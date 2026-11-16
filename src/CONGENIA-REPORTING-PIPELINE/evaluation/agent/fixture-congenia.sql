-- Synthetic, idempotent CONGENIA fixture for the formal reporting benchmark.
-- It contains no patient identity or clinical source data.

INSERT INTO usuario (usuario_id, nombre, especialidad, rol, activo)
VALUES (
  '30000000-0000-0000-0000-000000000001',
  'Usuario evaluacion sintetica',
  'Genetica Clinica',
  'MEDICO',
  true
)
ON CONFLICT (usuario_id) DO NOTHING;

WITH cases(idx, fecha, tenant, diagnostico, sexo_id) AS (
  VALUES
    (1,  DATE '2026-05-10', 23,  'Prueba',                                      1),
    (2,  DATE '2026-05-11', 23,  'Prueba',                                      2),
    (3,  DATE '2026-05-12', 23,  '',                                            3),
    (4,  DATE '2026-05-13', 23,  'Paladar hendido',                           NULL),
    (5,  DATE '2026-05-14', 23,  'Prueba e2e final OK',                       NULL),
    (6,  DATE '2026-06-10', 23,  'Prueba',                                    NULL),
    (7,  DATE '2026-06-11', 23,  'Prueba funcional dashboard y adendas',      NULL),
    (8,  DATE '2026-09-10', 23,  'Prueba',                                    NULL),
    (9,  DATE '2026-09-11', 23,  'Prueba manual desde frontend',              NULL),
    (10, DATE '2026-09-12', 254, 'QA defaults',                               NULL),
    (11, DATE '2026-10-01', 254, 'QA diagnostico sexo observaciones',         NULL),
    (12, DATE '2026-10-02', 254, 'Sospecha de sindrome genetico pediatrico',  NULL),
    (13, DATE '2026-10-02', 254, '',                                           NULL)
), inserted_patients AS (
  INSERT INTO paciente (
    paciente_id, paciente_ext_id, nombre_enc, nombre_dek_enc
  )
  SELECT
    ('20000000-0000-0000-0000-' || lpad(idx::text, 12, '0'))::uuid,
    'EVAL-' || lpad(idx::text, 3, '0'),
    decode('00', 'hex'),
    decode('00', 'hex')
  FROM cases
  ON CONFLICT (paciente_id) DO NOTHING
  RETURNING paciente_id
)
INSERT INTO ficha_clinica (
  ficha_id,
  paciente_id,
  origen_creacion,
  medico_id,
  fecha_consulta,
  diagnosticos_ext_texto,
  estado_ficha,
  version_ficha,
  fecha_creacion,
  creado_por,
  historia_clinica,
  id_tenant,
  ficha_raiz_id,
  es_vigente
)
SELECT
  ('10000000-0000-0000-0000-' || lpad(idx::text, 12, '0'))::uuid,
  ('20000000-0000-0000-0000-' || lpad(idx::text, 12, '0'))::uuid,
  'MANUAL',
  '30000000-0000-0000-0000-000000000001',
  fecha,
  diagnostico,
  'COMPLETA',
  1,
  fecha::timestamptz,
  '30000000-0000-0000-0000-000000000001',
  'HC-EVAL-' || lpad(idx::text, 3, '0'),
  tenant,
  ('10000000-0000-0000-0000-' || lpad(idx::text, 12, '0'))::uuid,
  true
FROM cases
ON CONFLICT (ficha_id) DO UPDATE SET
  fecha_consulta = EXCLUDED.fecha_consulta,
  diagnosticos_ext_texto = EXCLUDED.diagnosticos_ext_texto,
  fecha_creacion = EXCLUDED.fecha_creacion,
  id_tenant = EXCLUDED.id_tenant,
  es_vigente = true;

WITH cases(idx, sexo_id) AS (
  VALUES
    (1, 1), (2, 2), (3, 3), (4, NULL), (5, NULL), (6, NULL), (7, NULL),
    (8, NULL), (9, NULL), (10, NULL), (11, NULL), (12, NULL), (13, NULL)
)
INSERT INTO datos_adicionales_ficha (ficha_id, sexo_id)
SELECT
  ('10000000-0000-0000-0000-' || lpad(idx::text, 12, '0'))::uuid,
  sexo_id
FROM cases
ON CONFLICT (ficha_id) DO UPDATE SET sexo_id = EXCLUDED.sexo_id;
