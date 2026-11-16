-- Run against the frozen SIGSA reporting database described in
-- reference-snapshot.agent.json. Each query mirrors one formal case without
-- invoking the LLM or the reporting API.

-- agent-001: the natural-language filter is normalized without accents before
-- being applied to the diagnosis text.
SELECT count(*)::int AS total
FROM vw_sigsa_consultas_anon
WHERE lower(diagnostico) LIKE '%infeccion urinaria%';

-- agent-002
SELECT count(*)::int AS total FROM vw_sigsa_consultas_anon;

-- agent-003
SELECT count(*)::int AS total
FROM vw_sigsa_consultas_anon
WHERE fecha BETWEEN DATE '2025-06-01' AND DATE '2025-06-30';

-- agent-004
SELECT to_char(date_trunc('month', fecha), 'YYYY-MM') AS mes,
       count(*)::int AS total
FROM vw_sigsa_consultas_anon
GROUP BY date_trunc('month', fecha)
ORDER BY date_trunc('month', fecha);

-- agent-005
SELECT diagnostico, count(*)::int AS total
FROM vw_sigsa_consultas_anon
GROUP BY diagnostico
ORDER BY total DESC, diagnostico ASC
LIMIT 5;

-- agent-006
SELECT count(*)::int AS total
FROM vw_sigsa_consultas_anon
WHERE diagnostico ILIKE '%labio y paladar hendido%'
  AND fecha BETWEEN DATE '2025-01-01' AND DATE '2025-12-31';

-- agent-007
SELECT count(DISTINCT cie10)::int AS total
FROM vw_sigsa_consultas_anon;

-- agent-008
SELECT cie10, count(*)::int AS total
FROM vw_sigsa_consultas_anon
GROUP BY cie10
ORDER BY total DESC, cie10 ASC
LIMIT 10;
