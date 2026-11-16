import { readFileSync } from 'node:fs';
import type { ConnectionOptions } from 'node:tls';

/**
 * TLS settings for the Postgres connection, with libpq semantics.
 *
 * Without an explicit `ssl`, node-postgres reads PGSSLMODE on its own and, for
 * verify-full, validates against Node's built-in store, which does not carry
 * the RDS CA: the only mode that worked was `no-verify`, i.e. no protection
 * against MITM. The image now ships the RDS bundle and points
 * POSTGRES_SSL_CA_FILE at it.
 *
 *   disable          no TLS (default; local compose)
 *   require | prefer encrypt without validating (no-verify is an alias)
 *   verify-ca        validate the chain against POSTGRES_SSL_CA_FILE
 *   verify-full      verify-ca plus the server name; what AWS uses
 */
export function buildSslConfig(env: NodeJS.ProcessEnv = process.env): false | ConnectionOptions {
  const mode = (env.POSTGRES_SSL_MODE || env.PGSSLMODE || 'disable').trim().toLowerCase();

  switch (mode) {
    case 'disable':
      return false;
    case 'prefer':
    case 'require':
    case 'no-verify':
      return { rejectUnauthorized: false };
    case 'verify-ca':
    case 'verify-full': {
      const caFile = env.POSTGRES_SSL_CA_FILE;
      if (!caFile) {
        throw new Error(`POSTGRES_SSL_MODE='${mode}' requires POSTGRES_SSL_CA_FILE pointing at the CA bundle`);
      }
      const ssl: ConnectionOptions = { rejectUnauthorized: true, ca: readFileSync(caFile, 'utf8') };
      // Node checks the server name by default (verify-full); verify-ca does not.
      if (mode === 'verify-ca') ssl.checkServerIdentity = () => undefined;
      return ssl;
    }
    default:
      throw new Error(`POSTGRES_SSL_MODE='${mode}' is not valid. Use: disable, require, verify-ca or verify-full.`);
  }
}
