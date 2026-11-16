-- Versioned RAG corpus and low-friction CIE-10 batch review.

CREATE TABLE IF NOT EXISTS cie10_rag_version (
  rag_version varchar(80) PRIMARY KEY,
  estado varchar(20) NOT NULL DEFAULT 'BUILDING'
    CHECK (estado IN ('BUILDING', 'READY', 'ACTIVE', 'FAILED', 'ARCHIVED')),
  institutional_sha256 char(64) NOT NULL,
  reference_sha256 char(64),
  reference_commit varchar(64),
  embedding_model varchar(100) NOT NULL,
  embedding_dimensions integer NOT NULL CHECK (embedding_dimensions BETWEEN 1 AND 4096),
  vector_count integer NOT NULL DEFAULT 0,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_cie10_rag_active
  ON cie10_rag_version ((estado)) WHERE estado = 'ACTIVE';

CREATE TABLE IF NOT EXISTS cie10_rag_catalogo (
  rag_version varchar(80) NOT NULL REFERENCES cie10_rag_version (rag_version) ON DELETE CASCADE,
  codigo varchar(8) NOT NULL,
  descripcion text NOT NULL,
  codigo_interno varchar,
  en_catalogo_institucional boolean NOT NULL,
  en_referencia_externa boolean NOT NULL,
  PRIMARY KEY (rag_version, codigo)
);

CREATE INDEX IF NOT EXISTS ix_cie10_rag_catalogo_codigo
  ON cie10_rag_catalogo (codigo);

ALTER TABLE cie10_run
  ADD COLUMN IF NOT EXISTS rag_version varchar(80) REFERENCES cie10_rag_version (rag_version);

ALTER TABLE cie10_sugerencia
  ADD COLUMN IF NOT EXISTS rag_version varchar(80) REFERENCES cie10_rag_version (rag_version);

ALTER TABLE cie10_sugerencia
  ADD COLUMN IF NOT EXISTS input_sha256 char(64);

CREATE TABLE IF NOT EXISTS cie10_clausula (
  version varchar(40) PRIMARY KEY,
  texto text NOT NULL,
  activa boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_cie10_clausula_activa
  ON cie10_clausula ((activa)) WHERE activa = true;

INSERT INTO cie10_clausula (version, texto, activa)
VALUES (
  'CIE10-AI-REVIEW-V1',
  'Reconozco que los códigos CIE-10 fueron generados con apoyo de inteligencia artificial, que pueden contener errores y que debo revisar el lote antes de confirmarlo. La confirmación registra mi criterio profesional y no sustituye los controles ni las responsabilidades institucionales aplicables.',
  true
)
ON CONFLICT (version) DO UPDATE SET texto = EXCLUDED.texto;

CREATE TABLE IF NOT EXISTS cie10_revision_item (
  run_id uuid NOT NULL REFERENCES cie10_run (run_id),
  codigo_traductor varchar NOT NULL REFERENCES cie10_sugerencia (codigo_traductor),
  codigo_final varchar(8) NOT NULL,
  comentario varchar(300),
  corregido boolean NOT NULL DEFAULT false,
  revisor_id varchar NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, codigo_traductor)
);

CREATE TABLE IF NOT EXISTS cie10_lote_confirmacion (
  run_id uuid PRIMARY KEY REFERENCES cie10_run (run_id),
  clausula_version varchar(40) NOT NULL REFERENCES cie10_clausula (version),
  aceptada_por varchar NOT NULL,
  aceptada_en timestamptz NOT NULL DEFAULT now(),
  confirmada_por varchar,
  confirmada_en timestamptz,
  total_registros integer,
  csv_object_key text,
  csv_sha256 char(64)
);

INSERT INTO tipo_evento_catalogo (codigo, categoria, descripcion) VALUES
  ('CIE10_CLAUSULA_ACEPTADA', 'VALIDACION', 'Aceptacion de clausula para revision CIE-10 asistida por IA'),
  ('CIE10_LOTE_CONFIRMADO', 'VALIDACION', 'Confirmacion masiva de un lote CIE-10 revisado'),
  ('CIE10_BORRADOR_CORREGIDO', 'VALIDACION', 'Correccion preliminar de un registro del lote CIE-10'),
  ('CIE10_LOTE_CONFIRMACION_FALLIDA', 'VALIDACION', 'Intento fallido de confirmacion masiva CIE-10')
ON CONFLICT (codigo) DO UPDATE SET
  categoria = EXCLUDED.categoria,
  descripcion = EXCLUDED.descripcion;

GRANT SELECT, INSERT, UPDATE ON
  cie10_rag_version, cie10_rag_catalogo, cie10_clausula,
  cie10_revision_item, cie10_lote_confirmacion
TO congenia_app;

GRANT DELETE ON cie10_rag_catalogo TO congenia_app;

INSERT INTO schema_migrations (version)
VALUES ('14_cie10_rag_autocoding.sql')
ON CONFLICT (version) DO NOTHING;
