'use strict';

require('dotenv').config();

const app = require('./app');
const db = require('./config/db');
const { getOidcConfig } = require('./middleware/requireOAuthClient');
const { startPdfOutboxDispatcher } = require('./services/pdf-outbox.service');

const PORT = process.env.PORT || 3000;

async function start() {
  // Sin emisor, JWKS o audiencia la API no arranca: es preferible una tarea que
  // no levanta a una que acepta tokens emitidos para otro servicio.
  try {
    getOidcConfig();
  } catch (err) {
    console.error('[AUTH] Configuracion OIDC incompleta:', err.message);
    process.exit(1);
  }

  // Verify DB connection before accepting traffic
  try {
    await db.query('SELECT 1');
    console.log('[DB] Connected to PostgreSQL');
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`[SERVER] CONGENIA M1 running on port ${PORT}`);
  });

  // Publica los trabajos de PDF que quedaron pendientes (broker caido, tarea
  // reiniciada entre el COMMIT y la publicacion).
  startPdfOutboxDispatcher();
}

start();
