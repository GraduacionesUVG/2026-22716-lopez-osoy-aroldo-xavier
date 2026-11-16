'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

function stubModule(relativePath, exports) {
  const resolved = require.resolve(path.join(SRC, relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function fakePool(selectRows) {
  const queries = [];
  return {
    queries,
    async connect() {
      return {
        async query(sql, params = []) {
          queries.push({ sql, params });
          return /select/i.test(sql) ? { rows: selectRows } : { rows: [] };
        },
        release() {},
      };
    },
  };
}

function loadTools({ sigsaRows = [], congeniaRows = [], artifactStore } = {}) {
  const sigsaPool = fakePool(sigsaRows);
  const congeniaPool = fakePool(congeniaRows);
  stubModule('config/db.js', congeniaPool);
  stubModule('config/reportingDb.js', { appPool: sigsaPool, agentPool: sigsaPool });
  if (artifactStore) stubModule('services/reporting-artifact.service.js', artifactStore);
  const resolved = require.resolve(path.join(SRC, 'services/reporting-tools.service.js'));
  delete require.cache[resolved];
  return { ...require(resolved), sigsaPool, congeniaPool };
}

test('SIGSA grouping uses only the allowlisted dimension in SELECT and ORDER BY', async () => {
  const { callReportingTool, sigsaPool } = loadTools({ sigsaRows: [{ diagnostico: 'ITU', total: 5 }] });
  const result = await callReportingTool('sigsa_group_by_dimension', { dimension: 'diagnostico', limit: 5 });
  const select = sigsaPool.queries.find((query) => /FROM vw_sigsa_consultas_anon/.test(query.sql));

  assert.deepEqual(result.result, [{ diagnostico: 'ITU', total: 5 }]);
  assert.equal(result.blocks[0].title, 'Registros de producción ambulatoria por diagnóstico');
  assert.match(select.sql, /SELECT diagnostico AS diagnostico/);
  assert.match(select.sql, /ORDER BY total DESC, diagnostico ASC/);
  assert.doesNotMatch(select.sql, /\bvalor\b/);
  assert.deepEqual(select.params, [5]);
});

test('advanced tools validate, execute and reuse results without accepting SQL at execution', async () => {
  const artifacts = new Map();
  let sequence = 0;
  const artifactStore = {
    async saveArtifact(kind, payload) {
      const id = `${kind}-${++sequence}`;
      artifacts.set(id, payload);
      return id;
    },
    async readArtifact(_kind, id) {
      const value = artifacts.get(id);
      if (!value) throw Object.assign(new Error('expired'), { code: 'REPORTING_ARTIFACT_EXPIRED' });
      return value;
    },
  };
  const { callReportingTool, sigsaPool } = loadTools({
    sigsaRows: [{ servicio: 'PEDIATRIA', total: 8 }],
    artifactStore,
  });
  const context = { ownerSub: 'admin-1', conversationId: 'conversation-1' };
  const validated = await callReportingTool('validate_aggregate_sql', {
    source: 'SIGSA',
    sql: 'SELECT servicio, count(*) AS total FROM vw_sigsa_consultas_anon GROUP BY servicio',
    title: 'Atenciones de producción ambulatoria por área médica',
  }, context);
  assert.equal(validated.sqlHash.length, 64);

  const executed = await callReportingTool('execute_validated_query', {
    validatedQueryId: validated.validatedQueryId,
    sql: 'DELETE FROM anything',
  }, context);
  assert.equal(executed.resultId, 'result-2');
  assert.equal(executed.blocks[0].type, 'table');
  assert.ok(sigsaPool.queries.some((query) => query.sql === 'BEGIN READ ONLY'));
  assert.ok(sigsaPool.queries.some((query) => /reporting_result LIMIT 50/.test(query.sql)));

  const chart = await callReportingTool('build_chart', {
    resultId: executed.resultId,
    chartType: 'bar',
    categoryKey: 'servicio',
    valueKeys: ['total'],
  }, context);
  assert.equal(chart.blocks[0].type, 'bar_chart');
  assert.equal(chart.blocks[0].title, 'Atenciones de producción ambulatoria por área médica');
  assert.equal(chart.resultId, executed.resultId);
  await assert.rejects(callReportingTool('build_chart', {
    resultId: executed.resultId,
    chartType: 'javascript',
    categoryKey: 'servicio',
    valueKeys: ['total'],
  }, context), { code: 'INVALID_CHART_TYPE' });

  const formatted = await callReportingTool('format_analytical_answer', {
    resultId: executed.resultId,
    answer: 'Se muestran los registros por servicio.',
    title: 'Registros de producción ambulatoria por área médica',
  }, context);
  assert.equal(formatted.resultId, 'result-3');
  const titledChart = await callReportingTool('build_chart', {
    resultId: formatted.resultId,
    chartType: 'bar',
    categoryKey: 'servicio',
    valueKeys: ['total'],
  }, context);
  assert.equal(titledChart.blocks[0].title, 'Registros de producción ambulatoria por área médica');

  const chartWithBlankTitle = await callReportingTool('build_chart', {
    resultId: formatted.resultId,
    chartType: 'bar',
    title: '   ',
    categoryKey: 'servicio',
    valueKeys: ['total'],
  }, context);
  assert.equal(chartWithBlankTitle.blocks[0].title, 'Registros de producción ambulatoria por área médica');
});

test('chart tool converts PostgreSQL numeric strings into chart measures', async () => {
  const artifactStore = {
    async saveArtifact() { return 'unused'; },
    async readArtifact() {
      return {
        source: 'SIGSA',
        rows: [
          { area_medica: 'PEDIATRIA', cantidad: '40678' },
          { area_medica: 'GINECOLOGIA', cantidad: '29505' },
        ],
      };
    },
  };
  const { callReportingTool } = loadTools({ artifactStore });
  const chart = await callReportingTool('build_chart', {
    resultId: 'result-with-pg-counts',
    chartType: 'bar',
  }, { ownerSub: 'admin-1', conversationId: 'conversation-1' });

  assert.equal(chart.blocks[0].categoryKey, 'area_medica');
  assert.deepEqual(chart.blocks[0].series, [{ dataKey: 'cantidad', label: 'Cantidad' }]);
  assert.deepEqual(chart.blocks[0].rows, [
    { area_medica: 'PEDIATRIA', cantidad: 40678 },
    { area_medica: 'GINECOLOGIA', cantidad: 29505 },
  ]);
});

test('chart tool pivots repeated month and hospital area rows into stacked bars', async () => {
  const artifactStore = {
    async saveArtifact() { return 'unused'; },
    async readArtifact() {
      return {
        source: 'SIGSA',
        title: 'Atenciones por área hospitalaria y mes',
        rows: [
          { mes: '2025-01', departamento_hospitalario: 'PEDIATRIA', total: '8' },
          { mes: '2025-01', departamento_hospitalario: 'MEDICINA GENERAL', total: '5' },
          { mes: '2025-02', departamento_hospitalario: 'PEDIATRIA', total: '7' },
          { mes: '2025-02', departamento_hospitalario: 'MEDICINA GENERAL', total: '6' },
        ],
      };
    },
  };
  const { callReportingTool } = loadTools({ artifactStore });
  const chart = await callReportingTool('build_chart', {
    resultId: 'hospital-area-by-month',
    chartType: 'bar',
    categoryKey: 'mes',
    valueKeys: ['total'],
  }, { ownerSub: 'admin-1', conversationId: 'conversation-1' });

  assert.equal(chart.blocks[0].type, 'stacked_bar');
  assert.equal(chart.blocks[0].categoryKey, 'mes');
  assert.deepEqual(chart.blocks[0].series, [
    { dataKey: 'PEDIATRIA', label: 'PEDIATRIA' },
    { dataKey: 'MEDICINA GENERAL', label: 'MEDICINA GENERAL' },
  ]);
  assert.deepEqual(chart.blocks[0].rows, [
    { mes: '2025-01', PEDIATRIA: 8, 'MEDICINA GENERAL': 5 },
    { mes: '2025-02', PEDIATRIA: 7, 'MEDICINA GENERAL': 6 },
  ]);
});

test('stacked charts preserve totals by grouping overflow series as Otros', async () => {
  const areas = ['A', 'B', 'C', 'D', 'E', 'F'];
  const artifactStore = {
    async saveArtifact() { return 'unused'; },
    async readArtifact() {
      return {
        source: 'SIGSA',
        rows: areas.flatMap((area, index) => [
          { mes: '2025-01', area, total: index + 1 },
          { mes: '2025-02', area, total: index + 2 },
        ]),
      };
    },
  };
  const { callReportingTool } = loadTools({ artifactStore });
  const chart = await callReportingTool('build_chart', {
    resultId: 'many-areas',
    chartType: 'bar',
    categoryKey: 'mes',
    valueKeys: ['total'],
  }, { ownerSub: 'admin-1', conversationId: 'conversation-1' });

  assert.equal(chart.blocks[0].type, 'stacked_bar');
  assert.equal(chart.blocks[0].series.length, 5);
  assert.equal(chart.blocks[0].series.at(-1).dataKey, 'Otros');
  assert.equal(
    chart.blocks[0].series.reduce((sum, series) => sum + chart.blocks[0].rows[0][series.dataKey], 0),
    21
  );
});

test('stacked charts preserve overflow series from a previously pivoted result', async () => {
  const artifactStore = {
    async saveArtifact() { return 'unused'; },
    async readArtifact() {
      return {
        source: 'SIGSA',
        title: 'Atenciones por área y mes',
        rows: [
          { mes: '2026-01', Pediatria: 10, Cirugia: 8, Medicina: 6, Ginecologia: 4, Trauma: 2, Neurologia: 1 },
          { mes: '2026-02', Pediatria: 9, Cirugia: 7, Medicina: 5, Ginecologia: 3, Trauma: 2, Neurologia: 2 },
        ],
      };
    },
  };
  const { callReportingTool } = loadTools({ artifactStore });
  const chart = await callReportingTool('build_chart', {
    resultId: 'pivot-result',
    chartType: 'stacked_bar',
    categoryKey: 'mes',
    valueKeys: ['Pediatria', 'Cirugia', 'Medicina', 'Ginecologia', 'Trauma'],
  }, { ownerSub: 'admin-1', conversationId: 'conversation-1' });

  assert.deepEqual(chart.blocks[0].series.map(({ dataKey }) => dataKey), [
    'Pediatria', 'Cirugia', 'Medicina', 'Ginecologia', 'Otros',
  ]);
  assert.equal(chart.blocks[0].rows[0].Otros, 3);
  assert.equal(chart.blocks[0].rows[1].Otros, 4);
});

test('pivot tool aggregates cells and enforces the 500-cell limit', async () => {
  const artifacts = new Map([
    ['small', { source: 'SIGSA', rows: [
      { sexo: 'F', mes: '2026-01', total: 2 },
      { sexo: 'F', mes: '2026-02', total: 3 },
      { sexo: 'M', mes: '2026-01', total: 4 },
    ] }],
    ['large', { source: 'SIGSA', rows: Array.from({ length: 50 }, (_, index) => ({
      fila: `F${index % 25}`,
      columna: `C${Math.floor(index / 2)}`,
      total: 1,
    })) }],
  ]);
  const artifactStore = {
    async saveArtifact(kind, payload) {
      const id = `${kind}-saved`;
      artifacts.set(id, payload);
      return id;
    },
    async readArtifact(_kind, id) { return artifacts.get(id); },
  };
  const { callReportingTool } = loadTools({ artifactStore });
  const context = { ownerSub: 'admin-1', conversationId: 'conversation-1' };
  const pivot = await callReportingTool('build_pivot_table', {
    resultId: 'small', rowKey: 'sexo', columnKey: 'mes', valueKey: 'total',
  }, context);
  assert.deepEqual(pivot.result, [
    { sexo: 'F', '2026-01': 2, '2026-02': 3 },
    { sexo: 'M', '2026-01': 4, '2026-02': 0 },
  ]);
  await assert.rejects(callReportingTool('build_pivot_table', {
    resultId: 'large', rowKey: 'fila', columnKey: 'columna', valueKey: 'total',
  }, context), { code: 'PIVOT_TOO_LARGE' });
});

test('dataset comparison reads both aggregate views in read-only transactions', async () => {
  const { callReportingTool, sigsaPool, congeniaPool } = loadTools({
    sigsaRows: [{ total: 190140 }],
    congeniaRows: [{ total: 13 }],
  });
  const result = await callReportingTool('compare_dataset_counts', {});

  assert.equal(result.source, 'MULTI');
  assert.deepEqual(result.result, [
    { fuente: 'Producción ambulatoria', total: 190140 },
    { fuente: 'Ficha clínica', total: 13 },
  ]);
  assert.equal(result.blocks[0].title, 'Totales de producción ambulatoria y CONGENIA');
  assert.ok(sigsaPool.queries.some((query) => query.sql === 'BEGIN READ ONLY'));
  assert.ok(congeniaPool.queries.some((query) => query.sql === 'BEGIN READ ONLY'));
});

test('grouped dataset comparison aligns both sources by sex', async () => {
  const { callReportingTool } = loadTools({
    sigsaRows: [{ dimension: 'F', total: 117923 }, { dimension: 'M', total: 72217 }],
    congeniaRows: [{ dimension: 'F', total: 8 }, { dimension: 'M', total: 5 }],
  });
  const result = await callReportingTool('compare_dataset_groups', { dimension: 'sexo' });

  assert.equal(result.source, 'MULTI');
  assert.deepEqual(result.result, [
    { sexo: 'F', sigsa: 117923, congenia: 8 },
    { sexo: 'M', sigsa: 72217, congenia: 5 },
  ]);
  assert.equal(result.blocks[0].title, 'Producción ambulatoria y CONGENIA por sexo');
});

test('comparison charts expose public series labels without changing technical data keys', async () => {
  const artifacts = new Map([
    ['comparison', {
      source: 'MULTI',
      title: 'Producción ambulatoria y ficha clínica por sexo',
      rows: [{ sexo: 'F', sigsa: 117923, congenia: 8 }],
    }],
  ]);
  const { callReportingTool } = loadTools({ artifactStore: {
    async saveArtifact() { return 'unused'; },
    async readArtifact(_kind, id) { return artifacts.get(id); },
  } });

  const result = await callReportingTool('build_chart', {
    resultId: 'comparison',
    chartType: 'bar',
    categoryKey: 'sexo',
    valueKeys: ['sigsa', 'congenia'],
  }, { ownerSub: 'admin-1', conversationId: 'conversation-1' });

  assert.deepEqual(result.blocks[0].series, [
    { dataKey: 'sigsa', label: 'Producción ambulatoria' },
    { dataKey: 'congenia', label: 'Ficha clínica' },
  ]);
});

test('simple reporting tools choose metrics, text or tables according to the result shape', async () => {
  const toolCases = [
    ['sigsa_count_records', {}, 'metric', 'Total de registros de producción ambulatoria'],
    ['sigsa_peak_month', { diagnosisText: 'resfriado', from: '2025-01-01', to: '2025-12-31' }, 'table', 'Mes con más atenciones por resfriado en 2025'],
    ['sigsa_group_by_dimension', { dimension: 'sexo' }, 'table', 'Registros de producción ambulatoria por sexo'],
    ['sigsa_count_distinct_values', { dimension: 'cie10' }, 'metric', 'Valores distintos de producción ambulatoria por código CIE-10'],
    ['sigsa_monthly_records', {}, 'table', 'Registros de producción ambulatoria por mes'],
    ['sigsa_lookup_cie10', { code: 'A00' }, null, null],
    ['congenia_count_records', {}, 'metric', 'Total de fichas pediátricas genéticas CONGENIA'],
    ['congenia_group_by_dimension', { dimension: 'especialidad' }, 'table', 'Fichas CONGENIA por especialidad'],
    ['congenia_count_distinct_values', { dimension: 'institucion' }, 'metric', 'Valores distintos de fichas CONGENIA por institución'],
    ['congenia_monthly_records', {}, 'table', 'Fichas pediátricas genéticas CONGENIA por mes'],
    ['compare_dataset_counts', {}, 'table', 'Totales de producción ambulatoria y CONGENIA'],
    ['compare_dataset_groups', { dimension: 'sexo' }, 'table', 'Producción ambulatoria y CONGENIA por sexo'],
  ];

  for (const [name, args, expectedType, expectedTitle] of toolCases) {
    const { callReportingTool } = loadTools({
      sigsaRows: [{ codigo: 'A00', descripcion: 'Cólera', total: 2, sexo: 'F' }],
      congeniaRows: [{ total: 1, sexo: 'F', especialidad: 'Genética', institucion: 254 }],
    });
    const result = await callReportingTool(name, args);
    assert.equal(result.blocks[0]?.type ?? null, expectedType, name);
    const visibleTitle = result.blocks[0]?.title ?? result.blocks[0]?.label ?? null;
    assert.equal(visibleTitle, expectedTitle, name);
  }
});

test('monthly area tool returns a complete pivot instead of truncating grouped rows at fifty', async () => {
  const grouped = Array.from({ length: 60 }, (_, index) => ({
    mes: `2025-${String(Math.floor(index / 5) + 1).padStart(2, '0')}`,
    area_medica: `AREA ${index % 5 + 1}`,
    total: 1,
  }));
  const { callReportingTool } = loadTools({ sigsaRows: grouped });
  const result = await callReportingTool('sigsa_monthly_by_dimension', {
    dimension: 'servicio', from: '2025-01-01', to: '2025-12-31',
  });
  assert.equal(result.blocks[0].type, 'pivot');
  assert.equal(result.blocks[0].title, 'Atenciones de producción ambulatoria por área médica y mes en 2025');
  assert.equal(result.result.length, 12);
  assert.equal(result.blocks[0].columns.length, 6);
});

test('monthly area tool ranks top areas over the full requested period', async () => {
  const { callReportingTool, sigsaPool } = loadTools({
    sigsaRows: [{ mes: '2025-01', area_medica: 'PEDIATRIA', total: 4 }],
  });
  const result = await callReportingTool('sigsa_monthly_by_dimension', {
    dimension: 'servicio', topAreas: 3, from: '2025-01-01', to: '2025-12-31',
  });
  const select = sigsaPool.queries.find((query) => /WITH filtered/.test(query.sql));
  assert.match(select.sql, /top_areas/);
  assert.match(select.sql, /ORDER BY count\(\*\) DESC/);
  assert.deepEqual(select.params, ['2025-01-01', '2025-12-31', 3]);
  assert.equal(result.blocks[0].title, 'Atenciones de producción ambulatoria de las 3 áreas con mayor volumen por área médica y mes en 2025');
});

test('relative month filters are anchored to the latest date in the dataset', async () => {
  const { callReportingTool, sigsaPool } = loadTools({ sigsaRows: [{ total: 12 }] });
  await callReportingTool('sigsa_count_records', { latestMonths: 5, diagnosisText: 'embaraz' });
  const select = sigsaPool.queries.find((query) => /count\(\*\).*vw_sigsa_consultas_anon/s.test(query.sql));
  assert.match(select.sql, /max\(fecha\)/);
  assert.match(select.sql, /interval '1 month'/);
  assert.deepEqual(select.params, [5, 'embaraz']);
});
