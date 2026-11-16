'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/config/db');

// El controlador desestructura estos servicios al cargarse: se reemplazan
// antes de requerirlo. Cada archivo de prueba corre en su propio proceso.
const integrationService = require('../src/services/integration.service');
const auditService = require('../src/services/audit.service');
const nursera = require('../src/services/nursera.client');

const calls = { initSession: [], audit: [], auditFailures: [], nursera: [] };
let vigenteExists = false;

integrationService.initSession = async (args) => {
  calls.initSession.push(args);
  return { sessionToken: 'token', formUrl: 'url', expiresIn: 900 };
};
integrationService.hasVigenteFicha = async () => vigenteExists;
auditService.writeAuditEvent = async (_req, event) => { calls.audit.push(event); };
auditService.recordAuditFailure = async (_req, event, err) => { calls.auditFailures.push({ event, code: err.code }); };
auditService.getClientIp = () => '127.0.0.1';

const { postManualInit, postInit } = require('../src/controllers/integration.controller');
const { listFichasPaciente, getFichaVigente } = require('../src/services/ficha.service');
const {
  isProvisionalHistory,
  isValidReferredHistory,
  provisionalHistoryFor,
} = require('../src/utils/provisional');

const { userWithGroups, grupo, SUPERADMIN } = require('./helpers/userAuth');

const HOY = new Date().toISOString().slice(0, 10);

/** Medico (funcion `medicos`) en las instituciones dadas. */
function medico(tenants = ['23'], funcion = 'medicos') {
  return userWithGroups(tenants.map((tenant) => grupo(tenant, funcion)), {
    subject: 'medico-subject',
    username: 'medico.prueba',
    displayName: 'Medico Prueba',
    roles: ['medico'],
  });
}

function manualRequest(overrides = {}) {
  return {
    userAuth: medico(),
    headers: {},
    body: {
      provisional: true,
      paciente: { historiaClinica: '12345678', tenantId: '23', nombre: 'Paciente Sintetico' },
      consulta: { fechaConsulta: HOY, diagnosticoTexto: 'no debe guardarse' },
      ...overrides,
    },
  };
}

function fakeResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    set(name, value) { this.headers[name] = value; return this; },
  };
}

async function runManual(req) {
  const res = fakeResponse();
  let error = null;
  await postManualInit(req, res, (err) => { error = err; });
  return { res, error };
}

function reset({ exists = false, vigente = false, nurseraError = null } = {}) {
  calls.initSession = [];
  calls.audit = [];
  calls.auditFailures = [];
  calls.nursera = [];
  vigenteExists = vigente;
  nursera.patientExists = async (args) => {
    calls.nursera.push(args);
    if (nurseraError) throw nurseraError;
    return exists;
  };
}

// ── Formato TMP- ──────────────────────────────────────────────────────────

test('provisional history is TMP-<tenant>-<HC searched>', () => {
  assert.equal(provisionalHistoryFor(23, '12345678'), 'TMP-23-12345678');
  assert.equal(isProvisionalHistory('TMP-23-1'), true);
  assert.equal(isProvisionalHistory('tmp-23-1'), true);
  assert.equal(isProvisionalHistory('12345678'), false);
});

test('referred history rejects TMP- prefix, spaces, symbols and long values', () => {
  assert.equal(isValidReferredHistory('12345678'), true);
  assert.equal(isValidReferredHistory('HC-001'), true);
  assert.equal(isValidReferredHistory('TMP-1'), false);
  assert.equal(isValidReferredHistory('12 34'), false);
  assert.equal(isValidReferredHistory("1';--"), false);
  assert.equal(isValidReferredHistory('1'.repeat(49)), false);
  assert.equal(isValidReferredHistory(''), false);
});

// ── Cliente de Nursera ────────────────────────────────────────────────────

test('nursera lookup distinguishes found, not found and failures', async (t) => {
  const { patientExists } = require('../src/services/nursera.client');
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });

  let requestedUrl;
  global.fetch = async (url) => {
    requestedUrl = url;
    return { ok: true, json: async () => ({ error: false, valores: [{ idPaciente: 1 }] }) };
  };
  assert.equal(await patientExists({ tenantId: 23, historiaClinica: '12345678' }), true);
  assert.match(requestedUrl, /\/Paciente\?idTenant=23&historiaClinica=12345678$/);

  global.fetch = async () => ({ ok: true, json: async () => ({ error: false, valores: [] }) });
  assert.equal(await patientExists({ tenantId: 23, historiaClinica: '12345678' }), false);

  global.fetch = async () => ({ ok: false, status: 500 });
  await assert.rejects(patientExists({ tenantId: 23, historiaClinica: '1' }), { code: 'SADC_UNAVAILABLE', status: 503 });

  global.fetch = async () => ({ ok: true, json: async () => ({ error: true, mensaje: 'x' }) });
  await assert.rejects(patientExists({ tenantId: 23, historiaClinica: '1' }), { code: 'SADC_UNAVAILABLE' });

  global.fetch = async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); };
  await assert.rejects(patientExists({ tenantId: 23, historiaClinica: '1' }), { code: 'SADC_UNAVAILABLE' });
});

// ── POST /api/v1/sessions/manual con provisional ──────────────────────────

test('provisional session is created with TMP- history after SADC confirms absence', async () => {
  reset({ exists: false });
  const { res, error } = await runManual(manualRequest());

  assert.equal(error, null);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls.nursera, [{ tenantId: 23, historiaClinica: '12345678' }]);
  assert.equal(calls.initSession.length, 1);
  const { body, origenCreacion } = calls.initSession[0];
  assert.equal(origenCreacion, 'MANUAL');
  assert.equal(body.paciente.historiaClinica, 'TMP-23-12345678');
  assert.equal(body.paciente.patientId, 'TMP-23-12345678');
  assert.deepEqual(body.provisional, { historiaClinicaReferida: '12345678' });
  assert.equal(body.consulta.diagnosticoTexto, '');
  assert.equal(body.consulta.fechaConsulta, HOY);
  assert.deepEqual(calls.audit[0].detalle, { expiresIn: 900, provisional: true });
});

test('provisional session is refused when the history exists in SADC', async () => {
  reset({ exists: true });
  const { error } = await runManual(manualRequest());

  assert.equal(error.status, 409);
  assert.equal(error.code, 'PACIENTE_EXISTE_EN_SADC');
  assert.equal(calls.initSession.length, 0);
  assert.deepEqual(calls.auditFailures.map((f) => f.code), ['PACIENTE_EXISTE_EN_SADC']);
});

test('provisional session fails closed when SADC is unavailable', async () => {
  reset({ nurseraError: Object.assign(new Error('down'), { status: 503, code: 'SADC_UNAVAILABLE' }) });
  const { error } = await runManual(manualRequest());

  assert.equal(error.status, 503);
  assert.equal(error.code, 'SADC_UNAVAILABLE');
  assert.equal(calls.initSession.length, 0);
});

test('provisional session is refused when that TMP- history already has a ficha', async () => {
  reset({ exists: false, vigente: true });
  const { error } = await runManual(manualRequest());

  assert.equal(error.status, 409);
  assert.equal(error.code, 'FICHA_VIGENTE_EXISTE');
  assert.equal(calls.initSession.length, 0);
});

test('provisional session validates history and date before calling SADC', async () => {
  reset();
  let result = await runManual(manualRequest({
    paciente: { historiaClinica: 'TMP-23-1', tenantId: '23', nombre: 'Paciente Sintetico' },
  }));
  assert.equal(result.error.code, 'INVALID_HISTORIA_CLINICA');

  result = await runManual(manualRequest({ consulta: { fechaConsulta: '2999-01-01' } }));
  assert.equal(result.error.code, 'INVALID_FECHA_CONSULTA');

  result = await runManual(manualRequest({ consulta: { fechaConsulta: '2026-02-30' } }));
  assert.equal(result.error.code, 'INVALID_FECHA_CONSULTA');

  assert.equal(calls.nursera.length, 0);
  assert.equal(calls.initSession.length, 0);
});

test('provisional session checks the tenant before probing SADC', async () => {
  reset();
  const req = manualRequest();
  req.userAuth = medico(['99']);
  const { res } = await runManual(req);

  assert.equal(res.statusCode, 403);
  assert.equal(calls.nursera.length, 0);
});

test('non-provisional sessions cannot use the TMP- namespace', async () => {
  reset();
  const { error } = await runManual(manualRequest({
    provisional: false,
    paciente: { historiaClinica: 'TMP-23-12345678', tenantId: '23', nombre: 'Paciente Sintetico' },
  }));
  assert.equal(error.code, 'INVALID_HISTORIA_CLINICA');
  assert.equal(calls.initSession.length, 0);
});

test('SADC integration sessions cannot use the TMP- namespace', async () => {
  reset();
  const res = fakeResponse();
  await postInit({
    headers: {},
    integrationAuth: { systemId: 'sadc', tenantId: 23 },
    body: {
      paciente: { patientId: 'TMP-23-1', nombre: 'Paciente Sintetico' },
      consulta: { fechaConsulta: HOY, diagnosticoTexto: 'x' },
      medico: { medicoId: 'MED-1', nombre: 'Medico', especialidad: 'Genetica' },
    },
  }, res, (err) => { throw err; });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'INVALID_HISTORIA_CLINICA');
  assert.equal(calls.initSession.length, 0);
});

// ── Busqueda de fichas por HC ─────────────────────────────────────────────

test('patient ficha list also returns the provisional ficha of that history', async (t) => {
  const originalQuery = db.query;
  t.after(() => { db.query = originalQuery; });

  let params;
  db.query = async (_sql, values) => {
    params = values;
    return { rows: [{
      ficha_id: 'f1', ficha_raiz_id: 'f1', version_ficha: 1, estado_ficha: 'COMPLETA',
      historia_clinica: 'TMP-23-12345678', estado_revision: null,
      fecha_consulta: new Date('2026-10-10T00:00:00Z'), fecha_creacion: new Date('2026-10-10T12:00:00Z'),
      es_vigente: true, medico: 'Medico Prueba',
    }] };
  };

  const fichas = await listFichasPaciente({ tenantId: '23', historiaClinica: '12345678', userAuth: medico() });
  assert.deepEqual(params, [23, '12345678', 'TMP-23-12345678']);
  assert.equal(fichas[0].historiaClinica, 'TMP-23-12345678');
  assert.equal(fichas[0].provisional, true);
  assert.equal(fichas[0].esVigente, true);
});

test('patient ficha list of another institution is refused without touching the database', async (t) => {
  const originalQuery = db.query;
  t.after(() => { db.query = originalQuery; });
  let queried = false;
  db.query = async () => { queried = true; return { rows: [] }; };

  await assert.rejects(
    listFichasPaciente({ tenantId: '254', historiaClinica: '12345678', userAuth: medico(['23']) }),
    { status: 403, code: 'TENANT_FORBIDDEN' }
  );
  await assert.rejects(
    getFichaVigente({ tenantId: '254', historiaClinica: '12345678', userAuth: medico(['23']) }),
    { status: 403, code: 'TENANT_FORBIDDEN' }
  );
  await assert.rejects(
    listFichasPaciente({ tenantId: 'abc', historiaClinica: '12345678', userAuth: medico(['23']) }),
    { status: 400, code: 'INVALID_TENANT_ID' }
  );
  assert.equal(queried, false);
});

test('the superadmin lists patient fichas of any institution', async (t) => {
  const originalQuery = db.query;
  t.after(() => { db.query = originalQuery; });
  let params;
  db.query = async (_sql, values) => { params = values; return { rows: [] }; };

  const superadmin = userWithGroups([SUPERADMIN]);
  assert.deepEqual(await listFichasPaciente({ tenantId: '254', historiaClinica: '12345678', userAuth: superadmin }), []);
  assert.equal(params[0], 254);
});

test('manual registration requires fichas.crear in the chosen institution, not just access', async () => {
  reset();
  // Un revisor lee fichas en la 23 pero no puede registrarlas.
  const req = manualRequest();
  req.userAuth = medico(['23'], 'revisores');
  const { res } = await runManual(req);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'TENANT_FORBIDDEN');
  assert.equal(calls.nursera.length, 0, 'SADC is not probed');
});
