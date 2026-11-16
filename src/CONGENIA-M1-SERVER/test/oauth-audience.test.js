'use strict';

// La audiencia es obligatoria y el carril de maquina exige el cliente de
// procedencia. Se firman tokens reales y se sirven las llaves por HTTP local,
// para ejercitar jwtVerify y no un doble.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const ISSUER = 'https://idp.example.test/realms/congenia';
let server;
let privateKey;

test.before(async () => {
  const jose = await import('jose');
  const pair = await jose.generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const jwk = { ...(await jose.exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  server = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.OIDC_ISSUER_URL = ISSUER;
  process.env.OIDC_JWKS_URL = `http://127.0.0.1:${server.address().port}/certs`;
  process.env.OIDC_WEB_CLIENT_ID = 'congenia-web';
});

test.after(() => server.close());

async function sign(claims) {
  const jose = await import('jose');
  return new jose.SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

const { requireOAuthClient, getOidcConfig } = require('../src/middleware/requireOAuthClient');

function run(token) {
  const middleware = requireOAuthClient('congenia.sessions:init');
  const req = { headers: { authorization: `Bearer ${token}` } };
  return new Promise((resolve) => middleware(req, {}, (err) => resolve({ req, err })));
}

const MACHINE = { azp: 'sadc', client_id: 'sadc', aud: 'congenia-api', scope: 'congenia.sessions:init', tenant_id: '254', sub: 'svc' };

test('sin OIDC_AUDIENCE la configuracion se considera incompleta', () => {
  delete process.env.OIDC_AUDIENCE;
  assert.throws(() => getOidcConfig(), { code: 'OAUTH_NOT_CONFIGURED' });
});

test('sin OIDC_AUDIENCE ningun token pasa, ni siquiera uno valido', async () => {
  delete process.env.OIDC_AUDIENCE;
  const { err } = await run(await sign(MACHINE));
  assert.equal(err?.code, 'OAUTH_NOT_CONFIGURED');
});

test('un token de cuenta de servicio con la audiencia correcta pasa', async () => {
  process.env.OIDC_AUDIENCE = 'congenia-api';
  const { req, err } = await run(await sign(MACHINE));
  assert.equal(err, undefined);
  assert.equal(req.integrationAuth.systemId, 'sadc');
  assert.equal(req.integrationAuth.tenantId, '254');
});

test('un token emitido para otra audiencia se rechaza', async () => {
  process.env.OIDC_AUDIENCE = 'congenia-api';
  const { err } = await run(await sign({ ...MACHINE, aud: 'otro-servicio' }));
  assert.equal(err?.status, 401);
});

test('un token sin audiencia se rechaza', async () => {
  process.env.OIDC_AUDIENCE = 'congenia-api';
  const { aud: _aud, ...sinAudiencia } = MACHINE;
  const { err } = await run(await sign(sinAudiencia));
  assert.equal(err?.status, 401);
});

test('el carril de maquina exige azp', async () => {
  process.env.OIDC_AUDIENCE = 'congenia-api';
  const { azp: _azp, ...sinAzp } = MACHINE;
  const { err } = await run(await sign(sinAzp));
  assert.equal(err?.status, 401);
  assert.match(err.message, /azp/);
});

test('client_id distinto de azp se rechaza', async () => {
  process.env.OIDC_AUDIENCE = 'congenia-api';
  const { err } = await run(await sign({ ...MACHINE, client_id: 'otro-cliente' }));
  assert.equal(err?.status, 401);
});

test('un token de usuario del cliente web no entra por el carril de maquina', async () => {
  process.env.OIDC_AUDIENCE = 'congenia-api';
  const { client_id: _c, ...base } = MACHINE;
  const { err } = await run(await sign({ ...base, azp: 'congenia-web' }));
  assert.equal(err?.status, 403);
});
