'use strict';

// Separacion de funciones en las adendas: quien la solicita no la resuelve,
// tampoco el superadministrador.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const FICHA_ID = '11111111-2222-4333-8444-555555555555';
const ROOT_ID = '22222222-3333-4444-8555-666666666666';
const SOLICITANTE_ID = '33333333-4444-4555-8666-777777777777';
const OTRO_REVISOR_ID = '55555555-6666-4777-8888-999999999999';
const OBSERVACION_ID = '44444444-5555-4666-8777-888888888888';
const { userWithGroups, grupo, SUPERADMIN } = require('./helpers/userAuth');

function stubModule(relativePath, exports) {
  const resolved = require.resolve(path.join(SRC, relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function freshRequire(relativePath) {
  const resolved = require.resolve(path.join(SRC, relativePath));
  delete require.cache[resolved];
  return require(resolved);
}

/** Base falsa: la adenda pendiente la pidio SOLICITANTE_ID. */
function loadFicha() {
  const transactionQueries = [];
  const client = {
    query: async (sql) => {
      transactionQueries.push(sql);
      if (/SELECT observacion_id FROM observacion_ficha/.test(sql)) {
        return { rows: [{ observacion_id: OBSERVACION_ID }] };
      }
      return { rows: [] };
    },
    release: () => {},
  };
  stubModule('config/db.js', {
    query: async (sql) => {
      if (/FROM ficha_cambio/.test(sql)) return { rows: [{ usuario_id: SOLICITANTE_ID }] };
      return {
        rows: [{
          ficha_id: FICHA_ID,
          ficha_raiz_id: ROOT_ID,
          version_ficha: 2,
          estado_revision: 'PENDIENTE',
          estado_ficha: 'PENDIENTE',
          id_tenant: 23,
        }],
      };
    },
    connect: async () => client,
  });
  stubModule('services/upload.service.js', { generatePresignedReadUrl: async () => null });
  return { ficha: freshRequire('services/ficha.service.js'), transactionQueries };
}

// La adenda de prueba es de la institucion 23 (ver loadFicha).
function resolve(ficha, subject, groups, audit = { actor: { sub: subject }, ip: '10.0.0.1', requestId: 'req-1' }) {
  return ficha.resolveRevision({
    fichaId: FICHA_ID,
    decisiones: [{ tipo: 'OBSERVACION', id: OBSERVACION_ID, decision: 'APROBADO' }],
    userAuth: userWithGroups(groups, { subject, displayName: 'Revisor' }),
    ip: '10.0.0.1',
    audit,
  });
}

test('the requester of an adenda cannot resolve it', async () => {
  for (const funcion of ['genetistas', 'coordinadores']) {
    const { ficha, transactionQueries } = loadFicha();
    const audit = { actor: { sub: SOLICITANTE_ID }, ip: '10.0.0.1', requestId: 'req-1' };
    await assert.rejects(resolve(ficha, SOLICITANTE_ID, [grupo(23, funcion)], audit), {
      status: 403,
      code: 'SELF_REVIEW_FORBIDDEN',
    }, `${funcion} resolved its own adenda`);
    assert.equal(transactionQueries.length, 0, 'nothing is written when the review is refused');
    assert.equal(audit.resolved.idTenant, 23, 'the refusal is audited with the ficha tenant');
  }
});

test('another reviewer resolves the adenda', async () => {
  const { ficha, transactionQueries } = loadFicha();
  await resolve(ficha, OTRO_REVISOR_ID, [grupo(23, 'coordinadores')]);
  assert.ok(transactionQueries.includes('COMMIT'));
});

test('the superadmin cannot resolve an adenda it requested either', async () => {
  const { ficha, transactionQueries } = loadFicha();
  const audit = { actor: { sub: SOLICITANTE_ID }, ip: '10.0.0.1', requestId: 'req-1' };
  await assert.rejects(resolve(ficha, SOLICITANTE_ID, [SUPERADMIN], audit), {
    status: 403,
    code: 'SELF_REVIEW_FORBIDDEN',
  });
  assert.equal(transactionQueries.length, 0, 'nothing is written when the review is refused');
  assert.equal(audit.resolved.idTenant, 23, 'the refusal is audited with the ficha tenant');
});

test('the superadmin resolves an adenda requested by someone else', async () => {
  const { ficha, transactionQueries } = loadFicha();
  await resolve(ficha, OTRO_REVISOR_ID, [SUPERADMIN]);
  assert.ok(transactionQueries.includes('COMMIT'));
});

test('a reviewer role in another institution does not allow resolving here', async () => {
  // Medico en la 23 (lee la ficha) y coordinador en la 254: no revisa en la 23.
  const { ficha, transactionQueries } = loadFicha();
  const audit = { actor: { sub: OTRO_REVISOR_ID }, ip: '10.0.0.1', requestId: 'req-1' };
  await assert.rejects(
    resolve(ficha, OTRO_REVISOR_ID, [grupo(23, 'medicos'), grupo(254, 'coordinadores')], audit),
    { status: 403, code: 'FORBIDDEN' }
  );
  assert.equal(transactionQueries.length, 0);
  assert.equal(audit.resolved.idTenant, 23, 'the refusal is audited with the ficha tenant');
});

test('the same mixed user resolves in the institution where it reviews', async () => {
  const { ficha, transactionQueries } = loadFicha();
  await resolve(ficha, OTRO_REVISOR_ID, [grupo(23, 'coordinadores'), grupo(254, 'medicos')]);
  assert.ok(transactionQueries.includes('COMMIT'));
});

test('requesting an adenda needs fichas.crear in the ficha institution', async () => {
  // Un revisor lee fichas en la 23 pero no puede pedir adendas ahi.
  const { ficha, transactionQueries } = loadFicha();
  const audit = { actor: { sub: OTRO_REVISOR_ID }, ip: '10.0.0.1', requestId: 'req-1' };
  await assert.rejects(
    ficha.createRevision({
      fichaId: FICHA_ID,
      payload: { motivo: 'QA', observations: [{ observationText: 'QA' }] },
      userAuth: userWithGroups([grupo(23, 'revisores'), grupo(254, 'medicos')], { subject: OTRO_REVISOR_ID, displayName: 'Revisor' }),
      ip: '10.0.0.1',
      audit,
    }),
    { status: 403, code: 'FORBIDDEN' }
  );
  assert.equal(transactionQueries.length, 0);
  assert.equal(audit.resolved.idTenant, 23);
});
