-- =============================================================
-- CONGENIA — Bitacora de la consulta de pacientes en SADC
--
-- La busqueda de la ficha pasa por la API (GET /api/v1/sadc/pacientes) y deja
-- un evento propio. Solo agrega un codigo al catalogo: no cambia tablas.
-- Idempotente.
-- =============================================================

BEGIN;

INSERT INTO tipo_evento_catalogo (codigo, categoria, descripcion) VALUES
  ('SADC_PACIENTE_CONSULTADO', 'CONSULTA', 'Consulta de un paciente en SADC hecha por la API para la ficha')
ON CONFLICT (codigo) DO UPDATE SET
  categoria = EXCLUDED.categoria,
  descripcion = EXCLUDED.descripcion;

INSERT INTO schema_migrations (version)
VALUES ('19_sadc_lookup_audit.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
