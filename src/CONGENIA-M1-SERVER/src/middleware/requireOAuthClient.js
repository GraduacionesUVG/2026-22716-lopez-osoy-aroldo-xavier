'use strict';

let jwks;

function appError(status, code, message) {
  const err = new Error(message ?? code);
  err.status = status;
  err.code = code;
  return err;
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

function getScopeList(payload) {
  if (typeof payload.scope === 'string') {
    return payload.scope.split(' ').filter(Boolean);
  }
  if (Array.isArray(payload.scope)) {
    return payload.scope;
  }
  return [];
}

function getClientTenant(payload) {
  const raw = payload.tenant_id;
  const value = String(raw ?? '').trim();
  return /^\d+$/.test(value) ? value : null;
}

function getAllowedIssuers() {
  const listFromEnv = (process.env.OIDC_ISSUER_URLS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (listFromEnv.length > 0) {
    return listFromEnv;
  }

  const single = process.env.OIDC_ISSUER_URL?.trim();
  return single ? [single] : [];
}

/**
 * Emisor, JWKS y audiencia que todo token debe cumplir. La audiencia es
 * obligatoria: antes se omitia en silencio si OIDC_AUDIENCE faltaba, y un token
 * emitido para otro servicio del mismo realm pasaba la validacion.
 */
function getOidcConfig() {
  const issuers = getAllowedIssuers();
  const primaryIssuer = issuers[0];
  const jwksUrl = process.env.OIDC_JWKS_URL || (primaryIssuer ? `${primaryIssuer}/protocol/openid-connect/certs` : null);
  const audience = process.env.OIDC_AUDIENCE?.trim();

  if (issuers.length === 0 || !jwksUrl) {
    throw appError(500, 'OAUTH_NOT_CONFIGURED', 'OAuth issuer/JWKS is not configured');
  }
  if (!audience) {
    throw appError(500, 'OAUTH_NOT_CONFIGURED', 'OIDC_AUDIENCE is required');
  }
  return { issuers, jwksUrl, audience };
}

async function verifyJwt(token) {
  const { issuers, jwksUrl, audience } = getOidcConfig();

  const { createRemoteJWKSet, jwtVerify } = await import('jose');

  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl));
  }

  const options = { issuer: issuers.length === 1 ? issuers[0] : issuers, audience };

  try {
    const { payload } = await jwtVerify(token, jwks, options);
    return payload;
  } catch {
    jwks = null; // reset so next request retries the JWKS fetch
    throw appError(401, 'UNAUTHORIZED', 'Bearer token is invalid');
  }
}

/**
 * Cliente de procedencia de un token de maquina. `azp` es obligatorio porque es
 * el cliente al que Keycloak emitio el token; si ademas viene `client_id`
 * (cuenta de servicio) debe coincidir. Un token del cliente web es de una
 * persona y no entra por este carril, igual que requireOAuthUser rechaza los
 * de maquina.
 */
function machineClientOf(payload) {
  const azp = typeof payload.azp === 'string' ? payload.azp.trim() : '';
  if (!azp) {
    throw appError(401, 'UNAUTHORIZED', 'OAuth azp claim is missing');
  }
  if (payload.client_id != null && payload.client_id !== azp) {
    throw appError(401, 'UNAUTHORIZED', 'OAuth client_id does not match azp');
  }
  const webClient = process.env.OIDC_WEB_CLIENT_ID || 'congenia-web';
  if (azp === webClient) {
    throw appError(403, 'FORBIDDEN', 'Token was issued to the web client, not to a machine client');
  }
  return azp;
}

function requireOAuthClient(requiredScope) {
  const middleware = async function oauthClientMiddleware(req, _res, next) {
    try {
      const token = getBearerToken(req);

      if (!token) {
        throw appError(401, 'UNAUTHORIZED', 'Bearer token is required');
      }

      const payload = await verifyJwt(token);
      const scopes = getScopeList(payload);

      if (!scopes.includes(requiredScope)) {
        throw appError(403, 'FORBIDDEN', 'Required OAuth scope is missing');
      }

      const systemId = machineClientOf(payload);

      const tenantId = getClientTenant(payload);
      if (!tenantId) {
        throw appError(403, 'CLIENT_TENANT_MISSING', 'OAuth client tenant claim is missing');
      }

      req.integrationAuth = {
        type: 'oauth2',
        systemId,
        clientId: systemId,
        scopes,
        tokenSubject: payload.sub,
        tenantId,
      };

      return next();
    } catch (err) {
      return next(err);
    }
  };
  middleware.authKind = 'oauth-client';
  return middleware;
}

module.exports = { requireOAuthClient, getBearerToken, getClientTenant, verifyJwt, getOidcConfig, machineClientOf };
