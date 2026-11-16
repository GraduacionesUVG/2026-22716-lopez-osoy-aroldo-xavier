import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readCsv } from '../src/lib/csv.js';
import { anonymizeRows, FORBIDDEN_COLUMNS, validateDesidentifiedHeaders } from '../src/lib/sigsa.js';

test('anonymizeRows removes direct identifiers and normalizes date', async () => {
  const rows = await readCsv(path.join(import.meta.dirname, '..', 'fixtures', 'sigsa_raw_fixture.csv'));
  const output = anonymizeRows(rows, 'sigsa-test');

  assert.equal(output.length, 2);
  assert.equal(output[0].consulta_id, 'sigsa_000001');
  assert.equal(output[0].fecha, '2025-06-12');
  assert.equal(output[0].dataset_version, 'sigsa-test');

  for (const forbidden of FORBIDDEN_COLUMNS) {
    assert.equal(Object.hasOwn(output[0], forbidden), false, `${forbidden} leaked`);
  }
});

test('validateDesidentifiedHeaders rejects forbidden columns', () => {
  const errors = validateDesidentifiedHeaders(['consulta_id', 'fecha', 'NombrePaciente']);
  assert.ok(errors.some((error) => error.includes('NombrePaciente')));
});
