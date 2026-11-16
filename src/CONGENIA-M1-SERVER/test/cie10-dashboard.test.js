'use strict';

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

const ITEM = {
  codigo_traductor: '18752',
  diagnostico: 'cambios inflamatorios rinon derecho',
  cie10_original: '-1',
  sugerencias: [
    {
      codigo: 'N10',
      descripcionModelo: 'Nefritis aguda',
      codigoInternoCatalogo: '6001',
      nombreCatalogo: 'Nefritis tubulointersticial aguda',
    },
  ],
  razonamiento_clinico: 'Compatible con inflamacion renal.',
  error: null,
  modelo: 'gpt-4o-mini',
  procesado_en: '2026-09-25T04:06:30.781Z',
};

test('listSugerencias returns a cursor queue excluding decided items', async () => {
  const queries = [];
  stubModule('config/db.js', {
    query: async (sql, params = []) => {
      queries.push({ sql, params });
      if (/count\(\*\)::int AS total/.test(sql)) return { rows: [{ total: 2 }] };
      return { rows: [ITEM] };
    },
  });

  const service = freshRequire('services/cie10.service.js');
  const result = await service.listSugerencias({ query: { estado: 'PENDIENTE', limite: '1' } });

  assert.equal(result.total, 2);
  assert.equal(result.items[0].codigoTraductor, '18752');
  assert.equal(result.items[0].cie10Original, '-1');
  assert.equal(result.siguienteCursor, null);
  assert.match(queries[1].sql, /LEFT JOIN cie10_decision/);
  assert.match(queries[1].sql, /ORDER BY s\.procesado_en ASC, s\.codigo_traductor ASC/);
});

test('listActiveBatch exposes an empty code when AI found no valid suggestion', async () => {
  stubModule('config/db.js', {
    query: async (sql) => {
      if (/FROM cie10_run r/.test(sql)) {
        return {
          rows: [{
            run_id: 'run-empty-code',
            rag_version: 'rag-test',
            model: 'gpt-6-luna',
            finished_at: '2026-10-17T12:00:00.000Z',
            clausula_version: 'v1',
            clausula_texto: 'Clausula de prueba',
            aceptada_por: null,
            aceptada_en: null,
            confirmada_por: null,
            confirmada_en: null,
            csv_object_key: null,
            csv_sha256: null,
          }],
        };
      }
      if (/count\(\*\)::int AS total/.test(sql)) return { rows: [{ total: 1 }] };
      return {
        rows: [{
          ...ITEM,
          run_id: 'run-empty-code',
          sugerencias: [],
          razonamiento_clinico: 'No se encontro una codificacion valida.',
          rag_version: 'rag-test',
          borrador_codigo: null,
          borrador_comentario: null,
          borrador_corregido: null,
          decision: null,
          decision_codigo: null,
        }],
      };
    },
  });

  const service = freshRequire('services/cie10.service.js');
  const result = await service.listActiveBatch({
    userAuth: { subject: 'admin-1' },
    query: {},
  });

  assert.equal(result.items[0].finalCode, '');
  assert.equal(result.items[0].principal, null);
  assert.equal(result.items[0].status, 'REQUIERE_ATENCION');
});

test('createDecision accepts only a suggestion from the same CIE-10 item', async () => {
  const auditDetails = [];
  const client = {
    query: async (sql, params = []) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (/FROM cie10_sugerencia/.test(sql)) return { rows: [ITEM] };
      if (/SELECT codigo_traductor FROM cie10_decision/.test(sql)) return { rows: [] };
      if (/INSERT INTO cie10_decision \(/.test(sql)) {
        return {
          rows: [{
            codigo_traductor: params[0],
            decision: params[1],
            codigo_final: params[2],
            codigo_interno_catalogo: params[3],
            comentario: params[4],
            posicion: params[5],
            sugerencias_mostradas: params[6],
            revisor_id: params[7],
            revisor_nombre: params[8],
            decidido_en: '2026-09-30T14:21:07.000Z',
          }],
        };
      }
      if (/INSERT INTO auditoria_evento/.test(sql)) {
        auditDetails.push(JSON.parse(params[7]));
        return { rows: [] };
      }
      return { rows: [] };
    },
    release: () => {},
  };
  stubModule('config/db.js', { connect: async () => client });

  const service = freshRequire('services/cie10.service.js');
  const result = await service.createDecision({
    codigoTraductor: '18752',
    payload: {
      decision: 'ACEPTADA',
      codigo: 'N10',
      codigoInternoCatalogo: '6001',
      posicion: 1,
      sugerenciasMostradas: 1,
    },
    userAuth: { subject: 'admin-1', displayName: 'Admin CIE10' },
    audit: { actor: { sub: 'admin-1' }, ip: '10.0.0.1', requestId: 'req-cie10' },
  });

  assert.equal(result.decision, 'ACEPTADA');
  assert.equal(result.codigoFinal, 'N10');
  assert.ok(auditDetails.some((detail) => detail.codigoTraductor === '18752' && detail.codigoFinal === 'N10'));
  assert.ok(!JSON.stringify(auditDetails).includes('cambios inflamatorios'));
});

test('createDecision rejects repeated decisions with 409', async () => {
  const client = {
    query: async (sql) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      if (/FROM cie10_sugerencia/.test(sql)) return { rows: [ITEM] };
      if (/SELECT codigo_traductor FROM cie10_decision/.test(sql)) return { rows: [{ codigo_traductor: '18752' }] };
      return { rows: [] };
    },
    release: () => {},
  };
  stubModule('config/db.js', { connect: async () => client });

  const service = freshRequire('services/cie10.service.js');
  await assert.rejects(
    service.createDecision({
      codigoTraductor: '18752',
      payload: {
        decision: 'ACEPTADA',
        codigo: 'N10',
        codigoInternoCatalogo: '6001',
        posicion: 1,
        sugerenciasMostradas: 1,
      },
      userAuth: { subject: 'admin-1', displayName: 'Admin CIE10' },
      audit: { actor: { sub: 'admin-1' }, ip: '10.0.0.1', requestId: 'req-cie10' },
    }),
    { status: 409, code: 'CIE10_YA_DECIDIDO' }
  );
});

test('rejected manual code accepts well-formed unknown catalog codes with required comment', async () => {
  const client = {
    query: async (sql, params = []) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (/FROM cie10_sugerencia/.test(sql)) return { rows: [{ ...ITEM, sugerencias: [] }] };
      if (/SELECT codigo_traductor FROM cie10_decision/.test(sql)) return { rows: [] };
      if (/FROM cie10_catalogo/.test(sql)) return { rows: [] };
      if (/INSERT INTO cie10_decision \(/.test(sql)) {
        return {
          rows: [{
            codigo_traductor: params[0],
            decision: params[1],
            codigo_final: params[2],
            codigo_interno_catalogo: params[3],
            comentario: params[4],
            posicion: params[5],
            sugerencias_mostradas: params[6],
            revisor_id: params[7],
            revisor_nombre: params[8],
            decidido_en: '2026-09-30T14:21:07.000Z',
          }],
        };
      }
      return { rows: [] };
    },
    release: () => {},
  };
  stubModule('config/db.js', { connect: async () => client });

  const service = freshRequire('services/cie10.service.js');
  const result = await service.createDecision({
    codigoTraductor: '18752',
    payload: {
      decision: 'RECHAZADA',
      codigoCorrecto: 'Q99.99',
      comentario: 'El registro original usa este codigo.',
      sugerenciasMostradas: 0,
    },
    userAuth: { subject: 'admin-1', displayName: 'Admin CIE10' },
    audit: { actor: { sub: 'admin-1' }, ip: '10.0.0.1', requestId: 'req-cie10' },
  });

  assert.equal(result.decision, 'RECHAZADA');
  assert.equal(result.codigoFinal, 'Q99.99');
  assert.equal(result.codigoInternoCatalogo, null);
  assert.equal(result.comentario, 'El registro original usa este codigo.');
});

test('rejected manual code requires a comment', async () => {
  const client = {
    query: async (sql) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      if (/FROM cie10_sugerencia/.test(sql)) return { rows: [{ ...ITEM, sugerencias: [] }] };
      if (/SELECT codigo_traductor FROM cie10_decision/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
    release: () => {},
  };
  stubModule('config/db.js', { connect: async () => client });

  const service = freshRequire('services/cie10.service.js');
  await assert.rejects(
    service.createDecision({
      codigoTraductor: '18752',
      payload: { decision: 'RECHAZADA', codigoCorrecto: 'Q99.99', sugerenciasMostradas: 0 },
      userAuth: { subject: 'admin-1', displayName: 'Admin CIE10' },
      audit: { actor: { sub: 'admin-1' }, ip: '10.0.0.1', requestId: 'req-cie10' },
    }),
    { status: 400, code: 'COMENTARIO_REQUERIDO' }
  );
});

test('batch correction needs no comment and its audit event commits in the same transaction', async () => {
  const statements = [];
  const client = {
    query: async (sql, params = []) => {
      statements.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (/FROM cie10_run r/.test(sql)) return { rows: [{ run_id: params[0], confirmada_en: null }] };
      if (/SELECT s\.codigo_traductor, s\.sugerencias/.test(sql)) {
        return { rows: [{ codigo_traductor: '18752', sugerencias: ITEM.sugerencias, revision_corregida: null }] };
      }
      if (/FROM cie10_rag_catalogo c/.test(sql)) return { rows: [{ codigo: 'N12', codigo_interno: '6002' }] };
      if (/INSERT INTO cie10_revision_item/.test(sql)) {
        return { rows: [{
          codigo_traductor: '18752', codigo_final: 'N12', comentario: null,
          corregido: true, updated_at: '2026-10-17T12:00:00.000Z',
        }] };
      }
      if (/INSERT INTO auditoria_evento/.test(sql)) return { rows: [{ evento_id: 'audit-1' }] };
      return { rows: [] };
    },
    release: () => {},
  };
  stubModule('config/db.js', { connect: async () => client });

  const service = freshRequire('services/cie10.service.js');
  const result = await service.saveBatchCorrection({
    runId: '11111111-2222-4333-8444-555555555555',
    codigoTraductor: '18752',
    payload: { codigo: 'N12', sugerenciasMostradas: 1 },
    userAuth: { subject: 'admin-1' },
    audit: { actor: { sub: 'admin-1' }, requestId: 'req-batch-correction' },
  });

  assert.equal(result.codigoFinal, 'N12');
  assert.equal(statements[0].sql, 'BEGIN');
  assert.equal(statements.at(-1).sql, 'COMMIT');
  const audit = statements.find(({ sql }) => /INSERT INTO auditoria_evento/.test(sql));
  assert.ok(audit);
  assert.match(JSON.stringify(audit.params), /CIE10_BORRADOR_CORREGIDO/);
  assert.ok(!JSON.stringify(audit.params).includes('Diagnostico'));
});

test('catalog autocomplete reads only the active RAG version', async () => {
  let captured;
  stubModule('config/db.js', {
    query: async (sql, params) => {
      captured = { sql, params };
      return { rows: [{
        codigo: 'S83.6', descripcion: 'Esguince de otras partes de la rodilla',
        codigo_interno: null, en_catalogo_institucional: false, en_referencia_externa: true,
      }] };
    },
  });

  const service = freshRequire('services/cie10.service.js');
  const result = await service.searchCatalog({ q: 'esguince', limit: '10' });

  assert.match(captured.sql, /v\.estado = 'ACTIVE'/);
  assert.deepEqual(captured.params, ['esguince%', '%esguince%', 10]);
  assert.deepEqual(result.items[0], {
    codigo: 'S83.6', descripcion: 'Esguince de otras partes de la rodilla',
    codigoInterno: null, enCatalogoInstitucional: false, enReferenciaExterna: true,
  });
});

test('batch item acceptance stores the fifth selected position and shown count atomically', async () => {
  const fiveSuggestions = [
    'A00', 'B01', 'C02', 'D03', 'N10',
  ].map((codigo) => ({ codigo, descripcionModelo: `Opcion ${codigo}` }));
  const statements = [];
  const client = {
    query: async (sql, params = []) => {
      statements.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (/FROM cie10_run r/.test(sql)) return { rows: [{ run_id: params[0], confirmada_en: null }] };
      if (/SELECT s\.codigo_traductor, s\.sugerencias/.test(sql)) {
        return { rows: [{ ...ITEM, sugerencias: fiveSuggestions, revision_corregida: null }] };
      }
      if (/INSERT INTO cie10_revision_item/.test(sql)) {
        return { rows: [{
          codigo_traductor: '18752', codigo_final: 'N10', comentario: null,
          corregido: false, updated_at: '2026-10-17T12:00:00.000Z',
        }] };
      }
      if (/INSERT INTO auditoria_evento/.test(sql)) return { rows: [{ evento_id: 'audit-accept' }] };
      return { rows: [] };
    },
    release: () => {},
  };
  stubModule('config/db.js', { connect: async () => client });
  const service = freshRequire('services/cie10.service.js');

  const result = await service.acceptBatchItem({
    runId: '11111111-2222-4333-8444-555555555555',
    codigoTraductor: '18752',
    payload: { codigo: 'N10', posicion: 5, sugerenciasMostradas: 5 },
    userAuth: { subject: 'admin-1' },
    audit: { actor: { sub: 'admin-1' }, requestId: 'req-accept' },
  });

  assert.equal(result.corrected, false);
  const insert = statements.find(({ sql }) => /INSERT INTO cie10_revision_item/.test(sql));
  assert.deepEqual(insert.params.slice(2, 5), ['N10', 5, 5]);
  assert.equal(statements.at(-1).sql, 'COMMIT');
});

test('batch item acceptance rejects a code that is not in the selected position', async () => {
  const client = {
    query: async (sql, params = []) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      if (/FROM cie10_run r/.test(sql)) return { rows: [{ run_id: params[0], confirmada_en: null }] };
      if (/SELECT s\.codigo_traductor, s\.sugerencias/.test(sql)) {
        return { rows: [{ ...ITEM, revision_corregida: null }] };
      }
      return { rows: [] };
    },
    release: () => {},
  };
  stubModule('config/db.js', { connect: async () => client });
  const service = freshRequire('services/cie10.service.js');

  await assert.rejects(service.acceptBatchItem({
    runId: '11111111-2222-4333-8444-555555555555',
    codigoTraductor: '18752',
    payload: { codigo: 'R69', posicion: 1, sugerenciasMostradas: 1 },
    userAuth: { subject: 'admin-1' },
    audit: { actor: { sub: 'admin-1' }, requestId: 'req-accept' },
  }), { status: 400, code: 'SUGERENCIA_INVALIDA' });
});

test('bulk acceptance rolls back every row when one selection is invalid', async () => {
  const statements = [];
  const client = {
    query: async (sql, params = []) => {
      statements.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      if (/FROM cie10_run r/.test(sql)) return { rows: [{ run_id: params[0], confirmada_en: null }] };
      if (/SELECT s\.codigo_traductor, s\.sugerencias/.test(sql)) {
        return { rows: [{ ...ITEM, codigo_traductor: params[1], revision_corregida: null }] };
      }
      return { rows: [] };
    },
    release: () => {},
  };
  stubModule('config/db.js', { connect: async () => client });
  const service = freshRequire('services/cie10.service.js');

  await assert.rejects(service.acceptBatchItems({
    runId: '11111111-2222-4333-8444-555555555555',
    payload: { items: [
      { codigoTraductor: '18752', codigo: 'N10', posicion: 1, sugerenciasMostradas: 1 },
      { codigoTraductor: '18753', codigo: 'R69', posicion: 1, sugerenciasMostradas: 1 },
    ] },
    userAuth: { subject: 'admin-1' },
    audit: { actor: { sub: 'admin-1' }, requestId: 'req-bulk' },
  }), { status: 400, code: 'SUGERENCIA_INVALIDA' });

  assert.equal(statements.some(({ sql }) => /INSERT INTO cie10_revision_item/.test(sql)), false);
  assert.equal(statements.at(-1).sql, 'ROLLBACK');
});

test('batch correction requires an explicit override for an external code', async () => {
  const client = {
    query: async (sql, params = []) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      if (/FROM cie10_run r/.test(sql)) return { rows: [{ run_id: params[0], confirmada_en: null }] };
      if (/SELECT s\.codigo_traductor, s\.sugerencias/.test(sql)) return { rows: [{ ...ITEM }] };
      if (/FROM cie10_rag_catalogo c/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
    release: () => {},
  };
  stubModule('config/db.js', { connect: async () => client });
  const service = freshRequire('services/cie10.service.js');

  await assert.rejects(service.saveBatchCorrection({
    runId: '11111111-2222-4333-8444-555555555555',
    codigoTraductor: '18752',
    payload: { codigo: 'S83.004A', sugerenciasMostradas: 1 },
    userAuth: { subject: 'admin-1' },
    audit: { actor: { sub: 'admin-1' }, requestId: 'req-external' },
  }), { status: 400, code: 'CIE10_FUERA_DE_CATALOGO' });
});

test('batch correction accepts zero shown suggestions after an AI abstention', async () => {
  const statements = [];
  const client = {
    query: async (sql, params = []) => {
      statements.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (/FROM cie10_run r/.test(sql)) return { rows: [{ run_id: params[0], confirmada_en: null }] };
      if (/SELECT s\.codigo_traductor, s\.sugerencias/.test(sql)) {
        return { rows: [{ ...ITEM, sugerencias: [], revision_corregida: null }] };
      }
      if (/FROM cie10_rag_catalogo c/.test(sql)) {
        return { rows: [{ codigo: 'Z34.0', codigo_interno: '9001' }] };
      }
      if (/INSERT INTO cie10_revision_item/.test(sql)) {
        return { rows: [{
          codigo_traductor: '18752', codigo_final: 'Z34.0', comentario: null,
          corregido: true, updated_at: '2026-10-18T12:00:00.000Z',
        }] };
      }
      if (/INSERT INTO auditoria_evento/.test(sql)) return { rows: [{ evento_id: 'audit-correction' }] };
      return { rows: [] };
    },
    release: () => {},
  };
  stubModule('config/db.js', { connect: async () => client });
  const service = freshRequire('services/cie10.service.js');

  const result = await service.saveBatchCorrection({
    runId: '11111111-2222-4333-8444-555555555555',
    codigoTraductor: '18752',
    payload: { codigo: 'Z34.0', sugerenciasMostradas: 0 },
    userAuth: { subject: 'admin-1' },
    audit: { actor: { sub: 'admin-1' }, requestId: 'req-empty-correction' },
  });

  assert.equal(result.codigoFinal, 'Z34.0');
  assert.equal(result.corrected, true);
  const insert = statements.find(({ sql }) => /INSERT INTO cie10_revision_item/.test(sql));
  assert.equal(insert.params[3], 0);
  assert.equal(statements.at(-1).sql, 'COMMIT');
});

test('batch confirmation rejects incomplete review and rolls back', async () => {
  const statements = [];
  const client = {
    query: async (sql) => {
      statements.push(sql);
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      if (/FROM cie10_lote_confirmacion/.test(sql)) {
        return { rows: [{ run_id: 'run-1', clausula_version: 'v1', aceptada_por: 'admin-1', confirmada_en: null }] };
      }
      if (/FROM cie10_sugerencia s/.test(sql)) {
        return { rows: [{ ...ITEM, codigo_final: null, corregido: null, posicion: null, sugerencias_mostradas: null }] };
      }
      return { rows: [] };
    },
    release: () => {},
  };
  stubModule('config/db.js', { connect: async () => client });
  const service = freshRequire('services/cie10.service.js');

  await assert.rejects(service.confirmBatch({
    runId: 'run-1',
    userAuth: { subject: 'admin-1', displayName: 'Admin' },
    audit: { actor: { sub: 'admin-1' }, requestId: 'req-confirm' },
  }), { status: 422, code: 'CIE10_BATCH_INCOMPLETE' });
  assert.equal(statements.at(-1), 'ROLLBACK');
});

test('batch list separates pending and reviewed runs and reports both counters', async () => {
  stubModule('config/db.js', {
    query: async (sql) => {
      if (/SELECT r\.run_id/.test(sql)) return { rows: [{
        run_id: 'run-1', periodo: '2026-09', finished_at: '2026-10-01T12:00:00Z',
        confirmada_en: null, total: 20, pendientes: 3,
      }] };
      if (/SELECT count\(\*\)::int AS total/.test(sql)) return { rows: [{ total: 1 }] };
      return { rows: [{ pendientes: 1, revisados: 2 }] };
    },
  });
  const service = freshRequire('services/cie10.service.js');
  const result = await service.listBatches({ query: { estado: 'PENDIENTES', page: 1, pageSize: 10 } });

  assert.equal(result.items[0].periodo, '2026-09');
  assert.equal(result.items[0].pendientes, 3);
  assert.deepEqual(result.counts, { pendientes: 1, revisados: 2 });
});
