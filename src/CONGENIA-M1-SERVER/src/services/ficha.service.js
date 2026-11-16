'use strict';

const crypto = require('crypto');
const db = require('../config/db');
const { decryptPatientName, decryptText, encryptText, patientNameToken, patientNameTokenHex, tokenizePatientName } = require('../utils/patientName');
const { generatePresignedReadUrl } = require('./upload.service');
const { normalizeTenantId, userCanAccessTenant } = require('../utils/tenant');
const { accessSummary, can, isExempt, isSuperAdmin, tenantScope, tenantsOf } = require('../utils/accessPolicy');
const { isProvisionalHistory, provisionalHistoryFor } = require('../utils/provisional');
const { recordAuditEvent } = require('./audit.service');

function appError(status, code, message) {
  const err = new Error(message ?? code);
  err.status = status;
  err.code = code;
  return err;
}

function rowName(row) {
  return decryptPatientName(row.nombre_enc, row.nombre_dek_enc);
}

function clampPageSize(value) {
  const parsed = Number.parseInt(value ?? '12', 10);
  if (!Number.isInteger(parsed) || parsed < 1) return 12;
  return Math.min(parsed, 50);
}

function parsePage(value) {
  const parsed = Number.parseInt(value ?? '1', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function dateRange({ desde, hasta }) {
  if (desde || hasta) return { desde: desde || null, hasta: hasta || null };
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - 1);
  return {
    desde: start.toISOString().slice(0, 10),
    hasta: end.toISOString().slice(0, 10),
  };
}

function adendaDateRange({ estado, desde, hasta }) {
  if (desde || hasta) return { desde: desde || null, hasta: hasta || null };
  if (estado === 'PENDIENTE') return { desde: null, hasta: null };
  return dateRange({});
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function estadoRevision(value) {
  const estado = String(value ?? 'PENDIENTE').trim().toUpperCase();
  if (!['PENDIENTE', 'APROBADA', 'RECHAZADA'].includes(estado)) {
    throw appError(400, 'INVALID_ESTADO', 'estado must be PENDIENTE, APROBADA or RECHAZADA');
  }
  return estado;
}

function requireAuditContext(audit) {
  // Mutations must leave an audit row in their own transaction. Failing here
  // keeps a new caller from silently skipping the trail.
  if (!audit) throw new Error('audit context is required for this operation');
  return audit;
}

function normalizeObservationInput(item, index) {
  const text = String(item?.observationText ?? '').trim();
  if (!text) throw appError(400, 'INVALID_OBSERVATION', `observations[${index}].observationText is required`);
  if (text.length > 1000) throw appError(400, 'INVALID_OBSERVATION', `observations[${index}].observationText exceeds 1000 characters`);
  return { observationText: text };
}

/**
 * Instituciones en las que el usuario tiene `permiso`, para filtrar consultas.
 * `tenants` vacio con `allowed` significa superadministrador: sin filtro.
 */
function tenantFilter(userAuth, permiso = 'dashboard') {
  const scope = tenantScope(userAuth, permiso);
  if (scope.all) return { allowed: true, tenants: [] };
  return { allowed: scope.tenants.length > 0, tenants: scope.tenants };
}

/** 403 por falta de permiso en la institucion de la ficha; se audita con su tenant. */
function requirePermissionIn(userAuth, permiso, tenantId, audit) {
  if (can(userAuth, permiso, tenantId)) return;
  if (audit) audit.resolved = { ...(audit.resolved ?? {}), idTenant: tenantId };
  throw appError(403, 'FORBIDDEN', `Permission ${permiso} is missing in this institution`);
}

async function ensureLocalUser(client, userAuth) {
  await client.query(
    `INSERT INTO usuario (usuario_id, system_id, usuario_ext_id, nombre, rol, especialidad)
     VALUES ($1, $2, $3, $4, 'MEDICO', $5)
     ON CONFLICT (usuario_id)
     DO UPDATE SET nombre = EXCLUDED.nombre, especialidad = EXCLUDED.especialidad`,
    [
      userAuth.subject,
      null,
      userAuth.username ?? userAuth.subject,
      userAuth.displayName,
      userAuth.specialty ?? 'No especificada',
    ]
  );
}

/**
 * Perfil del usuario con sus permisos ya calculados desde access-policy.yaml,
 * por institucion. Responde aunque el usuario no tenga permisos (access vacio):
 * el frontend arma menu y pantallas con esto, pero cada ruta vuelve a decidir.
 */
async function getMe(userAuth) {
  const superadmin = isSuperAdmin(userAuth);
  const tenantIds = superadmin ? [] : tenantsOf(userAuth);
  let rows = [];
  if (superadmin) {
    const res = await db.query(
      `SELECT id_tenant, nombre
       FROM institucion_tenant
       WHERE activo = true
       ORDER BY id_tenant`
    );
    rows = res.rows;
  } else if (tenantIds.length > 0) {
    const res = await db.query(
      `SELECT id_tenant, nombre
       FROM institucion_tenant
       WHERE id_tenant = ANY($1::int[]) AND activo = true
       ORDER BY id_tenant`,
      [tenantIds]
    );
    rows = res.rows;
  }
  const catalog = new Map(rows.map((row) => [Number(row.id_tenant), row.nombre]));
  const activeIds = [...catalog.keys()];
  const option = (tenantId) => {
    const name = catalog.get(tenantId) ?? `Institución ${tenantId}`;
    return { id: String(tenantId), name, label: `${tenantId} - ${name}` };
  };
  const summary = accessSummary(userAuth, activeIds);
  return {
    subject: userAuth.subject,
    displayName: userAuth.displayName,
    especialidad: userAuth.specialty,
    roles: userAuth.roles ?? [],
    roleLabel: summary.roleLabel,
    permissions: summary.permissions,
    globalPermissions: summary.globalPermissions,
    access: summary.access.map((entry) => {
      const { name, label } = option(entry.tenantId);
      return { ...entry, name, label };
    }),
    tenants: activeIds.map(String),
    tenantOptions: activeIds.map(option),
  };
}

async function searchFichas({ userAuth, query }) {
  const access = tenantFilter(userAuth);
  const page = parsePage(query.page);
  const pageSize = clampPageSize(query.pageSize);
  if (!access.allowed) return { items: [], total: 0, page, pageSize };

  const { desde, hasta } = dateRange(query);
  const where = [];
  const params = [];
  if (access.tenants.length > 0) {
    params.push(access.tenants);
    where.push(`f.id_tenant = ANY($${params.length}::int[])`);
  }
  where.push('f.es_vigente = true');
  if (desde) {
    params.push(desde);
    where.push(`f.fecha_consulta >= $${params.length}::date`);
  }
  if (hasta) {
    params.push(hasta);
    where.push(`f.fecha_consulta <= $${params.length}::date`);
  }

  const q = String(query.q ?? '').trim();
  const nameTokens = tokenizePatientName(q);
  const historyLike = q ? q.toLowerCase() : '';
  if (q) {
    const tokenBuffers = nameTokens.map(patientNameToken);
    if (tokenBuffers.length > 0) {
      params.push(tokenBuffers, tokenBuffers.length, `%${historyLike}%`);
      const tokenParam = params.length - 2;
      const countParam = params.length - 1;
      const historyParam = params.length;
      where.push(`(
        lower(f.historia_clinica) LIKE $${historyParam}
        OR (
          SELECT count(DISTINCT pnt.token_hmac)
          FROM paciente_nombre_token pnt
          WHERE pnt.paciente_id = p.paciente_id
            AND pnt.token_hmac = ANY($${tokenParam}::bytea[])
        ) = $${countParam}
      )`);
    } else {
      params.push(`%${historyLike}%`);
      where.push(`lower(f.historia_clinica) LIKE $${params.length}`);
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countRes = await db.query(
    `SELECT count(*)::int AS total
     FROM ficha_clinica f
     JOIN paciente p ON p.paciente_id = f.paciente_id
     ${whereSql}`,
    params
  );

  params.push(pageSize, (page - 1) * pageSize);
  const rowsRes = await db.query(
    `SELECT f.ficha_id, f.fecha_consulta, f.historia_clinica, f.id_tenant,
            p.nombre_enc, p.nombre_dek_enc
     FROM ficha_clinica f
     JOIN paciente p ON p.paciente_id = f.paciente_id
     ${whereSql}
     ORDER BY f.fecha_consulta DESC, f.fecha_creacion DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    items: rowsRes.rows.map((row) => ({
      fichaId: row.ficha_id,
      nombrePaciente: rowName(row),
      fechaConsulta: row.fecha_consulta.toISOString().slice(0, 10),
      historiaClinica: row.historia_clinica,
      idTenant: row.id_tenant,
    })),
    total: countRes.rows[0]?.total ?? 0,
    page,
    pageSize,
  };
}

async function loadFichaBase(fichaId, userAuth) {
  const access = tenantFilter(userAuth);
  if (!access.allowed) throw appError(404, 'FICHA_NOT_FOUND', 'Ficha not found');
  const params = [fichaId];
  let tenantSql = '';
  if (access.tenants.length > 0) {
    params.push(access.tenants);
    tenantSql = `AND f.id_tenant = ANY($2::int[])`;
  }
  const res = await db.query(
    `SELECT f.*, p.nombre_enc, p.nombre_dek_enc, u.nombre AS medico_nombre, u.especialidad,
            da.referido_de_id, da.asistencia_parto_id, da.sexo_id, da.familiares_afectos,
            da.personas_hogar_menores, da.personas_hogar_adultos, da.comunidad_afectada,
            rd.nombre AS referido_de_nombre, ap.nombre AS asistencia_parto_nombre,
            sc.nombre AS sexo_nombre
     FROM ficha_clinica f
     JOIN paciente p ON p.paciente_id = f.paciente_id
     JOIN usuario u ON u.usuario_id = f.medico_id
     LEFT JOIN datos_adicionales_ficha da ON da.ficha_id = f.ficha_id
     LEFT JOIN referido_de rd ON rd.referido_de_id = da.referido_de_id
     LEFT JOIN asistencia_parto ap ON ap.asistencia_parto_id = da.asistencia_parto_id
     LEFT JOIN sexo_catalogo sc ON sc.sexo_id = da.sexo_id
     WHERE f.ficha_id = $1 ${tenantSql}`,
    params
  );
  if (!res.rows[0]) throw appError(404, 'FICHA_NOT_FOUND', 'Ficha not found');
  return res.rows[0];
}

async function loadWarningSigns(fichaId, options = {}) {
  const includeUrls = options.includeUrls !== false;
  const activeOnly = options.mode === 'active';
  const res = await db.query(
    `SELECT s.signo_id, s.signo_texto_libre, s.parte_id, p.nombre AS parte_nombre,
            r.region_id, r.nombre AS region_nombre, s.imagen_bucket_ref,
            s.added_in_revision, s.replaces_signo_id,
            rb.signo_id AS replaced_by_signo_id
     FROM signo_alerta_ficha s
     JOIN parte_del_cuerpo p ON p.parte_id = s.parte_id
     JOIN region_anatomica r ON r.region_id = p.region_id
     LEFT JOIN signo_alerta_ficha rb ON rb.replaces_signo_id = s.signo_id
     WHERE s.ficha_id = $1
       AND ($2::boolean = false OR rb.signo_id IS NULL)
       AND NOT EXISTS (
         SELECT 1
           FROM signo_alerta_ficha replacement
           JOIN signo_alerta_ficha original ON original.signo_id = replacement.replaces_signo_id
          WHERE replacement.ficha_id = s.ficha_id
            AND replacement.added_in_revision = true
            AND $2::boolean = true
            AND s.added_in_revision = false
            AND original.ficha_id <> s.ficha_id
            AND original.signo_texto_libre IS NOT DISTINCT FROM s.signo_texto_libre
            AND original.parte_id IS NOT DISTINCT FROM s.parte_id
            AND original.imagen_bucket_ref IS NOT DISTINCT FROM s.imagen_bucket_ref
       )
     ORDER BY s.fecha_registro, s.signo_id`,
    [fichaId, activeOnly]
  );
  return Promise.all(res.rows.map(async (row) => ({
    signoId: row.signo_id,
    signDescription: row.signo_texto_libre,
    partCatalogId: row.parte_id,
    partName: row.parte_nombre,
    regionId: row.region_id,
    regionName: row.region_nombre,
    imageUrl: includeUrls ? await generatePresignedReadUrl(row.imagen_bucket_ref) : null,
    addedInRevision: Boolean(row.added_in_revision),
    replacesSignoId: row.replaces_signo_id,
    replacedBySignoId: row.replaced_by_signo_id,
  })));
}

async function loadExams(fichaId, options = {}) {
  const includeUrls = options.includeUrls !== false;
  const activeOnly = options.mode === 'active';
  const res = await db.query(
    `SELECT e.examen_ficha_id, e.examen_texto_libre, e.imagen_bucket_ref,
            e.added_in_revision, e.replaces_examen_id, rb.examen_ficha_id AS replaced_by_examen_id
     FROM examen_ficha e
     LEFT JOIN examen_ficha rb ON rb.replaces_examen_id = e.examen_ficha_id
     WHERE e.ficha_id = $1
       AND ($2::boolean = false OR rb.examen_ficha_id IS NULL)
       AND NOT EXISTS (
         SELECT 1
           FROM examen_ficha replacement
           JOIN examen_ficha original ON original.examen_ficha_id = replacement.replaces_examen_id
          WHERE replacement.ficha_id = e.ficha_id
            AND replacement.added_in_revision = true
            AND $2::boolean = true
            AND e.added_in_revision = false
            AND original.ficha_id <> e.ficha_id
            AND original.examen_texto_libre IS NOT DISTINCT FROM e.examen_texto_libre
            AND original.imagen_bucket_ref IS NOT DISTINCT FROM e.imagen_bucket_ref
       )
     ORDER BY e.fecha_registro, e.examen_ficha_id`,
    [fichaId, activeOnly]
  );
  return Promise.all(res.rows.map(async (row) => ({
    examenId: row.examen_ficha_id,
    examDescription: row.examen_texto_libre,
    examUrl: includeUrls ? await generatePresignedReadUrl(row.imagen_bucket_ref) : null,
    addedInRevision: Boolean(row.added_in_revision),
    replacesExamenId: row.replaces_examen_id,
    replacedByExamenId: row.replaced_by_examen_id,
  })));
}

async function loadObservations(fichaId) {
  const res = await db.query(
    `SELECT observacion_id, texto_enc, texto_dek_enc, agregada_en_revision, fecha_creacion
     FROM observacion_ficha
     WHERE ficha_id = $1
     ORDER BY fecha_creacion, observacion_id`,
    [fichaId]
  );
  return res.rows.map((row) => ({
    observacionId: row.observacion_id,
    observationText: decryptText(row.texto_enc, row.texto_dek_enc),
    addedInRevision: Boolean(row.agregada_en_revision),
    fechaCreacion: row.fecha_creacion.toISOString(),
  }));
}

async function getFichaDetail({ fichaId, userAuth, mode = 'full' }) {
  const row = await loadFichaBase(fichaId, userAuth);
  const familiares = await db.query(
    `SELECT familiar_catalogo_id FROM familiar_afectado WHERE ficha_id = $1 ORDER BY familiar_catalogo_id`,
    [fichaId]
  );
  return {
    fichaId: row.ficha_id,
    pacienteId: row.paciente_id,
    fichaRaizId: row.ficha_raiz_id,
    revision: row.version_ficha,
    estadoFicha: row.estado_ficha,
    estadoRevision: row.estado_revision,
    esVigente: row.es_vigente,
    fechaCreacion: row.fecha_creacion?.toISOString(),
    fechaResolucion: row.fecha_resolucion?.toISOString() ?? null,
    resueltaPor: row.resuelta_por ?? null,
    motivoSolicitud: row.motivo_solicitud,
    motivoRechazo: row.motivo_rechazo,
    paciente: {
      nombre: rowName(row),
      historiaClinica: row.historia_clinica,
      tenantId: String(row.id_tenant),
    },
    consulta: {
      fechaConsulta: row.fecha_consulta.toISOString().slice(0, 10),
      diagnosticoTexto: row.diagnosticos_ext_texto ?? '',
    },
    medico: { nombre: row.medico_nombre, especialidad: row.especialidad },
    demographic: {
      referralSourceId: row.referido_de_id,
      referralSourceName: row.referido_de_nombre,
      birthMethodId: row.asistencia_parto_id,
      birthMethodName: row.asistencia_parto_nombre,
      sexId: row.sexo_id ?? null,
      sexName: row.sexo_nombre ?? null,
      affectedRelatives: row.familiares_afectos,
      affectedRelativesCategoryIds: familiares.rows.map((item) => item.familiar_catalogo_id),
      affectedUnderageRelatives: row.personas_hogar_menores ?? 0,
      affectedAdultRelatives: row.personas_hogar_adultos ?? 0,
      affectedCommunityMembers: row.comunidad_afectada,
    },
    consent: null,
    warningSigns: await loadWarningSigns(fichaId, { mode }),
    examDiagnoses: await loadExams(fichaId, { mode }),
    observations: await loadObservations(fichaId),
  };
}

function spanishDate(date) {
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

function opcion(value, label) {
  if (value == null || label == null) return null;
  return { value: String(value), label: String(label) };
}

function ternaryFromBoolean(value) {
  if (value == null) return null;
  return value ? 1 : 0;
}

function ternaryFromSiNo(value) {
  if (value === 'SI') return 1;
  if (value === 'NO') return 0;
  if (value === 'DESCONOCIDO') return 2;
  return null;
}

function regionValue(name) {
  const normalized = String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (normalized.includes('cabeza') || normalized.includes('cuello')) return 'cabeza_cuello';
  if (normalized.includes('tronco')) return 'tronco';
  if (normalized.includes('superior') || normalized.includes('brazo') || normalized.includes('mano')) return 'extremidades_superiores';
  if (normalized.includes('inferior') || normalized.includes('pierna') || normalized.includes('pie')) return 'extremidades_inferiores';
  if (normalized.includes('genital') || normalized.includes('perine')) return 'genitales_perine';
  return 'general_otro';
}

async function getDashboardDetail({ fichaId, userAuth }) {
  const detail = await getFichaDetail({ fichaId, userAuth, mode: 'active' });
  if (!detail.esVigente) throw appError(404, 'FICHA_NOT_FOUND', 'Ficha not found');
  return {
    fichaId: detail.fichaId,
    nombrePaciente: detail.paciente.nombre,
    historiaClinica: detail.paciente.historiaClinica,
    idTenant: Number(detail.paciente.tenantId),
    datosConsulta: {
      fechaConsulta: spanishDate(new Date(`${detail.consulta.fechaConsulta}T00:00:00.000Z`)),
      medicoConsulta: detail.medico.nombre,
      especialidad: detail.medico.especialidad,
      diagnosticos: detail.consulta.diagnosticoTexto,
      referidoDe: opcion(detail.demographic.referralSourceId, detail.demographic.referralSourceName),
      lugarDeParto: opcion(detail.demographic.birthMethodId, detail.demographic.birthMethodName),
      sexo: opcion(detail.demographic.sexId, detail.demographic.sexName),
    },
    otrosDemograficos: {
      familiaresAfectados: ternaryFromBoolean(detail.demographic.affectedRelatives),
      menoresEnHogar: detail.demographic.affectedUnderageRelatives,
      adultosEnHogar: detail.demographic.affectedAdultRelatives,
      quienAfectado: [],
      afectadosComunidad: ternaryFromSiNo(detail.demographic.affectedCommunityMembers),
    },
    signosAlerta: detail.warningSigns.map((sign) => ({
      id: sign.signoId,
      nombre: sign.signDescription,
      parteDelCuerpo: {
        regionValue: regionValue(sign.regionName),
        parteValue: String(sign.partCatalogId),
      },
      parteDelCuerpoLabel: sign.partName,
      imagenUrl: sign.imageUrl,
    })),
    examenesSugeridos: detail.examDiagnoses.map((exam) => ({
      id: exam.examenId,
      nombre: exam.examDescription,
      imagenUrl: exam.examUrl,
      nombreArchivo: exam.examUrl ? 'archivo-adjunto' : null,
    })),
    observaciones: detail.observations.map((observacion) => ({
      id: observacion.observacionId,
      texto: observacion.observationText,
      fecha: spanishDate(new Date(observacion.fechaCreacion)),
    })),
  };
}

async function listFichasPaciente({ tenantId, historiaClinica, userAuth }) {
  const normalizedTenant = normalizeTenantId(tenantId);
  if (!Number.isInteger(normalizedTenant)) {
    throw appError(400, 'INVALID_TENANT_ID', 'tenantId must be a numeric institution id');
  }
  // Una institucion ajena se rechaza (y se audita como DENEGADO); antes
  // respondia 200 con lista vacia y quedaba como lectura exitosa.
  if (!userCanAccessTenant(userAuth, normalizedTenant)) {
    throw appError(403, 'TENANT_FORBIDDEN', 'The user has no access to this institution');
  }
  // Tambien la ficha provisional de esa HC: si la HC vuelve a fallar se abre la
  // misma, y si ya aparecio en SADC se abre esa en vez de crear una segunda.
  const provisionalHistory = isProvisionalHistory(historiaClinica)
    ? historiaClinica
    : provisionalHistoryFor(normalizedTenant, historiaClinica);
  const res = await db.query(
    `SELECT f.ficha_id, f.ficha_raiz_id, f.version_ficha, f.estado_ficha, f.historia_clinica,
            f.estado_revision, f.fecha_consulta, f.fecha_creacion, f.es_vigente, u.nombre AS medico
     FROM ficha_clinica f
     JOIN usuario u ON u.usuario_id = f.medico_id
     WHERE f.id_tenant = $1 AND f.historia_clinica IN ($2, $3)
     ORDER BY f.version_ficha DESC`,
    [normalizedTenant, historiaClinica, provisionalHistory]
  );
  return res.rows.map((row) => ({
    fichaId: row.ficha_id,
    historiaClinica: row.historia_clinica,
    provisional: isProvisionalHistory(row.historia_clinica),
    fichaRaizId: row.ficha_raiz_id,
    revision: row.version_ficha,
    estado: row.estado_ficha,
    estadoFicha: row.estado_ficha,
    estadoRevision: row.estado_revision,
    fechaConsulta: row.fecha_consulta.toISOString().slice(0, 10),
    fechaCreacion: row.fecha_creacion.toISOString(),
    esVigente: row.es_vigente,
    medico: row.medico,
  }));
}

async function getFichaVigente({ tenantId, historiaClinica, userAuth }) {
  const list = await listFichasPaciente({ tenantId, historiaClinica, userAuth });
  const vigente = list.find((item) => item.esVigente) ?? null;
  return {
    ficha: vigente,
    tieneRevisionPendiente: list.some((item) => item.estadoFicha === 'PENDIENTE'),
  };
}

async function listPendingFichas({ userAuth }) {
  const access = tenantFilter(userAuth);
  if (!access.allowed) return [];
  const params = [];
  let tenantSql = '';
  if (access.tenants.length > 0) {
    params.push(access.tenants);
    tenantSql = `AND f.id_tenant = ANY($1::int[])`;
  }
  const res = await db.query(
    `SELECT f.ficha_id, f.ficha_raiz_id, f.version_ficha, f.estado_ficha, f.fecha_consulta,
            f.es_vigente, f.motivo_solicitud, f.fecha_creacion,
            f.paciente_id, f.historia_clinica, f.id_tenant, p.nombre_enc, p.nombre_dek_enc, u.nombre AS medico
     FROM ficha_clinica f
     JOIN paciente p ON p.paciente_id = f.paciente_id
     JOIN usuario u ON u.usuario_id = f.medico_id
     WHERE f.estado_ficha = 'PENDIENTE' ${tenantSql}
     ORDER BY f.fecha_creacion ASC`,
    params
  );
  return res.rows.map((row) => ({
    fichaId: row.ficha_id,
    fichaRaizId: row.ficha_raiz_id,
    revision: row.version_ficha,
    estadoFicha: row.estado_ficha,
    fechaConsulta: row.fecha_consulta.toISOString().slice(0, 10),
    esVigente: row.es_vigente,
    medico: row.medico,
    pacienteId: row.paciente_id,
    motivoSolicitud: row.motivo_solicitud ?? '',
    fechaCreacion: row.fecha_creacion.toISOString(),
    paciente: {
      nombre: rowName(row),
      historiaClinica: row.historia_clinica,
      tenantId: String(row.id_tenant),
    },
  }));
}

async function listAdendas({ userAuth, query }) {
  const access = tenantFilter(userAuth, 'adendas.revisar');
  const page = parsePage(query.page);
  const pageSize = clampPageSize(query.pageSize);
  if (!access.allowed) return { items: [], total: 0, page, pageSize };

  const estado = estadoRevision(query.estado);
  const { desde, hasta } = adendaDateRange({ ...query, estado });
  const where = ['f.estado_revision = $1'];
  const params = [estado];
  if (access.tenants.length > 0) {
    params.push(access.tenants);
    where.push(`f.id_tenant = ANY($${params.length}::int[])`);
  }
  if (desde) {
    params.push(desde);
    where.push(`f.fecha_creacion >= $${params.length}::date`);
  }
  if (hasta) {
    params.push(hasta);
    where.push(`f.fecha_creacion < ($${params.length}::date + INTERVAL '1 day')`);
  }

  const q = String(query.q ?? '').trim();
  const nameTokens = tokenizePatientName(q);
  if (q) {
    const qLike = `%${normalizeSearchText(q)}%`;
    const tokenBuffers = nameTokens.map(patientNameToken);
    if (tokenBuffers.length > 0) {
      params.push(tokenBuffers, tokenBuffers.length, qLike);
      const tokenParam = params.length - 2;
      const countParam = params.length - 1;
      const likeParam = params.length;
      where.push(`(
        lower(f.historia_clinica) LIKE $${likeParam}
        OR lower(translate(u.nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) LIKE $${likeParam}
        OR (
          SELECT count(DISTINCT pnt.token_hmac)
          FROM paciente_nombre_token pnt
          WHERE pnt.paciente_id = p.paciente_id
            AND pnt.token_hmac = ANY($${tokenParam}::bytea[])
        ) = $${countParam}
      )`);
    } else {
      params.push(qLike);
      where.push(`(
        lower(f.historia_clinica) LIKE $${params.length}
        OR lower(translate(u.nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) LIKE $${params.length}
      )`);
    }
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const countRes = await db.query(
    `SELECT count(*)::int AS total
     FROM ficha_clinica f
     JOIN paciente p ON p.paciente_id = f.paciente_id
     JOIN usuario u ON u.usuario_id = f.medico_id
     ${whereSql}`,
    params
  );

  params.push(pageSize, (page - 1) * pageSize);
  const rowsRes = await db.query(
    `SELECT f.ficha_id, f.ficha_raiz_id, f.version_ficha, f.estado_ficha, f.estado_revision,
            f.fecha_consulta, f.fecha_creacion, f.fecha_resolucion, f.es_vigente,
            f.motivo_solicitud, f.motivo_rechazo, f.historia_clinica, f.id_tenant,
            p.nombre_enc, p.nombre_dek_enc, u.nombre AS medico
     FROM ficha_clinica f
     JOIN paciente p ON p.paciente_id = f.paciente_id
     JOIN usuario u ON u.usuario_id = f.medico_id
     ${whereSql}
     ORDER BY f.fecha_creacion DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    items: rowsRes.rows.map((row) => ({
      fichaId: row.ficha_id,
      fichaRaizId: row.ficha_raiz_id,
      revision: row.version_ficha,
      estadoFicha: row.estado_ficha,
      estadoRevision: row.estado_revision,
      fechaConsulta: row.fecha_consulta.toISOString().slice(0, 10),
      fechaSolicitud: row.fecha_creacion.toISOString().slice(0, 10),
      fechaCreacion: row.fecha_creacion.toISOString(),
      fechaResolucion: row.fecha_resolucion?.toISOString() ?? null,
      esVigente: row.es_vigente,
      medico: row.medico,
      medicoSolicitante: row.medico,
      motivoSolicitud: row.motivo_solicitud ?? '',
      motivoRechazo: row.motivo_rechazo ?? '',
      paciente: {
        nombre: rowName(row),
        historiaClinica: row.historia_clinica,
        tenantId: String(row.id_tenant),
      },
    })),
    total: countRes.rows[0]?.total ?? 0,
    page,
    pageSize,
  };
}

async function createRevision({ fichaId, payload, userAuth, ip, audit }) {
  requireAuditContext(audit);
  const source = await loadFichaBase(fichaId, userAuth);
  requirePermissionIn(userAuth, 'fichas.crear', source.id_tenant, audit);
  if (!source.es_vigente) throw appError(409, 'FICHA_NOT_CURRENT', 'Only the current ficha can be revised');
  if (!String(payload.motivo ?? '').trim()) throw appError(400, 'INVALID_PAYLOAD', 'motivo is required');
  const replacedSignoIds = [...new Set((payload.warningSigns ?? [])
    .map((signo) => signo.replacesSignoId)
    .filter(Boolean))];
  const replacedExamenIds = [...new Set((payload.examDiagnoses ?? [])
    .map((examen) => examen.replacesExamenId)
    .filter(Boolean))];
  const observations = (payload.observations ?? []).map(normalizeObservationInput);
  if ((payload.warningSigns ?? []).length === 0 && (payload.examDiagnoses ?? []).length === 0 && observations.length === 0) {
    throw appError(400, 'NO_REVISION_CHANGES', 'Revision must include at least one change');
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await ensureLocalUser(client, userAuth);
    const pending = await client.query(
      `SELECT ficha_id FROM ficha_clinica
       WHERE ficha_raiz_id = $1 AND estado_ficha = 'PENDIENTE'
       FOR UPDATE`,
      [source.ficha_raiz_id]
    );
    if (pending.rows[0]) throw appError(409, 'REVISION_PENDING_EXISTS', 'A pending revision already exists');
    const next = await client.query(
      `SELECT COALESCE(MAX(version_ficha), 0) + 1 AS revision
       FROM ficha_clinica WHERE ficha_raiz_id = $1`,
      [source.ficha_raiz_id]
    );
    const newFichaId = crypto.randomUUID();
    const revision = next.rows[0].revision;
    await client.query(
      `INSERT INTO ficha_clinica (
         ficha_id, paciente_id, sesion_id, origen_creacion, medico_id, fecha_consulta,
         diagnosticos_ext_texto, estado_ficha, estado_revision, version_ficha, fecha_creacion, fecha_modificacion,
         creado_por, historia_clinica, id_tenant, ficha_raiz_id, es_vigente, motivo_solicitud
       ) VALUES ($1, $2, NULL, 'MANUAL', $3, $4, $5, 'PENDIENTE', $6, $7, NOW(), NOW(),
         $3, $8, $9, $10, false, $11)`,
      [newFichaId, source.paciente_id, source.medico_id, source.fecha_consulta, source.diagnosticos_ext_texto,
        'PENDIENTE', revision, source.historia_clinica, source.id_tenant, source.ficha_raiz_id, payload.motivo.trim()]
    );
    await client.query(
      `INSERT INTO datos_adicionales_ficha (
         ficha_id, referido_de_id, asistencia_parto_id, familiares_afectos,
         personas_hogar_menores, personas_hogar_adultos, comunidad_afectada, sexo_id
       )
       SELECT $1, referido_de_id, asistencia_parto_id, familiares_afectos,
              personas_hogar_menores, personas_hogar_adultos, comunidad_afectada, sexo_id
       FROM datos_adicionales_ficha WHERE ficha_id = $2`,
      [newFichaId, source.ficha_id]
    );
    await client.query(
      `INSERT INTO familiar_afectado (ficha_id, familiar_catalogo_id)
       SELECT $1, familiar_catalogo_id FROM familiar_afectado WHERE ficha_id = $2`,
      [newFichaId, source.ficha_id]
    );
    const sourceSigns = await client.query(
      `SELECT s.signo_id, s.signo_texto_libre, s.parte_id, s.imagen_bucket_ref,
              s.imagen_hash_sha256, s.fecha_registro, s.registrado_por
       FROM signo_alerta_ficha s
       LEFT JOIN signo_alerta_ficha rb ON rb.replaces_signo_id = s.signo_id
       WHERE s.ficha_id = $1
         AND rb.signo_id IS NULL
         AND NOT EXISTS (
           SELECT 1
             FROM signo_alerta_ficha replacement
             JOIN signo_alerta_ficha original ON original.signo_id = replacement.replaces_signo_id
            WHERE replacement.ficha_id = s.ficha_id
              AND replacement.added_in_revision = true
              AND s.added_in_revision = false
              AND original.ficha_id <> s.ficha_id
              AND original.signo_texto_libre IS NOT DISTINCT FROM s.signo_texto_libre
              AND original.parte_id IS NOT DISTINCT FROM s.parte_id
              AND original.imagen_bucket_ref IS NOT DISTINCT FROM s.imagen_bucket_ref
         )
       ORDER BY s.fecha_registro, s.signo_id`,
      [source.ficha_id]
    );
    const sourceExams = await client.query(
      `SELECT e.examen_ficha_id, e.examen_texto_libre, e.imagen_bucket_ref,
              e.imagen_hash_sha256, e.fecha_registro, e.registrado_por
       FROM examen_ficha e
       LEFT JOIN examen_ficha rb ON rb.replaces_examen_id = e.examen_ficha_id
       WHERE e.ficha_id = $1
         AND rb.examen_ficha_id IS NULL
         AND NOT EXISTS (
           SELECT 1
             FROM examen_ficha replacement
             JOIN examen_ficha original ON original.examen_ficha_id = replacement.replaces_examen_id
            WHERE replacement.ficha_id = e.ficha_id
              AND replacement.added_in_revision = true
              AND e.added_in_revision = false
              AND original.ficha_id <> e.ficha_id
              AND original.examen_texto_libre IS NOT DISTINCT FROM e.examen_texto_libre
              AND original.imagen_bucket_ref IS NOT DISTINCT FROM e.imagen_bucket_ref
         )
       ORDER BY e.fecha_registro, e.examen_ficha_id`,
      [source.ficha_id]
    );
    const signoMap = new Map();
    for (const sign of sourceSigns.rows) {
      const copyId = crypto.randomUUID();
      signoMap.set(sign.signo_id, copyId);
      await client.query(
        `INSERT INTO signo_alerta_ficha (
           signo_id, ficha_id, signo_texto_libre, parte_id, imagen_bucket_ref, imagen_hash_sha256,
           fecha_registro, registrado_por, added_in_revision
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)`,
        [copyId, newFichaId, sign.signo_texto_libre, sign.parte_id, sign.imagen_bucket_ref,
          sign.imagen_hash_sha256, sign.fecha_registro, sign.registrado_por]
      );
    }
    const examenMap = new Map();
    for (const exam of sourceExams.rows) {
      const copyId = crypto.randomUUID();
      examenMap.set(exam.examen_ficha_id, copyId);
      await client.query(
        `INSERT INTO examen_ficha (
           examen_ficha_id, ficha_id, examen_texto_libre, imagen_bucket_ref, imagen_hash_sha256,
           fecha_registro, registrado_por, added_in_revision
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, false)`,
        [copyId, newFichaId, exam.examen_texto_libre, exam.imagen_bucket_ref,
          exam.imagen_hash_sha256, exam.fecha_registro, exam.registrado_por]
      );
    }
    const sourceObservations = await client.query(
      `SELECT observacion_id, texto_enc, texto_dek_enc, fecha_creacion, usuario_id
       FROM observacion_ficha
       WHERE ficha_id = $1
       ORDER BY fecha_creacion, observacion_id`,
      [source.ficha_id]
    );
    for (const observacion of sourceObservations.rows) {
      await client.query(
        `INSERT INTO observacion_ficha (
           ficha_id, texto_enc, texto_dek_enc, agregada_en_revision, fecha_creacion, usuario_id
         ) VALUES ($1, $2, $3, false, $4, $5)`,
        [newFichaId, observacion.texto_enc, observacion.texto_dek_enc,
          observacion.fecha_creacion, observacion.usuario_id]
      );
    }
    for (const signoId of replacedSignoIds) {
      if (!signoMap.has(signoId)) throw appError(400, 'INVALID_REPLACEMENT', 'replacesSignoId does not belong to the current ficha');
    }
    for (const examenId of replacedExamenIds) {
      if (!examenMap.has(examenId)) throw appError(400, 'INVALID_REPLACEMENT', 'replacesExamenId does not belong to the current ficha');
    }
    for (const signo of payload.warningSigns ?? []) {
      await client.query(
        `INSERT INTO signo_alerta_ficha (
           ficha_id, signo_texto_libre, parte_id, imagen_bucket_ref, fecha_registro,
           registrado_por, added_in_revision, replaces_signo_id
         ) VALUES ($1, $2, $3, $4, NOW(), $5, true, $6)`,
        [newFichaId, signo.signDescription.trim(), signo.partCatalogId, signo.imageResourceId ?? null,
          source.medico_id, signo.replacesSignoId ? signoMap.get(signo.replacesSignoId) : null]
      );
    }
    for (const examen of payload.examDiagnoses ?? []) {
      await client.query(
        `INSERT INTO examen_ficha (
           ficha_id, examen_texto_libre, imagen_bucket_ref, fecha_registro,
           registrado_por, added_in_revision, replaces_examen_id
         ) VALUES ($1, $2, $3, NOW(), $4, true, $5)`,
        [newFichaId, examen.examDescription.trim(), examen.examResourceId ?? null,
          source.medico_id, examen.replacesExamenId ? examenMap.get(examen.replacesExamenId) : null]
      );
    }
    for (const observacion of observations) {
      const { textEnc, dekEnc } = encryptText(observacion.observationText);
      await client.query(
        `INSERT INTO observacion_ficha (
         ficha_id, texto_enc, texto_dek_enc, agregada_en_revision, fecha_creacion, usuario_id
         ) VALUES ($1, $2, $3, true, NOW(), $4)`,
        [newFichaId, textEnc, dekEnc, userAuth.subject]
      );
    }
    await client.query(
      `INSERT INTO ficha_cambio (ficha_id, usuario_id, campo_modificado, valor_anterior, valor_nuevo, justificacion, ip_origen)
       VALUES ($1, $2, 'revision', $3, $4, $5, $6)`,
      [newFichaId, userAuth.subject, String(source.version_ficha), String(revision), payload.motivo.trim(), ip]
    );
    await recordAuditEvent(audit, {
      tipoEvento: 'ADENDA_SOLICITADA',
      entidadTipo: 'Ficha',
      entidadId: newFichaId,
      usuarioId: userAuth.subject,
      idTenant: source.id_tenant,
      detalle: {
        fichaOrigenId: source.ficha_id,
        fichaRaizId: source.ficha_raiz_id,
        revision,
        signosAgregados: (payload.warningSigns ?? []).length,
        examenesAgregados: (payload.examDiagnoses ?? []).length,
        observacionesAgregadas: observations.length,
      },
    }, { client });
    await client.query('COMMIT');
    return { fichaId: newFichaId, revision, estadoFicha: 'PENDIENTE' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function normalizeDecision(raw) {
  const tipo = String(raw?.tipo ?? '').trim().toUpperCase();
  const decision = String(raw?.decision ?? '').trim().toUpperCase();
  const id = String(raw?.id ?? '').trim();
  if (!['SIGNO', 'EXAMEN', 'OBSERVACION'].includes(tipo) || !['APROBADO', 'RECHAZADO'].includes(decision) || !id) {
    throw appError(400, 'INVALID_DECISION', 'Each decision must include tipo, id and decision');
  }
  return { tipo, id, decision };
}

async function resolveRevision({ fichaId, decisiones, userAuth, ip, audit, motivoRechazo = null }) {
  requireAuditContext(audit);
  const row = await loadFichaBase(fichaId, userAuth);
  requirePermissionIn(userAuth, 'adendas.revisar', row.id_tenant, audit);
  if (row.estado_revision !== 'PENDIENTE' && row.estado_ficha !== 'PENDIENTE') {
    throw appError(409, 'REVISION_NOT_PENDING', 'Only pending revisions can be resolved');
  }
  // Separacion de funciones: quien pidio la adenda no la resuelve. El
  // solicitante sale de ficha_cambio (inmutable), no de creado_por, que guarda
  // al medico de la ficha original. La exencion la define access-policy.yaml.
  if (!isExempt(userAuth, 'no_autoaprobacion')) {
    const solicitud = await db.query(
      `SELECT usuario_id FROM ficha_cambio
       WHERE ficha_id = $1 AND campo_modificado = 'revision'
       LIMIT 1`,
      [fichaId]
    );
    if (solicitud.rows[0]?.usuario_id === userAuth.subject) {
      // El rechazo queda en la bitacora con la institucion de la ficha.
      audit.resolved = { ...(audit.resolved ?? {}), idTenant: row.id_tenant };
      throw appError(403, 'SELF_REVIEW_FORBIDDEN', 'A revision cannot be resolved by the user who requested it');
    }
  }
  const normalized = (decisiones ?? []).map(normalizeDecision);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await ensureLocalUser(client, userAuth);
    await client.query(`SELECT ficha_id FROM ficha_clinica WHERE ficha_raiz_id = $1 FOR UPDATE`, [row.ficha_raiz_id]);
    const signs = await client.query(
      `SELECT signo_id FROM signo_alerta_ficha
       WHERE ficha_id = $1 AND added_in_revision = true
       FOR UPDATE`,
      [fichaId]
    );
    const exams = await client.query(
      `SELECT examen_ficha_id FROM examen_ficha
       WHERE ficha_id = $1 AND added_in_revision = true
       FOR UPDATE`,
      [fichaId]
    );
    const observations = await client.query(
      `SELECT observacion_id FROM observacion_ficha
       WHERE ficha_id = $1 AND agregada_en_revision = true
       FOR UPDATE`,
      [fichaId]
    );
    const expected = new Map();
    for (const sign of signs.rows) expected.set(`SIGNO:${sign.signo_id}`, false);
    for (const exam of exams.rows) expected.set(`EXAMEN:${exam.examen_ficha_id}`, false);
    for (const observacion of observations.rows) expected.set(`OBSERVACION:${observacion.observacion_id}`, false);
    if (expected.size === 0) throw appError(400, 'NO_REVISION_CHANGES', 'Revision has no changes to resolve');

    let approvedCount = 0;
    const rejectedSigns = [];
    const rejectedExams = [];
    const rejectedObservations = [];
    for (const item of normalized) {
      const key = `${item.tipo}:${item.id}`;
      if (!expected.has(key)) throw appError(400, 'INVALID_DECISION_TARGET', 'Decision target is not part of the revision changes');
      if (expected.get(key)) throw appError(400, 'DUPLICATE_DECISION', 'Duplicate decision target');
      expected.set(key, true);
      if (item.decision === 'APROBADO') approvedCount += 1;
      if (item.decision === 'RECHAZADO' && item.tipo === 'SIGNO') rejectedSigns.push(item.id);
      if (item.decision === 'RECHAZADO' && item.tipo === 'EXAMEN') rejectedExams.push(item.id);
      if (item.decision === 'RECHAZADO' && item.tipo === 'OBSERVACION') rejectedObservations.push(item.id);
    }
    const missing = [...expected.entries()].filter(([, seen]) => !seen);
    if (missing.length > 0) throw appError(400, 'INCOMPLETE_DECISIONS', 'A decision is required for every revision change');

    // Las filas rechazadas se retiran de la ficha, pero su archivo se conserva
    // en el bucket: la referencia y el hash pasan al evento ALERTA_VALIDADA,
    // que es inmutable, para que la propuesta rechazada siga siendo evidencia
    // localizable y no quede un objeto sin vinculo.
    const archivosConservados = new Map();
    const conservar = (id, row) => {
      if (row.imagen_bucket_ref) {
        archivosConservados.set(id, { objectKey: row.imagen_bucket_ref, sha256: row.imagen_hash_sha256 ?? null });
      }
    };
    if (rejectedSigns.length > 0) {
      const removed = await client.query(
        `DELETE FROM signo_alerta_ficha
         WHERE ficha_id = $1 AND added_in_revision = true AND signo_id = ANY($2::uuid[])
         RETURNING signo_id, imagen_bucket_ref, imagen_hash_sha256`,
        [fichaId, rejectedSigns]
      );
      for (const row of removed.rows ?? []) conservar(`SIGNO:${row.signo_id}`, row);
    }
    if (rejectedExams.length > 0) {
      const removed = await client.query(
        `DELETE FROM examen_ficha
         WHERE ficha_id = $1 AND added_in_revision = true AND examen_ficha_id = ANY($2::uuid[])
         RETURNING examen_ficha_id, imagen_bucket_ref, imagen_hash_sha256`,
        [fichaId, rejectedExams]
      );
      for (const row of removed.rows ?? []) conservar(`EXAMEN:${row.examen_ficha_id}`, row);
    }
    if (rejectedObservations.length > 0) {
      await client.query(
        `DELETE FROM observacion_ficha
         WHERE ficha_id = $1 AND agregada_en_revision = true AND observacion_id = ANY($2::uuid[])`,
        [fichaId, rejectedObservations]
      );
    }

    if (approvedCount > 0) {
      await client.query(`UPDATE ficha_clinica SET es_vigente = false, fecha_modificacion = NOW() WHERE ficha_raiz_id = $1`, [row.ficha_raiz_id]);
      await client.query(
        `UPDATE ficha_clinica
         SET es_vigente = true, estado_ficha = 'COMPLETA', estado_revision = 'APROBADA',
             fecha_resolucion = NOW(), resuelta_por = $2, fecha_modificacion = NOW(), modificado_por = $2
         WHERE ficha_id = $1`,
        [fichaId, userAuth.subject]
      );
    } else {
      await client.query(
        `UPDATE ficha_clinica
         SET es_vigente = false, estado_ficha = 'ARCHIVADA', estado_revision = 'RECHAZADA',
             motivo_rechazo = COALESCE($2, motivo_rechazo), fecha_resolucion = NOW(),
             resuelta_por = $3, fecha_modificacion = NOW(), modificado_por = $3
         WHERE ficha_id = $1`,
        [fichaId, motivoRechazo ? String(motivoRechazo).trim() : null, userAuth.subject]
      );
    }
    await client.query(
      `INSERT INTO ficha_cambio (ficha_id, usuario_id, campo_modificado, valor_anterior, valor_nuevo, justificacion, ip_origen)
       VALUES ($1, $2, 'estado_revision', 'PENDIENTE', $3, $4, $5)`,
      [fichaId, userAuth.subject, approvedCount > 0 ? 'APROBADA' : 'RECHAZADA',
        motivoRechazo ? String(motivoRechazo).trim() : `Decisiones: ${approvedCount} aprobadas, ${expected.size - approvedCount} rechazadas`, ip]
    );
    // Validacion de alertas: una fila por cada decision del revisor, ademas del
    // resultado de la adenda. Se escriben en esta transaccion para que la
    // bitacora y la ficha no puedan divergir.
    for (const item of normalized) {
      const archivo = archivosConservados.get(`${item.tipo}:${item.id}`);
      await recordAuditEvent(audit, {
        tipoEvento: item.tipo === 'OBSERVACION' ? 'OBSERVACION_VALIDADA' : 'ALERTA_VALIDADA',
        entidadTipo: item.tipo === 'SIGNO' ? 'Signo' : (item.tipo === 'EXAMEN' ? 'Examen' : 'Observacion'),
        entidadId: item.id,
        usuarioId: userAuth.subject,
        idTenant: row.id_tenant,
        detalle: {
          fichaId,
          tipo: item.tipo,
          decision: item.decision,
          ...(archivo ? { archivoConservado: archivo } : {}),
        },
      }, { client });
    }
    await recordAuditEvent(audit, {
      tipoEvento: 'ADENDA_RESUELTA',
      entidadTipo: 'Ficha',
      entidadId: fichaId,
      usuarioId: userAuth.subject,
      idTenant: row.id_tenant,
      detalle: {
        estadoRevision: approvedCount > 0 ? 'APROBADA' : 'RECHAZADA',
        aprobadas: approvedCount,
        rechazadas: expected.size - approvedCount,
        conMotivo: Boolean(motivoRechazo),
        archivosConservados: archivosConservados.size,
      },
    }, { client });
    await client.query('COMMIT');
    return {
      fichaId,
      revision: row.version_ficha,
      estadoFicha: approvedCount > 0 ? 'COMPLETA' : 'ARCHIVADA',
      estadoRevision: approvedCount > 0 ? 'APROBADA' : 'RECHAZADA',
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function revisionChangeDecisions(fichaId, decision) {
  const signs = await db.query(
    `SELECT signo_id FROM signo_alerta_ficha WHERE ficha_id = $1 AND added_in_revision = true`,
    [fichaId]
  );
  const exams = await db.query(
    `SELECT examen_ficha_id FROM examen_ficha WHERE ficha_id = $1 AND added_in_revision = true`,
    [fichaId]
  );
  const observations = await db.query(
    `SELECT observacion_id FROM observacion_ficha WHERE ficha_id = $1 AND agregada_en_revision = true`,
    [fichaId]
  );
  return [
    ...signs.rows.map((row) => ({ tipo: 'SIGNO', id: row.signo_id, decision })),
    ...exams.rows.map((row) => ({ tipo: 'EXAMEN', id: row.examen_ficha_id, decision })),
    ...observations.rows.map((row) => ({ tipo: 'OBSERVACION', id: row.observacion_id, decision })),
  ];
}

async function approveRevision({ fichaId, userAuth, ip, audit }) {
  const decisiones = await revisionChangeDecisions(fichaId, 'APROBADO');
  return resolveRevision({ fichaId, decisiones, userAuth, ip, audit });
}

async function rejectRevision({ fichaId, motivo, userAuth, ip, audit }) {
  if (!String(motivo ?? '').trim()) throw appError(400, 'INVALID_PAYLOAD', 'motivo is required');
  const decisiones = await revisionChangeDecisions(fichaId, 'RECHAZADO');
  return resolveRevision({ fichaId, decisiones, userAuth, ip, audit, motivoRechazo: motivo });
}

function searchAuditDetail(query) {
  const tokens = tokenizePatientName(query.q ?? '');
  return {
    hasQ: Boolean(String(query.q ?? '').trim()),
    qWordCount: tokens.length,
    qTokenHashes: tokens.map(patientNameTokenHex),
    desde: query.desde ?? null,
    hasta: query.hasta ?? null,
    page: parsePage(query.page),
    pageSize: clampPageSize(query.pageSize),
  };
}

module.exports = {
  approveRevision,
  createRevision,
  getDashboardDetail,
  getFichaDetail,
  getFichaVigente,
  getMe,
  listAdendas,
  listFichasPaciente,
  listPendingFichas,
  rejectRevision,
  resolveRevision,
  searchAuditDetail,
  searchFichas,
};
