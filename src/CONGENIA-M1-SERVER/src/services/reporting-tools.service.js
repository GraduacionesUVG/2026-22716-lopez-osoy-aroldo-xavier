'use strict';

const db = require('../config/db');
const { agentPool } = require('../config/reportingDb');
const { readArtifact, saveArtifact } = require('./reporting-artifact.service');
const { describeSemanticModel } = require('./reporting-semantic-model');
const { validateReportingSql } = require('./reporting-sql-validator');

const TIMEOUT_MS = Number(process.env.REPORTING_STATEMENT_TIMEOUT_MS || 5000);
const MAX_RESULT_ROWS = 50;
const MAX_PIVOT_CELLS = 500;
const MAX_CHART_SERIES = 5;
const TIME_CATEGORY_KEYS = ['mes', 'fecha', 'fecha_consulta', 'periodo'];

const SIGSA_DIMENSIONS = {
  sexo: 'sexo',
  departamento: 'departamento',
  municipio: 'municipio',
  servicio: 'servicio',
  cie10: 'cie10',
  diagnostico: 'diagnostico',
};

const CONGENIA_DIMENSIONS = {
  sexo: 'sexo',
  diagnostico: 'diagnostico',
  especialidad: 'especialidad',
  institucion: 'id_tenant',
  origen: 'origen_creacion',
  estado: 'estado_ficha',
  referido_de: 'referido_de',
  asistencia_parto: 'asistencia_parto',
  familiares_afectos: 'familiares_afectos',
  comunidad_afectada: 'comunidad_afectada',
  es_provisional: 'es_provisional',
};

const COMPARISON_DIMENSIONS = {
  sexo: { sigsa: 'sexo', congenia: 'sexo', output: 'sexo' },
  diagnostico: { sigsa: 'diagnostico', congenia: 'diagnostico', output: 'diagnostico' },
  area_medica: { sigsa: 'servicio', congenia: 'especialidad', output: 'area_medica' },
};

const DIMENSION_LABELS = {
  sexo: 'sexo',
  departamento: 'departamento',
  municipio: 'municipio',
  servicio: 'área médica',
  cie10: 'código CIE-10',
  diagnostico: 'diagnóstico',
  especialidad: 'especialidad',
  institucion: 'institución',
  area_medica: 'área médica',
  origen: 'origen de creación',
  estado: 'estado de ficha',
  referido_de: 'fuente de referencia',
  asistencia_parto: 'asistencia del parto',
  familiares_afectos: 'familiares afectados',
  comunidad_afectada: 'comunidad afectada',
  es_provisional: 'tipo de historia clínica',
};

const COLUMN_LABELS = {
  total: 'Total',
  cantidad: 'Cantidad',
  sigsa: 'Producción ambulatoria',
  congenia: 'Ficha clínica',
  produccion_ambulatoria: 'Producción ambulatoria',
  ficha_clinica: 'Ficha clínica',
  area_medica: 'Área médica',
  diagnostico: 'Diagnóstico',
  cie10: 'Código CIE-10',
};

function sourceDisplayLabel(value) {
  const label = cleanText(value, 60);
  if (label?.toUpperCase() === 'SIGSA' || label?.toUpperCase() === 'SIGSA3') return 'Producción ambulatoria';
  if (label?.toUpperCase() === 'CONGENIA') return 'Ficha clínica';
  return label;
}

function columnDisplayLabel(value) {
  const key = String(value ?? '');
  if (COLUMN_LABELS[key]) return COLUMN_LABELS[key];
  const words = key.replace(/_/g, ' ').trim();
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : key;
}

function appError(status, code, message) {
  const err = new Error(message ?? code);
  err.status = status;
  err.code = code;
  return err;
}

function requireAgentPool() {
  if (!agentPool) throw appError(503, 'REPORTING_AGENT_DB_NOT_CONFIGURED', 'La base de reportería no está configurada.');
  return agentPool;
}

function cleanText(value, max = 120) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > max) throw appError(400, 'ARGUMENT_TOO_LONG', 'Uno de los filtros es demasiado largo.');
  return text;
}

function cleanDate(value) {
  if (value == null || value === '') return null;
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw appError(400, 'INVALID_DATE', 'Las fechas deben usar formato YYYY-MM-DD.');
  }
  return text;
}

function cleanLimit(value, fallback = 10) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), 25);
}

function cleanInteger(value, name) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw appError(400, 'INVALID_INTEGER', `${name} debe ser un entero positivo.`);
  }
  return parsed;
}

function pluralize(count, singular, plural) {
  return Number(count) === 1 ? singular : plural;
}

function buildWhere(filters, { diagnosisColumn = 'diagnostico' } = {}) {
  const clauses = [];
  const values = [];
  const add = (clause, value) => {
    values.push(value);
    clauses.push(clause.replace('?', `$${values.length}`));
  };

  if (filters.from) add('fecha >= ?', filters.from);
  if (filters.to) add('fecha <= ?', filters.to);
  if (filters.latestMonths) {
    add(`fecha >= (
      SELECT date_trunc('month', max(fecha)) - ((? - 1) * interval '1 month')
      FROM vw_sigsa_consultas_anon
    )`, filters.latestMonths);
    clauses.push(`fecha < (
      SELECT date_trunc('month', max(fecha)) + interval '1 month'
      FROM vw_sigsa_consultas_anon
    )`);
  }
  if (filters.diagnosisText) add(`lower(${diagnosisColumn}) LIKE '%' || lower(?) || '%'`, filters.diagnosisText);
  if (filters.cie10) add('upper(cie10) = upper(?)', filters.cie10);

  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
  };
}

function congeniaFiltersFromArgs(args = {}) {
  return {
    from: cleanDate(args.from),
    to: cleanDate(args.to),
    diagnosisText: cleanText(args.diagnosisText),
    sex: cleanText(args.sex, 1),
    specialty: cleanText(args.specialty),
    tenantId: cleanInteger(args.tenantId, 'tenantId'),
  };
}

function buildCongeniaWhere(filters) {
  const clauses = [];
  const values = [];
  const add = (clause, value) => {
    values.push(value);
    clauses.push(clause.replace('?', `$${values.length}`));
  };

  if (filters.from) add('fecha_consulta >= ?', filters.from);
  if (filters.to) add('fecha_consulta <= ?', filters.to);
  if (filters.diagnosisText) add("lower(diagnostico) LIKE '%' || lower(?) || '%'", filters.diagnosisText);
  if (filters.sex) add('upper(sexo) = upper(?)', filters.sex);
  if (filters.specialty) add("lower(especialidad) LIKE '%' || lower(?) || '%'", filters.specialty);
  if (filters.tenantId) add('id_tenant = ?', filters.tenantId);

  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
  };
}

const dateFilterProperties = {
  from: { type: 'string', description: 'Fecha inicial YYYY-MM-DD.' },
  to: { type: 'string', description: 'Fecha final YYYY-MM-DD.' },
};

const sigsaDateFilterProperties = {
  ...dateFilterProperties,
  latestMonths: { type: 'integer', minimum: 1, maximum: 24, description: 'Meses calendario más recientes presentes en la fuente.' },
};

const congeniaFilterProperties = {
  ...dateFilterProperties,
  diagnosisText: { type: 'string', description: 'Texto diagnostico a buscar de forma parcial.' },
  sex: { type: 'string', enum: ['M', 'F', 'I'], description: 'Sexo registrado.' },
  specialty: { type: 'string', description: 'Especialidad medica parcial.' },
  tenantId: { type: 'integer', minimum: 1, description: 'Identificador de institucion.' },
};

async function runReadonly(pool, sql, params = [], maxRows = MAX_RESULT_ROWS) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = ${Math.max(TIMEOUT_MS, 1000)}`);
    const result = await client.query(sql, params);
    await client.query('COMMIT');
    return result.rows.slice(0, maxRows);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function toolSchema(name, description, properties, required = []) {
  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties,
      required,
    },
  };
}

const tools = [
  toolSchema('describe_semantic_model', 'Describe de forma compacta las fuentes, dimensiones y medidas autorizadas antes de generar SQL.', {
    source: { type: 'string', enum: ['SIGSA', 'CONGENIA', 'ALL'] },
    concepts: { type: 'array', maxItems: 10, items: { type: 'string' } },
  }),
  toolSchema('validate_aggregate_sql', 'Valida una consulta SQL agregada y devuelve un identificador opaco. No ejecuta la consulta.', {
    source: { type: 'string', enum: ['SIGSA', 'CONGENIA'] },
    sql: { type: 'string', maxLength: 5000 },
    title: { type: 'string', maxLength: 120, description: 'Título clínico descriptivo para tablas y gráficas derivadas.' },
  }, ['source', 'sql', 'title']),
  toolSchema('execute_validated_query', 'Ejecuta una consulta agregada previamente validada mediante su identificador opaco.', {
    validatedQueryId: { type: 'string' },
  }, ['validatedQueryId']),
  toolSchema('compare_results', 'Combina resultados agregados ya ejecutados sin realizar joins entre bases.', {
    resultIds: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'string' } },
    labels: { type: 'array', maxItems: 4, items: { type: 'string' } },
  }, ['resultIds']),
  toolSchema('build_pivot_table', 'Convierte un resultado de dos dimensiones a formato ancho; debe usarse antes de una gráfica apilada.', {
    resultId: { type: 'string' },
    rowKey: { type: 'string' },
    columnKey: { type: 'string' },
    valueKey: { type: 'string' },
    title: { type: 'string', maxLength: 120 },
  }, ['resultId', 'rowKey', 'columnKey', 'valueKey']),
  toolSchema('build_chart', 'Construye una gráfica segura. Los resultados largos con categorías repetidas se convierten automáticamente en barras apiladas.', {
    resultId: { type: 'string' },
    chartType: { type: 'string', enum: ['bar', 'line', 'stacked_bar'] },
    title: { type: 'string', maxLength: 120 },
    categoryKey: { type: 'string' },
    valueKeys: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string' } },
  }, ['resultId', 'chartType', 'categoryKey', 'valueKeys']),
  toolSchema('format_analytical_answer', 'Prepara una respuesta amigable usando un resultado agregado. No agrega tabla para métricas o explicaciones simples salvo que presentation sea table.', {
    resultId: { type: 'string' },
    answer: { type: 'string', maxLength: 1200 },
    title: { type: 'string', maxLength: 120 },
    presentation: { type: 'string', enum: ['auto', 'summary', 'table'] },
  }, ['resultId', 'answer']),
  toolSchema('sigsa_count_records', 'Cuenta registros agregados de producción ambulatoria con filtros opcionales.', {
    diagnosisText: { type: 'string', description: 'Texto diagnóstico a buscar de forma parcial.' },
    cie10: { type: 'string', description: 'Código CIE-10 exacto.' },
    ...sigsaDateFilterProperties,
  }),
  toolSchema('sigsa_peak_month', 'Obtiene el mes con mayor cantidad de atenciones de producción ambulatoria para los filtros solicitados.', {
    diagnosisText: { type: 'string', description: 'Texto diagnóstico a buscar de forma parcial.' },
    cie10: { type: 'string', description: 'Código CIE-10 exacto.' },
    ...dateFilterProperties,
  }),
  toolSchema('sigsa_group_by_dimension', 'Agrupa registros de producción ambulatoria por una dimensión permitida.', {
    dimension: { type: 'string', enum: Object.keys(SIGSA_DIMENSIONS) },
    diagnosisText: { type: 'string' },
    cie10: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
    limit: { type: 'integer', minimum: 1, maximum: 25 },
  }, ['dimension']),
  toolSchema('sigsa_count_distinct_values', 'Cuenta valores distintos de una dimensión permitida de producción ambulatoria.', {
    dimension: { type: 'string', enum: Object.keys(SIGSA_DIMENSIONS) },
    diagnosisText: { type: 'string' },
    cie10: { type: 'string' },
    ...dateFilterProperties,
  }, ['dimension']),
  toolSchema('sigsa_monthly_records', 'Cuenta registros de producción ambulatoria por mes.', {
    from: { type: 'string' },
    to: { type: 'string' },
  }),
  toolSchema('sigsa_monthly_by_dimension', 'Genera una tabla dinámica de áreas médicas por mes, opcionalmente limitada a las áreas con mayor volumen total del período.', {
    dimension: { type: 'string', enum: ['servicio'] },
    topAreas: { type: 'integer', minimum: 1, maximum: 10, description: 'Cantidad de áreas con mayor volumen total que deben conservarse.' },
    diagnosisText: { type: 'string' },
    cie10: { type: 'string' },
    ...dateFilterProperties,
  }, ['dimension']),
  toolSchema('sigsa_lookup_cie10', 'Consulta la descripción institucional de un código CIE-10 presente en producción ambulatoria.', {
    code: { type: 'string', description: 'Código CIE-10 exacto, por ejemplo Z54.9.' },
  }, ['code']),
  toolSchema('congenia_count_records', 'Cuenta fichas pediátricas genéticas CONGENIA con filtros opcionales.', congeniaFilterProperties),
  toolSchema('congenia_group_by_dimension', 'Agrupa fichas CONGENIA por una dimensión permitida.', {
    dimension: { type: 'string', enum: Object.keys(CONGENIA_DIMENSIONS) },
    ...congeniaFilterProperties,
    limit: { type: 'integer', minimum: 1, maximum: 25 },
  }, ['dimension']),
  toolSchema('congenia_count_distinct_values', 'Cuenta valores distintos de una dimensión CONGENIA permitida.', {
    dimension: { type: 'string', enum: Object.keys(CONGENIA_DIMENSIONS) },
    ...congeniaFilterProperties,
  }, ['dimension']),
  toolSchema('congenia_monthly_records', 'Cuenta fichas pediátricas genéticas CONGENIA por mes.', {
    ...congeniaFilterProperties,
  }),
  toolSchema('compare_dataset_counts', 'Compara conteos agregados entre producción ambulatoria y CONGENIA para el mismo período.', {
    ...dateFilterProperties,
    tenantId: { type: 'integer', minimum: 1, description: 'Filtro institucional aplicado solo a CONGENIA.' },
  }),
  toolSchema('compare_dataset_groups', 'Compara producción ambulatoria y CONGENIA agrupados por una dimensión semántica común.', {
    dimension: { type: 'string', enum: Object.keys(COMPARISON_DIMENSIONS) },
    ...dateFilterProperties,
    tenantId: { type: 'integer', minimum: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 25 },
  }, ['dimension']),
];

function listReportingTools() {
  return tools;
}

function validateKnownTool(name) {
  if (!tools.some((tool) => tool.name === name)) {
    throw appError(400, 'UNKNOWN_TOOL', 'La herramienta solicitada no existe.');
  }
}

function filtersFromArgs(args = {}) {
  const latestMonths = args.latestMonths == null ? null : cleanInteger(args.latestMonths, 'latestMonths');
  if (latestMonths != null && latestMonths > 24) {
    throw appError(400, 'INVALID_INTEGER', 'latestMonths debe estar entre 1 y 24.');
  }
  return {
    diagnosisText: cleanText(args.diagnosisText),
    cie10: cleanText(args.cie10, 12),
    from: cleanDate(args.from),
    to: cleanDate(args.to),
    latestMonths,
  };
}

async function callReportingToolImpl(name, args = {}, context = {}) {
  validateKnownTool(name);

  if (name === 'describe_semantic_model') {
    const model = describeSemanticModel(args);
    return {
      source: args.source && args.source !== 'ALL' ? args.source : 'MULTI',
      result: [model],
      answer: 'Se devolvió el fragmento autorizado del modelo semántico.',
      transient: true,
    };
  }

  if (name === 'validate_aggregate_sql') {
    const validated = validateReportingSql(args.sql, args.source);
    const title = cleanText(args.title, 120);
    const validatedQueryId = await saveArtifact('query', { ...validated, title }, context);
    return {
      source: validated.source,
      result: [{ validatedQueryId, source: validated.source, tables: validated.tables, sqlHash: validated.sqlHash }],
      answer: 'La consulta agregada fue validada y está lista para ejecutarse.',
      validatedQueryId,
      sqlHash: validated.sqlHash,
      transient: true,
    };
  }

  if (name === 'execute_validated_query') {
    const query = await readArtifact('query', args.validatedQueryId, context);
    const pool = query.source === 'SIGSA' ? requireAgentPool() : db;
    const rows = await runReadonly(pool, `SELECT * FROM (${query.sql}) AS reporting_result LIMIT ${MAX_RESULT_ROWS}`);
    const title = cleanText(query.title, 120) ?? `Resultados agregados de ${sourceDisplayLabel(query.source)}`;
    const resultId = await saveArtifact('result', { source: query.source, rows, title }, context);
    return {
      source: query.source,
      result: rows,
      answer: `La consulta devolvió ${rows.length} filas agregadas.`,
      resultId,
      sqlHash: query.sqlHash,
      blocks: analyticalBlocks(title, rows),
      suggestedActions: chartAction(resultId, rows),
    };
  }

  if (name === 'compare_results') {
    const ids = Array.isArray(args.resultIds) ? args.resultIds.slice(0, 4) : [];
    if (ids.length < 2) throw appError(400, 'RESULTS_REQUIRED', 'Se requieren al menos dos resultados.');
    const artifacts = await Promise.all(ids.map((id) => readArtifact('result', id, context)));
    const labels = Array.isArray(args.labels) ? args.labels : [];
    const rows = safeRows(artifacts.flatMap((artifact, index) => artifact.rows.map((row) => ({
      ...row,
      fuente: sourceDisplayLabel(labels[index]) ?? sourceDisplayLabel(artifact.source),
    }))));
    const title = 'Comparación de resultados';
    const resultId = await saveArtifact('result', { source: 'MULTI', rows, title }, context);
    return {
      source: 'MULTI',
      result: rows,
      answer: 'Se combinaron los resultados agregados de las fuentes solicitadas.',
      resultId,
      blocks: [tableBlock(title, rows)],
      suggestedActions: chartAction(resultId, rows),
    };
  }

  if (name === 'build_pivot_table') {
    const artifact = await readArtifact('result', args.resultId, context);
    const pivot = buildPivot(artifact.rows, args);
    const title = cleanText(args.title, 120) ?? cleanText(artifact.title, 120) ?? 'Resultados agregados';
    const resultId = await saveArtifact('result', { source: artifact.source, rows: pivot.rows, title }, context);
    return {
      source: artifact.source,
      result: pivot.rows,
      answer: 'Se construyó la tabla dinámica solicitada.',
      resultId,
      blocks: [{ type: 'pivot', title, columns: pivot.columns, rows: pivot.rows }],
      suggestedActions: chartAction(resultId, pivot.rows),
    };
  }

  if (name === 'build_chart') {
    const artifact = await readArtifact('result', args.resultId, context);
    const title = cleanText(args.title, 120) ?? cleanText(artifact.title, 120);
    const block = chartBlock(artifact.rows, { ...args, title });
    return {
      source: artifact.source,
      result: artifact.rows,
      answer: 'Se preparó la gráfica solicitada.',
      resultId: args.resultId,
      blocks: [block],
      suggestedActions: [{ label: 'Ver como tabla', action: 'show_table', resultId: args.resultId }],
    };
  }

  if (name === 'format_analytical_answer') {
    const artifact = await readArtifact('result', args.resultId, context);
    const title = cleanText(args.title, 120) ?? artifact.title ?? 'Resultados';
    const resultId = await saveArtifact('result', { ...artifact, title }, context);
    return {
      source: artifact.source,
      result: artifact.rows,
      answer: cleanText(args.answer, 1200),
      resultId,
      blocks: args.presentation === 'summary'
        ? summaryBlocks(title, artifact.rows)
        : args.presentation === 'table'
          ? [tableBlock(title, artifact.rows)]
          : analyticalBlocks(title, artifact.rows),
      suggestedActions: chartAction(resultId, artifact.rows),
    };
  }

  if (name === 'sigsa_count_records') {
    const pool = requireAgentPool();
    const filters = filtersFromArgs(args);
    const { where, values } = buildWhere(filters);
    const rows = await runReadonly(pool, `SELECT count(*)::int AS total FROM vw_sigsa_consultas_anon ${where}`, values);
    const total = rows[0]?.total ?? 0;
    const suffix = filters.diagnosisText
      ? ` con diagnóstico relacionado con "${filters.diagnosisText}"`
      : filters.cie10
        ? ` con CIE-10 ${filters.cie10}`
        : '';
    const title = filters.diagnosisText
      ? `Total de registros de producción ambulatoria relacionados con ${filters.diagnosisText}`
      : filters.cie10
        ? `Total de registros de producción ambulatoria con CIE-10 ${filters.cie10}`
        : 'Total de registros de producción ambulatoria';
    return {
      source: 'SIGSA',
      result: rows,
      answer: `Se ${pluralize(total, 'encontró', 'encontraron')} ${total} ${pluralize(total, 'registro', 'registros')} de producción ambulatoria${suffix}.`,
      blocks: [metricBlock(title, total)],
      hideResult: true,
    };
  }

  if (name === 'sigsa_peak_month') {
    const pool = requireAgentPool();
    const filters = filtersFromArgs(args);
    const { where, values } = buildWhere(filters);
    const rows = await runReadonly(pool, `
      SELECT to_char(date_trunc('month', fecha), 'YYYY-MM') AS mes, count(*)::int AS total
      FROM vw_sigsa_consultas_anon
      ${where}
      GROUP BY 1
      ORDER BY total DESC, mes ASC
      LIMIT 1`, values);
    const diagnosis = filters.diagnosisText ? ` por ${filters.diagnosisText}` : '';
    const period = filters.from?.slice(0, 4) === filters.to?.slice(0, 4) ? ` en ${filters.from.slice(0, 4)}` : '';
    const title = `Mes con más atenciones${diagnosis}${period}`;
    return {
      source: 'SIGSA',
      result: rows,
      answer: rows.length
        ? `El mes con más atenciones${diagnosis}${period} fue ${rows[0].mes}, con ${rows[0].total} registros.`
        : 'No se encontraron atenciones para los filtros solicitados.',
      blocks: rows.length ? [tableBlock(title, rows)] : [],
    };
  }

  if (name === 'sigsa_group_by_dimension') {
    const pool = requireAgentPool();
    const dimension = String(args.dimension ?? '');
    const column = SIGSA_DIMENSIONS[dimension];
    if (!column) throw appError(400, 'INVALID_DIMENSION', 'La dimensión solicitada no está permitida.');
    const limit = cleanLimit(args.limit);
    const filters = filtersFromArgs(args);
    const { where, values } = buildWhere(filters);
    values.push(limit);
    const rows = await runReadonly(pool, `
      SELECT ${column} AS ${dimension}, count(*)::int AS total
      FROM vw_sigsa_consultas_anon
      ${where}
      GROUP BY ${column}
      ORDER BY total DESC, ${dimension} ASC
      LIMIT $${values.length}`, values);
    const label = DIMENSION_LABELS[dimension] ?? dimension;
    const title = `Registros de producción ambulatoria por ${label}`;
    return {
      source: 'SIGSA',
      result: rows,
      answer: `Se muestran los principales registros de producción ambulatoria agrupados por ${label}.`,
      blocks: [tableBlock(title, rows)],
    };
  }

  if (name === 'sigsa_count_distinct_values') {
    const pool = requireAgentPool();
    const dimension = String(args.dimension ?? '');
    const column = SIGSA_DIMENSIONS[dimension];
    if (!column) throw appError(400, 'INVALID_DIMENSION', 'La dimensión solicitada no está permitida.');
    const filters = filtersFromArgs(args);
    const { where, values } = buildWhere(filters);
    const rows = await runReadonly(pool, `
      SELECT count(DISTINCT ${column})::int AS total
      FROM vw_sigsa_consultas_anon
      ${where}`, values);
    const label = DIMENSION_LABELS[dimension] ?? dimension;
    const title = `Valores distintos de producción ambulatoria por ${label}`;
    return {
      source: 'SIGSA',
      result: rows,
      answer: `Producción ambulatoria contiene ${rows[0]?.total ?? 0} valores distintos para ${label}.`,
      blocks: [metricBlock(title, rows[0]?.total ?? 0)],
      hideResult: true,
    };
  }

  if (name === 'sigsa_monthly_records') {
    const pool = requireAgentPool();
    const filters = filtersFromArgs(args);
    const { where, values } = buildWhere(filters);
    const rows = await runReadonly(pool, `
      SELECT to_char(date_trunc('month', fecha), 'YYYY-MM') AS mes, count(*)::int AS total
      FROM vw_sigsa_consultas_anon
      ${where}
      GROUP BY 1
      ORDER BY 1 ASC`, values);
    const title = 'Registros de producción ambulatoria por mes';
    return {
      source: 'SIGSA',
      result: rows,
      answer: 'Se muestran los registros de producción ambulatoria por mes.',
      blocks: [tableBlock(title, rows)],
    };
  }

  if (name === 'sigsa_monthly_by_dimension') {
    const pool = requireAgentPool();
    if (args.dimension !== 'servicio') {
      throw appError(400, 'INVALID_DIMENSION', 'La dimensión solicitada no está permitida.');
    }
    const filters = filtersFromArgs(args);
    const { where, values } = buildWhere(filters);
    const topAreas = args.topAreas == null ? null : cleanInteger(args.topAreas, 'topAreas');
    if (topAreas != null && topAreas > 10) {
      throw appError(400, 'INVALID_INTEGER', 'topAreas debe estar entre 1 y 10.');
    }
    if (topAreas != null) values.push(topAreas);
    const grouped = await runReadonly(pool, `
      WITH filtered AS (
        SELECT fecha, COALESCE(NULLIF(trim(servicio), ''), 'Sin dato') AS area_medica
        FROM vw_sigsa_consultas_anon
        ${where}
      )
      ${topAreas == null ? '' : `, top_areas AS (
        SELECT area_medica
        FROM filtered
        GROUP BY area_medica
        ORDER BY count(*) DESC, area_medica ASC
        LIMIT $${values.length}
      )`}
      SELECT to_char(date_trunc('month', fecha), 'YYYY-MM') AS mes,
             area_medica,
             count(*)::int AS total
      FROM filtered
      ${topAreas == null ? '' : 'WHERE area_medica IN (SELECT area_medica FROM top_areas)'}
      GROUP BY 1, 2
      ORDER BY 1 ASC, 2 ASC`, values, MAX_PIVOT_CELLS + 1);
    const pivot = buildPivot(grouped, { rowKey: 'mes', columnKey: 'area_medica', valueKey: 'total' });
    const period = filters.from?.slice(0, 4) === filters.to?.slice(0, 4)
      ? ` en ${filters.from.slice(0, 4)}`
      : '';
    const scope = topAreas == null ? '' : ` de las ${topAreas} áreas con mayor volumen`;
    const title = `Atenciones de producción ambulatoria${scope} por área médica y mes${period}`;
    return {
      source: 'SIGSA',
      result: pivot.rows,
      answer: `Se muestra el desglose de atenciones${scope} por área médica y mes${period}.`,
      blocks: [{ type: 'pivot', title, columns: pivot.columns, rows: pivot.rows }],
    };
  }

  if (name === 'sigsa_lookup_cie10') {
    const pool = requireAgentPool();
    const code = cleanText(args.code, 12);
    if (!code) throw appError(400, 'INVALID_CIE10_CODE', 'Debes indicar un código CIE-10.');
    const rows = await runReadonly(pool, `
      SELECT upper(cie10) AS codigo,
             max(cie10_descripcion) AS descripcion,
             count(*)::int AS total
      FROM vw_sigsa_consultas_anon
      WHERE upper(cie10) = upper($1)
      GROUP BY upper(cie10)
      LIMIT 1`, [code]);
    if (rows.length === 0) {
      return {
        source: 'SIGSA',
        result: [],
        answer: `No se encontró el código CIE-10 ${code} en producción ambulatoria.`,
        blocks: [],
        hideResult: true,
      };
    }
    const row = rows[0];
    const description = row.descripcion || 'sin descripción registrada';
    const title = `Código CIE-10 ${row.codigo} en producción ambulatoria`;
    return {
      source: 'SIGSA',
      result: rows,
      answer: `El código CIE-10 ${row.codigo} corresponde a ${description}.`,
      blocks: [],
      hideResult: true,
    };
  }

  if (name === 'congenia_count_records') {
    const filters = congeniaFiltersFromArgs(args);
    const { where, values } = buildCongeniaWhere(filters);
    const rows = await runReadonly(db, `
      SELECT count(*)::int AS total
      FROM vw_congenia_fichas_anon
      ${where}`, values);
    const total = rows[0]?.total ?? 0;
    const title = 'Total de fichas pediátricas genéticas CONGENIA';
    return {
      source: 'CONGENIA',
      result: rows,
      answer: `Se ${pluralize(total, 'encontró', 'encontraron')} ${total} ${pluralize(total, 'ficha pediátrica genética', 'fichas pediátricas genéticas')} en CONGENIA.`,
      blocks: [metricBlock(title, total)],
      hideResult: true,
    };
  }

  if (name === 'congenia_group_by_dimension') {
    const dimension = String(args.dimension ?? '');
    const column = CONGENIA_DIMENSIONS[dimension];
    if (!column) throw appError(400, 'INVALID_DIMENSION', 'La dimensión solicitada no está permitida.');
    const limit = cleanLimit(args.limit);
    const filters = congeniaFiltersFromArgs(args);
    const { where, values } = buildCongeniaWhere(filters);
    values.push(limit);
    const rows = await runReadonly(db, `
      SELECT ${column} AS ${dimension}, count(*)::int AS total
      FROM vw_congenia_fichas_anon
      ${where}
      GROUP BY ${column}
      ORDER BY total DESC, ${dimension} ASC
      LIMIT $${values.length}`, values);
    const label = DIMENSION_LABELS[dimension] ?? dimension;
    const title = `Fichas CONGENIA por ${label}`;
    return {
      source: 'CONGENIA',
      result: rows,
      answer: `Se muestran las fichas CONGENIA agrupadas por ${label}.`,
      blocks: [tableBlock(title, rows)],
    };
  }

  if (name === 'congenia_count_distinct_values') {
    const dimension = String(args.dimension ?? '');
    const column = CONGENIA_DIMENSIONS[dimension];
    if (!column) throw appError(400, 'INVALID_DIMENSION', 'La dimensión solicitada no está permitida.');
    const filters = congeniaFiltersFromArgs(args);
    const { where, values } = buildCongeniaWhere(filters);
    const rows = await runReadonly(db, `
      SELECT count(DISTINCT ${column})::int AS total
      FROM vw_congenia_fichas_anon
      ${where}`, values);
    const label = DIMENSION_LABELS[dimension] ?? dimension;
    const title = `Valores distintos de fichas CONGENIA por ${label}`;
    return {
      source: 'CONGENIA',
      result: rows,
      answer: `CONGENIA contiene ${rows[0]?.total ?? 0} valores distintos para ${label}.`,
      blocks: [metricBlock(title, rows[0]?.total ?? 0)],
      hideResult: true,
    };
  }

  if (name === 'congenia_monthly_records') {
    const filters = congeniaFiltersFromArgs(args);
    const { where, values } = buildCongeniaWhere(filters);
    const rows = await runReadonly(db, `
      SELECT to_char(date_trunc('month', fecha_consulta), 'YYYY-MM') AS mes, count(*)::int AS total
      FROM vw_congenia_fichas_anon
      ${where}
      GROUP BY 1
      ORDER BY 1 ASC`, values);
    const title = 'Fichas pediátricas genéticas CONGENIA por mes';
    return {
      source: 'CONGENIA',
      result: rows,
      answer: 'Se muestran las fichas pediátricas genéticas CONGENIA por mes.',
      blocks: [tableBlock(title, rows)],
    };
  }

  if (name === 'compare_dataset_counts') {
    const pool = requireAgentPool();
    const sigsaFilters = filtersFromArgs(args);
    const congeniaFilters = congeniaFiltersFromArgs(args);
    const sigsaQuery = buildWhere(sigsaFilters);
    const congeniaQuery = buildCongeniaWhere(congeniaFilters);
    const [sigsaRows, congeniaRows] = await Promise.all([
      runReadonly(pool, `SELECT count(*)::int AS total FROM vw_sigsa_consultas_anon ${sigsaQuery.where}`, sigsaQuery.values),
      runReadonly(db, `SELECT count(*)::int AS total FROM vw_congenia_fichas_anon ${congeniaQuery.where}`, congeniaQuery.values),
    ]);
    const result = [
      { fuente: 'Producción ambulatoria', total: sigsaRows[0]?.total ?? 0 },
      { fuente: 'Ficha clínica', total: congeniaRows[0]?.total ?? 0 },
    ];
    const title = 'Totales de producción ambulatoria y CONGENIA';
    return {
      source: 'MULTI',
      result,
      answer: `Producción ambulatoria tiene ${result[0].total} registros y CONGENIA ${result[1].total} fichas para los filtros solicitados.`,
      blocks: [tableBlock(title, result)],
    };
  }

  if (name === 'compare_dataset_groups') {
    const dimension = COMPARISON_DIMENSIONS[args.dimension];
    if (!dimension) throw appError(400, 'INVALID_DIMENSION', 'La dimensión de comparación no está permitida.');
    const pool = requireAgentPool();
    const limit = cleanLimit(args.limit, 25);
    const sigsaQuery = buildWhere(filtersFromArgs(args));
    const congeniaQuery = buildCongeniaWhere(congeniaFiltersFromArgs(args));
    const [sigsaRows, congeniaRows] = await Promise.all([
      runReadonly(pool, `
        SELECT COALESCE(NULLIF(trim(${dimension.sigsa}::text), ''), 'Sin dato') AS dimension, count(*)::int AS total
        FROM vw_sigsa_consultas_anon
        ${sigsaQuery.where}
        GROUP BY 1
        ORDER BY total DESC, dimension ASC
        LIMIT $${sigsaQuery.values.length + 1}`, [...sigsaQuery.values, limit]),
      runReadonly(db, `
        SELECT COALESCE(NULLIF(trim(${dimension.congenia}::text), ''), 'Sin dato') AS dimension, count(*)::int AS total
        FROM vw_congenia_fichas_anon
        ${congeniaQuery.where}
        GROUP BY 1
        ORDER BY total DESC, dimension ASC
        LIMIT $${congeniaQuery.values.length + 1}`, [...congeniaQuery.values, limit]),
    ]);
    const grouped = new Map();
    const merge = (rows, source) => {
      for (const row of rows) {
        const label = String(row.dimension ?? 'Sin dato');
        const key = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        const current = grouped.get(key) ?? { [dimension.output]: label, sigsa: 0, congenia: 0 };
        current[source] = Number(row.total) || 0;
        grouped.set(key, current);
      }
    };
    merge(sigsaRows, 'sigsa');
    merge(congeniaRows, 'congenia');
    const result = [...grouped.values()]
      .sort((a, b) => (b.sigsa + b.congenia) - (a.sigsa + a.congenia))
      .slice(0, MAX_RESULT_ROWS);
    const label = DIMENSION_LABELS[dimension.output] ?? dimension.output.replace('_', ' ');
    const title = `Producción ambulatoria y CONGENIA por ${label}`;
    return {
      source: 'MULTI',
      result,
      answer: `Se comparan producción ambulatoria y CONGENIA agrupados por ${label}.`,
      blocks: [tableBlock(title, result)],
    };
  }

  throw appError(400, 'UNKNOWN_TOOL', 'La herramienta solicitada no existe.');
}

function safeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, MAX_RESULT_ROWS).filter((row) => row && typeof row === 'object' && !Array.isArray(row));
}

function tableBlock(title, rows) {
  const safe = safeRows(rows);
  return { type: 'table', title, columns: Object.keys(safe[0] ?? {}), rows: safe };
}

function metricBlock(label, value) {
  return { type: 'metric', label, value: Number(value) || 0 };
}

function analyticalBlocks(title, rows) {
  const safe = safeRows(rows);
  if (safe.length === 0) return [];
  const summarized = summaryBlocks(title, safe);
  if (summarized.length > 0) return summarized;
  return [tableBlock(title, safe)];
}

function summaryBlocks(title, rows) {
  const safe = safeRows(rows);
  if (safe.length === 0) return [];
  const columns = Object.keys(safe[0]);
  if (safe.length === 1 && columns.length === 1 && numericMeasure(safe[0][columns[0]]) != null) {
    return [metricBlock(title, safe[0][columns[0]])];
  }
  const rowKey = TIME_CATEGORY_KEYS.find((key) => columns.includes(key));
  const numericColumns = columns.filter((key) => safe.some((row) => numericMeasure(row[key]) != null));
  if (rowKey && numericColumns.length > 1) {
    return [{ type: 'pivot', title, columns: [rowKey, ...numericColumns], rows: safe }];
  }
  const valueKey = ['total', 'cantidad', 'atenciones'].find((key) => numericColumns.includes(key)) ?? numericColumns[0];
  const columnKey = columns.find((key) => key !== rowKey && key !== valueKey
    && safe.some((row) => typeof row[key] === 'string'));
  if (rowKey && columnKey && valueKey) {
    const pivot = buildPivot(safe, { rowKey, columnKey, valueKey });
    return [{ type: 'pivot', title, columns: pivot.columns, rows: pivot.rows }];
  }
  return [];
}

function requireResultColumns(rows, keys) {
  const columns = new Set(Object.keys(rows[0] ?? {}));
  for (const key of keys) {
    if (!columns.has(key)) throw appError(400, 'RESULT_COLUMN_NOT_FOUND', `La columna ${key} no existe en el resultado.`);
  }
}

function buildPivot(rawRows, args) {
  const rows = Array.isArray(rawRows)
    ? rawRows.slice(0, MAX_PIVOT_CELLS + 1).filter((row) => row && typeof row === 'object' && !Array.isArray(row))
    : [];
  requireResultColumns(rows, [args.rowKey, args.columnKey, args.valueKey]);
  const columnValues = [...new Set(rows.map((row) => String(row[args.columnKey] ?? 'Sin dato')))];
  const rowValues = [...new Set(rows.map((row) => String(row[args.rowKey] ?? 'Sin dato')))];
  if (columnValues.length * rowValues.length > MAX_PIVOT_CELLS) {
    throw appError(400, 'PIVOT_TOO_LARGE', 'La tabla dinámica excede el límite de 500 celdas.');
  }
  const resultRows = rowValues.map((rowValue) => {
    const result = { [args.rowKey]: rowValue };
    for (const columnValue of columnValues) result[columnValue] = 0;
    for (const row of rows.filter((candidate) => String(candidate[args.rowKey] ?? 'Sin dato') === rowValue)) {
      const columnValue = String(row[args.columnKey] ?? 'Sin dato');
      result[columnValue] += Number(row[args.valueKey]) || 0;
    }
    return result;
  });
  return { columns: [args.rowKey, ...columnValues], rows: resultRows };
}

function numericMeasure(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function chartCategoryKey(rows, requestedKey) {
  const requested = cleanText(requestedKey, 120);
  if (requested) return requested;
  const columns = Object.keys(rows[0] ?? {});
  return TIME_CATEGORY_KEYS.find((key) => columns.includes(key) && rows.some((row) => typeof row[key] === 'string'))
    ?? columns.find((key) => rows.some((row) => typeof row[key] === 'string'))
    ?? columns[0];
}

function limitPivotSeries(pivot) {
  const seriesKeys = pivot.columns.slice(1);
  if (seriesKeys.length <= MAX_CHART_SERIES) return pivot;

  const ranked = seriesKeys
    .filter((key) => key !== 'Otros')
    .map((key) => ({
      key,
      total: pivot.rows.reduce((sum, row) => sum + (numericMeasure(row[key]) ?? 0), 0),
    }))
    .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
  const kept = ranked.slice(0, MAX_CHART_SERIES - 1).map(({ key }) => key);
  const overflow = seriesKeys.filter((key) => !kept.includes(key));
  const rows = pivot.rows.map((row) => ({
    [pivot.columns[0]]: row[pivot.columns[0]],
    ...Object.fromEntries(kept.map((key) => [key, numericMeasure(row[key]) ?? 0])),
    Otros: overflow.reduce((sum, key) => sum + (numericMeasure(row[key]) ?? 0), 0),
  }));
  return { columns: [pivot.columns[0], ...kept, 'Otros'], rows };
}

function prepareChartData(rawRows, args) {
  const rows = safeRows(rawRows);
  const columns = Object.keys(rows[0] ?? {});
  const categoryKey = chartCategoryKey(rows, args.categoryKey);
  const allNumericValueKeys = columns.filter((key) => (
    key !== categoryKey && rows.some((row) => numericMeasure(row[key]) != null)
  ));
  const requestedValueKeys = Array.isArray(args.valueKeys) && args.valueKeys.length > 0
    ? args.valueKeys.slice(0, MAX_CHART_SERIES)
    : allNumericValueKeys.slice(0, MAX_CHART_SERIES);
  const secondaryDimensions = columns.filter((key) => (
    key !== categoryKey
    && !requestedValueKeys.includes(key)
    && rows.some((row) => typeof row[key] === 'string')
  ));
  const hasRepeatedCategories = new Set(rows.map((row) => String(row[categoryKey] ?? 'Sin dato'))).size < rows.length;

  if ((args.chartType ?? 'bar') === 'bar'
    && TIME_CATEGORY_KEYS.includes(categoryKey)
    && allNumericValueKeys.length > 1
    && secondaryDimensions.length === 0) {
    const pivot = limitPivotSeries({ columns: [categoryKey, ...allNumericValueKeys], rows });
    return {
      rows: pivot.rows,
      args: {
        ...args,
        chartType: 'stacked_bar',
        categoryKey,
        valueKeys: pivot.columns.slice(1),
      },
    };
  }

  if ((args.chartType ?? 'bar') !== 'line'
    && requestedValueKeys.length === 1
    && secondaryDimensions.length === 1
    && hasRepeatedCategories) {
    const pivot = limitPivotSeries(buildPivot(rows, {
      rowKey: categoryKey,
      columnKey: secondaryDimensions[0],
      valueKey: requestedValueKeys[0],
    }));
    return {
      rows: pivot.rows,
      args: {
        ...args,
        chartType: 'stacked_bar',
        categoryKey,
        valueKeys: pivot.columns.slice(1),
      },
    };
  }

  if (args.chartType === 'stacked_bar' && allNumericValueKeys.length > MAX_CHART_SERIES) {
    const pivot = limitPivotSeries({
      columns: [categoryKey, ...allNumericValueKeys],
      rows,
    });
    return {
      rows: pivot.rows,
      args: {
        ...args,
        categoryKey,
        valueKeys: pivot.columns.slice(1),
      },
    };
  }

  return { rows, args: { ...args, categoryKey, valueKeys: requestedValueKeys } };
}

function chartBlock(rawRows, args) {
  const prepared = prepareChartData(rawRows, args);
  const rows = prepared.rows.slice(0, 25);
  const chartArgs = prepared.args;
  const chartType = chartArgs.chartType ?? 'bar';
  if (!['bar', 'line', 'stacked_bar'].includes(chartType)) {
    throw appError(400, 'INVALID_CHART_TYPE', 'El tipo de gráfica solicitado no está permitido.');
  }
  const categoryKey = chartArgs.categoryKey;
  const valueKeys = chartArgs.valueKeys;
  if (!categoryKey || valueKeys.length === 0) {
    throw appError(400, 'CHART_COLUMNS_REQUIRED', 'El resultado no contiene dimensiones y medidas compatibles con una gráfica.');
  }
  requireResultColumns(rows, [categoryKey, ...valueKeys]);
  const chartRows = rows.map((row) => ({
    ...row,
    ...Object.fromEntries(valueKeys.map((key) => [key, numericMeasure(row[key]) ?? 0])),
  }));
  return {
    type: chartType === 'stacked_bar' ? 'stacked_bar' : `${chartType}_chart`,
    title: cleanText(chartArgs.title, 120) ?? 'Visualización',
    categoryKey,
    series: valueKeys.map((dataKey) => ({ dataKey, label: columnDisplayLabel(dataKey) })),
    rows: chartRows,
  };
}

function chartAction(resultId, rows) {
  return safeRows(rows).length > 1
    ? [{ label: 'Ver como gráfica', action: 'show_chart', resultId }]
    : [];
}

async function callReportingTool(name, args = {}, context = {}) {
  const result = await callReportingToolImpl(name, args, context);
  if (result.transient || result.resultId || !context.ownerSub || !context.conversationId) return result;
  const rows = safeRows(result.result);
  if (rows.length === 0) return { ...result, blocks: result.blocks ?? [] };
  const blocks = result.blocks ?? [tableBlock('Resultados', rows)];
  const title = blocks.find((block) => typeof block?.title === 'string')?.title ?? 'Resultados';
  const resultId = await saveArtifact('result', { source: result.source, rows, title }, context);
  return {
    ...result,
    resultId,
    blocks,
    suggestedActions: chartAction(resultId, rows),
  };
}

module.exports = {
  callReportingTool,
  listReportingTools,
};
