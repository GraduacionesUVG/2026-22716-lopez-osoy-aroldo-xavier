-- Expand the anonymized CONGENIA reporting view with aggregate-safe context.

CREATE OR REPLACE VIEW vw_congenia_fichas_anon AS
SELECT
  f.ficha_id,
  f.fecha_consulta,
  f.id_tenant,
  sc.codigo AS sexo,
  NULL::integer AS edad_anios,
  f.diagnosticos_ext_texto AS diagnostico,
  u.especialidad,
  f.fecha_creacion,
  f.origen_creacion,
  f.estado_ficha,
  f.version_ficha,
  rd.nombre AS referido_de,
  ap.nombre AS asistencia_parto,
  da.familiares_afectos,
  da.personas_hogar_menores,
  da.personas_hogar_adultos,
  da.comunidad_afectada,
  EXISTS (
    SELECT 1 FROM ficha_provisional fp WHERE fp.ficha_raiz_id = f.ficha_raiz_id
  ) AS es_provisional,
  (SELECT count(*)::int FROM familiar_afectado fa WHERE fa.ficha_id = f.ficha_id) AS numero_familiares_afectados,
  (SELECT count(*)::int FROM signo_alerta_ficha sa WHERE sa.ficha_id = f.ficha_id) AS numero_signos_alerta,
  (SELECT count(*)::int FROM examen_ficha ef WHERE ef.ficha_id = f.ficha_id) AS numero_examenes,
  (SELECT count(*)::int FROM observacion_ficha ob WHERE ob.ficha_id = f.ficha_id) AS numero_observaciones
FROM ficha_clinica f
LEFT JOIN datos_adicionales_ficha da ON da.ficha_id = f.ficha_id
LEFT JOIN sexo_catalogo sc ON sc.sexo_id = da.sexo_id
LEFT JOIN usuario u ON u.usuario_id = f.medico_id
LEFT JOIN referido_de rd ON rd.referido_de_id = da.referido_de_id
LEFT JOIN asistencia_parto ap ON ap.asistencia_parto_id = da.asistencia_parto_id
WHERE f.es_vigente IS DISTINCT FROM false;

INSERT INTO schema_migrations (version)
VALUES ('15_reporting_agent_context.sql')
ON CONFLICT (version) DO NOTHING;
