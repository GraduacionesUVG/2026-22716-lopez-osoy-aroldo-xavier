'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateReportingSql } = require('../src/services/reporting-sql-validator');

test('reporting SQL validator accepts aggregated select over allowed view', () => {
  const result = validateReportingSql(
    "SELECT COUNT(*) AS total FROM vw_sigsa_consultas_anon WHERE servicio = 'PEDIATRIA'"
  );
  assert.equal(result.tables[0], 'vw_sigsa_consultas_anon');
  assert.equal(result.sqlHash.length, 64);
});

test('reporting SQL validator recursively checks CTEs, subqueries and joins', () => {
  const valid = validateReportingSql(`
    WITH grouped AS (
      SELECT sexo, count(*) AS total
      FROM vw_sigsa_consultas_anon
      GROUP BY sexo
    )
    SELECT sexo, sum(total) AS total
    FROM grouped
    GROUP BY sexo`);
  assert.equal(valid.source, 'SIGSA');

  assert.throws(() => validateReportingSql(`
    SELECT count(*) FROM vw_sigsa_consultas_anon
    WHERE EXISTS (SELECT 1 FROM pg_catalog.pg_tables)`), { code: 'SQL_SOURCE_FORBIDDEN' });
  assert.throws(() => validateReportingSql(`
    SELECT count(*) FROM vw_sigsa_consultas_anon a
    JOIN vw_sigsa_consultas_anon b ON b.sexo = a.sexo`), { code: 'SQL_JOIN_FORBIDDEN' });
});

test('reporting SQL validator blocks identifiers even when reused as aliases', () => {
  assert.throws(() => validateReportingSql(
    'SELECT count(ficha_id) AS ficha_id FROM vw_congenia_fichas_anon'
  ), { code: 'SQL_PHI_COLUMN_FORBIDDEN' });
});

test('reporting SQL validator enforces declared source and safe functions', () => {
  assert.throws(() => validateReportingSql(
    'SELECT count(*) FROM vw_sigsa_consultas_anon', 'CONGENIA'
  ), { code: 'SQL_SOURCE_MISMATCH' });
  assert.throws(() => validateReportingSql(
    'SELECT pg_sleep(1), count(*) FROM vw_sigsa_consultas_anon'
  ), { code: 'SQL_FUNCTION_FORBIDDEN' });
});

test('reporting SQL validator blocks mutations and internal tables', () => {
  assert.throws(() => validateReportingSql('UPDATE vw_sigsa_consultas_anon SET servicio = 1'), {
    code: 'SQL_FORBIDDEN',
  });
  assert.throws(() => validateReportingSql('SELECT COUNT(*) FROM pg_catalog.pg_tables'), {
    code: 'SQL_SOURCE_FORBIDDEN',
  });
});

test('reporting SQL validator blocks row-level select star', () => {
  assert.throws(() => validateReportingSql('SELECT * FROM vw_sigsa_consultas_anon LIMIT 10'), {
    code: 'SQL_STAR_FORBIDDEN',
  });
});
