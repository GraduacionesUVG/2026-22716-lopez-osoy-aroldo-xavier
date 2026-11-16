-- CONGENIA - patient sex catalog and encrypted ficha observations

CREATE TABLE IF NOT EXISTS sexo_catalogo (
  sexo_id smallint PRIMARY KEY,
  codigo varchar(1) NOT NULL UNIQUE,
  nombre varchar(50) NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  orden smallint NOT NULL
);

INSERT INTO sexo_catalogo (sexo_id, codigo, nombre, activo, orden) VALUES
  (1, 'M', 'Masculino', true, 1),
  (2, 'F', 'Femenino', true, 2),
  (3, 'I', 'Indeterminado', true, 3)
ON CONFLICT (sexo_id) DO UPDATE SET
  codigo = EXCLUDED.codigo,
  nombre = EXCLUDED.nombre,
  activo = EXCLUDED.activo,
  orden = EXCLUDED.orden;

ALTER TABLE datos_adicionales_ficha
  ADD COLUMN IF NOT EXISTS sexo_id smallint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_datos_adicionales_sexo'
      AND conrelid = 'datos_adicionales_ficha'::regclass
  ) THEN
    ALTER TABLE datos_adicionales_ficha
      ADD CONSTRAINT fk_datos_adicionales_sexo
      FOREIGN KEY (sexo_id) REFERENCES sexo_catalogo (sexo_id)
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS observacion_ficha (
  observacion_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_id uuid NOT NULL,
  texto_enc bytea NOT NULL,
  texto_dek_enc bytea NOT NULL,
  agregada_en_revision boolean NOT NULL DEFAULT false,
  fecha_creacion timestamptz NOT NULL DEFAULT now(),
  usuario_id uuid NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_observacion_ficha'
      AND conrelid = 'observacion_ficha'::regclass
  ) THEN
    ALTER TABLE observacion_ficha
      ADD CONSTRAINT fk_observacion_ficha
      FOREIGN KEY (ficha_id) REFERENCES ficha_clinica (ficha_id)
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_observacion_usuario'
      AND conrelid = 'observacion_ficha'::regclass
  ) THEN
    ALTER TABLE observacion_ficha
      ADD CONSTRAINT fk_observacion_usuario
      FOREIGN KEY (usuario_id) REFERENCES usuario (usuario_id)
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_observacion_ficha_fecha
  ON observacion_ficha (ficha_id, fecha_creacion, observacion_id);

INSERT INTO tipo_evento_catalogo (codigo, categoria, descripcion) VALUES
  ('OBSERVACION_VALIDADA', 'VALIDACION', 'Decision del revisor sobre una observacion de una adenda')
ON CONFLICT (codigo) DO UPDATE SET
  categoria = EXCLUDED.categoria,
  descripcion = EXCLUDED.descripcion;

INSERT INTO schema_migrations (version)
VALUES ('07_patient_sex_observations.sql')
ON CONFLICT (version) DO NOTHING;
