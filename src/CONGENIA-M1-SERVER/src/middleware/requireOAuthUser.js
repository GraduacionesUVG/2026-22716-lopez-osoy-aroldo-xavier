'use strict';

const { getBearerToken, verifyJwt } = require('./requireOAuthClient');
const { auditContext } = require('../services/audit.service');
const {
  accessFromGroups,
  assertPermiso,
  hasPermissionAnywhere,
  tenantsOf,
} = require('../utils/accessPolicy');

function appError(status, code, message) {
  const err = new Error(message ?? code);
  err.status = status;
  err.code = code;
  return err;
}

function getRealmRoles(payload) {
  const roles = payload.realm_access?.roles;
  return Array.isArray(roles) ? roles.filter((role) => typeof role === 'string') : [];
}

/** Rutas de grupo del token (mapper `groups` de Keycloak con ruta completa). */
function getGroupClaims(payload) {
  const raw = payload.groups;
  return Array.isArray(raw) ? [...new Set(raw.filter((group) => typeof group === 'string'))] : [];
}

/**
 * Valida un token del flujo Authorization Code + PKCE del cliente web.
 * A diferencia de requireOAuthClient, representa a una persona; nunca confia en
 * nombre, identificador o especialidad enviados por el navegador.
 *
 * `permission` es un permiso de config/access-policy.yaml: la ruta exige que el
 * usuario lo tenga en al menos una institucion. El servicio vuelve a revisarlo
 * en la institucion del recurso. `permission: null` solo exige autenticacion
 * (GET /me, que responde aunque el usuario no tenga permisos).
 */
function requireOAuthUser(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options) || !('permission' in options)) {
    throw new Error('requireOAuthUser requires { permission } (a policy permission or null)');
  }
  const { permission } = options;
  if (permission !== null) assertPermiso(permission);
  const middleware = async function oauthUserMiddleware(req, _res, next) {
    try {
      const token = getBearerToken(req);
      if (!token) {
        throw appError(401, 'UNAUTHORIZED', 'Bearer token is required');
      }

      const payload = await verifyJwt(token);
      const expectedClient = process.env.OIDC_WEB_CLIENT_ID || 'congenia-web';
      if (payload.azp !== expectedClient) {
        throw appError(403, 'FORBIDDEN', 'Token was not issued to the web client');
      }

      // Los roles planos solo identifican al actor en la bitacora; los permisos
      // salen de los grupos, por institucion.
      const roles = getRealmRoles(payload);
      const access = accessFromGroups(getGroupClaims(payload));
      if (permission !== null && !hasPermissionAnywhere({ access }, permission)) {
        // El token ya es valido: el ACCESO_DENEGADO se atribuye a quien lo
        // intento, no queda anonimo.
        auditContext(req).resolved = {
          actor: {
            sub: typeof payload.sub === 'string' ? payload.sub : null,
            username: typeof payload.preferred_username === 'string' ? payload.preferred_username : null,
            roles,
          },
        };
        throw appError(403, 'FORBIDDEN', 'Required permission is missing');
      }

      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw appError(401, 'UNAUTHORIZED', 'Token subject is missing');
      }

      const displayName =
        (typeof payload.name === 'string' && payload.name.trim()) ||
        (typeof payload.preferred_username === 'string' && payload.preferred_username.trim());
      if (!displayName) {
        throw appError(403, 'USER_PROFILE_INCOMPLETE', 'The user profile has no display name');
      }

      req.userAuth = {
        type: 'oidc-user',
        subject: payload.sub,
        username: typeof payload.preferred_username === 'string' ? payload.preferred_username : null,
        displayName,
        specialty: typeof payload.especialidad === 'string' && payload.especialidad.trim()
          ? payload.especialidad.trim()
          : 'No especificada',
        roles,
        tenants: tenantsOf({ access }).map(String),
        access,
      };

      return next();
    } catch (err) {
      return next(err);
    }
  };
  middleware.requiredPermission = permission;
  middleware.authKind = 'oauth-user';
  return middleware;
}

module.exports = { requireOAuthUser, getRealmRoles, getGroupClaims };
