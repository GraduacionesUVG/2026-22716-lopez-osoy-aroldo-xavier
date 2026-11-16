'use strict';

// Al rechazar un signo o examen de una adenda, la fila sale de la ficha pero
// el archivo se conserva: su referencia y hash quedan en la bitacora.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const FICHA_ID = '11111111-2222-4333-8444-555555555555';
const ROOT_ID = '22222222-3333-4444-8555-666666666666';
const USER_ID = '33333333-4444-4555-8666-777777777777';
const SIGNO_ID = '55555555-6666-4777-8888-999999999999';
const EXAMEN_ID = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const SIGNO_KEY = 'prod/tenants/sadc/patients/p/profile/d1.jpg';
const { userWithGroups, grupo } = require('./helpers/userAuth');

function stubModule(relativePath, exports) {
  const resolved = require.resolve(path.join(SRC, relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function freshRequire(relativePath) {
  const resolved = require.resolve(path.join(SRC, relativePath));
  delete require.cache[resolved];
  return require(resolved);
}

test('el archivo de un signo rechazado queda referenciado en ALERTA_VALIDADA', async () => {
  const auditEvents = [];
  const queries = [];
  const client = {
    query: async (sql, params = []) => {
      queries.push({ sql, params });
      if (/SELECT signo_id FROM signo_alerta_ficha/.test(sql)) return { rows: [{ signo_id: SIGNO_ID }] };
      if (/SELECT examen_ficha_id FROM examen_ficha/.test(sql)) return { rows: [{ examen_ficha_id: EXAMEN_ID }] };
      if (/SELECT observacion_id FROM observacion_ficha/.test(sql)) return { rows: [] };
      if (/DELETE FROM signo_alerta_ficha/.test(sql)) {
        return { rows: [{ signo_id: SIGNO_ID, imagen_bucket_ref: SIGNO_KEY, imagen_hash_sha256: 'b'.repeat(64) }] };
      }
      if (/INSERT INTO auditoria_evento/.test(sql)) auditEvents.push({ tipo: params[1], detalle: JSON.parse(params[7]) });
      return { rows: [] };
    },
    release: () => {},
  };
  stubModule('config/db.js', {
    query: async () => ({
      rows: [{ ficha_id: FICHA_ID, ficha_raiz_id: ROOT_ID, version_ficha: 2, estado_revision: 'PENDIENTE', estado_ficha: 'PENDIENTE', id_tenant: 23 }],
    }),
    connect: async () => client,
  });
  stubModule('services/upload.service.js', { generatePresignedReadUrl: async () => null });

  const ficha = freshRequire('services/ficha.service.js');
  await ficha.resolveRevision({
    fichaId: FICHA_ID,
    decisiones: [
      { tipo: 'SIGNO', id: SIGNO_ID, decision: 'RECHAZADO' },
      { tipo: 'EXAMEN', id: EXAMEN_ID, decision: 'APROBADO' },
    ],
    userAuth: userWithGroups([grupo(23, 'genetistas')], { subject: USER_ID, displayName: 'Medico' }),
    ip: '10.0.0.1',
    audit: { actor: { sub: USER_ID }, ip: '10.0.0.1', requestId: 'req-1' },
  });

  const borrado = queries.find((call) => /DELETE FROM signo_alerta_ficha/.test(call.sql));
  assert.match(borrado.sql, /RETURNING signo_id, imagen_bucket_ref, imagen_hash_sha256/);
  // Ningun borrado de objetos en S3 ni de filas aprobadas.
  assert.ok(!queries.some((call) => /DELETE FROM examen_ficha/.test(call.sql)));

  const signo = auditEvents.find((event) => event.tipo === 'ALERTA_VALIDADA' && event.detalle.tipo === 'SIGNO');
  assert.deepEqual(signo.detalle.archivoConservado, { objectKey: SIGNO_KEY, sha256: 'b'.repeat(64) });
  const examen = auditEvents.find((event) => event.tipo === 'ALERTA_VALIDADA' && event.detalle.tipo === 'EXAMEN');
  assert.equal(examen.detalle.archivoConservado, undefined);
  const resumen = auditEvents.find((event) => event.tipo === 'ADENDA_RESUELTA');
  assert.equal(resumen.detalle.archivosConservados, 1);
});
