'use strict';

/**
 * Centralized error-handling middleware.
 * Must be registered LAST in app.js (after all routes).
 *
 * Propagate errors with next(err); attach err.status for
 * non-500 responses (e.g. validation errors use 400).
 */
function errorHandler(err, req, res, _next) {
  const status = err.status || 500;

  if (status >= 500) {
    console.error(`[ERROR] ${req.method} ${req.path}:`, err);
  }

  res.status(status).json({
    success: false,
    error: err.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED'),
    message: status >= 500 ? 'Internal server error' : (err.message || 'Request failed'),
  });
}

module.exports = errorHandler;
