-- Reporting agent audit catalog refresh.
-- Keep this incremental so databases that already applied 09_reporting_agent.sql
-- still receive the non-Text-to-SQL wording used by the current tool-calling agent.

INSERT INTO tipo_evento_catalogo (codigo, categoria, descripcion) VALUES
  ('AGENT_QUERY_EXECUTED', 'CONSULTA', 'Consulta agregada de reportería ejecutada por el agente'),
  ('AGENT_QUERY_FAILED', 'CONSULTA', 'Consulta agregada de reportería fallida o bloqueada')
ON CONFLICT (codigo) DO UPDATE SET
  categoria = EXCLUDED.categoria,
  descripcion = EXCLUDED.descripcion;

CREATE OR REPLACE VIEW vw_congenia_fichas_anon AS
SELECT
  f.ficha_id,
  f.fecha_consulta,
  f.id_tenant,
  sc.codigo AS sexo,
  NULL::integer AS edad_anios,
  f.diagnosticos_ext_texto AS diagnostico,
  u.especialidad
FROM ficha_clinica f
LEFT JOIN datos_adicionales_ficha da ON da.ficha_id = f.ficha_id
LEFT JOIN sexo_catalogo sc ON sc.sexo_id = da.sexo_id
LEFT JOIN usuario u ON u.usuario_id = f.medico_id
WHERE f.es_vigente IS DISTINCT FROM false;

INSERT INTO schema_migrations (version)
VALUES ('11_reporting_agent_audit.sql')
ON CONFLICT (version) DO NOTHING;
