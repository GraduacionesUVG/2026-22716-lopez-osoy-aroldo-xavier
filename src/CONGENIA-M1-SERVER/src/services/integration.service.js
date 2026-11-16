'use strict';

const crypto = require('crypto');
const db = require('../config/db');
const { connectRedis } = require('../config/redis');
const { encryptSessionKey } = require('../utils/sessionTokenCrypto');
const { activateSession: activatePatientSession } = require('./patient-session.service');
const { normalizeTenantId } = require('../utils/tenant');
const { sessionAuditActor } = require('./audit.service');

function appError(status, code, message) {
  const err = new Error(message ?? code);
  err.status = status;
  err.code = code;
  return err;
}

function resolveAuthorizedTenant(authContext, requestedTenant) {
  const authorized = normalizeTenantId(authContext?.tenantId);
  const requested = requestedTenant == null ? null : normalizeTenantId(requestedTenant);
  if (!Number.isInteger(authorized)) {
    throw appError(403, 'TENANT_CLAIM_REQUIRED', 'A valid tenant claim is required');
  }
  if (requestedTenant != null && (!Number.isInteger(requested) || requested !== authorized)) {
    throw appError(403, 'TENANT_FORBIDDEN', 'Requested tenant does not match the authenticated context');
  }
  return authorized;
}

function getSessionTtlSeconds() {
  const raw = process.env.SESSION_EXPIRY_MINUTES ?? '15';
  const minutes = Number.parseInt(raw, 10);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 120) {
    const err = new Error('SESSION_EXPIRY_MINUTES must be an integer between 5 and 120');
    err.code = 'SESSION_CONFIG_INVALID';
    err.status = 500;
    throw err;
  }
  return minutes * 60;
}

async function initSession({ authContext, body, ip, origenCreacion = 'INTEGRACION' }) {
  const rawKey = crypto.randomBytes(32).toString('hex');
  const redisKey = `patient:session:${rawKey}`;

  const ttlSeconds = getSessionTtlSeconds();
  const frontendBase = process.env.FRONTEND_BASE_URL ?? 'http://localhost:5174';
  const fichaRoute = process.env.FRONTEND_FICHA_ROUTE ?? '/ficha';
  const incomingPatientId = String(body.paciente.patientId ?? body.paciente.historiaClinica ?? '').trim();
  const historiaClinica = String(body.paciente.historiaClinica ?? body.paciente.externalID ?? incomingPatientId).trim();
  const tenantId = resolveAuthorizedTenant(authContext, body.paciente.tenantId);

  // Build the Redis payload:
  // - incoming patientId / medicoId are the external IDs from the SADC
  // - generate new UUIDs to be used as DB primary keys at POST /patient time
  const redisPayload = {
    schemaVersion: 1,
    state: 'PENDING',
    sessionId: crypto.randomUUID(),
    fichaId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    uploads: [],
    systemId: authContext.systemId,
    origenCreacion,
    paciente: {
      patientId: crypto.randomUUID(),        // internal DB UUID (pre-generated)
      externalID: incomingPatientId,         // external ID from SADC (e.g. "PAC-001")
      historiaClinica,
      tenantId: tenantId == null ? null : String(tenantId),
      nombre: body.paciente.nombre,
    },
    consulta: {
      fechaConsulta: body.consulta.fechaConsulta,
      diagnosticoTexto: body.consulta.diagnosticoTexto,
    },
    medico: {
      medicoId: crypto.randomUUID(),         // internal DB UUID (pre-generated)
      externalId: body.medico.medicoId,      // external ID from SADC (e.g. "MED-001")
      username: body.medico.username ?? null, // Keycloak username (manual flow), for the audit trail
      nombre: body.medico.nombre,
      especialidad: body.medico.especialidad,
    },
    // Solo el flujo manual lo llena, despues de confirmar en SADC que la HC no existe.
    provisional: body.provisional?.historiaClinicaReferida
      ? { historiaClinicaReferida: String(body.provisional.historiaClinicaReferida) }
      : null,
  };

  const redis = await connectRedis();
  await redis.set(redisKey, JSON.stringify(redisPayload), { EX: ttlSeconds });

  // Encrypt the Redis key before returning it to the frontend.
  // The frontend will send this encrypted value as the X-Session-Token header.
  const encryptedSessionToken = encryptSessionKey(redisKey);

  return {
    sessionToken: encryptedSessionToken,
    // URL fragments are not sent to ALB/Nginx, so the capability never lands
    // in access logs. The frontend consumes and scrubs it on first render.
    formUrl: `${frontendBase}${fichaRoute}#sessionToken=${encodeURIComponent(encryptedSessionToken)}`,
    expiresIn: ttlSeconds,
  };
}

async function activateSession(redisKey, _ip) {
  const { payload, alreadyActive } = await activatePatientSession(redisKey);

  return {
    // Solo para la bitacora; el controlador lo retira de la respuesta.
    auditActor: sessionAuditActor(payload),
    fichaId: payload.fichaId,
    sessionId: payload.sessionId,
    origenCreacion: payload.origenCreacion ?? 'INTEGRACION',
    alreadyActive,
    paciente: {
      patientId: payload.paciente.patientId,      // internal UUID
      externalId: payload.paciente.externalID,    // external ID from SADC
      nombre: payload.paciente.nombre,
      historiaClinica: payload.paciente.historiaClinica ?? null,
      tenantId: payload.paciente.tenantId ?? null,
      historiaClinicaReferida: payload.provisional?.historiaClinicaReferida ?? null,
    },
    consulta: {
      fechaConsulta: payload.consulta.fechaConsulta,
      diagnosticoTexto: payload.consulta.diagnosticoTexto,
    },
    medico: {
      medicoId: payload.medico.medicoId,          // internal UUID
      medicoExtId: payload.medico.externalId,     // external ID from SADC
      nombre: payload.medico.nombre,
      especialidad: payload.medico.especialidad,
    },
  };
}

/** true si la HC ya tiene una ficha vigente en el tenant. */
async function hasVigenteFicha(tenantId, historiaClinica) {
  const res = await db.query(
    `SELECT 1 FROM ficha_clinica
     WHERE id_tenant = $1 AND historia_clinica = $2 AND es_vigente
     LIMIT 1`,
    [tenantId, historiaClinica]
  );
  return res.rows.length > 0;
}

module.exports = {
  hasVigenteFicha,
  initSession,
  activateSession,
  getSessionTtlSeconds,
  resolveAuthorizedTenant,
};
