'use strict';

const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
const db = require('../config/db');
const { recordAuditEvent } = require('./audit.service');
const { generatePresignedReadUrl, getInternalS3Client } = require('./upload.service');

const FORMATO_CIE10 = /^[A-Z]\d{2}(\.[0-9A-Z]{1,4})?$/;
const MAX_LIMIT = 50;
const EXPORT_URL_TTL_SECONDS = 300;

function appError(status, code, message) {
  const err = new Error(message ?? code);
  err.status = status;
  err.code = code;
  return err;
}

function clampInt(value, { defaultValue, min, max }) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return defaultValue;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeCie10Code(value) {
  return String(value ?? '').trim().toUpperCase();
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function parseS3Prefix(uri) {
  const value = String(uri ?? '').trim();
  if (!value) {
    throw appError(404, 'CIE10_EXPORT_NOT_CONFIGURED', 'No hay exportación CSV configurada.');
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw appError(500, 'CIE10_EXPORT_CONFIG_INVALID', 'CIE10_REVIEW_EXPORT_S3_PREFIX is invalid.');
  }
  if (parsed.protocol !== 's3:' || !parsed.hostname) {
    throw appError(500, 'CIE10_EXPORT_CONFIG_INVALID', 'CIE10_REVIEW_EXPORT_S3_PREFIX must be an s3:// URI.');
  }
  return {
    bucket: parsed.hostname,
    prefix: decodeURIComponent(parsed.pathname.slice(1)).replace(/\/?$/, '/'),
  };
}

function serializeCursor(row) {
  if (!row) return null;
  return `${new Date(row.procesado_en).toISOString()}|${row.codigo_traductor}`;
}

function parseCursor(cursor) {
  if (!cursor) return null;
  const [datePart, ...rest] = String(cursor).split('|');
  const codigoTraductor = rest.join('|');
  const date = new Date(datePart);
  if (!codigoTraductor || Number.isNaN(date.getTime())) {
    throw appError(400, 'INVALID_CURSOR', 'cursor is invalid');
  }
  return { procesadoEn: date.toISOString(), codigoTraductor };
}

function toSuggestion(row) {
  return {
    runId: row.run_id,
    codigoTraductor: row.codigo_traductor,
    diagnostico: row.diagnostico,
    cie10Original: row.cie10_original ?? '-1',
    sugerencias: Array.isArray(row.sugerencias) ? row.sugerencias : [],
    razonamientoClinico: row.razonamiento_clinico ?? null,
    error: row.error ?? null,
    modelo: row.modelo,
    procesadoEn: new Date(row.procesado_en).toISOString(),
    ragVersion: row.rag_version ?? null,
  };
}

function toDecision(row) {
  if (!row) return null;
  return {
    codigoTraductor: row.codigo_traductor,
    diagnostico: row.diagnostico,
    decision: row.decision,
    codigoFinal: row.codigo_final,
    codigoInternoCatalogo: row.codigo_interno_catalogo ?? null,
    comentario: row.comentario ?? null,
    decididoEn: new Date(row.decidido_en).toISOString(),
    revisor: row.revisor_nombre,
  };
}

function publicDecisionPayload(row) {
  return {
    decision: row.decision,
    codigoFinal: row.codigo_final,
    codigoInternoCatalogo: row.codigo_interno_catalogo ?? null,
    posicion: row.posicion ?? null,
    sugerenciasMostradas: row.sugerencias_mostradas,
  };
}

async function listSugerencias({ query = {} }) {
  const limit = clampInt(query.limite, { defaultValue: 20, min: 1, max: MAX_LIMIT });
  const cursor = parseCursor(query.cursor);

  const params = [];
  let cursorSql = '';
  if (cursor) {
    params.push(cursor.procesadoEn, cursor.codigoTraductor);
    cursorSql = `AND (s.procesado_en, s.codigo_traductor) > ($${params.length - 1}::timestamptz, $${params.length})`;
  }

  const totalPromise = db.query(
    `SELECT count(*)::int AS total
       FROM cie10_sugerencia s
       LEFT JOIN cie10_decision d ON d.codigo_traductor = s.codigo_traductor
      WHERE d.codigo_traductor IS NULL`
  );

  params.push(limit + 1);
  const rowsPromise = db.query(
    `SELECT s.run_id, s.codigo_traductor, s.diagnostico, s.cie10_original, s.sugerencias,
            s.razonamiento_clinico, s.error, s.modelo, s.procesado_en, s.rag_version
       FROM cie10_sugerencia s
       LEFT JOIN cie10_decision d ON d.codigo_traductor = s.codigo_traductor
      WHERE d.codigo_traductor IS NULL
        ${cursorSql}
      ORDER BY s.procesado_en ASC, s.codigo_traductor ASC
      LIMIT $${params.length}`,
    params
  );

  const [totalResult, rowsResult] = await Promise.all([totalPromise, rowsPromise]);
  const pageRows = rowsResult.rows.slice(0, limit);
  const extra = rowsResult.rows.length > limit ? rowsResult.rows[limit - 1] : null;

  return {
    items: pageRows.map(toSuggestion),
    total: totalResult.rows[0]?.total ?? 0,
    siguienteCursor: extra ? serializeCursor(pageRows[pageRows.length - 1]) : null,
  };
}

async function getSugerencia(codigoTraductor) {
  const result = await db.query(
    `SELECT s.run_id, s.codigo_traductor, s.diagnostico, s.cie10_original, s.sugerencias,
            s.razonamiento_clinico, s.error, s.modelo, s.procesado_en, s.rag_version,
            d.decision, d.codigo_final, d.codigo_interno_catalogo, d.comentario,
            d.decidido_en, d.revisor_nombre
       FROM cie10_sugerencia s
       LEFT JOIN cie10_decision d ON d.codigo_traductor = s.codigo_traductor
      WHERE s.codigo_traductor = $1`,
    [codigoTraductor]
  );
  const row = result.rows[0];
  if (!row) throw appError(404, 'CIE10_NOT_FOUND', 'Este diagnóstico ya no existe.');

  return {
    ...toSuggestion(row),
    decision: row.decision ? toDecision(row) : null,
  };
}

function validateShownCount(payload, item) {
  const shown = Number.parseInt(payload.sugerenciasMostradas, 10);
  const available = Array.isArray(item.sugerencias) ? item.sugerencias.length : 0;
  const minimum = available === 0 ? 0 : 1;
  if (!Number.isInteger(shown) || shown < minimum || shown > 10) {
    throw appError(400, 'INVALID_PAYLOAD', 'sugerenciasMostradas is invalid');
  }
  if (shown > available) {
    throw appError(400, 'INVALID_PAYLOAD', 'sugerenciasMostradas is invalid');
  }
  return shown;
}

async function catalogByCode(client, code) {
  const result = await client.query(
    `SELECT codigo_interno, codigo, nombre FROM cie10_catalogo WHERE codigo = $1 AND activo = true`,
    [code]
  );
  return result.rows[0] ?? null;
}

async function buildDecision(client, item, payload, userAuth) {
  const sugerencias = Array.isArray(item.sugerencias) ? item.sugerencias : [];
  const sugerenciasMostradas = validateShownCount(payload, item);

  if (payload.decision === 'ACEPTADA') {
    const codigo = normalizeCie10Code(payload.codigo);
    const codigoInternoCatalogo = String(payload.codigoInternoCatalogo ?? '').trim();
    const posicion = Number.parseInt(payload.posicion, 10);
    const matchIndex = sugerencias.findIndex((s) =>
      normalizeCie10Code(s.codigo) === codigo &&
      String(s.codigoInternoCatalogo ?? '').trim() === codigoInternoCatalogo
    );
    if (matchIndex < 0 || !Number.isInteger(posicion) || posicion !== matchIndex + 1) {
      throw appError(400, 'INVALID_SUGGESTION', 'codigo must match one suggestion for this item');
    }
    return {
      decision: 'ACEPTADA',
      codigoFinal: codigo,
      codigoInternoCatalogo,
      comentario: null,
      posicion,
      sugerenciasMostradas,
      revisorId: userAuth.subject,
      revisorNombre: userAuth.displayName,
    };
  }

  if (payload.decision === 'RECHAZADA') {
    const codigo = normalizeCie10Code(payload.codigoCorrecto);
    if (!FORMATO_CIE10.test(codigo)) {
      throw appError(400, 'FORMATO_CIE10', 'El código no tiene formato CIE-10.');
    }
    const comentario = String(payload.comentario ?? '').trim();
    if (!comentario) {
      throw appError(400, 'COMENTARIO_REQUERIDO', 'comentario is required for rejected CIE-10 suggestions');
    }
    if (comentario.length > 300) {
      throw appError(400, 'INVALID_COMMENT', 'comentario exceeds 300 characters');
    }
    const catalog = await catalogByCode(client, codigo);
    return {
      decision: 'RECHAZADA',
      codigoFinal: codigo,
      codigoInternoCatalogo: catalog?.codigo_interno ?? null,
      comentario,
      posicion: null,
      sugerenciasMostradas,
      revisorId: userAuth.subject,
      revisorNombre: userAuth.displayName,
    };
  }

  throw appError(400, 'INVALID_DECISION', 'decision must be ACEPTADA or RECHAZADA');
}

async function loadItemForUpdate(client, codigoTraductor) {
  const result = await client.query(
    `SELECT codigo_traductor, diagnostico, cie10_original, sugerencias,
            razonamiento_clinico, error, modelo, procesado_en
       FROM cie10_sugerencia
      WHERE codigo_traductor = $1
      FOR UPDATE`,
    [codigoTraductor]
  );
  const row = result.rows[0];
  if (!row) throw appError(404, 'CIE10_NOT_FOUND', 'Este diagnóstico ya no existe.');
  return row;
}

async function insertAudit(client, audit, { tipoEvento, codigoTraductor, decision, previous = null, statusCode = 201 }) {
  await recordAuditEvent(audit, {
    tipoEvento,
    entidadTipo: 'Cie10',
    entidadId: codigoTraductor,
    statusCode,
    detalle: {
      codigoTraductor,
      decision: decision.decision,
      codigoFinal: decision.codigoFinal,
      codigoInternoCatalogo: decision.codigoInternoCatalogo,
      posicion: decision.posicion,
      sugerenciasMostradas: decision.sugerenciasMostradas,
      previous,
    },
  }, { client });
}

async function createDecision({ codigoTraductor, payload, userAuth, audit }) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const item = await loadItemForUpdate(client, codigoTraductor);
    const existing = await client.query('SELECT codigo_traductor FROM cie10_decision WHERE codigo_traductor = $1', [codigoTraductor]);
    if (existing.rows[0]) throw appError(409, 'CIE10_YA_DECIDIDO', 'Otro revisor ya decidió este diagnóstico.');

    const decision = await buildDecision(client, item, payload, userAuth);
    const inserted = await client.query(
      `INSERT INTO cie10_decision (
         codigo_traductor, decision, codigo_final, codigo_interno_catalogo,
         comentario, posicion, sugerencias_mostradas, revisor_id, revisor_nombre
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING codigo_traductor, decision, codigo_final, codigo_interno_catalogo,
                 comentario, posicion, sugerencias_mostradas, revisor_id,
                 revisor_nombre, decidido_en`,
      [
        codigoTraductor,
        decision.decision,
        decision.codigoFinal,
        decision.codigoInternoCatalogo,
        decision.comentario,
        decision.posicion,
        decision.sugerenciasMostradas,
        decision.revisorId,
        decision.revisorNombre,
      ]
    );
    const row = { ...inserted.rows[0], diagnostico: item.diagnostico };
    await client.query(
      `INSERT INTO cie10_decision_historial (
         codigo_traductor, accion, decision_anterior, decision_nueva, revisor_id
       ) VALUES ($1, 'CREATED', NULL, $2::jsonb, $3)`,
      [codigoTraductor, JSON.stringify(publicDecisionPayload(inserted.rows[0])), userAuth.subject]
    );
    await insertAudit(client, audit, {
      tipoEvento: 'CIE10_DECISION_REGISTRADA',
      codigoTraductor,
      decision,
    });
    await client.query('COMMIT');
    return toDecision(row);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function updateDecision({ codigoTraductor, payload, userAuth, audit }) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const item = await loadItemForUpdate(client, codigoTraductor);
    const previousResult = await client.query(
      `SELECT codigo_traductor, decision, codigo_final, codigo_interno_catalogo,
              comentario, posicion, sugerencias_mostradas, revisor_id, revisor_nombre, decidido_en
         FROM cie10_decision
        WHERE codigo_traductor = $1
        FOR UPDATE`,
      [codigoTraductor]
    );
    const previous = previousResult.rows[0];
    if (!previous) throw appError(404, 'CIE10_SIN_DECISION', 'No hay una decisión que corregir.');

    const decision = await buildDecision(client, item, payload, userAuth);
    const updated = await client.query(
      `UPDATE cie10_decision
          SET decision = $2,
              codigo_final = $3,
              codigo_interno_catalogo = $4,
              comentario = $5,
              posicion = $6,
              sugerencias_mostradas = $7,
              revisor_id = $8,
              revisor_nombre = $9,
              decidido_en = now()
        WHERE codigo_traductor = $1
        RETURNING codigo_traductor, decision, codigo_final, codigo_interno_catalogo,
                  comentario, posicion, sugerencias_mostradas, revisor_id,
                  revisor_nombre, decidido_en`,
      [
        codigoTraductor,
        decision.decision,
        decision.codigoFinal,
        decision.codigoInternoCatalogo,
        decision.comentario,
        decision.posicion,
        decision.sugerenciasMostradas,
        decision.revisorId,
        decision.revisorNombre,
      ]
    );
    const row = { ...updated.rows[0], diagnostico: item.diagnostico };
    await client.query(
      `INSERT INTO cie10_decision_historial (
         codigo_traductor, accion, decision_anterior, decision_nueva, revisor_id
       ) VALUES ($1, 'UPDATED', $2::jsonb, $3::jsonb, $4)`,
      [
        codigoTraductor,
        JSON.stringify(publicDecisionPayload(previous)),
        JSON.stringify(publicDecisionPayload(updated.rows[0])),
        userAuth.subject,
      ]
    );
    await insertAudit(client, audit, {
      tipoEvento: 'CIE10_DECISION_CORREGIDA',
      codigoTraductor,
      decision,
      previous: publicDecisionPayload(previous),
      statusCode: 200,
    });
    await client.query('COMMIT');
    return toDecision(row);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function listDecisiones({ userAuth, query = {} }) {
  const page = clampInt(query.page, { defaultValue: 1, min: 1, max: 100000 });
  const pageSize = clampInt(query.pageSize, { defaultValue: 20, min: 1, max: MAX_LIMIT });
  const offset = (page - 1) * pageSize;

  const params = [userAuth.subject];
  const [rowsResult, totalResult, summaryResult] = await Promise.all([
    db.query(
      `SELECT d.codigo_traductor, s.diagnostico, d.decision, d.codigo_final,
              d.codigo_interno_catalogo, d.comentario, d.decidido_en, d.revisor_nombre
         FROM cie10_decision d
         JOIN cie10_sugerencia s ON s.codigo_traductor = d.codigo_traductor
        WHERE d.revisor_id = $1
        ORDER BY d.decidido_en DESC
        LIMIT $2 OFFSET $3`,
      [...params, pageSize, offset]
    ),
    db.query('SELECT count(*)::int AS total FROM cie10_decision WHERE revisor_id = $1', params),
    db.query(
      `SELECT
         count(*) FILTER (WHERE decision = 'ACEPTADA')::int AS aceptadas,
         count(*) FILTER (WHERE decision = 'RECHAZADA')::int AS rechazadas
       FROM cie10_decision
       WHERE revisor_id = $1`,
      params
    ),
  ]);

  return {
    items: rowsResult.rows.map(toDecision),
    total: totalResult.rows[0]?.total ?? 0,
    page,
    pageSize,
    resumen: {
      aceptadas: summaryResult.rows[0]?.aceptadas ?? 0,
      rechazadas: summaryResult.rows[0]?.rechazadas ?? 0,
    },
  };
}

function principalSuggestion(row) {
  return Array.isArray(row.sugerencias) && row.sugerencias.length > 0 ? row.sugerencias[0] : null;
}

async function listBatches({ query = {} }) {
  const state = String(query.estado ?? '').trim().toUpperCase();
  if (!['PENDIENTES', 'REVISADOS'].includes(state)) {
    throw appError(400, 'ESTADO_INVALIDO', 'estado debe ser PENDIENTES o REVISADOS.');
  }
  const page = clampInt(query.page, { defaultValue: 1, min: 1, max: 100000 });
  const pageSize = clampInt(query.pageSize, { defaultValue: 10, min: 1, max: MAX_LIMIT });
  const confirmedPredicate = state === 'REVISADOS' ? 'lc.confirmada_en IS NOT NULL' : 'lc.confirmada_en IS NULL';
  const base = `
    FROM cie10_run r
    LEFT JOIN cie10_lote_confirmacion lc ON lc.run_id = r.run_id
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE ri.codigo_traductor IS NULL)::int AS pendientes
        FROM cie10_sugerencia s
        LEFT JOIN cie10_revision_item ri
          ON ri.run_id = s.run_id AND ri.codigo_traductor = s.codigo_traductor
       WHERE s.run_id = r.run_id
    ) stats ON true
   WHERE r.estado = 'COMPLETED'`;
  const [items, total, counts] = await Promise.all([
    db.query(
      `SELECT r.run_id, r.periodo, r.finished_at, lc.confirmada_en,
              COALESCE(stats.total, 0) AS total, COALESCE(stats.pendientes, 0) AS pendientes
         ${base} AND ${confirmedPredicate}
        ORDER BY r.periodo DESC NULLS LAST, r.finished_at DESC NULLS LAST
        LIMIT $1 OFFSET $2`,
      [pageSize, (page - 1) * pageSize]
    ),
    db.query(`SELECT count(*)::int AS total ${base} AND ${confirmedPredicate}`),
    db.query(
      `SELECT
         count(*) FILTER (WHERE lc.confirmada_en IS NULL)::int AS pendientes,
         count(*) FILTER (WHERE lc.confirmada_en IS NOT NULL)::int AS revisados
       FROM cie10_run r
       LEFT JOIN cie10_lote_confirmacion lc ON lc.run_id = r.run_id
       WHERE r.estado = 'COMPLETED'`
    ),
  ]);
  return {
    items: items.rows.map((row) => ({
      runId: row.run_id,
      periodo: row.periodo,
      status: row.confirmada_en ? 'CONFIRMADO' : 'PENDIENTE_REVISION',
      finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
      total: row.total ?? 0,
      pendientes: row.pendientes ?? 0,
      confirmedAt: row.confirmada_en ? new Date(row.confirmada_en).toISOString() : null,
    })),
    total: total.rows[0]?.total ?? 0,
    page,
    pageSize,
    counts: {
      pendientes: counts.rows[0]?.pendientes ?? 0,
      revisados: counts.rows[0]?.revisados ?? 0,
    },
  };
}

async function loadBatchRun(runId) {
  const params = [];
  const idPredicate = runId ? `AND r.run_id = $${params.push(runId)}` : '';
  const result = await db.query(
    `SELECT r.run_id, r.periodo, r.rag_version, r.model, r.finished_at,
            c.version AS clausula_version, c.texto AS clausula_texto,
            lc.aceptada_por, lc.aceptada_en, lc.confirmada_en
       FROM cie10_run r
       CROSS JOIN LATERAL (
         SELECT version, texto FROM cie10_clausula WHERE activa = true LIMIT 1
       ) c
       LEFT JOIN cie10_lote_confirmacion lc ON lc.run_id = r.run_id
      WHERE r.estado = 'COMPLETED' ${idPredicate}
      ORDER BY r.finished_at DESC NULLS LAST, r.started_at DESC
      LIMIT 1`,
    params
  );
  const run = result.rows[0];
  if (!run) throw appError(404, 'CIE10_BATCH_NOT_FOUND', 'El lote CIE-10 no existe.');
  return run;
}

async function listBatch({ runId, userAuth, query = {} }) {
  const page = clampInt(query.page, { defaultValue: 1, min: 1, max: 100000 });
  const pageSize = clampInt(query.pageSize, { defaultValue: 20, min: 1, max: MAX_LIMIT });
  const confidence = query.confianza ? String(query.confianza).trim().toUpperCase() : null;
  if (confidence && !['ALTA', 'MEDIA', 'BAJA'].includes(confidence)) {
    throw appError(400, 'CONFIANZA_INVALIDA', 'confianza debe ser ALTA, MEDIA o BAJA.');
  }
  const rawQuery = String(query.q ?? '').trim();
  if (rawQuery && (rawQuery.length < 2 || rawQuery.length > 100)) {
    throw appError(400, 'BUSQUEDA_INVALIDA', 'q debe tener entre 2 y 100 caracteres.');
  }
  const run = await loadBatchRun(runId);
  const params = [run.run_id];
  const filters = [];
  if (confidence) filters.push(`s.sugerencias->0->>'confianza' = $${params.push(confidence)}`);
  if (rawQuery) {
    filters.push(`translate(lower(s.diagnostico), 'áéíóúüñ', 'aeiouun') LIKE '%' || $${params.push(normalizeSearchText(rawQuery))} || '%'`);
  }
  const filterSql = filters.length ? `AND ${filters.join(' AND ')}` : '';
  const listParams = [...params, pageSize, (page - 1) * pageSize];
  const limitPosition = listParams.length - 1;
  const offsetPosition = listParams.length;
  const [itemsResult, totalResult, pendingResult] = await Promise.all([
    db.query(
      `SELECT s.run_id, s.codigo_traductor, s.diagnostico, s.cie10_original, s.sugerencias,
              s.razonamiento_clinico, s.error, s.modelo, s.procesado_en, s.rag_version,
              ri.codigo_final AS borrador_codigo, ri.comentario AS borrador_comentario,
              ri.corregido AS borrador_corregido, ri.posicion AS borrador_posicion,
              ri.sugerencias_mostradas AS borrador_mostradas,
              d.decision, d.codigo_final AS decision_codigo
         FROM cie10_sugerencia s
         LEFT JOIN cie10_revision_item ri
           ON ri.run_id = s.run_id AND ri.codigo_traductor = s.codigo_traductor
         LEFT JOIN cie10_decision d ON d.codigo_traductor = s.codigo_traductor
        WHERE s.run_id = $1 ${filterSql}
        ORDER BY
          CASE
            WHEN s.error IS NOT NULL OR jsonb_array_length(s.sugerencias) = 0 THEN 0
            WHEN s.sugerencias->0->>'soporte' = 'REQUIERE_ATENCION' THEN 1
            WHEN s.sugerencias->0->>'confianza' = 'BAJA' THEN 2
            WHEN s.sugerencias->0->>'confianza' = 'MEDIA' THEN 3
            ELSE 4
          END,
          s.procesado_en, s.codigo_traductor
        LIMIT $${limitPosition} OFFSET $${offsetPosition}`,
      listParams
    ),
    db.query(`SELECT count(*)::int AS total FROM cie10_sugerencia s WHERE s.run_id = $1 ${filterSql}`, params),
    db.query(
      `SELECT count(*) FILTER (WHERE ri.codigo_traductor IS NULL)::int AS pendientes
         FROM cie10_sugerencia s
         LEFT JOIN cie10_revision_item ri
           ON ri.run_id = s.run_id AND ri.codigo_traductor = s.codigo_traductor
        WHERE s.run_id = $1`,
      [run.run_id]
    ),
  ]);

  return {
    runId: run.run_id,
    periodo: run.periodo,
    status: run.confirmada_en ? 'CONFIRMADO' : 'PENDIENTE_REVISION',
    ragVersion: run.rag_version,
    model: run.model,
    finishedAt: run.finished_at ? new Date(run.finished_at).toISOString() : null,
    clause: { version: run.clausula_version, text: run.clausula_texto },
    clauseAccepted: run.aceptada_por === userAuth.subject,
    clauseAcceptedAt: run.aceptada_en ? new Date(run.aceptada_en).toISOString() : null,
    confirmed: Boolean(run.confirmada_en),
    confirmedAt: run.confirmada_en ? new Date(run.confirmada_en).toISOString() : null,
    items: itemsResult.rows.map((row) => {
      const principal = principalSuggestion(row);
      const corrected = row.borrador_corregido ?? row.decision === 'RECHAZADA';
      const reviewed = row.borrador_codigo != null || row.decision != null;
      return {
        ...toSuggestion(row),
        principal,
        status: run.confirmada_en
          ? 'CONFIRMADO'
          : corrected
            ? 'CORREGIDO_POR_MEDICO'
            : principal
              ? 'AUTOCODIFICADO'
              : 'REQUIERE_ATENCION',
        finalCode: row.borrador_codigo ?? row.decision_codigo ?? principal?.codigo ?? '',
        corrected: Boolean(corrected),
        correctionComment: row.borrador_comentario ?? null,
        reviewed,
      };
    }),
    total: totalResult.rows[0]?.total ?? 0,
    page,
    pageSize,
    counts: { pendientes: pendingResult.rows[0]?.pendientes ?? 0 },
  };
}

async function listActiveBatch({ userAuth, query = {} }) {
  return listBatch({ runId: null, userAuth, query });
}

async function searchCatalog(query = {}) {
  const term = String(query.q ?? '').trim();
  const limit = clampInt(query.limit, { defaultValue: 10, min: 1, max: 20 });
  if (term.length < 2) return { items: [] };
  const result = await db.query(
    `SELECT c.codigo, c.descripcion, c.codigo_interno,
            c.en_catalogo_institucional, c.en_referencia_externa
       FROM cie10_rag_catalogo c
       JOIN cie10_rag_version v ON v.rag_version = c.rag_version AND v.estado = 'ACTIVE'
      WHERE c.codigo ILIKE $1 OR c.descripcion ILIKE $2
      ORDER BY
        CASE WHEN c.codigo ILIKE $1 THEN 0 ELSE 1 END,
        c.en_catalogo_institucional DESC, c.codigo
      LIMIT $3`,
    [`${term}%`, `%${term}%`, limit]
  );
  return {
    items: result.rows.map((row) => ({
      codigo: row.codigo,
      descripcion: row.descripcion,
      codigoInterno: row.codigo_interno ?? null,
      enCatalogoInstitucional: row.en_catalogo_institucional,
      enReferenciaExterna: row.en_referencia_externa,
    })),
  };
}

async function ensureMutableBatch(client, runId) {
  const result = await client.query(
    `SELECT r.run_id, lc.confirmada_en
       FROM cie10_run r
       LEFT JOIN cie10_lote_confirmacion lc ON lc.run_id = r.run_id
      WHERE r.run_id = $1 AND r.estado = 'COMPLETED'
      FOR UPDATE OF r`,
    [runId]
  );
  const run = result.rows[0];
  if (!run) throw appError(404, 'CIE10_BATCH_NOT_FOUND', 'El lote CIE-10 no existe.');
  if (run.confirmada_en) throw appError(409, 'CIE10_BATCH_ALREADY_CONFIRMED', 'El lote ya fue confirmado.');
}

async function loadBatchItem(client, runId, codigoTraductor) {
  const result = await client.query(
    `SELECT s.codigo_traductor, s.sugerencias, ri.corregido AS revision_corregida
       FROM cie10_sugerencia s
       LEFT JOIN cie10_revision_item ri
         ON ri.run_id = s.run_id AND ri.codigo_traductor = s.codigo_traductor
      WHERE s.run_id = $1 AND s.codigo_traductor = $2
      FOR UPDATE OF s`,
    [runId, codigoTraductor]
  );
  if (!result.rows[0]) throw appError(404, 'CIE10_NOT_FOUND', 'El registro no pertenece a este lote.');
  return result.rows[0];
}

function validateBatchAcceptance(item, payload) {
  const suggestions = Array.isArray(item.sugerencias) ? item.sugerencias : [];
  const position = Number.parseInt(payload.posicion, 10);
  const shown = Number.parseInt(payload.sugerenciasMostradas, 10);
  const code = normalizeCie10Code(payload.codigo);
  if (!Number.isInteger(shown) || shown < 1 || shown > 5 || !Number.isInteger(position)
    || position < 1 || position > shown || shown > suggestions.length) {
    throw appError(400, 'SUGERENCIAS_MOSTRADAS_INVALIDAS', 'La cantidad de sugerencias mostradas no es válida.');
  }
  if (normalizeCie10Code(suggestions[position - 1]?.codigo) !== code) {
    throw appError(400, 'SUGERENCIA_INVALIDA', 'El código no coincide con la sugerencia seleccionada.');
  }
  return { code, position, shown };
}

async function persistBatchAcceptance(client, { runId, codigoTraductor, accepted, userAuth, audit }) {
  const result = await client.query(
    `INSERT INTO cie10_revision_item (
       run_id, codigo_traductor, codigo_final, comentario, corregido,
       posicion, sugerencias_mostradas, revisor_id
     ) VALUES ($1, $2, $3, NULL, false, $4, $5, $6)
     ON CONFLICT (run_id, codigo_traductor) DO UPDATE SET
       codigo_final = EXCLUDED.codigo_final, comentario = NULL, corregido = false,
       posicion = EXCLUDED.posicion, sugerencias_mostradas = EXCLUDED.sugerencias_mostradas,
       revisor_id = EXCLUDED.revisor_id, updated_at = now()
     RETURNING codigo_traductor, codigo_final, comentario, corregido, updated_at`,
    [runId, codigoTraductor, accepted.code, accepted.position, accepted.shown, userAuth.subject]
  );
  await recordAuditEvent(audit, {
    tipoEvento: 'CIE10_BORRADOR_ACEPTADO', entidadTipo: 'Cie10', entidadId: codigoTraductor,
    statusCode: 200,
    detalle: {
      runId, codigoTraductor, codigoFinal: accepted.code,
      posicion: accepted.position, sugerenciasMostradas: accepted.shown,
    },
  }, { client });
  return {
    codigoTraductor: result.rows[0].codigo_traductor,
    codigoFinal: result.rows[0].codigo_final,
    comentario: null,
    corrected: false,
    updatedAt: new Date(result.rows[0].updated_at).toISOString(),
  };
}

async function acceptBatchItem({ runId, codigoTraductor, payload, userAuth, audit }) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await ensureMutableBatch(client, runId);
    const item = await loadBatchItem(client, runId, codigoTraductor);
    const accepted = validateBatchAcceptance(item, payload);
    const response = await persistBatchAcceptance(client, {
      runId, codigoTraductor, accepted, userAuth, audit,
    });
    await client.query('COMMIT');
    return response;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function acceptBatchItems({ runId, payload, userAuth, audit }) {
  const requested = Array.isArray(payload.items) ? payload.items : [];
  if (requested.length < 1 || requested.length > 50) {
    throw appError(400, 'ACEPTACION_MASIVA_INVALIDA', 'Debe aceptar entre 1 y 50 filas.');
  }
  const identifiers = requested.map((item) => String(item.codigoTraductor ?? '').trim());
  if (identifiers.some((id) => !id) || new Set(identifiers).size !== identifiers.length) {
    throw appError(400, 'ACEPTACION_MASIVA_INVALIDA', 'Las filas deben ser únicas y tener identificador.');
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await ensureMutableBatch(client, runId);
    const prepared = [];
    for (const request of requested) {
      const codigoTraductor = String(request.codigoTraductor).trim();
      const item = await loadBatchItem(client, runId, codigoTraductor);
      if (item.revision_corregida) {
        const error = appError(409, 'CIE10_YA_CORREGIDO', 'Una fila ya fue corregida por un médico.');
        error.detalle = { codigoTraductor };
        throw error;
      }
      try {
        prepared.push({ codigoTraductor, accepted: validateBatchAcceptance(item, request) });
      } catch (error) {
        error.detalle = { codigoTraductor };
        throw error;
      }
    }
    const accepted = [];
    for (const item of prepared) {
      accepted.push(await persistBatchAcceptance(client, {
        runId, ...item, userAuth, audit,
      }));
    }
    await client.query('COMMIT');
    return { aceptados: accepted };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function saveBatchCorrection({ runId, codigoTraductor, payload, userAuth, audit }) {
  const code = normalizeCie10Code(payload.codigo);
  if (!FORMATO_CIE10.test(code)) throw appError(400, 'FORMATO_CIE10', 'El código no tiene formato CIE-10.');
  const shown = payload.sugerenciasMostradas == null
    ? null
    : Number.parseInt(payload.sugerenciasMostradas, 10);
  if (shown != null && (!Number.isInteger(shown) || shown < 0 || shown > 5)) {
    throw appError(400, 'SUGERENCIAS_MOSTRADAS_INVALIDAS', 'La cantidad de sugerencias mostradas no es válida.');
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await ensureMutableBatch(client, runId);
    await loadBatchItem(client, runId, codigoTraductor);
    const catalog = await client.query(
      `SELECT c.codigo, c.codigo_interno
         FROM cie10_rag_catalogo c
         JOIN cie10_rag_version v ON v.rag_version = c.rag_version AND v.estado = 'ACTIVE'
        WHERE c.codigo = $1
        LIMIT 1`,
      [code]
    );
    const outsideCatalog = !catalog.rows[0];
    if (outsideCatalog && payload.fueraDeCatalogo !== true) {
      throw appError(400, 'CIE10_FUERA_DE_CATALOGO', 'El código no está en el catálogo CIE-10 vigente.');
    }
    const result = await client.query(
      `INSERT INTO cie10_revision_item (
         run_id, codigo_traductor, codigo_final, comentario, corregido,
         posicion, sugerencias_mostradas, revisor_id
       )
       SELECT $1, s.codigo_traductor, $3, NULL, true, NULL, $4, $5
         FROM cie10_sugerencia s
        WHERE s.run_id = $1 AND s.codigo_traductor = $2
       ON CONFLICT (run_id, codigo_traductor) DO UPDATE SET
         codigo_final = EXCLUDED.codigo_final, comentario = NULL,
         corregido = true, posicion = NULL,
         sugerencias_mostradas = EXCLUDED.sugerencias_mostradas,
         revisor_id = EXCLUDED.revisor_id, updated_at = now()
       RETURNING codigo_traductor, codigo_final, comentario, corregido, updated_at`,
      [runId, codigoTraductor, code, shown, userAuth.subject]
    );
    if (!result.rows[0]) throw appError(404, 'CIE10_NOT_FOUND', 'El registro no pertenece a este lote.');
    await recordAuditEvent(audit, {
      tipoEvento: 'CIE10_BORRADOR_CORREGIDO', entidadTipo: 'Cie10', entidadId: codigoTraductor,
      statusCode: 200,
      detalle: { runId, codigoTraductor, codigoFinal: code, fueraDeCatalogo: outsideCatalog },
    }, { client });
    await client.query('COMMIT');
    return {
      codigoTraductor: result.rows[0].codigo_traductor,
      codigoFinal: result.rows[0].codigo_final,
      comentario: result.rows[0].comentario,
      corrected: result.rows[0].corregido,
      updatedAt: new Date(result.rows[0].updated_at).toISOString(),
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function acceptBatchClause({ runId, clauseVersion, userAuth, audit }) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const clause = await client.query(
      'SELECT version FROM cie10_clausula WHERE version = $1 AND activa = true',
      [clauseVersion]
    );
    if (!clause.rows[0]) throw appError(409, 'CIE10_CLAUSE_OUTDATED', 'La cláusula cambió; vuelva a leerla.');
    const inserted = await client.query(
      `INSERT INTO cie10_lote_confirmacion (run_id, clausula_version, aceptada_por)
       SELECT r.run_id, $2, $3 FROM cie10_run r WHERE r.run_id = $1 AND r.estado = 'COMPLETED'
       ON CONFLICT (run_id) DO UPDATE SET
         clausula_version = EXCLUDED.clausula_version,
         aceptada_por = EXCLUDED.aceptada_por,
         aceptada_en = now()
       WHERE cie10_lote_confirmacion.confirmada_en IS NULL
       RETURNING run_id, clausula_version, aceptada_en`,
      [runId, clauseVersion, userAuth.subject]
    );
    if (!inserted.rows[0]) throw appError(409, 'CIE10_BATCH_ALREADY_CONFIRMED', 'El lote ya fue confirmado o no existe.');
    await recordAuditEvent(audit, {
      tipoEvento: 'CIE10_CLAUSULA_ACEPTADA', entidadTipo: 'Cie10Run', entidadId: runId,
      statusCode: 200, detalle: { runId, clauseVersion },
    }, { client });
    await client.query('COMMIT');
    return { runId, clauseVersion, acceptedAt: new Date(inserted.rows[0].aceptada_en).toISOString() };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function confirmBatch({ runId, userAuth, audit }) {
  const client = await db.connect();
  let response;
  try {
    await client.query('BEGIN');
    const confirmation = await client.query(
      `SELECT run_id, clausula_version, aceptada_por, confirmada_en
         FROM cie10_lote_confirmacion WHERE run_id = $1 FOR UPDATE`,
      [runId]
    );
    const state = confirmation.rows[0];
    if (!state || state.aceptada_por !== userAuth.subject) {
      throw appError(409, 'CIE10_CLAUSE_REQUIRED', 'Debe aceptar la cláusula vigente antes de confirmar.');
    }
    if (state.confirmada_en) throw appError(409, 'CIE10_BATCH_ALREADY_CONFIRMED', 'El lote ya fue confirmado.');

    const items = await client.query(
      `SELECT s.codigo_traductor, s.sugerencias,
              ri.codigo_final, ri.comentario, ri.corregido,
              ri.posicion, ri.sugerencias_mostradas
         FROM cie10_sugerencia s
         JOIN cie10_run r ON r.run_id = s.run_id
         LEFT JOIN cie10_revision_item ri
           ON ri.run_id = s.run_id AND ri.codigo_traductor = s.codigo_traductor
        WHERE s.run_id = $1
        ORDER BY s.procesado_en, s.codigo_traductor
        FOR UPDATE OF s`,
      [runId]
    );
    if (items.rows.length === 0) throw appError(422, 'CIE10_BATCH_EMPTY', 'El lote no contiene registros.');
    const incomplete = items.rows.filter((row) => !row.codigo_final);
    if (incomplete.length > 0) {
      throw appError(422, 'CIE10_BATCH_INCOMPLETE', `${incomplete.length} registros sin aceptar ni corregir.`);
    }

    const confirmedAt = new Date();
    for (const row of items.rows) {
      const corrected = Boolean(row.corregido);
      const code = row.codigo_final;
      const catalogResult = await client.query(
        `SELECT c.codigo_interno
           FROM cie10_rag_catalogo c
           JOIN cie10_rag_version v ON v.rag_version = c.rag_version AND v.estado = 'ACTIVE'
          WHERE c.codigo = $1
          LIMIT 1`,
        [code]
      );
      const catalog = catalogResult.rows[0] ?? null;
      await client.query(
        `INSERT INTO cie10_decision (
           codigo_traductor, decision, codigo_final, codigo_interno_catalogo,
           comentario, posicion, sugerencias_mostradas, revisor_id, revisor_nombre, decidido_en
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (codigo_traductor) DO NOTHING`,
        [row.codigo_traductor, corrected ? 'RECHAZADA' : 'ACEPTADA', code,
          catalog?.codigo_interno ?? null,
          null, corrected ? null : row.posicion,
          row.sugerencias_mostradas ?? Math.min(Array.isArray(row.sugerencias) ? row.sugerencias.length : 0, 5),
          userAuth.subject, userAuth.displayName, confirmedAt]
      );
    }
    await client.query(
      `UPDATE cie10_lote_confirmacion
          SET confirmada_por = $2, confirmada_en = $3, total_registros = $4
        WHERE run_id = $1`,
      [runId, userAuth.subject, confirmedAt, items.rows.length]
    );
    await recordAuditEvent(audit, {
      tipoEvento: 'CIE10_LOTE_CONFIRMADO', entidadTipo: 'Cie10Run', entidadId: runId,
      statusCode: 200, detalle: { runId, clauseVersion: state.clausula_version, total: items.rows.length },
    }, { client });
    await client.query('COMMIT');
    response = {
      runId, confirmed: true, total: items.rows.length,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  return response;
}

async function latestExportUrl() {
  const { bucket, prefix } = parseS3Prefix(process.env.CIE10_REVIEW_EXPORT_S3_PREFIX);
  const listed = await getInternalS3Client().send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
  }));
  const latest = (listed.Contents ?? [])
    .filter((item) => item.Key && item.Key.endsWith('.csv'))
    .sort((a, b) => {
      const byDate = new Date(b.LastModified ?? 0).getTime() - new Date(a.LastModified ?? 0).getTime();
      return byDate || String(b.Key).localeCompare(String(a.Key));
    })[0];

  if (!latest?.Key) {
    throw appError(404, 'CIE10_EXPORT_NOT_FOUND', 'Todavía no hay CSV exportado.');
  }

  const filename = latest.Key.split('/').pop() || 'cie10-reviewed.csv';
  const presignedUrl = await generatePresignedReadUrl(latest.Key, {
    bucket,
    expiresIn: EXPORT_URL_TTL_SECONDS,
    responseContentDisposition: `attachment; filename="${filename}"`,
    responseContentType: 'text/csv; charset=utf-8',
  });
  if (!presignedUrl) {
    throw appError(404, 'CIE10_EXPORT_NOT_FOUND', 'Todavía no hay CSV exportado.');
  }

  return {
    presignedUrl,
    objectKey: latest.Key,
    expiresIn: EXPORT_URL_TTL_SECONDS,
    generatedAt: latest.LastModified ? new Date(latest.LastModified).toISOString() : null,
    sizeBytes: latest.Size ?? null,
  };
}

function failureAuditDetail(err, codigoTraductor, payload) {
  return {
    codigoTraductor,
    errorCode: err?.code ?? null,
    decision: payload?.decision ?? null,
    codigoFinal: payload?.decision === 'ACEPTADA'
      ? normalizeCie10Code(payload.codigo)
      : normalizeCie10Code(payload?.codigoCorrecto),
    sugerenciasMostradas: payload?.sugerenciasMostradas ?? null,
  };
}

module.exports = {
  acceptBatchItem,
  acceptBatchItems,
  acceptBatchClause,
  confirmBatch,
  createDecision,
  failureAuditDetail,
  getSugerencia,
  latestExportUrl,
  listActiveBatch,
  listBatch,
  listBatches,
  listDecisiones,
  listSugerencias,
  normalizeCie10Code,
  saveBatchCorrection,
  searchCatalog,
  updateDecision,
};
