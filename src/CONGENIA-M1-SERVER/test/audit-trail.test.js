'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const FICHA_ID = '11111111-2222-4333-8444-555555555555';

/** Replaces a module in the require cache before anything loads it. */
function stubModule(relativePath, exports) {
  const resolved = require.resolve(path.join(SRC, relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function freshRequire(relativePath) {
  const resolved = require.resolve(path.join(SRC, relativePath));
  delete require.cache[resolved];
  return require(resolved);
}

function fakeReq(overrides = {}) {
  return {
    method: 'GET',
    headers: { 'user-agent': 'node-test', 'x-request-id': 'req-123' },
    socket: { remoteAddress: '10.0.0.1' },
    params: {},
    query: {},
    body: {},
    baseUrl: '/api/v1',
    route: { path: '/fichas/:id' },
    userAuth: { subject: 'kc-sub-1', username: 'medico.inicial', roles: ['medico'], tenants: ['23'] },
    ...overrides,
  };
}

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined, listeners: {} };
  res.set = (key, value) => { res.headers[key] = value; return res; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.send = () => res;
  res.on = (event, fn) => { res.listeners[event] = fn; };
  return res;
}

// ── audit.service ──────────────────────────────────────────────

test('audit rows carry actor, route template and request id, never the URL', async () => {
  const { auditContext, recordAuditEvent } = freshRequire('services/audit.service.js');
  const req = fakeReq({
    baseUrl: '/api/v1',
    route: { path: '/pacientes/:tenantId/:historiaClinica/fichas' },
    originalUrl: '/api/v1/pacientes/23/HC-0001/fichas',
  });
  const calls = [];
  const client = { query: async (sql, params) => { calls.push({ sql, params }); } };

  await recordAuditEvent(auditContext(req), {
    tipoEvento: 'FICHA_LISTADA',
    entidadTipo: 'Ficha',
    idTenant: '23',
    detalle: { vista: 'historial' },
  }, { client });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO auditoria_evento/);
  assert.doesNotMatch(calls[0].sql, /hash_entrada/, 'the hash chain belongs to the database trigger');
  const params = calls[0].params;
  assert.equal(params[1], 'FICHA_LISTADA');
  assert.equal(params[8], 'kc-sub-1');
  assert.deepEqual(params[10], ['medico']);
  assert.equal(params[11], 23);
  assert.equal(params[13], '/api/v1/pacientes/:tenantId/:historiaClinica/fichas');
  assert.equal(params[15], 'req-123');
  assert.ok(!params.some((value) => String(value).includes('HC-0001')), 'patient identifiers from the URL are not stored');
});

test('non-UUID entity references move to detalle instead of breaking the uuid column', async () => {
  const { recordAuditEvent } = freshRequire('services/audit.service.js');
  const calls = [];
  const client = { query: async (_sql, params) => { calls.push(params); } };

  await recordAuditEvent({ actor: {} }, { tipoEvento: 'URL_PREFIRMADA_GENERADA', entidadId: 'not-a-uuid' }, { client });
  assert.equal(calls[0][3], null);
  assert.equal(JSON.parse(calls[0][7]).entidadRef, 'not-a-uuid');

  await recordAuditEvent({ actor: {} }, { tipoEvento: 'FICHA_LEIDA', entidadId: FICHA_ID }, { client });
  assert.equal(calls[1][3], FICHA_ID);
});

test('untrusted X-Request-Id values are replaced', () => {
  const { resolveRequestId } = freshRequire('services/audit.service.js');
  assert.equal(resolveRequestId({ headers: { 'x-request-id': 'abc-123' } }), 'abc-123');
  const replaced = resolveRequestId({ headers: { 'x-request-id': "x'); DROP TABLE auditoria_evento;--" } });
  assert.match(replaced, /^[0-9a-f-]{36}$/);
});

// ── auditAccess middleware ─────────────────────────────────────

test('access middleware maps statuses to EXITOSO, DENEGADO and FALLIDO', () => {
  const { resultadoForStatus } = freshRequire('middleware/auditAccess.js');
  assert.equal(resultadoForStatus(200), 'EXITOSO');
  assert.equal(resultadoForStatus(304), 'EXITOSO');
  assert.equal(resultadoForStatus(401), 'DENEGADO');
  assert.equal(resultadoForStatus(403), 'DENEGADO');
  assert.equal(resultadoForStatus(404), 'FALLIDO');
  assert.equal(resultadoForStatus(500), 'FALLIDO');
});

test('a rejected token is recorded as ACCESO_DENEGADO once the response finishes', async () => {
  const inserted = [];
  stubModule('config/db.js', { query: async (_sql, params) => { inserted.push(params); } });
  freshRequire('services/audit.service.js');
  const { auditAccess } = freshRequire('middleware/auditAccess.js');

  const req = fakeReq({ userAuth: undefined, baseUrl: '/api/v1', route: undefined, headers: {} });
  const res = fakeRes();
  let nextCalled = false;
  auditAccess()(req, res, () => { nextCalled = true; });
  assert.ok(nextCalled);
  assert.ok(res.headers['X-Request-Id'], 'the request id is echoed to the client');

  // The auth middleware rejected the token; the route matched before that.
  req.route = { path: '/fichas/:id' };
  req.baseUrl = '';
  res.statusCode = 401;
  res.listeners.finish();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(inserted.length, 1);
  assert.equal(inserted[0][1], 'ACCESO_DENEGADO');
  assert.equal(inserted[0][6], 'DENEGADO');
  assert.equal(inserted[0][13], '/api/v1/fichas/:id', 'the mount path survives the router restoring baseUrl');
  assert.equal(inserted[0][14], 401);
});

// ── ficha.controller: fail-closed reads ────────────────────────

function loadFichaController({ auditFails = false } = {}) {
  const events = [];
  const failures = [];
  const sample = {
    items: [{ fichaId: FICHA_ID }],
    total: 1,
  };
  stubModule('services/ficha.service.js', {
    searchFichas: async () => sample,
    listAdendas: async () => sample,
    getDashboardDetail: async () => ({ fichaId: FICHA_ID, idTenant: 23 }),
    getFichaDetail: async () => ({ fichaId: FICHA_ID, revision: 1, paciente: { tenantId: '23' } }),
    listFichasPaciente: async () => [{ fichaId: FICHA_ID }],
    getFichaVigente: async () => ({ ficha: { fichaId: FICHA_ID }, tieneRevisionPendiente: false }),
    listPendingFichas: async () => [{ fichaId: FICHA_ID }],
    getMe: async () => ({}),
    createRevision: async () => ({}),
    resolveRevision: async () => ({}),
    approveRevision: async () => ({}),
    rejectRevision: async () => ({}),
    searchAuditDetail: () => ({ hasQ: false }),
  });
  stubModule('services/audit.service.js', {
    auditContext: () => ({}),
    getClientIp: () => '10.0.0.1',
    writeAuditEvent: async (_req, event) => {
      if (auditFails) throw new Error('audit table unavailable');
      events.push(event);
    },
    recordAuditFailure: async (_req, event, err) => { failures.push({ event, err }); },
  });
  return { ctrl: freshRequire('controllers/ficha.controller.js'), events, failures };
}

const CLINICAL_READS = [
  ['search', 'FICHA_BUSQUEDA', {}],
  ['dashboardDetail', 'FICHA_LEIDA', { params: { fichaId: FICHA_ID } }],
  ['apiDetail', 'FICHA_LEIDA', { params: { id: FICHA_ID } }],
  ['listPaciente', 'FICHA_LISTADA', { params: { tenantId: '23', historiaClinica: 'HC-1' } }],
  ['vigentePaciente', 'FICHA_LISTADA', { params: { tenantId: '23', historiaClinica: 'HC-1' } }],
  ['pending', 'FICHA_LISTADA', {}],
  ['adendas', 'ADENDA_BUSQUEDA', { query: { estado: 'PENDIENTE' } }],
];

for (const [handler, tipoEvento, reqOverrides] of CLINICAL_READS) {
  test(`${handler} audits ${tipoEvento} before answering`, async () => {
    const { ctrl, events } = loadFichaController();
    const res = fakeRes();
    let forwarded;
    await ctrl[handler](fakeReq(reqOverrides), res, (err) => { forwarded = err; });

    assert.equal(forwarded, undefined);
    assert.ok(res.body !== undefined, 'the data is returned');
    assert.equal(events.length, 1);
    assert.equal(events[0].tipoEvento, tipoEvento);
  });

  test(`${handler} withholds the data when the audit row cannot be written`, async () => {
    const { ctrl, failures } = loadFichaController({ auditFails: true });
    const res = fakeRes();
    let forwarded;
    await ctrl[handler](fakeReq(reqOverrides), res, (err) => { forwarded = err; });

    assert.ok(forwarded instanceof Error, 'the error reaches the error handler (500)');
    assert.equal(res.body, undefined, 'no clinical data is sent');
    assert.equal(failures.length, 1);
    assert.equal(failures[0].event.tipoEvento, tipoEvento);
  });
}

// ── services: mutations cannot skip the trail ──────────────────

test('clinical mutations refuse to run without an audit context', async () => {
  stubModule('config/db.js', {
    query: async () => { throw new Error('the database must not be reached'); },
    connect: async () => { throw new Error('the database must not be reached'); },
  });
  freshRequire('services/audit.service.js');
  const fichaService = freshRequire('services/ficha.service.js');
  const userAuth = { subject: 'kc-sub-1', roles: ['congenia-admin'], tenants: ['23'] };

  await assert.rejects(
    fichaService.createRevision({ fichaId: FICHA_ID, payload: { motivo: 'x' }, userAuth, ip: '1.1.1.1' }),
    /audit context is required/
  );
  await assert.rejects(
    fichaService.resolveRevision({ fichaId: FICHA_ID, decisiones: [], userAuth, ip: '1.1.1.1' }),
    /audit context is required/
  );
});

test('session flows audit the Keycloak subject (manual) or the external system (integration)', () => {
  const { sessionAuditActor } = freshRequire('services/audit.service.js');
  assert.deepEqual(
    sessionAuditActor({ origenCreacion: 'MANUAL', systemId: 'congenia-web', medico: { externalId: 'kc-sub-1' } }),
    { sub: 'kc-sub-1', username: null, roles: null }
  );
  assert.deepEqual(
    sessionAuditActor({ origenCreacion: 'INTEGRACION', systemId: 'sadc', medico: { externalId: 'MED-001' } }),
    { sub: 'client:sadc', username: 'MED-001', roles: null }
  );
});

test('manual sessions carry the Keycloak username into the audit actor', () => {
  const { sessionAuditActor } = freshRequire('services/audit.service.js');
  assert.deepEqual(
    sessionAuditActor({ origenCreacion: 'MANUAL', medico: { externalId: 'kc-sub-1', username: 'josh-test' } }),
    { sub: 'kc-sub-1', username: 'josh-test', roles: null }
  );
});

test('access rows of X-Session-Token requests take actor and tenant from their business event', async () => {
  const inserted = [];
  stubModule('config/db.js', { query: async (_sql, params) => { inserted.push(params); } });
  const audit = freshRequire('services/audit.service.js');
  const { auditAccess } = freshRequire('middleware/auditAccess.js');

  const req = fakeReq({ userAuth: undefined, baseUrl: '/v1', route: undefined, method: 'POST' });
  const res = fakeRes();
  auditAccess()(req, res, () => {});

  // The controller runs: no bearer, the actor comes from the session.
  req.route = { path: '/patient' };
  await audit.recordAuditEvent(audit.auditContext(req), {
    tipoEvento: 'FICHA_CREADA',
    idTenant: 254,
    actor: { sub: 'kc-sub-1', username: 'josh-test', roles: null },
  });

  res.statusCode = 201;
  res.listeners.finish();
  await new Promise((resolve) => setImmediate(resolve));

  const access = inserted.find((params) => params[1] === 'ACCESO_API');
  assert.equal(access[8], 'kc-sub-1');
  assert.equal(access[9], 'josh-test');
  assert.equal(access[11], 254);
  assert.equal(access[14], 201);
});

// ── requireCatalogReader ───────────────────────────────────────

function loadCatalogReader(sessionState) {
  stubModule('services/patient-session.service.js', {
    getActiveSession: async () => {
      if (sessionState !== 'ACTIVE') throw Object.assign(new Error('not active'), { status: 409 });
      return { origenCreacion: 'MANUAL', systemId: 'congenia-web', medico: { externalId: 'kc-sub-1', username: 'josh-test' }, paciente: { tenantId: '23' } };
    },
  });
  stubModule('middleware/requireXSessionToken.js', {
    requireXSessionToken: () => (req, _res, next) => {
      if (req.headers['x-session-token'] !== 'valid') return next(Object.assign(new Error('bad'), { status: 400 }));
      req.redisSessionKey = `patient:session:${'a'.repeat(64)}`;
      return next();
    },
  });
  freshRequire('services/audit.service.js');
  return freshRequire('middleware/requireCatalogReader.js').requireCatalogReader();
}

async function runMiddleware(mw, req) {
  return new Promise((resolve) => { mw(req, fakeRes(), (err) => resolve(err)); });
}

test('catalog reads without credentials are rejected with 401', async () => {
  const mw = loadCatalogReader('ACTIVE');
  const err = await runMiddleware(mw, fakeReq({ headers: {}, userAuth: undefined }));
  assert.equal(err?.status, 401);
});

test('catalog reads with a forged or inactive session token are rejected with 401', async () => {
  let mw = loadCatalogReader('ACTIVE');
  let err = await runMiddleware(mw, fakeReq({ headers: { 'x-session-token': 'forged' }, userAuth: undefined }));
  assert.equal(err?.status, 401);

  mw = loadCatalogReader('CONSUMED');
  err = await runMiddleware(mw, fakeReq({ headers: { 'x-session-token': 'valid' }, userAuth: undefined }));
  assert.equal(err?.status, 401);
});

test('catalog reads with an active session name the session actor in the audit trail', async () => {
  const mw = loadCatalogReader('ACTIVE');
  const req = fakeReq({ headers: { 'x-session-token': 'valid' }, userAuth: undefined });
  const err = await runMiddleware(mw, req);
  assert.equal(err, undefined);
  assert.deepEqual(req.auditCtx.resolved, {
    actor: { sub: 'kc-sub-1', username: 'josh-test', roles: null },
    idTenant: 23,
  });
});
