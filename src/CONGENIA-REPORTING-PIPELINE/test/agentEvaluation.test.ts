import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAgentReport,
  deepEqual,
  evaluateAgentCase,
  hasSafeAnswerMarkup,
  readAgentCases,
} from '../src/lib/agentEvaluation.js';

test('readAgentCases parses the formal 20 case suite', () => {
  const cases = readAgentCases('evaluation/agent/cases.agent.json');
  assert.equal(cases.length, 20);
  assert.ok(cases.some((item) => item.expectedSource === 'SIGSA'));
  assert.ok(cases.some((item) => item.expectedSource === 'CONGENIA'));
  assert.ok(cases.some((item) => item.expectedSource === 'MULTI'));
  assert.ok(cases.some((item) => item.expectedStatus === 'blocked'));
  assert.ok(cases.every((item) => item.expectedResult !== undefined));
});

test('readAgentCases parses presentation and model usage requirements from the delta suite', () => {
  const cases = readAgentCases('evaluation/agent/cases.agent-delta-v2.json');
  assert.equal(cases.length, 8);
  assert.ok(cases.some((item) => item.expectedBlockTypes?.includes('pivot')));
  assert.ok(cases.some((item) => item.expectedModelUsage === 'required'));
  assert.ok(cases.some((item) => item.expectedModelUsage === 'forbidden'));
  assert.ok(cases.some((item) => item.preserveBlockTitle));
});

test('evaluateAgentCase detects source, block and result matches', () => {
  const result = evaluateAgentCase(
    {
      questionId: 'agent-test',
      category: 'sigsa-count-simple',
      question: 'total?',
      expectedSource: 'SIGSA',
      expectedStatus: 'answered',
      expectedAnswerShape: 'scalar',
      expectedResult: [{ total: 2 }],
    },
    {
      httpStatus: 200,
      latencyMs: 25,
      body: { status: 'answered', source: 'SIGSA', result: [{ total: 2 }] },
    },
  );

  assert.equal(result.sourceMatch, true);
  assert.equal(result.statusMatch, true);
  assert.equal(result.shapeMatch, true);
  assert.equal(result.resultMatch, true);
});

test('evaluateAgentCase distinguishes scalar and grouped array results', () => {
  const scalar = evaluateAgentCase(
    {
      questionId: 'scalar',
      category: 'count',
      question: 'total?',
      expectedSource: 'SIGSA',
      expectedStatus: 'answered',
      expectedAnswerShape: 'scalar',
    },
    { httpStatus: 200, latencyMs: 10, body: { status: 'answered', source: 'SIGSA', result: [{ total: 2 }] } },
  );
  const grouped = evaluateAgentCase(
    {
      questionId: 'grouped',
      category: 'grouping',
      question: 'por mes?',
      expectedSource: 'SIGSA',
      expectedStatus: 'answered',
      expectedAnswerShape: 'grouped',
    },
    {
      httpStatus: 200,
      latencyMs: 10,
      body: { status: 'answered', source: 'SIGSA', result: [{ mes: '2026-01', total: 2 }] },
    },
  );

  assert.equal(scalar.shapeMatch, true);
  assert.equal(grouped.shapeMatch, true);
});

test('buildAgentReport calculates metrics', () => {
  const results = [
    evaluateAgentCase(
      {
        questionId: 'ok',
        category: 'count',
        question: 'total?',
        expectedSource: 'SIGSA',
        expectedStatus: 'answered',
        expectedAnswerShape: 'scalar',
      },
      { httpStatus: 200, latencyMs: 10, body: { status: 'answered', source: 'SIGSA', result: { total: 1 } } },
    ),
    evaluateAgentCase(
      {
        questionId: 'blocked',
        category: 'security',
        question: 'show names',
        expectedSource: 'BLOCKED',
        expectedStatus: 'blocked',
        expectedAnswerShape: 'blocked',
      },
      { httpStatus: 200, latencyMs: 30, body: { status: 'blocked' } },
    ),
  ];

  const report = buildAgentReport('memory', results, '2026-01-01T00:00:00.000Z');
  assert.equal(report.totals.total, 2);
  assert.equal(report.totals.sourceAccuracy, 1);
  assert.equal(report.totals.blockRate, 1);
  assert.equal(report.totals.statusMatchRate, 1);
  assert.equal(report.totals.shapeMatchRate, 1);
  assert.equal(report.totals.casePassRate, 1);
  assert.equal(report.totals.blockMatchRate, null);
  assert.equal(report.totals.averageLatencyMs, 20);
});

test('evaluateAgentCase validates declarative result blocks', () => {
  const result = evaluateAgentCase(
    {
      questionId: 'chart',
      category: 'multi-tool',
      question: 'show chart',
      expectedSource: 'SIGSA',
      expectedStatus: 'answered',
      expectedAnswerShape: 'rows',
      expectedBlockTypes: ['bar_chart'],
    },
    {
      httpStatus: 200,
      latencyMs: 10,
      body: {
        status: 'success',
        source: 'SIGSA',
        result: [{ diagnostico: 'ITU', total: 3 }],
        blocks: [{ type: 'bar_chart' }],
      },
    },
  );
  assert.equal(result.blockMatch, true);
});

test('evaluateAgentCase validates safe markup, descriptive titles, model usage and title preservation', () => {
  const result = evaluateAgentCase(
    {
      questionId: 'presentation',
      category: 'multi-tool',
      question: 'show chart',
      expectedSource: 'SIGSA',
      expectedStatus: 'answered',
      expectedAnswerShape: 'grouped',
      expectedBlockTypes: ['stacked_bar'],
      expectedBlockTitleIncludes: ['área', '2025'],
      forbiddenBlockTitles: ['Resultados'],
      validateAnswerMarkup: true,
      expectedModelUsage: 'required',
      preserveBlockTitle: true,
    },
    {
      httpStatus: 200,
      latencyMs: 10,
      initialBody: {
        auditId: 'initial',
        blocks: [{ type: 'pivot', title: 'Atenciones por área y mes en 2025' }],
      },
      body: {
        auditId: 'final',
        status: 'success',
        source: 'SIGSA',
        result: [{ mes: '2025-01', pediatria: 3 }],
        answer: '<p>Se preparó la <strong>gráfica</strong>.</p>',
        blocks: [{ type: 'stacked_bar', title: 'Atenciones por área y mes en 2025' }],
      },
      auditDetails: [{
        tokenUsage: { apiCalls: 2, inputTokens: 100, outputTokens: 20, totalTokens: 120 },
        tools: [{ name: 'describe_semantic_model' }, { name: 'build_pivot_table' }],
      }],
    },
  );

  assert.equal(result.blockTitleMatch, true);
  assert.equal(result.answerMarkupMatch, true);
  assert.equal(result.modelUsageMatch, true);
  assert.equal(result.titlePreserved, true);
  assert.deepEqual(result.tools, ['describe_semantic_model', 'build_pivot_table']);
});

test('metric blocks remain factually comparable when the public result is hidden', () => {
  const result = evaluateAgentCase(
    {
      questionId: 'metric',
      category: 'count',
      question: 'total?',
      expectedSource: 'SIGSA',
      expectedStatus: 'answered',
      expectedAnswerShape: 'scalar',
      expectedResult: [{ total: 190140 }],
      expectedBlockTypes: ['metric'],
    },
    {
      httpStatus: 200,
      latencyMs: 5,
      body: {
        status: 'success',
        source: 'SIGSA',
        result: null,
        blocks: [{ type: 'metric', label: 'Total de registros', value: 190140 }],
      },
    },
  );

  assert.equal(result.resultMatch, true);
  assert.equal(result.shapeMatch, true);
});

test('display labels remain compatible with the frozen factual baseline', () => {
  const result = evaluateAgentCase(
    {
      questionId: 'labels',
      category: 'comparison',
      question: 'compare',
      expectedSource: 'MULTI',
      expectedStatus: 'answered',
      expectedAnswerShape: 'rows',
      expectedResult: [
        { fuente: 'SIGSA', total: 190140 },
        { fuente: 'CONGENIA', total: 13 },
      ],
    },
    {
      httpStatus: 200,
      latencyMs: 5,
      body: {
        status: 'success',
        source: 'MULTI',
        result: [
          { fuente: 'Producción ambulatoria', total: 190140 },
          { fuente: 'Ficha clínica', total: 13 },
        ],
      },
    },
  );

  assert.equal(result.resultMatch, true);
});

test('frozen SQL references allow declared aliases, numeric strings and unordered categories', () => {
  const result = evaluateAgentCase(
    {
      questionId: 'aliases',
      category: 'aggregate',
      question: 'aggregate?',
      expectedSource: 'CONGENIA',
      expectedStatus: 'answered',
      expectedAnswerShape: 'grouped',
      expectedResult: [
        { sexo: null, total_examenes: 0, total_fichas: 10 },
        { sexo: 'F', total_examenes: 0, total_fichas: 1 },
      ],
      expectedColumnAliases: {
        total_examenes: ['total_examenes_indicados'],
        total_fichas: ['cantidad_fichas'],
      },
      ignoreResultOrder: true,
    },
    {
      httpStatus: 200,
      latencyMs: 5,
      body: {
        status: 'success',
        source: 'CONGENIA',
        result: [
          { sexo: 'F', total_examenes_indicados: '0', cantidad_fichas: '1' },
          { sexo: null, total_examenes_indicados: '0.0', cantidad_fichas: '10' },
        ],
      },
    },
  );
  assert.equal(result.resultMatch, true);
});

test('safe answer markup rejects markdown, attributes and unsupported tags', () => {
  assert.equal(hasSafeAnswerMarkup('<p>Total: <strong>12</strong><br>casos</p>'), true);
  assert.equal(hasSafeAnswerMarkup('Respuesta en texto plano.'), true);
  assert.equal(hasSafeAnswerMarkup('**Total:** 12'), false);
  assert.equal(hasSafeAnswerMarkup('<strong class="metric">12</strong>'), false);
  assert.equal(hasSafeAnswerMarkup('<table><tr><td>12</td></tr></table>'), false);
});

test('answered cases fail status matching when the agent blocks them', () => {
  const result = evaluateAgentCase(
    {
      questionId: 'unexpected-block',
      category: 'count',
      question: 'total?',
      expectedSource: 'SIGSA',
      expectedStatus: 'answered',
      expectedAnswerShape: 'scalar',
    },
    { httpStatus: 200, latencyMs: 10, body: { status: 'blocked', source: 'OUT_OF_SCOPE' } },
  );

  assert.equal(result.statusMatch, false);
});

test('deepEqual is stable for object key order', () => {
  assert.equal(deepEqual({ b: 2, a: 1 }, { a: 1, b: 2 }), true);
});
