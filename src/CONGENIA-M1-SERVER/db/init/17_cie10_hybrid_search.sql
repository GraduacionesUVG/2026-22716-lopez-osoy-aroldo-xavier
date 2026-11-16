-- Add the normalized corpus used by CIE-10 hybrid lexical retrieval.

ALTER TABLE cie10_rag_catalogo
  ADD COLUMN IF NOT EXISTS texto_busqueda_normalizado text;

UPDATE cie10_rag_catalogo
   SET texto_busqueda_normalizado = descripcion_normalizada
 WHERE texto_busqueda_normalizado IS NULL;

INSERT INTO schema_migrations (version)
VALUES ('17_cie10_hybrid_search.sql')
ON CONFLICT (version) DO NOTHING;
