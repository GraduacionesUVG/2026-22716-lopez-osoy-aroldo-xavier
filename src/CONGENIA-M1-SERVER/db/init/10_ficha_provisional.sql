-- CONGENIA - Fichas provisionales: pacientes cuya historia clinica no existe en SADC.
--
-- Una ficha provisional es una ficha_clinica normal (mismas tablas hijas,
-- catalogos, consentimiento y adendas) cuya historia_clinica es
-- 'TMP-<id_tenant>-<HC buscada>'. Esta tabla guarda solo lo que la distingue:
-- la HC que no se encontro y el estado de su consolidacion con SADC.
--
-- Hay una fila por ficha raiz, asi cubre todas las versiones de la ficha.
-- La consolidacion es una adenda: la version nueva lleva la HC real y, al
-- aprobarla un revisor, pasa a ser la vigente. La fila de aqui no se borra.
--
-- psql corre este archivo sin --single-transaction, por eso va entre BEGIN y
-- COMMIT: si algo falla no queda aplicado a medias.

BEGIN;

-- ── 1. Precondicion ──────────────────────────────────────────
-- El indice ux_ficha_vigente_por_hc (seccion 5) no se puede crear si ya hay
-- duplicados. Se detiene aqui con un mensaje claro.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM ficha_clinica
    WHERE es_vigente
    GROUP BY id_tenant, historia_clinica
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Hay historias clinicas con mas de una ficha vigente en el mismo tenant. Resolverlas antes de aplicar 10_ficha_provisional.sql';
  END IF;
END $$;

-- ── 2. Tabla ─────────────────────────────────────────────────
-- La HC buscada admite 48 caracteres para que 'TMP-' + tenant + '-' + HC
-- quepa en ficha_clinica.historia_clinica (varchar(64)).

CREATE TABLE IF NOT EXISTS ficha_provisional (
  ficha_raiz_id uuid PRIMARY KEY
    REFERENCES ficha_clinica (ficha_id) DEFERRABLE INITIALLY IMMEDIATE,
  id_tenant integer NOT NULL
    REFERENCES institucion_tenant (id_tenant) DEFERRABLE INITIALLY IMMEDIATE,
  historia_clinica_referida varchar(48) NOT NULL,
  historia_clinica_provisional varchar(64) NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'PENDIENTE',
  creado_por uuid NOT NULL
    REFERENCES usuario (usuario_id) DEFERRABLE INITIALLY IMMEDIATE,
  fecha_creacion timestamptz NOT NULL DEFAULT now(),
  intentos_consolidacion smallint NOT NULL DEFAULT 0,
  ultimo_intento timestamptz,
  ficha_consolidada_id uuid
    REFERENCES ficha_clinica (ficha_id) DEFERRABLE INITIALLY IMMEDIATE,
  historia_clinica_real varchar(64),
  resuelto_por uuid
    REFERENCES usuario (usuario_id) DEFERRABLE INITIALLY IMMEDIATE,
  fecha_resolucion timestamptz,

  CONSTRAINT ck_ficha_provisional_estado
    CHECK (estado IN ('PENDIENTE', 'EN_REVISION', 'CONSOLIDADA', 'DESCARTADA')),
  CONSTRAINT ck_ficha_provisional_referida
    CHECK (historia_clinica_referida ~ '^[A-Za-z0-9-]+$'
           AND upper(historia_clinica_referida) NOT LIKE 'TMP-%'),
  CONSTRAINT ck_ficha_provisional_formato
    CHECK (historia_clinica_provisional = 'TMP-' || id_tenant || '-' || historia_clinica_referida),
  CONSTRAINT ck_ficha_provisional_real
    CHECK (historia_clinica_real IS NULL OR upper(historia_clinica_real) NOT LIKE 'TMP-%'),
  CONSTRAINT ck_ficha_provisional_intentos
    CHECK (intentos_consolidacion >= 0),
  -- EN_REVISION y CONSOLIDADA necesitan la adenda de consolidacion y la HC real.
  CONSTRAINT ck_ficha_provisional_adenda
    CHECK (estado NOT IN ('EN_REVISION', 'CONSOLIDADA')
           OR (ficha_consolidada_id IS NOT NULL AND historia_clinica_real IS NOT NULL)),
  -- Solo los estados finales llevan quien y cuando los resolvio.
  CONSTRAINT ck_ficha_provisional_resolucion
    CHECK ((estado IN ('CONSOLIDADA', 'DESCARTADA'))
           = (resuelto_por IS NOT NULL AND fecha_resolucion IS NOT NULL))
);

COMMENT ON TABLE ficha_provisional IS 'Ficha raiz registrada con historia clinica provisional (TMP-) porque la HC no existe en SADC. Una fila por ficha raiz.';
COMMENT ON COLUMN ficha_provisional.ficha_raiz_id IS 'Ficha raiz provisional. Cubre todas sus versiones y adendas.';
COMMENT ON COLUMN ficha_provisional.id_tenant IS 'Institucion. Igual al id_tenant de la ficha raiz (lo valida el trigger).';
COMMENT ON COLUMN ficha_provisional.historia_clinica_referida IS 'HC que escribio el medico y no existio en SADC. El batch de consolidacion la vuelve a buscar.';
COMMENT ON COLUMN ficha_provisional.historia_clinica_provisional IS 'TMP-<id_tenant>-<historia_clinica_referida>. Igual a ficha_clinica.historia_clinica de la raiz.';
COMMENT ON COLUMN ficha_provisional.estado IS 'PENDIENTE | EN_REVISION (adenda de consolidacion creada) | CONSOLIDADA | DESCARTADA';
COMMENT ON COLUMN ficha_provisional.creado_por IS 'Medico que registro la ficha provisional';
COMMENT ON COLUMN ficha_provisional.intentos_consolidacion IS 'Veces que el batch consulto SADC sin encontrar la HC';
COMMENT ON COLUMN ficha_provisional.ultimo_intento IS 'Ultima consulta del batch a SADC';
COMMENT ON COLUMN ficha_provisional.ficha_consolidada_id IS 'Version (adenda) de la misma ficha raiz que lleva la HC real';
COMMENT ON COLUMN ficha_provisional.historia_clinica_real IS 'HC encontrada en SADC al consolidar';
COMMENT ON COLUMN ficha_provisional.resuelto_por IS 'Revisor que aprobo o descarto la consolidacion';
COMMENT ON COLUMN ficha_provisional.fecha_resolucion IS 'Momento en que la consolidacion se aprobo o se descarto';

-- ── 3. Indices ───────────────────────────────────────────────

-- Cero duplicidad: una misma HC buscada no abre dos provisionales activas.
CREATE UNIQUE INDEX IF NOT EXISTS ux_ficha_provisional_activa_hc
  ON ficha_provisional (id_tenant, historia_clinica_referida)
  WHERE estado IN ('PENDIENTE', 'EN_REVISION');

-- Cola del batch mensual: primero las que nunca se intentaron.
CREATE INDEX IF NOT EXISTS ix_ficha_provisional_cola
  ON ficha_provisional (ultimo_intento NULLS FIRST)
  WHERE estado = 'PENDIENTE';

-- Listado del dashboard por institucion.
CREATE INDEX IF NOT EXISTS ix_ficha_provisional_tenant_estado
  ON ficha_provisional (id_tenant, estado, fecha_creacion DESC);

-- ── 4. Integridad ────────────────────────────────────────────
-- Las reglas que cruzan tablas no caben en un CHECK. El trigger tambien
-- protege contra el propietario, no solo contra congenia_app.

CREATE OR REPLACE FUNCTION ficha_provisional_validar()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ficha_provisional no admite DELETE: usar estado DESCARTADA';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'PENDIENTE' THEN
      RAISE EXCEPTION 'Una ficha provisional nace en estado PENDIENTE';
    END IF;
    -- La fila apunta a una ficha raiz del mismo tenant cuya HC es la provisional.
    IF NOT EXISTS (
      SELECT 1
      FROM ficha_clinica f
      WHERE f.ficha_id = NEW.ficha_raiz_id
        AND f.ficha_raiz_id = f.ficha_id
        AND f.id_tenant = NEW.id_tenant
        AND f.historia_clinica = NEW.historia_clinica_provisional
    ) THEN
      RAISE EXCEPTION 'La ficha % no es una ficha raiz del tenant % con historia clinica %',
        NEW.ficha_raiz_id, NEW.id_tenant, NEW.historia_clinica_provisional;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.estado IN ('CONSOLIDADA', 'DESCARTADA') THEN
    RAISE EXCEPTION 'La ficha provisional % ya esta resuelta (%)', OLD.ficha_raiz_id, OLD.estado;
  END IF;

  IF NEW.ficha_raiz_id IS DISTINCT FROM OLD.ficha_raiz_id
     OR NEW.id_tenant IS DISTINCT FROM OLD.id_tenant
     OR NEW.historia_clinica_referida IS DISTINCT FROM OLD.historia_clinica_referida
     OR NEW.historia_clinica_provisional IS DISTINCT FROM OLD.historia_clinica_provisional
     OR NEW.creado_por IS DISTINCT FROM OLD.creado_por
     OR NEW.fecha_creacion IS DISTINCT FROM OLD.fecha_creacion THEN
    RAISE EXCEPTION 'Los datos de origen de una ficha provisional no se modifican';
  END IF;

  -- La adenda de consolidacion es una version de la misma ficha raiz y lleva la HC real.
  IF NEW.ficha_consolidada_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM ficha_clinica f
    WHERE f.ficha_id = NEW.ficha_consolidada_id
      AND f.ficha_raiz_id = NEW.ficha_raiz_id
      AND f.id_tenant = NEW.id_tenant
      AND f.historia_clinica = NEW.historia_clinica_real
  ) THEN
    RAISE EXCEPTION 'La ficha % no es una version de % con historia clinica %',
      NEW.ficha_consolidada_id, NEW.ficha_raiz_id, NEW.historia_clinica_real;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ficha_provisional_no_truncate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ficha_provisional no admite TRUNCATE';
END;
$$;

DROP TRIGGER IF EXISTS trg_ficha_provisional_validar ON ficha_provisional;
CREATE TRIGGER trg_ficha_provisional_validar
  BEFORE INSERT OR UPDATE OR DELETE ON ficha_provisional
  FOR EACH ROW EXECUTE FUNCTION ficha_provisional_validar();

DROP TRIGGER IF EXISTS trg_ficha_provisional_no_truncate ON ficha_provisional;
CREATE TRIGGER trg_ficha_provisional_no_truncate
  BEFORE TRUNCATE ON ficha_provisional
  FOR EACH STATEMENT EXECUTE FUNCTION ficha_provisional_no_truncate();

-- ── 5. Una ficha vigente por historia clinica ────────────────
-- Hoy solo el frontend evita dos fichas raiz para la misma HC. Esto lo fija
-- en la base para ambos flujos (SADC y provisional) y bloquea consolidar
-- contra una HC real que ya tiene su propia ficha vigente.

CREATE UNIQUE INDEX IF NOT EXISTS ux_ficha_vigente_por_hc
  ON ficha_clinica (id_tenant, historia_clinica)
  WHERE es_vigente;

-- ── 6. Eventos de auditoria ──────────────────────────────────

INSERT INTO tipo_evento_catalogo (codigo, categoria, descripcion) VALUES
  ('FICHA_PROVISIONAL_CREADA', 'MODIFICACION', 'Ficha registrada con historia clinica provisional porque la HC no existe en SADC'),
  ('FICHA_PROVISIONAL_EN_REVISION', 'INTEGRACION', 'La HC buscada aparecio en SADC y se creo la adenda de consolidacion'),
  ('FICHA_PROVISIONAL_CONSOLIDADA', 'VALIDACION', 'Revisor aprobo la consolidacion de la ficha provisional con la HC real'),
  ('FICHA_PROVISIONAL_DESCARTADA', 'VALIDACION', 'Revisor descarto la consolidacion de la ficha provisional'),
  ('CONSOLIDACION_EJECUTADA', 'INTEGRACION', 'Resumen de una corrida del batch de consolidacion de fichas provisionales')
ON CONFLICT (codigo) DO UPDATE SET
  categoria = EXCLUDED.categoria,
  descripcion = EXCLUDED.descripcion;

-- ── 7. Permisos ──────────────────────────────────────────────
-- ALTER DEFAULT PRIVILEGES (06_audit_trail.sql) le da a congenia_app
-- SELECT, INSERT, UPDATE y DELETE en toda tabla nueva. Aqui se reduce a lo
-- que usa: leer, insertar y actualizar solo las columnas de la consolidacion.

REVOKE ALL ON ficha_provisional FROM congenia_app;
GRANT SELECT, INSERT ON ficha_provisional TO congenia_app;
GRANT UPDATE (
  estado,
  intentos_consolidacion,
  ultimo_intento,
  ficha_consolidada_id,
  historia_clinica_real,
  resuelto_por,
  fecha_resolucion
) ON ficha_provisional TO congenia_app;

INSERT INTO schema_migrations (version)
VALUES ('10_ficha_provisional.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
