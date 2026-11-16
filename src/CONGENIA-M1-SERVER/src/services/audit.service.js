'use strict';

const crypto = require('crypto');
const db = require('../config/db');
const { logError } = require('../config/logger');

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress ?? '0.0.0.0';
}

/**
 * Reuses the caller's X-Request-Id only when it is a plain token, so the header
 * cannot smuggle arbitrary text into the audit trail.
 */
function resolveRequestId(req) {
  const header = req.headers?.['x-request-id'];
  return typeof header === 'string' && REQUEST_ID_PATTERN.test(header) ? header : crypto.randomUUID();
}

/**
 * The route template, never the URL: paths such as
 * /pacientes/:tenantId/:historiaClinica carry patient identifiers.
 */
function routeTemplate(req, mountPath = req.baseUrl ?? '') {
  if (!req.route?.path) return null;
  return `${mountPath}${req.route.path}`;
}

function actorFromRequest(req) {
  if (req.userAuth) {
    return {
      sub: req.userAuth.subject,
      username: req.userAuth.username ?? null,
      roles: req.userAuth.roles ?? [],
    };
  }
  if (req.integrationAuth) {
    return {
      sub: `client:${req.integrationAuth.systemId}`,
      username: req.integrationAuth.clientId ?? null,
      roles: req.integrationAuth.scopes ?? [],
    };
  }
  return { sub: null, username: null, roles: null };
}

/**
 * Everything an audit row needs from the HTTP request, captured once so that
 * services can write events inside their own transactions without holding req.
 */
function auditContext(req) {
  // One context per request, shared by every event the request writes. The
  // access middleware reads `resolved` from it to fill actor and tenant on
  // requests that carry no bearer (X-Session-Token flows).
  if (req.auditCtx) return req.auditCtx;
  req.auditCtx = {
    resolved: null,
    actor: actorFromRequest(req),
    ip: getClientIp(req),
    userAgent: req.headers?.['user-agent'] ?? null,
    requestId: req.requestId ?? resolveRequestId(req),
    method: req.method ?? null,
    route: req.auditRoute ?? routeTemplate(req),
  };
  return req.auditCtx;
}

/**
 * Actor of the X-Session-Token flows, which carry no bearer identity. In the
 * manual flow the session stores the Keycloak subject of the medico, so the row
 * lines up with that user's bearer-authenticated events. In the integration
 * flow the actor is the external system, and the medico is its own identifier.
 */
function sessionAuditActor(session) {
  const medicoExtId = session?.medico?.externalId ?? null;
  if (session?.origenCreacion === 'MANUAL') {
    return { sub: medicoExtId, username: session?.medico?.username ?? null, roles: null };
  }
  return { sub: session?.systemId ? `client:${session.systemId}` : null, username: medicoExtId, roles: null };
}

function truncate(value, max) {
  if (value == null) return null;
  const text = String(value);
  return text.length > max ? text.slice(0, max) : text;
}

/**
 * Inserts one event. The hash chain, sequence and timestamp are set by the
 * database trigger (06_audit_trail.sql), not here.
 *
 * Pass `client` to write inside an open transaction: the event then commits or
 * rolls back together with the change it describes. Errors propagate; callers
 * that must not fail use recordAuditFailure.
 */
async function recordAuditEvent(ctx, event, { client = db } = {}) {
  const {
    tipoEvento,
    resultado = 'EXITOSO',
    entidadTipo = null,
    entidadId = null,
    idTenant = null,
    usuarioId = null,
    statusCode = null,
    actor = null,
    detalle = {},
  } = event;
  const who = actor ?? ctx.actor ?? {};
  const entidadUuid = entidadId != null && UUID_PATTERN.test(String(entidadId)) ? String(entidadId) : null;
  const payload = entidadId != null && !entidadUuid ? { ...detalle, entidadRef: String(entidadId) } : detalle;
  const tenant = Number.parseInt(idTenant, 10);

  const result = await client.query(
    `INSERT INTO auditoria_evento (
       usuario_id, tipo_evento, entidad_tipo, entidad_id, ip_origen, user_agent,
       resultado, detalle_json, actor_sub, actor_username, actor_roles, id_tenant,
       http_method, ruta, status_code, request_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING evento_id`,
    [
      usuarioId,
      tipoEvento,
      entidadTipo,
      entidadUuid,
      truncate(ctx.ip ?? '0.0.0.0', 45),
      truncate(ctx.userAgent, 500),
      resultado,
      JSON.stringify(payload ?? {}),
      truncate(who.sub, 100),
      truncate(who.username, 200),
      Array.isArray(who.roles) ? who.roles : null,
      Number.isInteger(tenant) ? tenant : null,
      truncate(ctx.method, 10),
      truncate(ctx.route, 300),
      statusCode,
      truncate(ctx.requestId, 100),
    ]
  );

  if (ctx.resolved !== undefined && who.sub && !ctx.resolved) {
    ctx.resolved = { actor: who, idTenant: Number.isInteger(tenant) ? tenant : null };
  } else if (ctx.resolved && ctx.resolved.idTenant == null && Number.isInteger(tenant)) {
    ctx.resolved.idTenant = tenant;
  }
  return result?.rows?.[0]?.evento_id ?? null;
}

function writeAuditEvent(req, event, options) {
  return recordAuditEvent(auditContext(req), event, options);
}

function resultadoForError(err) {
  return [401, 403, 404].includes(err?.status) ? 'DENEGADO' : 'FALLIDO';
}

/**
 * Records that an operation failed. Used on error paths, where the original
 * error must reach the client: if the audit write itself fails it is logged
 * instead of replacing that error.
 */
async function recordAuditFailure(req, event, err) {
  try {
    await writeAuditEvent(req, {
      ...event,
      // Un servicio que ya identifico la institucion la deja en el contexto.
      idTenant: event.idTenant ?? auditContext(req).resolved?.idTenant ?? null,
      resultado: resultadoForError(err),
      statusCode: err?.status ?? 500,
      detalle: { ...(event.detalle ?? {}), errorCode: err?.code ?? null },
    });
  } catch (auditErr) {
    logError('AUDIT_WRITE_FAILED', {
      tipoEvento: event.tipoEvento,
      requestId: req.requestId ?? null,
      error: auditErr.message,
    });
  }
}

module.exports = {
  auditContext,
  getClientIp,
  recordAuditEvent,
  recordAuditFailure,
  resolveRequestId,
  routeTemplate,
  sessionAuditActor,
  writeAuditEvent,
};
