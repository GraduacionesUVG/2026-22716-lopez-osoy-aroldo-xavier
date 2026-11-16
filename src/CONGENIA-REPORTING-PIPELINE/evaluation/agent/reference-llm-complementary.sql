-- Referencias congeladas antes de ejecutar la suite complementaria LLM.
-- Fecha: 2026-10-30. Fuentes: snapshot SIGSA desidentificado y vista CONGENIA local.

-- agent-llm-001
SELECT sexo, round(avg(edad_anios)::numeric, 2)::float AS promedio_edad
FROM vw_sigsa_consultas_anon
WHERE fecha >= DATE '2025-01-01' AND fecha < DATE '2026-01-01' AND edad_anios IS NOT NULL
GROUP BY sexo ORDER BY promedio_edad DESC NULLS LAST, sexo;

-- agent-llm-002
SELECT municipio, count(*)::int AS total
FROM vw_sigsa_consultas_anon
WHERE fecha >= DATE '2025-01-01' AND fecha < DATE '2026-01-01' AND municipio IS NOT NULL
GROUP BY municipio ORDER BY total DESC, municipio LIMIT 5;

-- agent-llm-003
SELECT servicio, round(avg(edad_anios)::numeric, 2)::float AS promedio_edad, count(*)::int AS total
FROM vw_sigsa_consultas_anon
WHERE fecha >= DATE '2025-01-01' AND fecha < DATE '2026-01-01' AND edad_anios IS NOT NULL
GROUP BY servicio HAVING count(*) >= 100
ORDER BY promedio_edad DESC, servicio LIMIT 10;

-- agent-llm-004
WITH top_areas AS (
  SELECT servicio FROM vw_sigsa_consultas_anon
  WHERE fecha >= DATE '2025-01-01' AND fecha < DATE '2026-01-01'
  GROUP BY servicio ORDER BY count(*) DESC LIMIT 3
)
SELECT to_char(date_trunc('month', fecha), 'YYYY-MM') AS mes,
       servicio AS area_medica, count(*)::int AS total
FROM vw_sigsa_consultas_anon
WHERE fecha >= DATE '2025-01-01' AND fecha < DATE '2026-01-01'
  AND servicio IN (SELECT servicio FROM top_areas)
GROUP BY date_trunc('month', fecha), servicio
ORDER BY date_trunc('month', fecha), servicio;

-- agent-llm-005
SELECT sexo, emergencia, count(*)::int AS total
FROM vw_sigsa_consultas_anon
WHERE fecha >= DATE '2025-01-01' AND fecha < DATE '2026-01-01'
GROUP BY sexo, emergencia ORDER BY sexo, emergencia;

-- agent-llm-006
SELECT to_char(date_trunc('month', fecha), 'YYYY-MM') AS mes,
       count(*) FILTER (WHERE primera = true)::int AS primeras,
       count(*) FILTER (WHERE reconsulta = true)::int AS reconsultas,
       count(*) FILTER (WHERE interconsulta = true)::int AS interconsultas
FROM vw_sigsa_consultas_anon
WHERE fecha >= DATE '2025-01-01' AND fecha < DATE '2026-01-01'
GROUP BY date_trunc('month', fecha) ORDER BY date_trunc('month', fecha);

-- agent-llm-007
SELECT especialidad, round(avg(numero_signos_alerta)::numeric, 2)::float AS promedio_signos,
       count(*)::int AS total_fichas
FROM vw_congenia_fichas_anon
GROUP BY especialidad ORDER BY promedio_signos DESC NULLS LAST, especialidad;

-- agent-llm-008
SELECT sexo, sum(numero_examenes)::int AS total_examenes, count(*)::int AS total_fichas
FROM vw_congenia_fichas_anon
GROUP BY sexo ORDER BY sexo NULLS FIRST;

-- agent-llm-009
SELECT origen_creacion, estado_ficha, count(*)::int AS total
FROM vw_congenia_fichas_anon
GROUP BY origen_creacion, estado_ficha ORDER BY origen_creacion, estado_ficha;

-- agent-llm-010, consulta independiente por fuente
SELECT sexo, count(*)::int AS total FROM vw_sigsa_consultas_anon GROUP BY sexo ORDER BY sexo NULLS FIRST;
SELECT sexo, count(*)::int AS total FROM vw_congenia_fichas_anon GROUP BY sexo ORDER BY sexo NULLS FIRST;
