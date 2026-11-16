'use strict';

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { apiReference } = require('@scalar/express-api-reference');
const catalogRoutes = require('./routes/v1/catalog.routes');
const integrationRoutes = require('./routes/v1/integration.routes');
const patientRoutes = require('./routes/v1/patient.routes');
const uploadRoutes = require('./routes/v1/upload.routes');
const fichaRoutes = require('./routes/v1/ficha.routes');
const fichaApiRoutes = require('./routes/v1/ficha-api.routes');
const cie10Routes = require('./routes/v1/cie10.routes');
const reportingRoutes = require('./routes/v1/reporting.routes');
const errorHandler = require('./middleware/errorHandler');
const { auditAccess } = require('./middleware/auditAccess');
const openapiSpec = require('./config/swagger');
const pool = require('./config/db');
const { connectRedis } = require('./config/redis');
const { logError } = require('./config/logger');

const app = express();

// ── CORS ──────────────────────────────────────────────────────
// Allowed origins come from the env var (comma-separated list).
// In development the playground runs on localhost:5173 (Vite default).
const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin not allowed — ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Cache-Control',
      'X-Session-Token',
      'X-Request-Id',
    ],
    credentials: true,
  })
);

// ── Body parsing ──────────────────────────────────────────────
// El alta de ficha trae la firma como PNG en base64; el limite por defecto
// (100 kB) dejaba sin margen a una firma grande. El PNG se valida aparte
// contra CONSENT_SIGNATURE_MAX_BYTES (consent-signature.service.js).
app.use(express.json({ limit: '300kb' }));
app.use(cookieParser());

// ── Health checks ─────────────────────────────────────────────
// Two levels, deliberately:
//
//   /health        Liveness. Answers if the process is up, nothing else. This
//                  is the one the load balancer polls: if it depended on
//                  Postgres or Redis, a database blip would pull every task
//                  out of rotation and turn a degradation into an outage.
//   /health/ready  Readiness. This one does check the dependencies. It exists
//                  because on the first AWS deployment the `ok` from /health
//                  coexisted with a Redis instance that was created, billed
//                  and never connected: a health check that only looks at the
//                  process says nothing about the system.
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const READINESS_TIMEOUT_MS = 2000;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not answer in ${ms}ms`)), ms);
    if (typeof timer.unref === 'function') timer.unref();
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function probe(name, run) {
  const startedAt = Date.now();
  try {
    await withTimeout(run(), READINESS_TIMEOUT_MS, name);
    return { name, status: 'ok', latencyMs: Date.now() - startedAt };
  } catch (err) {
    // Details go to the log, not to the response: a network failure message
    // carries the internal RDS hostname and this endpoint is exposed via ALB.
    logError('READINESS_CHECK_FAILED', { dependency: name, message: err.message });
    return { name, status: 'error', latencyMs: Date.now() - startedAt };
  }
}

app.get('/health/ready', async (_req, res) => {
  const checks = await Promise.all([
    probe('postgres', () => pool.query('SELECT 1')),
    probe('redis', async () => {
      const redis = await connectRedis();
      await redis.ping();
    }),
  ]);

  const ready = checks.every((check) => check.status === 'ok');
  res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'degraded', checks });
});

// ── OpenAPI spec (JSON) ───────────────────────────────────────
app.get('/openapi.json', (_req, res) => res.json(openapiSpec));

// ── Scalar API docs ───────────────────────────────────────────
app.use(
  '/docs',
  apiReference({ spec: { url: '/openapi.json' } })
);

// ── Audit trail: one access row per API request ───────────────
app.use(['/v1', '/api/v1'], auditAccess());

// ── API v1 routes ─────────────────────────────────────────────
app.use('/v1', catalogRoutes);
app.use('/v1', fichaRoutes);
app.use('/v1', patientRoutes);
app.use('/v1', uploadRoutes);
app.use('/api/v1', integrationRoutes);
app.use('/api/v1', fichaApiRoutes);
app.use('/api/v1', cie10Routes);
app.use('/api/v1', reportingRoutes);

// ── 404 handler ───────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ── Centralized error handler (must be last) ──────────────────
app.use(errorHandler);

module.exports = app;
