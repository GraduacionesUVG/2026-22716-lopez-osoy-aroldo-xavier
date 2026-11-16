-- =============================================================
-- CONGENIA — La firma del consentimiento sale de la base
--
-- La imagen PNG de la firma viajaba dentro de firma_evidencia_tecnica
-- (clave firmaBase64) y quedaba en texto plano en la tabla, sus backups y
-- replicas. Desde esta migracion vive en S3: la fila guarda solo
-- firma_png_ref y firma_png_hash_sha256, y el worker del PDF verifica ese
-- hash antes de dibujarla.
--
-- El CHECK entra NOT VALID: no rechaza filas nuevas con la imagen, pero deja
-- pasar las historicas hasta que scripts/backfill_consent_signature_png.js
-- las migre y valide la restriccion.
--
-- Idempotente: segura sobre bases nuevas y existentes.
-- =============================================================

BEGIN;

ALTER TABLE consentimiento
  ADD COLUMN IF NOT EXISTS firma_png_ref varchar(500),
  ADD COLUMN IF NOT EXISTS firma_png_hash_sha256 char(64),
  ADD COLUMN IF NOT EXISTS json_hash_sha256 char(64);

COMMENT ON COLUMN consentimiento.firma_evidencia_tecnica IS
  'Metadatos de la captura (timestamp, userAgent, canvasHash, version legal) y declaraciones aceptadas. Nunca la imagen ni el trazo de la firma.';
COMMENT ON COLUMN consentimiento.json_hash_sha256 IS
  'SHA-256 de firma_evidencia_tecnica serializada como JSON canonico (claves ordenadas, sin espacios).';
COMMENT ON COLUMN consentimiento.firma_png_ref IS
  'Clave S3 del PNG de la firma, en el bucket de documentos.';
COMMENT ON COLUMN consentimiento.firma_png_hash_sha256 IS
  'SHA-256 de los bytes del PNG de la firma. El worker lo verifica antes de generar el PDF.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_evidencia_sin_png'
      AND conrelid = 'consentimiento'::regclass
  ) THEN
    ALTER TABLE consentimiento
      ADD CONSTRAINT chk_evidencia_sin_png
      CHECK (NOT (firma_evidencia_tecnica ? 'firmaBase64')) NOT VALID;
  END IF;
END $$;

INSERT INTO tipo_evento_catalogo (codigo, categoria, descripcion) VALUES
  ('FIRMA_EVIDENCIA_MIGRADA', 'ARCHIVO', 'Firma de un consentimiento historico movida de la base a S3')
ON CONFLICT (codigo) DO UPDATE SET
  categoria = EXCLUDED.categoria,
  descripcion = EXCLUDED.descripcion;

INSERT INTO schema_migrations (version)
VALUES ('12_firma_png_s3.sql')
ON CONFLICT (version) DO NOTHING;

COMMIT;
