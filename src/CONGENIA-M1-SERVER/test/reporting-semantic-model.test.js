'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { describeSemanticModel } = require('../src/services/reporting-semantic-model');

test('semantic model returns only relevant authorized concepts', () => {
  const model = describeSemanticModel({ source: 'SIGSA', concepts: ['área médica', 'sexo'] });
  assert.equal(model.sources.length, 1);
  assert.equal(model.sources[0].view, 'vw_sigsa_consultas_anon');
  assert.deepEqual(model.sources[0].fields.map((field) => field.column).sort(), ['servicio', 'sexo']);
  assert.equal(model.sources[0].fields.some((field) => field.column === 'consulta_id'), false);
  assert.equal(model.rules.crossSourceJoins, false);
});

test('semantic model resolves medical area per source without inventing columns', () => {
  const model = describeSemanticModel({ source: 'ALL', concepts: ['area medica'] });
  const sigsa = model.sources.find((source) => source.source === 'SIGSA');
  const congenia = model.sources.find((source) => source.source === 'CONGENIA');
  assert.deepEqual(sigsa.fields.map((field) => field.column), ['servicio']);
  assert.deepEqual(congenia.fields.map((field) => field.column), ['especialidad']);
});

test('CONGENIA semantic model exposes aggregate-safe ficha context', () => {
  const result = describeSemanticModel({ source: 'CONGENIA' });
  const fields = result.sources[0].fields.map((field) => field.column);

  assert.ok(fields.includes('referido_de'));
  assert.ok(fields.includes('asistencia_parto'));
  assert.ok(fields.includes('familiares_afectos'));
  assert.ok(fields.includes('numero_signos_alerta'));
  assert.ok(fields.includes('numero_examenes'));
  assert.ok(fields.includes('numero_observaciones'));
  assert.ok(!fields.includes('ficha_id'));
  assert.ok(!fields.includes('historia_clinica'));
});

test('semantic concepts match clinical phrases with aggregate qualifiers', () => {
  const model = describeSemanticModel({
    source: 'CONGENIA',
    concepts: ['sexo registrado', 'total de exámenes indicados', 'cantidad de fichas'],
  });
  const fields = model.sources[0].fields.map((item) => item.column);
  assert.ok(fields.includes('sexo'));
  assert.ok(fields.includes('numero_examenes'));
});
