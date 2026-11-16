'use strict';

const { decryptSessionKey } = require('../utils/sessionTokenCrypto');

function appError(status, code, message) {
  const err = new Error(message ?? code);
  err.status = status;
  err.code = code;
  return err;
}

/**
 * Middleware that reads the X-Session-Token header, decrypts it, and exposes
 * the raw Redis key via req.redisSessionKey.
 *
 * Use this on any endpoint that needs to look up the patient session in Redis.
 */
function requireXSessionToken() {
  const middleware = function xSessionTokenMiddleware(req, _res, next) {
    try {
      const encryptedToken = req.headers['x-session-token'];
      if (!encryptedToken) {
        throw appError(400, 'MISSING_SESSION_TOKEN', 'X-Session-Token header is required');
      }

      let redisKey;
      try {
        redisKey = decryptSessionKey(encryptedToken);
      } catch {
        throw appError(400, 'INVALID_SESSION_TOKEN', 'X-Session-Token is invalid or has been tampered with');
      }

      if (!/^patient:session:[a-f0-9]{64}$/.test(redisKey)) {
        throw appError(400, 'INVALID_SESSION_TOKEN', 'X-Session-Token has an invalid scope');
      }

      req.redisSessionKey = redisKey;
      return next();
    } catch (err) {
      return next(err);
    }
  };
  middleware.authKind = 'session-token';
  return middleware;
}

module.exports = { requireXSessionToken };
