'use strict';

const crypto = require('crypto');
const db = require('../config/db');
// Como modulo y no desestructurado: las pruebas reemplazan publishToQueue.
const rabbitmq = require('../config/rabbitmq');
const { logEvent, logError } = require('../config/logger');

const QUEUE_NAME = () => process.env.RABBITMQ_QUEUE_MAIN || 'consent.pdf.generate';
const BATCH_SIZE = 20;
const MAX_BACKOFF_SECONDS = 3600;

function buildPdfJob({ consentimientoId, fichaId, requestedAt }) {
  return {
    schemaVersion: '1.0',
    eventType: 'consent.pdf.generate.requested',
    jobId: crypto.randomUUID(),
    requestedAt,
    consentimiento_id: consentimientoId,
    ficha_id: fichaId,
  };
}

/**
 * Registra el trabajo dentro de la transaccion abierta del consentimiento:
 * si el alta hace ROLLBACK, el trabajo tampoco existe; si hace COMMIT, el
 * trabajo queda pendiente aunque RabbitMQ este caido.
 */
async function enqueuePdfJob(client, { consentimientoId, fichaId, requestedAt }) {
  const payload = buildPdfJob({ consentimientoId, fichaId, requestedAt });
  const outboxId = crypto.randomUUID();
  await client.query(
    `INSERT INTO pdf_outbox (outbox_id, consentimiento_id, ficha_id, payload)
     VALUES ($1, $2, $3, $4)`,
    [outboxId, consentimientoId, fichaId, JSON.stringify(payload)]
  );
  return { outboxId, payload };
}

function backoffSeconds(intentos) {
  return Math.min(MAX_BACKOFF_SECONDS, 30 * 2 ** Math.max(0, intentos - 1));
}

/**
 * Publica una fila y la marca. Solo se marca como publicada despues de la
 * confirmacion del broker; un fallo deja la fila pendiente con espera
 * creciente. Si la marca falla tras publicar, el trabajo puede salir dos veces:
 * el worker ya trata el consentimiento con pdf_ref como terminado.
 */
async function publishEntry(client, { outboxId, payload, intentos = 0 }) {
  try {
    await rabbitmq.publishToQueue(QUEUE_NAME(), payload);
  } catch (err) {
    const next = intentos + 1;
    await client.query(
      `UPDATE pdf_outbox
          SET intentos = $2,
              ultimo_error = $3,
              siguiente_intento = now() + make_interval(secs => $4)
        WHERE outbox_id = $1`,
      [outboxId, next, String(err.message ?? err).slice(0, 300), backoffSeconds(next)]
    );
    logError('RABBITMQ_PUBLISH_FAILED', {
      outboxId,
      consentimientoId: payload.consentimiento_id,
      intentos: next,
      error: err.message,
    });
    return false;
  }
  await client.query(
    `UPDATE pdf_outbox SET publicado_en = now(), intentos = intentos + 1, ultimo_error = NULL
      WHERE outbox_id = $1`,
    [outboxId]
  );
  logEvent('RABBITMQ_EVENT_PUBLISHED', {
    outboxId,
    fichaId: payload.ficha_id,
    consentimientoId: payload.consentimiento_id,
    queue: QUEUE_NAME(),
  });
  return true;
}

/**
 * Intento inmediato tras el COMMIT del alta, con la misma conexion (ya fuera
 * de la transaccion). Nunca falla la respuesta.
 */
async function publishNow(client, entry) {
  try {
    return await publishEntry(client, entry);
  } catch (err) {
    logError('PDF_OUTBOX_MARK_FAILED', { outboxId: entry.outboxId, error: err.message });
    return false;
  }
}

/**
 * Publica las filas vencidas. SKIP LOCKED permite mas de una tarea de API sin
 * que dos publiquen la misma fila al mismo tiempo.
 */
async function dispatchPendingPdfJobs({ limit = BATCH_SIZE } = {}) {
  const client = await db.connect();
  let published = 0;
  let failed = 0;
  try {
    await client.query('BEGIN');
    const pending = await client.query(
      `SELECT outbox_id, payload, intentos
         FROM pdf_outbox
        WHERE publicado_en IS NULL AND siguiente_intento <= now()
        ORDER BY creado_en
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [limit]
    );
    for (const row of pending.rows) {
      const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
      const ok = await publishEntry(client, { outboxId: row.outbox_id, payload, intentos: row.intentos });
      if (ok) published += 1;
      else failed += 1;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  if (published || failed) logEvent('PDF_OUTBOX_DISPATCHED', { published, failed });
  return { published, failed };
}

/**
 * Barrido periodico. PDF_OUTBOX_INTERVAL_MS=0 lo apaga (por ejemplo en
 * scripts de una sola corrida); el valor por omision es 30 s.
 */
function startPdfOutboxDispatcher({ intervalMs = Number(process.env.PDF_OUTBOX_INTERVAL_MS ?? 30_000) } = {}) {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null;
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await dispatchPendingPdfJobs();
    } catch (err) {
      logError('PDF_OUTBOX_DISPATCH_FAILED', { error: err.message });
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref?.();
  return timer;
}

module.exports = {
  buildPdfJob,
  enqueuePdfJob,
  publishNow,
  dispatchPendingPdfJobs,
  startPdfOutboxDispatcher,
  backoffSeconds,
};
