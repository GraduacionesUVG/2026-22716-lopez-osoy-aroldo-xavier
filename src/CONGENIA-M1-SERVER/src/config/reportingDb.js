'use strict';

const { Pool } = require('pg');
const { buildSslConfig } = require('./db');

// verify-ca/verify-full reuse the CA bundle of the main pool, so the reporting
// databases are validated the same way as RDS.
function sslFromUrl(url) {
  if (!url) return false;
  const verify = /sslmode=(verify-ca|verify-full)/i.exec(url);
  if (verify) {
    return buildSslConfig({ POSTGRES_SSL_MODE: verify[1], POSTGRES_SSL_CA_FILE: process.env.POSTGRES_SSL_CA_FILE });
  }
  return /sslmode=(require|no-verify)/i.test(url) ? { rejectUnauthorized: false } : undefined;
}

function createPoolFromUrl(envName, { max = 5 } = {}) {
  const connectionString = process.env[envName];
  if (!connectionString) return null;
  return new Pool({
    connectionString,
    ssl: sslFromUrl(connectionString),
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

const appPool = createPoolFromUrl('REPORTING_DATABASE_APP_URL');
const agentPool = createPoolFromUrl('REPORTING_DATABASE_AGENT_READONLY_URL', { max: 2 });

for (const [name, pool] of [['reporting-app', appPool], ['reporting-agent', agentPool]]) {
  pool?.on('error', (err) => {
    console.error(`[${name}] Unexpected error on idle client:`, err.message);
  });
}

module.exports = {
  appPool,
  agentPool,
};
