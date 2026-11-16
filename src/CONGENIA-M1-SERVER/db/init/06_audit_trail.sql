-- =============================================================
-- CONGENIA — Bitacora de auditoria integra
--
-- auditoria_evento pasa a ser una bitacora de solo insercion con cadena de
-- hashes calculada por la base: el orden, la marca de tiempo y los hashes los
-- fija un trigger, no la aplicacion. ficha_cambio queda tambien inmutable.
--
-- La API se conecta como congenia_app, que solo puede INSERT/SELECT sobre la
-- bitacora. Las migraciones siguen corriendo con el usuario propietario.
--
-- Idempotente: segura sobre bases nuevas y existentes.
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version varchar(200) PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- ── 1. Catalogo de tipos de evento ───────────────────────────

CREATE TABLE IF NOT EXISTS tipo_evento_catalogo (
  codigo varchar(50) PRIMARY KEY,
  categoria varchar(20) NOT NULL,
  descripcion varchar(300) NOT NULL
);

INSERT INTO tipo_evento_catalogo (codigo, categoria, descripcion) VALUES
  ('ACCESO_API',                   'ACCESO',       'Solicitud atendida por la API'),
  ('ACCESO_DENEGADO',              'ACCESO',       'Solicitud rechazada por autenticacion o autorizacion (401/403)'),
  ('FICHA_BUSQUEDA',               'CONSULTA',     'Busqueda de fichas en el dashboard'),
  ('FICHA_LEIDA',                  'CONSULTA',     'Lectura del detalle de una ficha clinica'),
  ('FICHA_LISTADA',                'CONSULTA',     'Listado de fichas de un paciente o pendientes'),
  ('ADENDA_BUSQUEDA',              'CONSULTA',     'Busqueda en la bandeja de adendas'),
  ('FICHA_CREADA',                 'MODIFICACION', 'Alta de una ficha clinica'),
  ('CONSENTIMIENTO_FIRMADO',       'MODIFICACION', 'Registro del consentimiento informado firmado'),
  ('ADENDA_SOLICITADA',            'MODIFICACION', 'Creacion de una adenda sobre una ficha vigente'),
  ('ADENDA_RESUELTA',              'VALIDACION',   'Resolucion de una adenda (aprobada o rechazada)'),
  ('ALERTA_VALIDADA',              'VALIDACION',   'Decision del revisor sobre un signo de alerta o examen de una adenda'),
  ('SESION_INTEGRACION_CREADA',    'INTEGRACION',  'Sesion de captura iniciada por un sistema externo'),
  ('SESION_INTEGRACION_MANUAL',    'INTEGRACION',  'Sesion de captura iniciada manualmente por un medico'),
  ('SESION_INTEGRACION_ACTIVADA',  'INTEGRACION',  'Apertura del formulario de captura'),
  ('URL_PREFIRMADA_GENERADA',      'ARCHIVO',      'Emision de una URL prefirmada de subida'),
  ('PDF_CONSENTIMIENTO_GENERADO',  'ARCHIVO',      'PDF del consentimiento generado y almacenado'),
  ('CATALOGO_MODIFICADO',          'CATALOGO',     'Alta, cambio o baja en un catalogo clinico')
ON CONFLICT (codigo) DO UPDATE SET
  categoria = EXCLUDED.categoria,
  descripcion = EXCLUDED.descripcion;

-- Tipos que ya existan en la bitacora, para que la FK no rechace historia.
INSERT INTO tipo_evento_catalogo (codigo, categoria, descripcion)
SELECT DISTINCT tipo_evento, 'HEREDADO', 'Tipo registrado antes de la migracion 06'
FROM auditoria_evento
ON CONFLICT (codigo) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_auditoria_tipo_evento'
      AND conrelid = 'auditoria_evento'::regclass
  ) THEN
    ALTER TABLE auditoria_evento
      ADD CONSTRAINT fk_auditoria_tipo_evento
      FOREIGN KEY (tipo_evento) REFERENCES tipo_evento_catalogo (codigo);
  END IF;
END $$;

-- ── 2. Columnas de trazabilidad ──────────────────────────────

ALTER TABLE auditoria_evento
  ADD COLUMN IF NOT EXISTS secuencia bigint,
  ADD COLUMN IF NOT EXISTS actor_sub varchar(100),
  ADD COLUMN IF NOT EXISTS actor_username varchar(200),
  ADD COLUMN IF NOT EXISTS actor_roles text[],
  ADD COLUMN IF NOT EXISTS id_tenant integer,
  ADD COLUMN IF NOT EXISTS http_method varchar(10),
  ADD COLUMN IF NOT EXISTS ruta varchar(300),
  ADD COLUMN IF NOT EXISTS status_code smallint,
  ADD COLUMN IF NOT EXISTS request_id varchar(100);

CREATE SEQUENCE IF NOT EXISTS auditoria_evento_secuencia_seq OWNED BY auditoria_evento.secuencia;

COMMENT ON COLUMN auditoria_evento.secuencia IS 'Orden total de la cadena. Lo asigna el trigger, no la aplicacion';
COMMENT ON COLUMN auditoria_evento.tipo_evento IS 'FK a tipo_evento_catalogo';
COMMENT ON COLUMN auditoria_evento.actor_sub IS 'Subject de Keycloak, client:<system_id> o system:<servicio>';
COMMENT ON COLUMN auditoria_evento.ruta IS 'Plantilla de la ruta (ej: /api/v1/fichas/:id), nunca la URL con identificadores';
COMMENT ON COLUMN auditoria_evento.hash_entrada_anterior IS 'hash_entrada_actual de la fila con la secuencia previa. Genesis: 64 ceros';
COMMENT ON COLUMN auditoria_evento.hash_entrada_actual IS 'auditoria_evento_hash(fila): SHA-256 de los campos canonicos + hash_entrada_anterior';

-- ── 3. Cadena de hashes ──────────────────────────────────────

-- Campos canonicos en orden fijo. jsonb_build_array evita ambiguedades de
-- separadores y la fecha se fija en UTC para que el resultado no dependa del
-- TimeZone de la sesion.
CREATE OR REPLACE FUNCTION auditoria_evento_hash(e auditoria_evento)
RETURNS char(64)
LANGUAGE sql
STABLE
AS $$
  SELECT encode(sha256(convert_to(jsonb_build_array(
    e.secuencia,
    to_char(e.fecha_hora AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    e.evento_id,
    e.tipo_evento,
    e.resultado,
    e.usuario_id,
    e.actor_sub,
    e.actor_username,
    e.actor_roles,
    e.id_tenant,
    e.entidad_tipo,
    e.entidad_id,
    e.ip_origen,
    e.user_agent,
    e.session_id,
    e.http_method,
    e.ruta,
    e.status_code,
    e.request_id,
    e.detalle_json,
    e.hash_entrada_anterior
  )::text, 'UTF8')), 'hex')
$$;

-- Primera aplicacion: numerar y encadenar la historia existente antes de que
-- los triggers de inmutabilidad la congelen. Los campos de contenido no se
-- tocan; solo se completan secuencia, actor_sub y los hashes.
DO $$
DECLARE
  r record;
  anterior char(64) := repeat('0', 64);
BEGIN
  IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = '06_audit_trail.sql') THEN
    RETURN;
  END IF;

  UPDATE auditoria_evento a
  SET secuencia = n.secuencia
  FROM (
    SELECT evento_id, row_number() OVER (ORDER BY fecha_hora, evento_id) AS secuencia
    FROM auditoria_evento
  ) n
  WHERE a.evento_id = n.evento_id;

  PERFORM setval(
    'auditoria_evento_secuencia_seq',
    COALESCE((SELECT max(secuencia) FROM auditoria_evento), 0) + 1,
    false
  );

  UPDATE auditoria_evento
  SET actor_sub = detalle_json->>'actorSubject'
  WHERE actor_sub IS NULL AND detalle_json ? 'actorSubject';

  FOR r IN SELECT evento_id FROM auditoria_evento ORDER BY secuencia LOOP
    UPDATE auditoria_evento SET hash_entrada_anterior = anterior WHERE evento_id = r.evento_id;
    UPDATE auditoria_evento a
    SET hash_entrada_actual = auditoria_evento_hash(a)
    WHERE a.evento_id = r.evento_id
    RETURNING a.hash_entrada_actual INTO anterior;
  END LOOP;
END $$;

ALTER TABLE auditoria_evento ALTER COLUMN secuencia SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_auditoria_secuencia ON auditoria_evento (secuencia);

-- El advisory lock serializa a los escritores hasta el COMMIT de su
-- transaccion: la siguiente insercion ya ve la fila previa confirmada. La
-- secuencia se toma despues del lock para que su orden sea el de la cadena.
CREATE OR REPLACE FUNCTION auditoria_evento_encadenar()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  anterior char(64);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('congenia.auditoria_evento'));
  NEW.secuencia := nextval('auditoria_evento_secuencia_seq');
  NEW.fecha_hora := clock_timestamp();
  SELECT hash_entrada_actual INTO anterior
  FROM auditoria_evento
  ORDER BY secuencia DESC
  LIMIT 1;
  NEW.hash_entrada_anterior := COALESCE(anterior, repeat('0', 64));
  NEW.hash_entrada_actual := auditoria_evento_hash(NEW);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auditoria_evento_encadenar ON auditoria_evento;
CREATE TRIGGER trg_auditoria_evento_encadenar
  BEFORE INSERT ON auditoria_evento
  FOR EACH ROW EXECUTE FUNCTION auditoria_evento_encadenar();

-- Recalcula la cadena desde una secuencia dada. Detecta filas alteradas,
-- reordenadas o borradas en medio; no detecta el borrado de la ultima fila
-- ni una cadena reescrita completa por el propietario de la base.
CREATE OR REPLACE FUNCTION verificar_cadena_auditoria(desde_secuencia bigint DEFAULT 0)
RETURNS TABLE (ok boolean, filas_verificadas bigint, primera_secuencia_rota bigint, motivo text)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  r auditoria_evento;
  anterior char(64);
  n bigint := 0;
BEGIN
  IF desde_secuencia > 0 THEN
    SELECT a.hash_entrada_actual INTO anterior
    FROM auditoria_evento a
    WHERE a.secuencia < desde_secuencia
    ORDER BY a.secuencia DESC
    LIMIT 1;
  END IF;
  anterior := COALESCE(anterior, repeat('0', 64));

  FOR r IN SELECT * FROM auditoria_evento a WHERE a.secuencia >= desde_secuencia ORDER BY a.secuencia LOOP
    n := n + 1;
    IF r.hash_entrada_anterior IS DISTINCT FROM anterior THEN
      RETURN QUERY SELECT false, n, r.secuencia, 'hash_entrada_anterior no coincide con la fila previa'::text;
      RETURN;
    END IF;
    IF r.hash_entrada_actual IS DISTINCT FROM auditoria_evento_hash(r) THEN
      RETURN QUERY SELECT false, n, r.secuencia, 'hash_entrada_actual no coincide con el contenido de la fila'::text;
      RETURN;
    END IF;
    anterior := r.hash_entrada_actual;
  END LOOP;

  RETURN QUERY SELECT true, n, NULL::bigint, NULL::text;
END $$;

-- ── 4. Inmutabilidad ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION bloquear_modificacion_auditoria()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es de solo insercion: % no esta permitido', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;

DROP TRIGGER IF EXISTS trg_auditoria_evento_inmutable ON auditoria_evento;
CREATE TRIGGER trg_auditoria_evento_inmutable
  BEFORE UPDATE OR DELETE ON auditoria_evento
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria_evento_no_truncate ON auditoria_evento;
CREATE TRIGGER trg_auditoria_evento_no_truncate
  BEFORE TRUNCATE ON auditoria_evento
  FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_auditoria();

DROP TRIGGER IF EXISTS trg_ficha_cambio_inmutable ON ficha_cambio;
CREATE TRIGGER trg_ficha_cambio_inmutable
  BEFORE UPDATE OR DELETE ON ficha_cambio
  FOR EACH ROW EXECUTE FUNCTION bloquear_modificacion_auditoria();

DROP TRIGGER IF EXISTS trg_ficha_cambio_no_truncate ON ficha_cambio;
CREATE TRIGGER trg_ficha_cambio_no_truncate
  BEFORE TRUNCATE ON ficha_cambio
  FOR EACH STATEMENT EXECUTE FUNCTION bloquear_modificacion_auditoria();

-- ── 5. Indices de consulta ───────────────────────────────────

CREATE INDEX IF NOT EXISTS ix_auditoria_entidad_fecha ON auditoria_evento (entidad_tipo, entidad_id, fecha_hora);
CREATE INDEX IF NOT EXISTS ix_auditoria_actor_fecha ON auditoria_evento (actor_sub, fecha_hora);
CREATE INDEX IF NOT EXISTS ix_auditoria_tipo_fecha ON auditoria_evento (tipo_evento, fecha_hora);
CREATE INDEX IF NOT EXISTS brin_auditoria_fecha ON auditoria_evento USING brin (fecha_hora);
CREATE INDEX IF NOT EXISTS ix_ficha_cambio_ficha_fecha ON ficha_cambio (ficha_id, fecha_hora);

-- ── 6. Rol de la aplicacion ──────────────────────────────────
-- Se crea sin login. El entrypoint de migrate le asigna LOGIN y contrasena
-- cuando recibe APP_DB_PASSWORD, para no dejar la contrasena en este archivo.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'congenia_app') THEN
    CREATE ROLE congenia_app NOLOGIN;
  END IF;
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO congenia_app', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO congenia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO congenia_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO congenia_app;

REVOKE UPDATE, DELETE, TRUNCATE ON auditoria_evento, ficha_cambio FROM congenia_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON schema_migrations, tipo_evento_catalogo FROM congenia_app;

-- Tablas de migraciones futuras creadas por el propietario.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO congenia_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO congenia_app;

INSERT INTO schema_migrations (version)
VALUES ('06_audit_trail.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
