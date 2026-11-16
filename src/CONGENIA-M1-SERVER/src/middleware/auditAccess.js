'use strict';

const { auditContext, recordAuditEvent, resolveRequestId, routeTemplate } = require('../services/audit.service');
const { logError } = require('../config/logger');

function resultadoForStatus(status) {
  if (status === 401 || status === 403) return 'DENEGADO';
  return status < 400 ? 'EXITOSO' : 'FALLIDO';
}

/**
 * Access log of the API, written to the audit trail: one ACCESO_API row per
 * answered request, or ACCESO_DENEGADO for 401/403 (including tokens rejected
 * before any controller runs).
 *
 * It runs after the response is sent, so it cannot fail the request. Business
 * events (FICHA_LEIDA, FICHA_CREADA, ...) are the fail-closed part; this layer
 * guarantees that no request goes unrecorded, even one no controller audits.
 */
function auditAccess() {
  return function auditAccessMiddleware(req, res, next) {
    if (req.method === 'OPTIONS') return next();

    req.requestId = resolveRequestId(req);
    res.set('X-Request-Id', req.requestId);

    // Routers restore req.baseUrl when they finish, so the mount point is
    // captured here, while it still says /v1 or /api/v1.
    const mountPath = req.baseUrl;
    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const status = res.statusCode;
      const resultado = resultadoForStatus(status);
      const base = auditContext(req);
      const ctx = { ...base, route: routeTemplate(req, mountPath) };
      // Requests without a bearer take the actor their business event resolved;
      // every request takes the tenant it touched.
      const actor = ctx.actor?.sub ? ctx.actor : (base.resolved?.actor ?? ctx.actor);
      const durationMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);

      recordAuditEvent(ctx, {
        tipoEvento: resultado === 'DENEGADO' ? 'ACCESO_DENEGADO' : 'ACCESO_API',
        resultado,
        actor,
        idTenant: base.resolved?.idTenant ?? null,
        statusCode: status,
        detalle: { durationMs, matched: ctx.route !== null },
      }).catch((err) => {
        logError('AUDIT_WRITE_FAILED', {
          tipoEvento: 'ACCESO_API',
          requestId: req.requestId,
          status,
          error: err.message,
        });
      });
    });

    return next();
  };
}

module.exports = { auditAccess, resultadoForStatus };
