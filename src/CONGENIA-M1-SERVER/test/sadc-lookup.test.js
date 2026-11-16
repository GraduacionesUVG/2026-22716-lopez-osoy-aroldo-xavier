'use strict';

// La busqueda de la ficha en SADC pasa por la API: institucion del token,
// bitacora sin PHI, limite de 20 s y sin cache.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

const { userWithGroups, grupo } = require('./helpers/userAuth');

process.env.APP_ENCRYPTION_KEY = 'a'.repeat(64);

const SRC = path.join(__dirname, '..', 'src');
const auditRows = [];
const dbPath = require.resolve(path.join(SRC, 'config/db.js'));
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { query: async (_sql, params) => { auditRows.push(params); return { rows: [{ evento_id: 1 }] }; } },
};

const nursera = require('../src/services/nursera.client');
const { buscarPaciente } = require('../src/controllers/sadc.controller');

function call(query, userAuth) {
  const req = { query, userAuth, headers: {}, method: 'GET', ip: '10.0.0.1', baseUrl: '/api/v1', route: { path: '/sadc/pacientes' } };
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      set(name, value) { this.headers[name] = value; return this; },
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ res: this, body }); return this; },
    };
    buscarPaciente(req, res, (err) => resolve({ err }));
  });
}

const MEDICO_254 = userWithGroups([grupo(254, 'medicos')]);
const MEDICO_DOS = userWithGroups([grupo(254, 'medicos'), grupo(23, 'medicos')]);

function lastAudit() {
  const row = auditRows.at(-1);
  return { tipo: row[1], resultado: row[6], detalle: JSON.parse(row[7]), tenant: row[11] };
}

test('devuelve el paciente de la institucion del token, sin cache y con bitacora', async () => {
  nursera.findPatient = async ({ tenantId, historiaClinica }) => {
    assert.equal(tenantId, 254);
    assert.equal(historiaClinica, 'HC-100');
    return { idPaciente: 9, idInstitucion: 254, nombres: 'Ana', apellidos: 'Lopez', historiaClinica: 'HC-100' };
  };
  const { res, body } = await call({ idTenant: '254', historiaClinica: 'HC-100' }, MEDICO_254);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(body.data.historiaClinica, 'HC-100');
  const audit = lastAudit();
  assert.equal(audit.tipo, 'SADC_PACIENTE_CONSULTADO');
  assert.equal(audit.tenant, 254);
  assert.equal(audit.detalle.encontrado, true);
  // La HC no queda en claro en la bitacora.
  assert.ok(!JSON.stringify(audit.detalle).includes('HC-100'));
  assert.match(audit.detalle.hcTokenHash, /^[0-9a-f]{64}$/);
});

test('rechaza una institucion distinta de las del token sin consultar SADC', async () => {
  let consultado = false;
  nursera.findPatient = async () => { consultado = true; return null; };
  const { res, body } = await call({ idTenant: '23', historiaClinica: 'HC-100' }, MEDICO_254);
  assert.equal(res.statusCode, 403);
  assert.equal(body.error, 'TENANT_FORBIDDEN');
  assert.equal(consultado, false);
  assert.equal(lastAudit().resultado, 'DENEGADO');
});

test('sin idTenant usa la unica institucion del usuario', async () => {
  nursera.findPatient = async ({ tenantId }) => {
    assert.equal(tenantId, 254);
    return null;
  };
  const { res, body } = await call({ historiaClinica: 'HC-200' }, MEDICO_254);
  assert.equal(res.statusCode, 404);
  assert.equal(body.error, 'PATIENT_NOT_FOUND');
  assert.equal(lastAudit().detalle.encontrado, false);
});

test('con varias instituciones idTenant es obligatorio', async () => {
  const { res } = await call({ historiaClinica: 'HC-200' }, MEDICO_DOS);
  assert.equal(res.statusCode, 400);
});

test('SADC caido o lento se informa como 503/504', async () => {
  nursera.findPatient = async () => { const e = new Error('x'); e.status = 504; e.code = 'SADC_TIMEOUT'; throw e; };
  const { res, body } = await call({ idTenant: '254', historiaClinica: 'HC-100' }, MEDICO_254);
  assert.equal(res.statusCode, 504);
  assert.equal(body.error, 'SADC_TIMEOUT');
  assert.equal(lastAudit().resultado, 'FALLIDO');
});

async function withNursera(handler, fn) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.NURSERA_API_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn();
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('findPatient filtra pacientes de otra institucion', async () => {
  delete require.cache[require.resolve('../src/services/nursera.client')];
  const client = require('../src/services/nursera.client');
  await withNursera((req, res) => {
    assert.match(req.url, /^\/Paciente\?idTenant=254&historiaClinica=HC-1$/);
    res.end(JSON.stringify({ error: false, valores: [{ idPaciente: 1, idInstitucion: 23, historiaClinica: 'HC-1', nombres: 'A', apellidos: 'B' }] }));
  }, async () => {
    await assert.rejects(client.findPatient({ tenantId: 254, historiaClinica: 'HC-1' }), { code: 'SADC_INVALID_RESPONSE' });
  });
  await withNursera((_req, res) => res.end(JSON.stringify({ error: false, valores: [] })), async () => {
    assert.equal(await client.findPatient({ tenantId: 254, historiaClinica: 'HC-1' }), null);
  });
});

test('el tiempo limite de la busqueda es 20 s y un vencimiento da SADC_TIMEOUT', async () => {
  delete require.cache[require.resolve('../src/services/nursera.client')];
  const client = require('../src/services/nursera.client');
  assert.equal(client.SEARCH_TIMEOUT_MS, 20_000);
  await withNursera(() => {}, async () => {
    await assert.rejects(client.lookup({ tenantId: 254, historiaClinica: 'HC-1', timeoutMs: 50 }), { code: 'SADC_TIMEOUT', status: 504 });
  });
});
