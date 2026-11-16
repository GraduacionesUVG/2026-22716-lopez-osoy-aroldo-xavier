'use strict';

// Bandeja de salida del PDF: un broker caido no pierde el trabajo; la fila se
// marca solo con confirmacion y se reintenta con espera creciente.

const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');
const rabbitmq = require('../src/config/rabbitmq');
const outbox = require('../src/services/pdf-outbox.service');

function fakeClient(pendingRows = []) {
  const queries = [];
  return {
    queries,
    async query(sql, params) {
      const flat = sql.replace(/\s+/g, ' ').trim();
      queries.push({ sql: flat, params });
      if (flat.startsWith('SELECT outbox_id')) return { rows: pendingRows };
      return { rows: [] };
    },
    release() {},
  };
}

const ENTRY = {
  outboxId: '22222222-2222-4222-8222-222222222222',
  payload: { consentimiento_id: 'c-1', ficha_id: 'f-1' },
};

test('enqueuePdfJob inserta el trabajo con el contrato del worker', async () => {
  const client = fakeClient();
  const { payload } = await outbox.enqueuePdfJob(client, { consentimientoId: 'c-1', fichaId: 'f-1', requestedAt: '2026-10-30T00:00:00.000Z' });
  assert.equal(payload.eventType, 'consent.pdf.generate.requested');
  assert.equal(payload.consentimiento_id, 'c-1');
  assert.match(client.queries[0].sql, /^INSERT INTO pdf_outbox/);
  assert.equal(JSON.parse(client.queries[0].params[3]).ficha_id, 'f-1');
});

test('con broker disponible la fila queda publicada', async () => {
  const published = [];
  rabbitmq.publishToQueue = async (queue, message) => { published.push({ queue, message }); };
  const client = fakeClient();
  assert.equal(await outbox.publishNow(client, ENTRY), true);
  assert.equal(published[0].queue, 'consent.pdf.generate');
  assert.match(client.queries[0].sql, /^UPDATE pdf_outbox SET publicado_en = now\(\)/);
});

test('con broker caido la fila queda pendiente con reintento y no falla el alta', async () => {
  rabbitmq.publishToQueue = async () => { throw new Error('ECONNREFUSED'); };
  const client = fakeClient();
  assert.equal(await outbox.publishNow(client, ENTRY), false);
  const update = client.queries[0];
  assert.match(update.sql, /siguiente_intento = now\(\) \+ make_interval/);
  assert.deepEqual(update.params, [ENTRY.outboxId, 1, 'ECONNREFUSED', 30]);
});

test('el despachador publica las pendientes bajo SKIP LOCKED', async () => {
  const published = [];
  rabbitmq.publishToQueue = async (_q, message) => { published.push(message); };
  const client = fakeClient([
    { outbox_id: 'o-1', payload: { consentimiento_id: 'c-1' }, intentos: 2 },
    { outbox_id: 'o-2', payload: JSON.stringify({ consentimiento_id: 'c-2' }), intentos: 0 },
  ]);
  const original = db.connect;
  db.connect = async () => client;
  try {
    assert.deepEqual(await outbox.dispatchPendingPdfJobs(), { published: 2, failed: 0 });
  } finally {
    db.connect = original;
  }
  const sqls = client.queries.map((q) => q.sql);
  assert.equal(sqls[0], 'BEGIN');
  assert.match(sqls[1], /FOR UPDATE SKIP LOCKED$/);
  assert.equal(sqls.at(-1), 'COMMIT');
  assert.deepEqual(published.map((m) => m.consentimiento_id), ['c-1', 'c-2']);
});

test('la espera entre reintentos crece y se acota a una hora', () => {
  assert.deepEqual([1, 2, 3, 4].map(outbox.backoffSeconds), [30, 60, 120, 240]);
  assert.equal(outbox.backoffSeconds(20), 3600);
});

test('PDF_OUTBOX_INTERVAL_MS=0 apaga el barrido', () => {
  assert.equal(outbox.startPdfOutboxDispatcher({ intervalMs: 0 }), null);
});
