-- Independent SQL references for cases.agent-delta-v2.json.
-- Run against the frozen SIGSA reporting snapshot without invoking the agent.

-- agent-delta-001
SELECT count(*)::int AS total
FROM vw_sigsa_consultas_anon
WHERE diagnostico ILIKE '%embarazo%'
  AND fecha BETWEEN DATE '2025-06-01' AND DATE '2025-07-31';

-- agent-delta-002: five calendar months anchored to MAX(fecha).
WITH anchor AS (
  SELECT date_trunc('month', max(fecha)) AS max_month
  FROM vw_sigsa_consultas_anon
)
SELECT count(*)::int AS total
FROM vw_sigsa_consultas_anon, anchor
WHERE diagnostico ILIKE '%embarazo%'
  AND fecha >= max_month - interval '4 months'
  AND fecha < max_month + interval '1 month';

-- agent-delta-003
SELECT to_char(date_trunc('month', fecha), 'YYYY-MM') AS mes,
       count(*)::int AS total
FROM vw_sigsa_consultas_anon
WHERE diagnostico ILIKE '%resfriado%'
  AND fecha BETWEEN DATE '2025-01-01' AND DATE '2025-12-31'
GROUP BY date_trunc('month', fecha)
ORDER BY total DESC, mes ASC
LIMIT 1;

-- agent-delta-004
SELECT servicio AS area_medica, count(*)::int AS total
FROM vw_sigsa_consultas_anon
WHERE fecha BETWEEN DATE '2025-05-01' AND DATE '2025-05-31'
GROUP BY servicio
ORDER BY total DESC, area_medica ASC
LIMIT 10;

-- agent-delta-005 and agent-delta-006 use the same month x area source data.
SELECT to_char(date_trunc('month', fecha), 'YYYY-MM') AS mes,
       servicio AS area_medica,
       count(*)::int AS total
FROM vw_sigsa_consultas_anon
WHERE fecha BETWEEN DATE '2025-01-01' AND DATE '2025-12-31'
GROUP BY date_trunc('month', fecha), servicio
ORDER BY date_trunc('month', fecha), total DESC, area_medica ASC;

-- agent-delta-007
SELECT count(*)::int AS total
FROM vw_sigsa_consultas_anon;
