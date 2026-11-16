-- Run against the frozen CONGENIA evaluation database described in
-- reference-snapshot.agent.json. Each query mirrors one formal case without
-- invoking the LLM or the reporting API.

-- agent-009
SELECT count(*)::int AS total FROM vw_congenia_fichas_anon;

-- agent-010
SELECT to_char(date_trunc('month', fecha_consulta), 'YYYY-MM') AS mes,
       count(*)::int AS total
FROM vw_congenia_fichas_anon
GROUP BY date_trunc('month', fecha_consulta)
ORDER BY date_trunc('month', fecha_consulta);

-- agent-011
SELECT count(*)::int AS total
FROM vw_congenia_fichas_anon
WHERE fecha_consulta BETWEEN DATE '2026-01-01' AND DATE '2026-12-31';

-- agent-012
SELECT sexo, count(*)::int AS total
FROM vw_congenia_fichas_anon
GROUP BY sexo
ORDER BY total DESC, sexo ASC;

-- agent-013
SELECT diagnostico, count(*)::int AS total
FROM vw_congenia_fichas_anon
GROUP BY diagnostico
ORDER BY total DESC, diagnostico ASC
LIMIT 10;

-- agent-014
SELECT count(*)::int AS total
FROM vw_congenia_fichas_anon
WHERE id_tenant = 254
  AND fecha_consulta BETWEEN DATE '2026-01-01' AND DATE '2026-12-31';

-- agent-015
SELECT to_char(date_trunc('month', fecha_consulta), 'YYYY-MM') AS mes,
       count(*)::int AS total
FROM vw_congenia_fichas_anon
WHERE id_tenant = 23
GROUP BY date_trunc('month', fecha_consulta)
ORDER BY date_trunc('month', fecha_consulta);

-- agent-016 combines this count with agent-002.
SELECT count(*)::int AS total FROM vw_congenia_fichas_anon;
