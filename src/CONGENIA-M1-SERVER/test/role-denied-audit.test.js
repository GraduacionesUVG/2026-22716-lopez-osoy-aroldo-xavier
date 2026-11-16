'use strict';

// Un 403 por falta de permiso se atribuye al usuario del token: la fila
// ACCESO_DENEGADO no queda anonima. Un token invalido sigue sin actor.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

function stubModule(relativePath, exports) {
  const resolved = require.resolve(path.join(SRC, relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function freshRequire(relativePath) {
  const resolved = require.resolve(path.join(SRC, relativePath));
  delete require.cache[resolved];
  return require(resolved);
}

function loadMiddleware(verifyJwt) {
  const inserted = [];
  stubModule('config/db.js', { query: async (_sql, params) => { inserted.push(params); return { rows: [{}] }; } });
  stubModule('middleware/requireOAuthClient.js', { getBearerToken: () => 'token', verifyJwt });
  const audit = freshRequire('services/audit.service.js');
  const { requireOAuthUser } = freshRequire('middleware/requireOAuthUser.js');
  return { audit, requireOAuthUser, inserted };
}

function run(middleware) {
  const req = { headers: { authorization: 'Bearer token' }, method: 'POST', ip: '10.0.0.1' };
  return new Promise((resolve) => middleware(req, {}, (err) => resolve({ req, err })));
}

const REVISOR = {
  azp: 'congenia-web',
  sub: 'kc-revisor',
  preferred_username: 'qa.revisor',
  name: 'Rosa Revisora',
  realm_access: { roles: ['congenia-admin'] },
  groups: ['/instituciones/254/revisores'],
};

test('a valid token without the required permission is denied and attributed to its user', async () => {
  const { audit, requireOAuthUser } = loadMiddleware(async () => REVISOR);
  const { req, err } = await run(requireOAuthUser({ permission: 'adendas.revisar' }));

  assert.equal(err.status, 403);
  assert.equal(err.code, 'FORBIDDEN');
  assert.equal(req.userAuth, undefined, 'the request does not proceed as an authenticated user');
  assert.deepEqual(audit.auditContext(req).resolved.actor, {
    sub: 'kc-revisor',
    username: 'qa.revisor',
    roles: ['congenia-admin'],
  });
});

test('an invalid token stays without an actor', async () => {
  const { audit, requireOAuthUser } = loadMiddleware(async () => { throw Object.assign(new Error('bad'), { status: 401 }); });
  const { req, err } = await run(requireOAuthUser({ permission: 'dashboard' }));

  assert.equal(err.status, 401);
  assert.equal(audit.auditContext(req).resolved, null);
});

test('a failure records the tenant a service resolved for the request', async () => {
  const { audit, inserted } = loadMiddleware(async () => REVISOR);
  const req = { headers: {}, method: 'POST', ip: '10.0.0.1' };
  audit.auditContext(req).resolved = { idTenant: 254 };

  await audit.recordAuditFailure(req, { tipoEvento: 'ADENDA_RESUELTA', entidadTipo: 'Ficha' },
    Object.assign(new Error('self'), { status: 403, code: 'SELF_REVIEW_FORBIDDEN' }));

  assert.equal(inserted.length, 1);
  assert.equal(inserted[0][1], 'ADENDA_RESUELTA');
  assert.equal(inserted[0][6], 'DENEGADO');
  assert.equal(inserted[0][11], 254);
});

test('a token with the permission passes and carries per-institution access', async () => {
  const { requireOAuthUser } = loadMiddleware(async () => REVISOR);
  const { req, err } = await run(requireOAuthUser({ permission: 'cie10.corregir' }));

  assert.equal(err, undefined);
  assert.deepEqual(req.userAuth.tenants, ['254']);
  assert.deepEqual([...req.userAuth.access.porInstitucion.get(254).permisos].sort(),
    ['cie10.corregir', 'dashboard', 'reporteria']);
});

test('a token without the groups claim has no permissions, even with realm roles and tenants', async () => {
  const { requireOAuthUser } = loadMiddleware(async () => ({
    ...REVISOR, groups: undefined, tenants: ['254'], realm_access: { roles: ['congenia-superadmin'] },
  }));
  const { err } = await run(requireOAuthUser({ permission: 'dashboard' }));
  assert.equal(err.status, 403);
});

test('/me only requires authentication', async () => {
  const { requireOAuthUser } = loadMiddleware(async () => ({ ...REVISOR, groups: [] }));
  const { req, err } = await run(requireOAuthUser({ permission: null }));
  assert.equal(err, undefined);
  assert.deepEqual(req.userAuth.tenants, []);
});

test('routes must declare a known permission', () => {
  const { requireOAuthUser } = loadMiddleware(async () => REVISOR);
  assert.throws(() => requireOAuthUser(['medico']), /requires \{ permission \}/);
  assert.throws(() => requireOAuthUser({ permission: 'fichas.borrar' }), /Permiso desconocido/);
});
