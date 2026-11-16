-- Allow medical corrections when the AI abstained and displayed no suggestions.

ALTER TABLE cie10_revision_item
  DROP CONSTRAINT IF EXISTS cie10_revision_item_aceptado_chk,
  DROP CONSTRAINT IF EXISTS cie10_revision_item_mostradas_chk,
  DROP CONSTRAINT IF EXISTS cie10_revision_item_selection_chk;

ALTER TABLE cie10_revision_item
  ADD CONSTRAINT cie10_revision_item_selection_chk
  CHECK (
    (
      corregido = true
      AND posicion IS NULL
      AND (sugerencias_mostradas IS NULL OR sugerencias_mostradas BETWEEN 0 AND 5)
    )
    OR
    (
      corregido = false
      AND posicion BETWEEN 1 AND 5
      AND sugerencias_mostradas BETWEEN posicion AND 5
    )
  );

INSERT INTO schema_migrations (version)
VALUES ('18_cie10_empty_suggestion_correction.sql')
ON CONFLICT (version) DO NOTHING;
