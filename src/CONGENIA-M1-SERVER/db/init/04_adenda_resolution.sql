-- =============================================================
-- CONGENIA — Adenda resolution metadata and institution catalog
-- Idempotent incremental migration. Do not fold into older files.
-- =============================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  version varchar(200) PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ficha_clinica
  ADD COLUMN IF NOT EXISTS estado_revision varchar(16),
  ADD COLUMN IF NOT EXISTS fecha_resolucion timestamptz,
  ADD COLUMN IF NOT EXISTS resuelta_por uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_ficha_estado_revision'
      AND conrelid = 'ficha_clinica'::regclass
  ) THEN
    ALTER TABLE ficha_clinica
      ADD CONSTRAINT ck_ficha_estado_revision
      CHECK (estado_revision IS NULL OR estado_revision IN ('PENDIENTE', 'APROBADA', 'RECHAZADA'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_ficha_resuelta_por'
      AND conrelid = 'ficha_clinica'::regclass
  ) THEN
    ALTER TABLE ficha_clinica
      ADD CONSTRAINT fk_ficha_resuelta_por
      FOREIGN KEY (resuelta_por) REFERENCES usuario (usuario_id)
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

UPDATE ficha_clinica
SET estado_revision = CASE
  WHEN COALESCE(version_ficha, 1) <= 1 THEN NULL
  WHEN estado_ficha = 'PENDIENTE' THEN 'PENDIENTE'
  WHEN estado_ficha IN ('VALIDADA', 'COMPLETA') THEN 'APROBADA'
  WHEN estado_ficha = 'ARCHIVADA' THEN 'RECHAZADA'
  ELSE estado_revision
END
WHERE estado_revision IS NULL;

UPDATE ficha_clinica
SET fecha_resolucion = COALESCE(fecha_resolucion, fecha_modificacion, fecha_creacion)
WHERE estado_revision IN ('APROBADA', 'RECHAZADA')
  AND fecha_resolucion IS NULL;

CREATE TABLE IF NOT EXISTS institucion_tenant (
  id_tenant integer PRIMARY KEY,
  nombre varchar(160) NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  fecha_creacion timestamptz NOT NULL DEFAULT now(),
  fecha_modificacion timestamptz NOT NULL DEFAULT now()
);

INSERT INTO institucion_tenant (id_tenant, nombre, activo)
VALUES
  (23, 'PruebaInstitucion', true),
  (254, 'SADC', true)
ON CONFLICT (id_tenant) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  activo = true,
  fecha_modificacion = now();

CREATE INDEX IF NOT EXISTS ix_ficha_adendas_tenant_estado_fecha
  ON ficha_clinica (id_tenant, estado_revision, fecha_creacion DESC)
  WHERE estado_revision IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_ficha_raiz_version
  ON ficha_clinica (ficha_raiz_id, version_ficha DESC);

INSERT INTO schema_migrations (version)
VALUES ('04_adenda_resolution.sql')
ON CONFLICT (version) DO NOTHING;
