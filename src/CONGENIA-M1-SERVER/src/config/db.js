'use strict';

const fs = require('node:fs');
const { Pool } = require('pg');

/**
 * TLS settings for the Postgres connection.
 *
 * RDS enforces `rds.force_ssl=1`: without encryption it rejects the connection
 * with "no pg_hba.conf entry ... no encryption". A Postgres container enforces
 * nothing, which is why this never came up locally.
 *
 * Declared here instead of letting `pg` infer it from PGSSLMODE: the implicit
 * behaviour depends on the driver version, does not show up in the code, and
 * makes a TLS mismatch look like a networking problem. Modes follow libpq
 * semantics.
 *
 *   disable          no TLS (default; what the local compose uses)
 *   require | prefer encrypt without validating the CA
 *   verify-ca        encrypt and validate the chain against POSTGRES_SSL_CA_FILE
 *   verify-full      verify-ca plus the server name; what AWS uses
 *
 * `no-verify` is accepted as an alias of `require` so that an older task
 * definition still starts, but it gives no protection against MITM.
 *
 * The image ships the RDS bundle in certs/ and points POSTGRES_SSL_CA_FILE at
 * it, so verify-full needs no download at build or start time.
 */
function buildSslConfig(env = process.env) {
  const mode = (env.POSTGRES_SSL_MODE || env.PGSSLMODE || 'disable')
    .trim()
    .toLowerCase();

  switch (mode) {
    case 'disable':
      return false;

    // node-postgres cannot do the `prefer` fallback: if the server does not
    // offer TLS the connection fails instead of retrying in the clear.
    case 'prefer':
    case 'require':
    case 'no-verify':
      return { rejectUnauthorized: false };

    case 'verify-ca':
    case 'verify-full': {
      const caFile = env.POSTGRES_SSL_CA_FILE;
      if (!caFile) {
        throw new Error(
          `POSTGRES_SSL_MODE='${mode}' requires POSTGRES_SSL_CA_FILE pointing at the CA bundle ` +
            '(for RDS: https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem)'
        );
      }
      const ssl = { rejectUnauthorized: true, ca: fs.readFileSync(caFile, 'utf8') };
      // Node checks the server name by default, which is verify-full. libpq's
      // verify-ca only checks the chain, so the name check is switched off.
      if (mode === 'verify-ca') ssl.checkServerIdentity = () => undefined;
      return ssl;
    }

    default:
      throw new Error(
        `POSTGRES_SSL_MODE='${mode}' is not valid. Use: disable, require, verify-ca or verify-full.`
      );
  }
}

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number(process.env.POSTGRES_PORT) || 5432,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  ssl: buildSslConfig(),
  // Keep a small pool — adjust when load is known
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err.message);
  process.exit(1);
});

module.exports = pool;
module.exports.buildSslConfig = buildSslConfig;
