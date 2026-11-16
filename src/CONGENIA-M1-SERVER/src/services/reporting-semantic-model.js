'use strict';

const SEMANTIC_MODEL_VERSION = 'reporting-semantic-v2';

const SOURCES = {
  SIGSA: {
    source: 'SIGSA',
    view: 'vw_sigsa_consultas_anon',
    description: 'Registros anonimizados de producción ambulatoria.',
    fields: [
      field('fecha', 'date', ['fecha de consulta', 'periodo', 'mes'], ['count']),
      field('turno', 'categorical', ['jornada', 'turno de atención']),
      field('clinica', 'categorical', ['clínica']),
      field('tipo_clinica', 'categorical', ['tipo de clínica']),
      field('servicio', 'categorical', ['servicio médico', 'área médica', 'area medica', 'departamento de atención']),
      field('departamento_hospitalario', 'categorical', ['departamento hospitalario', 'área hospitalaria', 'departamento médico']),
      field('sexo', 'categorical', ['sexo del paciente']),
      field('edad_dias', 'numeric', ['edad en días'], ['avg', 'min', 'max']),
      field('edad_meses', 'numeric', ['edad en meses'], ['avg', 'min', 'max']),
      field('edad_anios', 'numeric', ['edad', 'edad en años'], ['avg', 'min', 'max']),
      field('pueblo', 'categorical', ['pueblo']),
      field('comunidad_linguistica', 'categorical', ['comunidad lingüística']),
      field('departamento', 'categorical', ['departamento geográfico']),
      field('municipio', 'categorical', ['municipio']),
      field('diagnostico', 'categorical', ['diagnóstico', 'causa']),
      field('cie10', 'categorical', ['código CIE-10', 'cie 10']),
      field('cie10_descripcion', 'categorical', ['descripción CIE-10']),
      field('nuevo', 'boolean', ['caso nuevo']),
      field('primera', 'boolean', ['primera consulta']),
      field('reconsulta', 'boolean', ['reconsulta']),
      field('interconsulta', 'boolean', ['interconsulta']),
      field('emergencia', 'boolean', ['emergencia']),
      field('dataset_version', 'categorical', ['versión del dataset']),
    ],
  },
  CONGENIA: {
    source: 'CONGENIA',
    view: 'vw_congenia_fichas_anon',
    description: 'Fichas pediátricas genéticas vigentes y anonimizadas de CONGENIA.',
    fields: [
      field('fecha_consulta', 'date', ['fecha de consulta', 'periodo', 'mes'], ['count']),
      field('fecha_creacion', 'date', ['fecha de creación', 'fecha de registro'], ['count']),
      field('id_tenant', 'integer', ['institución', 'tenant']),
      field('origen_creacion', 'categorical', ['origen', 'forma de registro']),
      field('estado_ficha', 'categorical', ['estado de la ficha']),
      field('version_ficha', 'numeric', ['versión de ficha', 'revisión'], ['avg', 'min', 'max']),
      field('sexo', 'categorical', ['sexo del paciente']),
      field('diagnostico', 'categorical', ['diagnóstico', 'causa']),
      field('especialidad', 'categorical', ['especialidad', 'área médica', 'area medica']),
      field('referido_de', 'categorical', ['referido de', 'fuente de referencia', 'referencia']),
      field('asistencia_parto', 'categorical', ['asistencia del parto', 'atención del parto']),
      field('familiares_afectos', 'boolean', ['familiares afectados', 'antecedente familiar']),
      field('personas_hogar_menores', 'numeric', ['menores afectados en el hogar'], ['avg', 'min', 'max', 'sum']),
      field('personas_hogar_adultos', 'numeric', ['adultos afectados en el hogar'], ['avg', 'min', 'max', 'sum']),
      field('comunidad_afectada', 'categorical', ['comunidad afectada']),
      field('es_provisional', 'boolean', ['ficha provisional', 'historia provisional']),
      field('numero_familiares_afectados', 'numeric', ['cantidad de familiares afectados'], ['avg', 'min', 'max', 'sum']),
      field('numero_signos_alerta', 'numeric', ['cantidad de signos de alerta'], ['avg', 'min', 'max', 'sum']),
      field('numero_examenes', 'numeric', ['cantidad de exámenes', 'estudios indicados'], ['avg', 'min', 'max', 'sum']),
      field('numero_observaciones', 'numeric', ['cantidad de observaciones'], ['avg', 'min', 'max', 'sum']),
    ],
  },
};

function field(column, type, aliases = [], aggregations = ['count']) {
  return { concept: column, column, type, aliases, aggregations, sensitive: false };
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function semanticTokens(value) {
  const ignored = new Set(['cantidad', 'conteo', 'total', 'totales', 'numero', 'numeros', 'por', 'cada', 'del', 'las', 'los']);
  return normalize(value)
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length >= 4 && !ignored.has(token));
}

function fieldsForTerms(fields, terms) {
  const matched = new Set();
  for (const term of terms) {
    const exact = fields.filter((candidate) => {
      const haystack = normalize([candidate.concept, candidate.column, ...candidate.aliases].join(' '));
      return haystack.includes(term) || term.includes(normalize(candidate.concept));
    });
    const selected = exact.length > 0 ? exact : fields.filter((candidate) => {
      const fieldTokens = new Set(semanticTokens([candidate.concept, candidate.column, ...candidate.aliases].join(' ')));
      return semanticTokens(term).some((token) => fieldTokens.has(token));
    });
    for (const field of selected) matched.add(field);
  }
  return fields.filter((field) => matched.has(field));
}

function describeSemanticModel({ source, concepts } = {}) {
  const requestedSource = String(source ?? '').trim().toUpperCase();
  const selected = requestedSource && requestedSource !== 'ALL'
    ? [SOURCES[requestedSource]].filter(Boolean)
    : Object.values(SOURCES);
  if (selected.length === 0) {
    const err = new Error('La fuente semántica solicitada no existe.');
    err.status = 400;
    err.code = 'INVALID_SEMANTIC_SOURCE';
    throw err;
  }

  const terms = Array.isArray(concepts)
    ? concepts.map(normalize).filter(Boolean).slice(0, 10)
    : [];
  return {
    version: SEMANTIC_MODEL_VERSION,
    sources: selected.map((entry) => ({
      ...entry,
      fields: terms.length === 0
        ? entry.fields
        : fieldsForTerms(entry.fields, terms),
    })),
    rules: {
      aggregateOnly: true,
      maxRows: 50,
      crossSourceJoins: false,
      patientLevelData: false,
      rowMeaning: {
        SIGSA: 'Cada fila es una atención o registro de producción ambulatoria, no un paciente único.',
        CONGENIA: 'Cada fila es una ficha clínica vigente anonimizada.',
      },
      relativePeriods: 'Últimos N meses se ancla al mes de MAX(fecha) de la fuente.',
      multidimensionalRequests: 'Debe conservar todas las dimensiones solicitadas y devolver una fila por combinación antes del pivot.',
    },
  };
}

function sourceForView(view) {
  return Object.values(SOURCES).find((entry) => entry.view === view)?.source ?? null;
}

function allowedColumnsForView(view) {
  const source = Object.values(SOURCES).find((entry) => entry.view === view);
  return new Set(source?.fields.map((entry) => entry.column) ?? []);
}

module.exports = {
  SEMANTIC_MODEL_VERSION,
  SOURCES,
  allowedColumnsForView,
  describeSemanticModel,
  sourceForView,
};
