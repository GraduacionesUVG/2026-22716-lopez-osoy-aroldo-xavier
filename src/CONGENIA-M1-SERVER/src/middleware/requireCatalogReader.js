'use strict';

const { requireOAuthUser } = require('./requireOAuthUser');
const { requireXSessionToken } = require('./requireXSessionToken');
const { getActiveSession } = require('../services/patient-session.service');
const { auditContext, sessionAuditActor } = require('../services/audit.service');

function appError(status, code, message) {
  const err = new Error(message ?? code);
  err.status = status;
  err.code = code;
  return err;
}

/**
 * Catalog reads (ReferidoDe, PartesCuerpo, ...) are reference data without
 * PHI, but they are still only served to someone the API can name:
 *
 *   - a clinical user of the dashboard, with a Keycloak bearer, or
 *   - the capture form opened from SADC, whose only credential is the
 *     X-Session-Token of an ACTIVE session (checked in Redis, not just
 *     decrypted, so an expired or consumed session is refused).
 *
 * Either way the access row of the audit trail gets an actor.
 */
function requireCatalogReader() {
  const bearer = requireOAuthUser({ permission: 'dashboard' });
  const sessionToken = requireXSessionToken();

  const middleware = function catalogReaderMiddleware(req, res, next) {
    if (req.headers.authorization) {
      return bearer(req, res, next);
    }

    if (!req.headers['x-session-token']) {
      return next(appError(401, 'UNAUTHORIZED', 'A bearer token or X-Session-Token is required'));
    }

    return sessionToken(req, res, async (tokenErr) => {
      if (tokenErr) {
        return next(appError(401, 'UNAUTHORIZED', 'X-Session-Token is invalid'));
      }
      try {
        const session = await getActiveSession(req.redisSessionKey);
        auditContext(req).resolved = {
          actor: sessionAuditActor(session),
          idTenant: Number.parseInt(session.paciente?.tenantId, 10) || null,
        };
        return next();
      } catch {
        return next(appError(401, 'UNAUTHORIZED', 'The capture session is not active'));
      }
    });
  };

  middleware.requiredPermission = 'dashboard';
  middleware.authKind = 'oauth-user-or-session-token';
  return middleware;
}

module.exports = { requireCatalogReader };
