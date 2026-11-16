-- =============================================================
-- CONGENIA — Incremental contracts for dashboard search/adendas
-- Idempotent by design: safe on fresh and existing databases.
-- =============================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  version varchar(200) PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);


-- api_key_hash placeholder: congenia-web autentica con OAuth2/Keycloak.
-- La columna es NOT NULL por compatibilidad con el esquema heredado.
INSERT INTO sistema_externo (
  system_id, nombre, api_key_hash, auth_method, oauth_client_id,
  oauth_issuer, oauth_audience, activo_oauth, activo
)
VALUES (
  'congenia-web',
  'CONGENIA — Aplicacion web',
  'fa0e5c989f0e417c02fa495aef6dcddfce6a966d15285101c639998d464a358a',
  'OAUTH2',
  'congenia-web',
  'http://keycloak:8080/realms/congenia',
  'congenia-api',
  true,
  true
) ON CONFLICT (system_id) DO UPDATE SET
  oauth_client_id = EXCLUDED.oauth_client_id,
  oauth_audience = EXCLUDED.oauth_audience,
  activo_oauth = true,
  activo = true;

ALTER TABLE ficha_clinica
  ADD COLUMN IF NOT EXISTS historia_clinica varchar(64),
  ADD COLUMN IF NOT EXISTS id_tenant integer,
  ADD COLUMN IF NOT EXISTS ficha_raiz_id uuid,
  ADD COLUMN IF NOT EXISTS es_vigente boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS motivo_solicitud varchar(500),
  ADD COLUMN IF NOT EXISTS motivo_rechazo varchar(500);

UPDATE ficha_clinica f
SET historia_clinica = COALESCE(NULLIF(f.historia_clinica, ''), p.paciente_ext_id, f.paciente_id::text)
FROM paciente p
WHERE p.paciente_id = f.paciente_id
  AND (f.historia_clinica IS NULL OR f.historia_clinica = '');

UPDATE ficha_clinica
SET id_tenant = COALESCE(id_tenant, NULLIF(current_setting('app.default_tenant_id', true), '')::int, 23)
WHERE id_tenant IS NULL;

UPDATE ficha_clinica
SET ficha_raiz_id = COALESCE(ficha_raiz_id, ficha_id)
WHERE ficha_raiz_id IS NULL;

ALTER TABLE ficha_clinica
  ALTER COLUMN historia_clinica SET NOT NULL,
  ALTER COLUMN id_tenant SET NOT NULL,
  ALTER COLUMN ficha_raiz_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_ficha_raiz'
      AND conrelid = 'ficha_clinica'::regclass
  ) THEN
    ALTER TABLE ficha_clinica
      ADD CONSTRAINT fk_ficha_raiz
      FOREIGN KEY (ficha_raiz_id) REFERENCES ficha_clinica (ficha_id)
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

ALTER TABLE signo_alerta_ficha
  ADD COLUMN IF NOT EXISTS added_in_revision boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS replaces_signo_id uuid;

ALTER TABLE examen_ficha
  ADD COLUMN IF NOT EXISTS added_in_revision boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS replaces_examen_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_signo_replaces'
      AND conrelid = 'signo_alerta_ficha'::regclass
  ) THEN
    ALTER TABLE signo_alerta_ficha
      ADD CONSTRAINT fk_signo_replaces
      FOREIGN KEY (replaces_signo_id) REFERENCES signo_alerta_ficha (signo_id)
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_examen_replaces'
      AND conrelid = 'examen_ficha'::regclass
  ) THEN
    ALTER TABLE examen_ficha
      ADD CONSTRAINT fk_examen_replaces
      FOREIGN KEY (replaces_examen_id) REFERENCES examen_ficha (examen_ficha_id)
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS paciente_nombre_token (
  paciente_id uuid NOT NULL REFERENCES paciente (paciente_id) ON DELETE CASCADE,
  token_hmac bytea NOT NULL,
  PRIMARY KEY (paciente_id, token_hmac)
);

CREATE INDEX IF NOT EXISTS ix_paciente_nombre_token_hmac
  ON paciente_nombre_token (token_hmac);

CREATE INDEX IF NOT EXISTS ix_ficha_tenant_fecha
  ON ficha_clinica (id_tenant, fecha_consulta DESC);

CREATE INDEX IF NOT EXISTS ix_ficha_tenant_historia
  ON ficha_clinica (id_tenant, historia_clinica);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ficha_raiz_vigente
  ON ficha_clinica (ficha_raiz_id)
  WHERE es_vigente;

INSERT INTO schema_migrations (version)
VALUES ('03_ficha_contracts.sql')
ON CONFLICT (version) DO NOTHING;
