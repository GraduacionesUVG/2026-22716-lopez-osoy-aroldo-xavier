-- Monthly CIE-10 batch review and hierarchical RAG catalog.

ALTER TABLE cie10_run
  ADD COLUMN IF NOT EXISTS periodo char(7);

UPDATE cie10_run
   SET periodo = to_char(
     (COALESCE(finished_at, started_at) AT TIME ZONE 'America/Guatemala') - interval '1 month',
     'YYYY-MM'
   )
 WHERE periodo IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cie10_run_periodo_chk'
  ) THEN
    ALTER TABLE cie10_run
      ADD CONSTRAINT cie10_run_periodo_chk
      CHECK (periodo IS NULL OR periodo ~ '^\d{4}-(0[1-9]|1[0-2])$');
  END IF;
END $$;

ALTER TABLE cie10_revision_item
  ADD COLUMN IF NOT EXISTS posicion smallint,
  ADD COLUMN IF NOT EXISTS sugerencias_mostradas smallint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cie10_revision_item_aceptado_chk'
  ) THEN
    ALTER TABLE cie10_revision_item
      ADD CONSTRAINT cie10_revision_item_aceptado_chk
      CHECK (corregido OR posicion IS NOT NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cie10_revision_item_mostradas_chk'
  ) THEN
    ALTER TABLE cie10_revision_item
      ADD CONSTRAINT cie10_revision_item_mostradas_chk
      CHECK (sugerencias_mostradas IS NULL OR sugerencias_mostradas BETWEEN 1 AND 5);
  END IF;
END $$;

ALTER TABLE cie10_rag_catalogo
  ADD COLUMN IF NOT EXISTS descripcion_normalizada text,
  ADD COLUMN IF NOT EXISTS nivel smallint,
  ADD COLUMN IF NOT EXISTS parent_codigo varchar(8),
  ADD COLUMN IF NOT EXISTS ancestros jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source varchar(120);

UPDATE cie10_rag_catalogo
   SET descripcion_normalizada = lower(descripcion)
 WHERE descripcion_normalizada IS NULL;

CREATE INDEX IF NOT EXISTS ix_cie10_run_periodo_estado
  ON cie10_run (periodo DESC, estado, finished_at DESC);

CREATE INDEX IF NOT EXISTS ix_cie10_revision_item_run
  ON cie10_revision_item (run_id, codigo_traductor);

CREATE INDEX IF NOT EXISTS ix_cie10_rag_catalogo_descripcion
  ON cie10_rag_catalogo (rag_version, descripcion_normalizada);

CREATE INDEX IF NOT EXISTS ix_cie10_rag_catalogo_parent
  ON cie10_rag_catalogo (rag_version, parent_codigo);

INSERT INTO tipo_evento_catalogo (codigo, categoria, descripcion) VALUES
  ('CIE10_BORRADOR_ACEPTADO', 'VALIDACION', 'Aceptacion preliminar de una sugerencia del lote CIE-10')
ON CONFLICT (codigo) DO UPDATE SET
  categoria = EXCLUDED.categoria,
  descripcion = EXCLUDED.descripcion;

INSERT INTO schema_migrations (version)
VALUES ('16_cie10_batch_review.sql')
ON CONFLICT (version) DO NOTHING;
