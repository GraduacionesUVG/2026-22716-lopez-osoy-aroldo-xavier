'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const FICHA_ID = '11111111-2222-4333-8444-555555555555';
const ROOT_ID = '22222222-3333-4444-8555-666666666666';
const USER_ID = '33333333-4444-4555-8666-777777777777';
const OBSERVACION_ID = '44444444-5555-4666-8777-888888888888';
const { userWithGroups, grupo } = require('./helpers/userAuth');
// Quien resuelve adendas en la institucion 23 (adendas.revisar).
const REVISOR_23 = () => userWithGroups([grupo(23, 'genetistas')], { subject: USER_ID, displayName: 'Medico' });

function stubModule(relativePath, exports) {
  const resolved = require.resolve(path.join(SRC, relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function freshRequire(relativePath) {
  const resolved = require.resolve(path.join(SRC, relativePath));
  delete require.cache[resolved];
  return require(resolved);
}

test('getSexos returns active catalog rows in database order', async () => {
  const queries = [];
  stubModule('config/db.js', {
    query: async (sql) => {
      queries.push(sql);
      return { rows: [{ sexo_id: 1, codigo: 'M', nombre: 'Masculino' }] };
    },
  });

  const catalog = freshRequire('services/catalog.service.js');
  const rows = await catalog.getSexos();

  assert.deepEqual(rows, [{ sexo_id: 1, codigo: 'M', nombre: 'Masculino' }]);
  assert.match(queries[0], /FROM sexo_catalogo/);
  assert.match(queries[0], /activo = true/);
});

test('generic encrypted text helpers round-trip PHI without storing plaintext', () => {
  process.env.APP_ENCRYPTION_KEY = 'a'.repeat(64);
  const { decryptText, encryptText } = freshRequire('utils/patientName.js');

  const original = 'Observacion clinica con salto\nsegunda linea';
  const encrypted = encryptText(original);

  assert.ok(Buffer.isBuffer(encrypted.textEnc));
  assert.ok(Buffer.isBuffer(encrypted.dekEnc));
  assert.doesNotMatch(encrypted.textEnc.toString('utf8'), /Observacion clinica/);
  assert.equal(decryptText(encrypted.textEnc, encrypted.dekEnc), original);
});

test('resolveRevision requires decisions for observation changes too', async () => {
  const client = {
    query: async (sql) => {
      if (/SELECT ficha_id FROM ficha_clinica WHERE ficha_raiz_id/.test(sql)) return { rows: [] };
      if (/SELECT signo_id FROM signo_alerta_ficha/.test(sql)) return { rows: [] };
      if (/SELECT examen_ficha_id FROM examen_ficha/.test(sql)) return { rows: [] };
      if (/SELECT observacion_id FROM observacion_ficha/.test(sql)) return { rows: [{ observacion_id: OBSERVACION_ID }] };
      return { rows: [] };
    },
    release: () => {},
  };
  stubModule('config/db.js', {
    query: async () => ({
      rows: [{
        ficha_id: FICHA_ID,
        ficha_raiz_id: ROOT_ID,
        version_ficha: 2,
        estado_revision: 'PENDIENTE',
        estado_ficha: 'PENDIENTE',
        id_tenant: 23,
      }],
    }),
    connect: async () => client,
  });
  stubModule('services/upload.service.js', { generatePresignedReadUrl: async () => null });

  const ficha = freshRequire('services/ficha.service.js');
  await assert.rejects(
    ficha.resolveRevision({
      fichaId: FICHA_ID,
      decisiones: [],
      userAuth: REVISOR_23(),
      ip: '10.0.0.1',
      audit: { actor: { sub: USER_ID }, ip: '10.0.0.1', requestId: 'req-1' },
    }),
    { code: 'INCOMPLETE_DECISIONS' }
  );
});

test('resolveRevision writes OBSERVACION_VALIDADA in the same transaction without PHI text', async () => {
  const auditEvents = [];
  const queries = [];
  const client = {
    query: async (sql, params = []) => {
      queries.push({ sql, params });
      if (/SELECT ficha_id FROM ficha_clinica WHERE ficha_raiz_id/.test(sql)) return { rows: [] };
      if (/SELECT signo_id FROM signo_alerta_ficha/.test(sql)) return { rows: [] };
      if (/SELECT examen_ficha_id FROM examen_ficha/.test(sql)) return { rows: [] };
      if (/SELECT observacion_id FROM observacion_ficha/.test(sql)) return { rows: [{ observacion_id: OBSERVACION_ID }] };
      if (/INSERT INTO auditoria_evento/.test(sql)) auditEvents.push(JSON.parse(params[7]));
      return { rows: [] };
    },
    release: () => {},
  };
  stubModule('config/db.js', {
    query: async () => ({
      rows: [{
        ficha_id: FICHA_ID,
        ficha_raiz_id: ROOT_ID,
        version_ficha: 2,
        estado_revision: 'PENDIENTE',
        estado_ficha: 'PENDIENTE',
        id_tenant: 23,
      }],
    }),
    connect: async () => client,
  });
  stubModule('services/upload.service.js', { generatePresignedReadUrl: async () => null });

  const ficha = freshRequire('services/ficha.service.js');
  const result = await ficha.resolveRevision({
    fichaId: FICHA_ID,
    decisiones: [{ tipo: 'OBSERVACION', id: OBSERVACION_ID, decision: 'RECHAZADO' }],
    userAuth: REVISOR_23(),
    ip: '10.0.0.1',
    audit: { actor: { sub: USER_ID }, ip: '10.0.0.1', requestId: 'req-1' },
  });

  assert.equal(result.estadoRevision, 'RECHAZADA');
  assert.ok(queries.some((call) => /DELETE FROM observacion_ficha/.test(call.sql)));
  assert.ok(queries.some((call) => /INSERT INTO auditoria_evento/.test(call.sql)));
  assert.ok(auditEvents.some((event) => event.tipo === 'OBSERVACION' && event.decision === 'RECHAZADO'));
  assert.ok(!JSON.stringify(auditEvents).includes('Observacion clinica'));
});
