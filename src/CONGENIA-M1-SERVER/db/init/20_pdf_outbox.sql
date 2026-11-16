-- =============================================================
-- CONGENIA — Bandeja de salida (outbox) del trabajo de PDF
--
-- Antes, el mensaje a RabbitMQ se publicaba despues del COMMIT y un fallo del
-- broker solo dejaba un RABBITMQ_PUBLISH_FAILED en el log: el consentimiento
-- quedaba sin PDF para siempre. Ahora la fila de pdf_outbox se inserta en la
-- misma transaccion que el consentimiento, y un despachador de la API publica
-- las pendientes con confirmacion del broker hasta lograrlo.
--
-- Idempotente. Reversion (solo si se retira el despachador):
--   DROP TABLE IF EXISTS pdf_outbox;
--   DELETE FROM schema_migrations WHERE version = '20_pdf_outbox.sql';
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS pdf_outbox (
  outbox_id          uuid PRIMARY KEY,
  consentimiento_id  uuid NOT NULL REFERENCES consentimiento (consentimiento_id),
  ficha_id           uuid NOT NULL REFERENCES ficha_clinica (ficha_id),
  payload            jsonb NOT NULL,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  publicado_en       timestamptz,
  intentos           integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  siguiente_intento  timestamptz NOT NULL DEFAULT now(),
  ultimo_error       varchar(300)
);

COMMENT ON TABLE pdf_outbox IS
  'Trabajos de generacion de PDF pendientes de publicar en RabbitMQ; se insertan en la transaccion del consentimiento';

-- Un trabajo por consentimiento: reintentar el alta no duplica la publicacion.
CREATE UNIQUE INDEX IF NOT EXISTS ux_pdf_outbox_consentimiento ON pdf_outbox (consentimiento_id);
CREATE INDEX IF NOT EXISTS ix_pdf_outbox_pendiente ON pdf_outbox (siguiente_intento) WHERE publicado_en IS NULL;

-- ALTER DEFAULT PRIVILEGES (06) daria tambien DELETE: la bandeja conserva la
-- historia de publicacion, asi que la API solo inserta y marca.
REVOKE ALL ON pdf_outbox FROM congenia_app;
GRANT SELECT, INSERT ON pdf_outbox TO congenia_app;
GRANT UPDATE (publicado_en, intentos, siguiente_intento, ultimo_error) ON pdf_outbox TO congenia_app;

INSERT INTO schema_migrations (version)
VALUES ('20_pdf_outbox.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
