'use strict';

const crypto = require('crypto');
const { Parser } = require('node-sql-parser');
const { allowedColumnsForView, sourceForView } = require('./reporting-semantic-model');

const parser = new Parser();
const ALLOWED_TABLES = new Set(['vw_sigsa_consultas_anon', 'vw_congenia_fichas_anon']);
const ALLOWED_FUNCTIONS = new Set([
  'avg', 'btrim', 'coalesce', 'count', 'date_trunc', 'extract', 'lower',
  'max', 'min', 'nullif', 'round', 'sum', 'to_char', 'upper',
]);
const FORBIDDEN_PATTERN = /(;.*\S|--|\/\*|\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|execute|set|show|vacuum|analyze)\b)/i;
const MAX_SQL_LENGTH = 5000;
const FORBIDDEN_COLUMNS = new Set(['consulta_id', 'ficha_id']);

function appError(status, code, message) {
  const err = new Error(message ?? code);
  err.status = status;
  err.code = code;
  return err;
}

function scalarName(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value?.name)) return value.name.map(scalarName).filter(Boolean).join('.');
  return value?.value ?? value?.expr?.value ?? null;
}

function normalizeTableName(table) {
  return [table?.db, table?.schema, table?.table].filter(Boolean).join('.') || table?.table;
}

function walk(node, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((item) => walk(item, visitor));
    else walk(value, visitor);
  }
}

function cteNames(ast) {
  return new Set((ast.with ?? []).map((entry) => scalarName(entry.name)).filter(Boolean));
}

function collectTables(ast) {
  const ctes = cteNames(ast);
  const tables = [];
  walk(ast, (node) => {
    if (node.type !== 'select' || !Array.isArray(node.from)) return;
    if (node.from.length > 1 || node.from.some((entry) => entry.join)) {
      throw appError(400, 'SQL_JOIN_FORBIDDEN', 'No hay relaciones autorizadas para realizar joins.');
    }
    for (const entry of node.from) {
      const table = normalizeTableName(entry);
      if (table && !ctes.has(table)) tables.push(table);
    }
  });
  return [...new Set(tables)];
}

function collectAliases(ast) {
  const aliases = new Set();
  walk(ast, (node) => {
    if (node.type !== 'select') return;
    for (const column of node.columns ?? []) {
      if (column.as) aliases.add(String(column.as));
    }
  });
  return aliases;
}

function validateColumnsAndFunctions(ast, table) {
  const allowedColumns = allowedColumnsForView(table);
  const aliases = collectAliases(ast);
  walk(ast, (node) => {
    if (node.type === 'column_ref') {
      const column = scalarName(node.column);
      if (FORBIDDEN_COLUMNS.has(String(column).toLowerCase())) {
        throw appError(400, 'SQL_PHI_COLUMN_FORBIDDEN', 'La consulta intenta acceder a un identificador no autorizado.');
      }
      if (column && column !== '*' && !allowedColumns.has(column) && !aliases.has(column)) {
        throw appError(400, 'SQL_COLUMN_FORBIDDEN', `La columna ${column} no está autorizada.`);
      }
    }
    if (node.type === 'function' || node.type === 'aggr_func') {
      const name = String(scalarName(node.name) ?? '').toLowerCase();
      if (name && !ALLOWED_FUNCTIONS.has(name)) {
        throw appError(400, 'SQL_FUNCTION_FORBIDDEN', `La función ${name} no está autorizada.`);
      }
    }
  });
}

function hasTopLevelStar(ast) {
  return (ast.columns ?? []).some((column) =>
    column?.expr?.type === 'star'
    || (column?.expr?.type === 'column_ref' && scalarName(column.expr.column) === '*'));
}

function isAggregated(ast) {
  let aggregate = false;
  walk(ast, (node) => {
    if (node.type === 'aggr_func' || node.groupby) aggregate = true;
  });
  return aggregate;
}

function validateReportingSql(sql, expectedSource = null) {
  const text = String(sql ?? '').trim();
  if (!text) throw appError(400, 'SQL_EMPTY', 'La consulta generada está vacía.');
  if (text.length > MAX_SQL_LENGTH) throw appError(400, 'SQL_TOO_LONG', 'La consulta es demasiado larga.');
  if (FORBIDDEN_PATTERN.test(text)) {
    throw appError(400, 'SQL_FORBIDDEN', 'La consulta contiene operaciones no permitidas.');
  }

  let ast;
  try {
    ast = parser.astify(text, { database: 'Postgresql' });
  } catch (_err) {
    throw appError(400, 'SQL_INVALID', 'La consulta generada no es SQL válido.');
  }
  if (Array.isArray(ast)) throw appError(400, 'SQL_MULTIPLE', 'Solo se permite una sentencia.');
  if (ast.type !== 'select') throw appError(400, 'SQL_NOT_SELECT', 'Solo se permiten consultas SELECT.');
  if (hasTopLevelStar(ast)) throw appError(400, 'SQL_STAR_FORBIDDEN', 'SELECT * no está permitido.');

  const tables = collectTables(ast);
  if (tables.length === 0) throw appError(400, 'SQL_NO_SOURCE', 'La consulta no declara una fuente.');
  if (tables.length !== 1 || !ALLOWED_TABLES.has(tables[0])) {
    throw appError(400, 'SQL_SOURCE_FORBIDDEN', 'La consulta usa una fuente no autorizada.');
  }
  const source = sourceForView(tables[0]);
  if (expectedSource && String(expectedSource).toUpperCase() !== source) {
    throw appError(400, 'SQL_SOURCE_MISMATCH', 'La consulta no coincide con la fuente declarada.');
  }
  if (!isAggregated(ast)) {
    throw appError(400, 'SQL_NOT_AGGREGATED', 'El agente solo puede devolver resultados agregados.');
  }
  validateColumnsAndFunctions(ast, tables[0]);

  const normalizedSql = text.replace(/;+\s*$/, '');
  return {
    sql: normalizedSql,
    sqlHash: crypto.createHash('sha256').update(normalizedSql).digest('hex'),
    tables,
    source,
  };
}

module.exports = {
  validateReportingSql,
};
