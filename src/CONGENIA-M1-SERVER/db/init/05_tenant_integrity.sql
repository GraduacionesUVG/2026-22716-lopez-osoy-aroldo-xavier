-- Tenant access is issued by Keycloak; this catalog remains the authoritative
-- registry for institution labels and referential integrity.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_ficha_institucion_tenant'
      AND conrelid = 'ficha_clinica'::regclass
  ) THEN
    ALTER TABLE ficha_clinica
      ADD CONSTRAINT fk_ficha_institucion_tenant
      FOREIGN KEY (id_tenant) REFERENCES institucion_tenant (id_tenant)
      DEFERRABLE INITIALLY IMMEDIATE
      NOT VALID;
  END IF;
END $$;

ALTER TABLE ficha_clinica
  VALIDATE CONSTRAINT fk_ficha_institucion_tenant;

INSERT INTO schema_migrations (version)
VALUES ('05_tenant_integrity.sql')
ON CONFLICT (version) DO NOTHING;
