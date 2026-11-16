-- CONGENIA - CIE-10 dashboard queue, monthly AI runs and reviewer decisions

CREATE TABLE IF NOT EXISTS cie10_catalogo (
  codigo_interno varchar PRIMARY KEY,
  codigo varchar(8) NOT NULL UNIQUE,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  importado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cie10_run (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estado varchar(20) NOT NULL DEFAULT 'RUNNING'
    CHECK (estado IN ('RUNNING', 'COMPLETED', 'FAILED')),
  source_catalog_uri text NOT NULL,
  source_translator_uri text NOT NULL,
  model varchar(100) NOT NULL,
  prompt_version varchar(50) NOT NULL,
  max_records integer,
  processed_count integer NOT NULL DEFAULT 0,
  suggestion_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS cie10_sugerencia (
  codigo_traductor varchar PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES cie10_run (run_id) DEFERRABLE INITIALLY IMMEDIATE,
  diagnostico text NOT NULL,
  cie10_original varchar,
  ai_status varchar(40) NOT NULL DEFAULT 'suggestions'
    CHECK (ai_status IN ('suggestions', 'insufficient_information', 'error')),
  sugerencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  razonamiento_clinico text,
  error text,
  modelo varchar(100) NOT NULL,
  procesado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_cie10_sugerencia_orden
  ON cie10_sugerencia (procesado_en, codigo_traductor);

CREATE TABLE IF NOT EXISTS cie10_decision (
  codigo_traductor varchar PRIMARY KEY REFERENCES cie10_sugerencia (codigo_traductor)
    DEFERRABLE INITIALLY IMMEDIATE,
  decision varchar(10) NOT NULL CHECK (decision IN ('ACEPTADA', 'RECHAZADA')),
  codigo_final varchar(8) NOT NULL,
  codigo_interno_catalogo varchar REFERENCES cie10_catalogo (codigo_interno)
    DEFERRABLE INITIALLY IMMEDIATE,
  comentario varchar(300),
  posicion smallint,
  sugerencias_mostradas smallint NOT NULL,
  revisor_id varchar NOT NULL,
  revisor_nombre varchar(200) NOT NULL,
  decidido_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_cie10_decision_revisor_fecha
  ON cie10_decision (revisor_id, decidido_en DESC);

CREATE TABLE IF NOT EXISTS cie10_decision_historial (
  historial_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_traductor varchar NOT NULL,
  accion varchar(20) NOT NULL CHECK (accion IN ('CREATED', 'UPDATED')),
  decision_anterior jsonb,
  decision_nueva jsonb NOT NULL,
  revisor_id varchar NOT NULL,
  fecha_evento timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_cie10_decision_historial_item
  ON cie10_decision_historial (codigo_traductor, fecha_evento DESC);

INSERT INTO tipo_evento_catalogo (codigo, categoria, descripcion) VALUES
  ('CIE10_DECISION_REGISTRADA', 'VALIDACION', 'Primera decision de correccion CIE-10'),
  ('CIE10_DECISION_CORREGIDA', 'VALIDACION', 'Correccion de una decision CIE-10 existente'),
  ('CIE10_DECISION_FALLIDA', 'VALIDACION', 'Intento fallido de decision o correccion CIE-10')
ON CONFLICT (codigo) DO UPDATE SET
  categoria = EXCLUDED.categoria,
  descripcion = EXCLUDED.descripcion;

GRANT SELECT, INSERT, UPDATE ON cie10_catalogo, cie10_run, cie10_sugerencia, cie10_decision, cie10_decision_historial TO congenia_app;

INSERT INTO schema_migrations (version)
VALUES ('08_cie10_dashboard.sql')
ON CONFLICT (version) DO NOTHING;
