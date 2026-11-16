-- Referencias congeladas antes de ejecutar cases.agent-generalization-v1.json.
-- Fecha: 2026-10-30. SIGSA usa el snapshot desidentificado; CONGENIA usa la vista local anonimizada.

-- agent-generalization-001
SELECT departamento, count(*)::int AS total
FROM vw_sigsa_consultas_anon
WHERE fecha >= DATE '2024-01-01' AND fecha < DATE '2025-01-01'
GROUP BY departamento
ORDER BY total DESC, departamento
LIMIT 5;

-- agent-generalization-002
SELECT pueblo, round(avg(edad_anios)::numeric, 2)::float AS promedio_edad,
       count(*)::int AS total
FROM vw_sigsa_consultas_anon
WHERE fecha >= DATE '2025-01-01' AND fecha < DATE '2026-01-01'
  AND edad_anios IS NOT NULL
GROUP BY pueblo
HAVING count(*) >= 500
ORDER BY promedio_edad DESC, pueblo;

-- agent-generalization-003
SELECT diagnostico, count(*)::int AS total
FROM vw_sigsa_consultas_anon
WHERE fecha >= DATE '2025-01-01' AND fecha < DATE '2026-01-01'
  AND sexo = 'F'
GROUP BY diagnostico
ORDER BY total DESC, diagnostico
LIMIT 3;

-- agent-generalization-004
SELECT es_provisional,
       round(avg(numero_observaciones)::numeric, 2)::float AS promedio_observaciones,
       count(*)::int AS total_fichas
FROM vw_congenia_fichas_anon
GROUP BY es_provisional
ORDER BY es_provisional NULLS FIRST;

-- agent-generalization-005, consultas independientes por fuente
SELECT count(*)::int AS total
FROM vw_sigsa_consultas_anon
WHERE fecha >= DATE '2025-01-01' AND fecha < DATE '2026-01-01';

SELECT count(*)::int AS total
FROM vw_congenia_fichas_anon
WHERE fecha_consulta >= DATE '2025-01-01' AND fecha_consulta < DATE '2026-01-01';
