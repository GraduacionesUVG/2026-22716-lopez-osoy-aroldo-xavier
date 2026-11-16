'use strict';

const crypto = require('crypto');
const db = require('../config/db');
const { logEvent, logError } = require('../config/logger');
const pdfOutbox = require('./pdf-outbox.service');
const {
  acquireSubmission,
  completeSubmission,
  rollbackSubmission,
} = require('./patient-session.service');
const { verifyUploadedObjects } = require('./upload.service');
const { encryptPatientName, encryptText, patientNameToken, tokenizePatientName } = require('../utils/patientName');
const { normalizeTenantId } = require('../utils/tenant');
const { recordAuditEvent, sessionAuditActor } = require('./audit.service');
const {
  resolveSignatureInput,
  parseSignaturePng,
  sanitizeEvidence,
  buildSignatureKey,
  putSignaturePng,
  deleteSignaturePng,
} = require('./consent-signature.service');
const { canonicalJson } = require('../utils/canonicalJson');

const PLACEHOLDER_HASH = '0'.repeat(64);
// Indices unicos de 10_ficha_provisional.sql: otra ficha vigente con la misma HC.
const CURRENT_FICHA_CONSTRAINTS = new Set(['ux_ficha_vigente_por_hc', 'ux_ficha_provisional_activa_hc']);

// ── Error helper ───────────────────────────────────────────────────────────

function appError(status, code, message) {
  const err = new Error(message ?? code);
  err.status = status;
  err.code = code;
  return err;
}

function validateUploadReferences(body, sessionPayload) {
  // Redis Lua serializa una lista vacia como `{}` al activar la sesion.
  // Tratar cualquier forma no-array como una lista vacia mantiene el contrato
  // hasta que exista al menos un upload registrado.
  const sessionUploads = Array.isArray(sessionPayload.uploads) ? sessionPayload.uploads : [];
  const uploads = new Map(
    sessionUploads.map((upload) => [upload.objectKey, upload.category])
  );

  const references = [
    ...(body.warningSigns ?? [])
      .filter((item) => item.imageResourceId != null)
      .map((item) => ({ objectKey: item.imageResourceId, category: 'profile' })),
    ...(body.examDiagnoses ?? [])
      .filter((item) => item.examResourceId != null)
      .map((item) => ({ objectKey: item.examResourceId, category: 'exam' })),
  ];

  for (const reference of references) {
    if (uploads.get(reference.objectKey) !== reference.category) {
      throw appError(
        400,
        'INVALID_UPLOAD_REFERENCE',
        'An upload reference does not belong to this session or category'
      );
    }
  }
}

// ── Main service ───────────────────────────────────────────────────────────

async function registerFicha({ redisSessionKey, body, ip, audit }) {
  if (!audit) throw new Error('audit context is required to register a ficha');
  const {
    referralSourceId,
    birthMethodId = null,
    sexId,
    affectedRelatives,
    affectedRelativesCategoryIds = [],
    affectedUnderageRelatives,
    affectedAdultRelatives,
    affectedCommunityMembers,
    warningSigns = [],
    examDiagnoses = [],
    observations = [],
    consent,
  } = body;

  // Atomically reserve this capability for one submission. The fixed fichaId
  // makes retries idempotent even if a client loses the HTTP response.
  const acquisition = await acquireSubmission(redisSessionKey);
  if (acquisition.alreadySubmitted) {
    return { ...acquisition.payload.result, alreadySubmitted: true };
  }
  if (acquisition.inProgress) {
    // Recovery path for the narrow window where PostgreSQL committed but the
    // Redis CONSUMED transition failed. A truly concurrent request will not
    // see an uncommitted row and still receives SESSION_PROCESSING.
    const existing = await db.query(
      `SELECT f.ficha_id, c.consentimiento_id, c.fecha_hora_aceptacion
       FROM ficha_clinica f
       JOIN consentimiento c ON c.ficha_id = f.ficha_id
       WHERE f.ficha_id = $1`,
      [acquisition.payload.fichaId]
    );
    if (existing.rows[0]) {
      const recovered = {
        fichaId: existing.rows[0].ficha_id,
        consentimientoId: existing.rows[0].consentimiento_id,
        // El sello persistido, no uno nuevo: este camino recupera una
        // transaccion que ya habia hecho COMMIT.
        fechaHoraAceptacion: existing.rows[0].fecha_hora_aceptacion.toISOString(),
      };
      await completeSubmission(redisSessionKey, recovered);
      return { ...recovered, alreadySubmitted: true };
    }
    throw appError(409, 'SESSION_PROCESSING', 'The form submission is already in progress');
  }

  const sessionPayload = acquisition.payload;
  const { systemId, paciente: pacienteInfo, consulta, medico: medicoInfo } = sessionPayload;
  const origenCreacion = sessionPayload.origenCreacion === 'MANUAL' ? 'MANUAL' : 'INTEGRACION';
  const flowId = sessionPayload.sessionId;
  const fichaId = sessionPayload.fichaId;
  const historiaClinica = String(
    pacienteInfo.historiaClinica ?? pacienteInfo.externalID ?? pacienteInfo.patientId
  ).trim();
  const idTenant = normalizeTenantId(pacienteInfo.tenantId);
  if (!historiaClinica || !Number.isInteger(idTenant)) {
    throw appError(400, 'SESSION_PATIENT_CONTEXT_INCOMPLETE', 'Patient history and tenant are required');
  }
  // Lo fija /sessions/manual tras confirmar en SADC que la HC no existe.
  const provisional = sessionPayload.provisional?.historiaClinicaReferida
    ? { historiaClinicaReferida: String(sessionPayload.provisional.historiaClinicaReferida) }
    : null;

  logEvent('REGISTRO_FICHA_INICIO', { systemId, flowId, fichaId });
  const ahora = new Date();

  let client;
  let transactionStarted = false;
  let committed = false;
  let signatureKey = null;
  let signatureUploaded = false;
  try {
    validateUploadReferences(body, sessionPayload);
    await verifyUploadedObjects(sessionPayload, body);
    // La imagen de la firma no entra a la base: solo su ruta y su hash. La
    // evidencia tecnica se reduce a los campos permitidos.
    const signature = parseSignaturePng(resolveSignatureInput(consent));
    const evidence = sanitizeEvidence(consent.firmaEvidenciaTecnica);
    client = await db.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    const sexoRes = await client.query(
      `SELECT sexo_id FROM sexo_catalogo WHERE sexo_id = $1 AND activo = true`,
      [sexId]
    );
    if (!sexoRes.rows[0]) {
      throw appError(400, 'INVALID_SEX_ID', 'sexId does not exist or is inactive');
    }

    // Una ficha vigente por HC y tenant. Esto da un 409 claro; la garantia la
    // pone ux_ficha_vigente_por_hc, que tambien cubre dos registros simultaneos.
    const vigenteRes = await client.query(
      `SELECT 1 FROM ficha_clinica
       WHERE id_tenant = $1 AND historia_clinica = $2 AND es_vigente
       LIMIT 1`,
      [idTenant, historiaClinica]
    );
    if (vigenteRes.rows[0]) {
      throw appError(409, 'FICHA_VIGENTE_EXISTE', 'This patient already has a current ficha');
    }

    // ── 1. Upsert paciente — force the pre-generated UUID as PK ────────────
    // pacienteInfo.patientId  → internal UUID (pre-generated in /sessions/init)
    // pacienteInfo.externalID → external ID from the SADC (e.g. "PAC-001")
    const { nombreEnc, nombreDekEnc } = encryptPatientName(pacienteInfo.nombre);
    const pacienteRes = await client.query(
      `INSERT INTO paciente (paciente_id, system_id, paciente_ext_id, nombre_enc, nombre_dek_enc)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (system_id, paciente_ext_id)
       DO UPDATE SET ultima_sincronizacion = NOW()
       RETURNING paciente_id`,
      [pacienteInfo.patientId, systemId, pacienteInfo.externalID, nombreEnc, nombreDekEnc]
    );
    const pacienteId = pacienteRes.rows[0].paciente_id;
    await client.query('DELETE FROM paciente_nombre_token WHERE paciente_id = $1', [pacienteId]);
    for (const token of tokenizePatientName(pacienteInfo.nombre)) {
      await client.query(
        `INSERT INTO paciente_nombre_token (paciente_id, token_hmac)
         VALUES ($1, $2)
         ON CONFLICT (paciente_id, token_hmac) DO NOTHING`,
        [pacienteId, patientNameToken(token)]
      );
    }
    logEvent('PACIENTE_UPSERT', { pacienteId, systemId });

    // ── 2. Upsert usuario (médico) — force the pre-generated UUID as PK ────
    // medicoInfo.medicoId  → internal UUID (pre-generated in /sessions/init)
    // medicoInfo.externalId → external ID from the SADC (e.g. "MED-001")
    const usuarioRes = await client.query(
      `INSERT INTO usuario (usuario_id, system_id, usuario_ext_id, nombre, rol, especialidad)
       VALUES ($1, $2, $3, $4, 'MEDICO', $5)
       ON CONFLICT (system_id, usuario_ext_id)
       DO UPDATE SET nombre = EXCLUDED.nombre, especialidad = EXCLUDED.especialidad
       RETURNING usuario_id`,
      [medicoInfo.medicoId, systemId, medicoInfo.externalId, medicoInfo.nombre, medicoInfo.especialidad]
    );
    const medicoId = usuarioRes.rows[0].usuario_id;
    logEvent('MEDICO_UPSERT', { medicoId, systemId });

    // ── 3. Determine version_ficha ──────────────────────────────────────────
    const versionRes = await client.query(
      `SELECT COALESCE(MAX(version_ficha), 0) + 1 AS next_version
       FROM ficha_clinica WHERE paciente_id = $1`,
      [pacienteId]
    );
    const versionFicha = versionRes.rows[0].next_version;

    // ── 4. Insert ficha_clinica ─────────────────────────────────────────────
    await client.query(
      `INSERT INTO ficha_clinica (
         ficha_id, paciente_id, sesion_id, origen_creacion, medico_id,
         fecha_consulta, diagnosticos_ext_texto,
         estado_ficha, version_ficha, fecha_creacion, fecha_modificacion,
         creado_por, historia_clinica, id_tenant, ficha_raiz_id, es_vigente
       ) VALUES ($1, $2, NULL, $3, $4, $5, $6, 'COMPLETA', $7, $8, $8, $4, $9, $10, $1, true)`,
      [fichaId, pacienteId, origenCreacion, medicoId, consulta.fechaConsulta, consulta.diagnosticoTexto, versionFicha, ahora, historiaClinica, idTenant]
    );
    logEvent('FICHA_CLINICA_INSERT', { fichaId, pacienteId, medicoId, versionFicha });

    // ── 4b. Ficha provisional ───────────────────────────────────────────────
    // Misma transaccion que la ficha: el trigger de ficha_provisional valida
    // que la raiz exista con este tenant y esta HC TMP-.
    if (provisional) {
      await client.query(
        `INSERT INTO ficha_provisional (
           ficha_raiz_id, id_tenant, historia_clinica_referida,
           historia_clinica_provisional, creado_por
         ) VALUES ($1, $2, $3, $4, $5)`,
        [fichaId, idTenant, provisional.historiaClinicaReferida, historiaClinica, medicoId]
      );
      logEvent('FICHA_PROVISIONAL_INSERT', { fichaId });
    }

    // ── 5. Insert consentimiento ────────────────────────────────────────────
    // Hash sobre JSON canonico: se puede recalcular desde la fila jsonb.
    const jsonHash = crypto
      .createHash('sha256')
      .update(canonicalJson(evidence))
      .digest('hex');
    // El id se fija aqui para que la ruta de la firma exista antes del INSERT.
    const consentimientoId = crypto.randomUUID();
    signatureKey = buildSignatureKey({ systemId, pacienteId, consentimientoId });

    await client.query(
      `INSERT INTO consentimiento (
         consentimiento_id, ficha_id, medico_id, tipo_firmante, nombre_firmante,
         idioma_consentimiento, aceptacion_terminos, aceptacion_contacto,
         fecha_hora_aceptacion, firma_evidencia_tecnica, firma_png_ref,
         pdf_hash_sha256, firma_png_hash_sha256, json_hash_sha256,
         ip_dispositivo, session_id, estado_consentimiento
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'VIGENTE')`,
      [
        consentimientoId, fichaId, medicoId,
        consent.tipoFirmante, consent.nombreFirmante,
        consent.idiomaConsentimiento, consent.aceptacionTerminos, consent.aceptacionContacto,
        ahora, JSON.stringify(evidence), signatureKey,
        PLACEHOLDER_HASH, signature.sha256, jsonHash, ip, flowId,
      ]
    );
    logEvent('CONSENTIMIENTO_INSERT', { consentimientoId, fichaId });

    // ── 6. Insert datos_adicionales_ficha ───────────────────────────────────
    await client.query(
      `INSERT INTO datos_adicionales_ficha (
         ficha_id, referido_de_id, asistencia_parto_id,
         familiares_afectos, personas_hogar_menores, personas_hogar_adultos,
         comunidad_afectada, sexo_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [fichaId, referralSourceId, birthMethodId, affectedRelatives, affectedUnderageRelatives, affectedAdultRelatives, affectedCommunityMembers, sexId]
    );
    logEvent('DATOS_ADICIONALES_INSERT', { fichaId });

    // ── 7. Insert familiar_afectado ─────────────────────────────────────────
    for (const familiarId of affectedRelativesCategoryIds) {
      await client.query(
        `INSERT INTO familiar_afectado (ficha_id, familiar_catalogo_id) VALUES ($1, $2)`,
        [fichaId, familiarId]
      );
    }
    if (affectedRelativesCategoryIds.length > 0) {
      logEvent('FAMILIARES_AFECTADOS_INSERT', { fichaId, count: affectedRelativesCategoryIds.length });
    }

    // ── 8. Insert signo_alerta_ficha ────────────────────────────────────────
    for (const signo of warningSigns) {
      await client.query(
        `INSERT INTO signo_alerta_ficha (
           ficha_id, signo_texto_libre, parte_id,
           imagen_bucket_ref, fecha_registro, registrado_por
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [fichaId, signo.signDescription.trim(), signo.partCatalogId, signo.imageResourceId ?? null, ahora, medicoId]
      );
    }
    if (warningSigns.length > 0) {
      logEvent('SIGNOS_ALERTA_INSERT', { fichaId, count: warningSigns.length });
    }

    // ── 9. Insert examen_ficha ──────────────────────────────────────────────
    for (const examen of examDiagnoses) {
      await client.query(
        `INSERT INTO examen_ficha (
           ficha_id, examen_texto_libre,
           imagen_bucket_ref, fecha_registro, registrado_por
         ) VALUES ($1, $2, $3, $4, $5)`,
        [fichaId, examen.examDescription.trim(), examen.examResourceId ?? null, ahora, medicoId]
      );
    }
    if (examDiagnoses.length > 0) {
      logEvent('EXAMENES_INSERT', { fichaId, count: examDiagnoses.length });
    }

    // ── 10. Insert observacion_ficha ────────────────────────────────────────
    for (const observacion of observations) {
      const { textEnc, dekEnc } = encryptText(observacion.observationText.trim());
      await client.query(
        `INSERT INTO observacion_ficha (
           ficha_id, texto_enc, texto_dek_enc, agregada_en_revision,
           fecha_creacion, usuario_id
         ) VALUES ($1, $2, $3, false, $4, $5)`,
        [fichaId, textEnc, dekEnc, ahora, medicoId]
      );
    }
    if (observations.length > 0) {
      logEvent('OBSERVACIONES_INSERT', { fichaId, count: observations.length });
    }

    // ── 11. Bitacora ────────────────────────────────────────────────────────
    // El flujo usa X-Session-Token, no un bearer: el actor sale de la sesion y
    // usuario_id apunta al medico materializado en el paso 2 de esta transaccion.
    const actor = sessionAuditActor(sessionPayload);
    await recordAuditEvent(audit, {
      tipoEvento: 'FICHA_CREADA',
      entidadTipo: 'Ficha',
      entidadId: fichaId,
      usuarioId: medicoId,
      idTenant,
      actor,
      detalle: {
        systemId,
        origenCreacion,
        provisional: Boolean(provisional),
        versionFicha,
        sexId,
        signos: warningSigns.length,
        examenes: examDiagnoses.length,
        observaciones: observations.length,
        familiares: affectedRelativesCategoryIds.length,
      },
    }, { client });
    await recordAuditEvent(audit, {
      tipoEvento: 'CONSENTIMIENTO_FIRMADO',
      entidadTipo: 'Consentimiento',
      entidadId: consentimientoId,
      usuarioId: medicoId,
      idTenant,
      actor,
      detalle: {
        fichaId,
        tipoFirmante: consent.tipoFirmante,
        idioma: consent.idiomaConsentimiento,
        aceptacionContacto: consent.aceptacionContacto,
        firmaHashSha256: jsonHash,
        firmaPngHashSha256: signature.sha256,
      },
    }, { client });
    if (provisional) {
      // Sin HC ni nombre en el detalle: la HC provisional ya esta en la ficha.
      await recordAuditEvent(audit, {
        tipoEvento: 'FICHA_PROVISIONAL_CREADA',
        entidadTipo: 'Ficha',
        entidadId: fichaId,
        usuarioId: medicoId,
        idTenant,
        actor,
        detalle: { origenCreacion },
      }, { client });
    }

    // ── Trabajo del PDF en la bandeja de salida ─────────────────────────────
    // En la misma transaccion: si el broker esta caido el trabajo no se pierde,
    // queda pendiente y el despachador lo publica despues.
    const pdfJob = await pdfOutbox.enqueuePdfJob(client, {
      consentimientoId,
      fichaId,
      requestedAt: ahora.toISOString(),
    });

    // ── Firma a S3 ──────────────────────────────────────────────────────────
    // Ultimo paso antes del COMMIT: si la subida falla, la transaccion se
    // revierte y no queda una fila apuntando a un objeto inexistente.
    await putSignaturePng({ key: signatureKey, buffer: signature.buffer, sha256: signature.sha256, consentimientoId });
    signatureUploaded = true;

    // ── COMMIT ──────────────────────────────────────────────────────────────
    await client.query('COMMIT');
    committed = true;
    logEvent('TRANSACCION_COMMIT', { fichaId, consentimientoId });

    // `ahora` es el mismo instante que se persistio en fecha_hora_aceptacion y
    // que imprime el PDF. Se devuelve para que la interfaz muestre ese sello y
    // no uno calculado en el navegador: el esquema exige hora del servidor.
    const result = {
      fichaId,
      consentimientoId,
      fechaHoraAceptacion: ahora.toISOString(),
      fichaRaizId: fichaId,
      revision: versionFicha,
      estadoFicha: 'COMPLETA',
      historiaClinica,
      tenantId: String(idTenant),
    };
    try {
      await completeSubmission(redisSessionKey, result);
    } catch (err) {
      // The database is authoritative after COMMIT. Keep the successful HTTP
      // response and surface the reconciliation need without exposing PHI.
      logError('SESSION_COMPLETION_FAILED', { fichaId, error: err.message });
    }

    // ── Post-commit: primer intento de publicar el PDF ──────────────────────
    // Si falla, la fila de pdf_outbox sigue pendiente y el despachador la
    // reintenta; la respuesta no depende del broker.
    await pdfOutbox.publishNow(client, pdfJob);

    return { ...result, alreadySubmitted: false };
  } catch (err) {
    if (client && transactionStarted && !committed) {
      await client.query('ROLLBACK');
    }
    if (signatureUploaded && !committed) {
      await deleteSignaturePng(signatureKey);
    }
    if (!committed) {
      try {
        await rollbackSubmission(redisSessionKey);
      } catch (rollbackErr) {
        logError('SESSION_ROLLBACK_FAILED', { fichaId, error: rollbackErr.message });
      }
    }
    if (err.code === '23505' && CURRENT_FICHA_CONSTRAINTS.has(err.constraint)) {
      logError('FICHA_VIGENTE_EXISTE', { fichaId });
      throw appError(409, 'FICHA_VIGENTE_EXISTE', 'This patient already has a current ficha');
    }
    if (err.code === '23505' && err.constraint && err.constraint.includes('ficha_clinica')) {
      logError('FICHA_ALREADY_EXISTS', { fichaId });
      throw appError(409, 'FICHA_ALREADY_EXISTS', 'A ficha has already been submitted for this session');
    }
    logError('TRANSACCION_ROLLBACK', { fichaId, error: err.message, pgCode: err.code });
    throw err;
  } finally {
    client?.release();
  }
}

module.exports = { registerFicha, validateUploadReferences };
