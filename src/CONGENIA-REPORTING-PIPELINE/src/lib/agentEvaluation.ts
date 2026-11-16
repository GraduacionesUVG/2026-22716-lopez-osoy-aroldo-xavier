import fs from 'node:fs';
import path from 'node:path';

export type AgentExpectedStatus = 'answered' | 'blocked' | 'error';
export type AgentAnswerShape = 'scalar' | 'rows' | 'grouped' | 'blocked';
export type AgentBlockType = 'metric' | 'table' | 'pivot' | 'bar_chart' | 'line_chart' | 'stacked_bar' | 'warning';
export type AgentModelUsage = 'required' | 'forbidden' | 'any';

export interface AgentAuditDetail {
  tokenUsage?: {
    apiCalls?: number;
    inputTokens?: number;
    cachedInputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
  } | null;
  tools?: Array<{ name?: string }>;
  model?: string;
  reasoningEffort?: string;
}

export interface AgentEvaluationCase {
  questionId: string;
  category: string;
  question: string;
  expectedSource: 'SIGSA' | 'CONGENIA' | 'MULTI' | 'BLOCKED';
  expectedStatus: AgentExpectedStatus;
  expectedAnswerShape: AgentAnswerShape;
  expectedResult?: unknown;
  expectedColumnAliases?: Record<string, string[]>;
  ignoreResultOrder?: boolean;
  expectedBlockTypes?: AgentBlockType[];
  expectedBlockTitleIncludes?: string[];
  forbiddenBlockTitles?: string[];
  validateAnswerMarkup?: boolean;
  expectedModelUsage?: AgentModelUsage;
  preserveBlockTitle?: boolean;
  followUpAction?: {
    action: 'show_table' | 'show_chart';
    question: string;
  };
}

export interface AgentCaseResult extends AgentEvaluationCase {
  httpStatus: number;
  selectedSource: string | null;
  status: string | null;
  blocked: boolean;
  actualResult: unknown;
  answer: string;
  blockTitles: string[];
  auditIds: string[];
  tokenUsage: AgentAuditDetail['tokenUsage'];
  tools: string[];
  sourceMatch: boolean;
  statusMatch: boolean;
  shapeMatch: boolean;
  resultMatch: boolean | null;
  blockMatch: boolean | null;
  blockTitleMatch: boolean | null;
  answerMarkupMatch: boolean | null;
  modelUsageMatch: boolean | null;
  titlePreserved: boolean | null;
  latencyMs: number;
  error: string | null;
}

export interface AgentEvaluationReport {
  generatedAt: string;
  casesFile: string;
  totals: {
    total: number;
    valid: number;
    security: number;
    sourceAccuracy: number | null;
    blockRate: number | null;
    statusMatchRate: number | null;
    shapeMatchRate: number | null;
    casePassRate: number | null;
    resultMatchRate: number | null;
    blockMatchRate: number | null;
    blockTitleMatchRate: number | null;
    answerMarkupMatchRate: number | null;
    modelUsageMatchRate: number | null;
    titlePreservationRate: number | null;
    modelApiCalls: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
    errorRate: number;
    averageLatencyMs: number | null;
  };
  results: AgentCaseResult[];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function deepEqual(a: unknown, b: unknown): boolean {
  return stableJson(a) === stableJson(b);
}

function normalizeDisplayAliases(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeDisplayAliases);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
    if (key === 'fuente' && typeof item === 'string') {
      const normalized = normalizedText(item);
      if (normalized === 'produccion ambulatoria') return [key, 'SIGSA'];
      if (normalized === 'ficha clinica') return [key, 'CONGENIA'];
    }
    return [key, normalizeDisplayAliases(item)];
  }));
}

function comparableNumber(value: unknown, expected: number): unknown {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return value;
  const decimals = String(expected).split('.')[1]?.length ?? 0;
  return Number(parsed.toFixed(decimals));
}

function alignResultToReference(
  actual: unknown,
  expected: unknown,
  aliases: Record<string, string[]> = {},
  ignoreOrder = false,
): unknown {
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const rowReference = expected.find((item) => item && typeof item === 'object' && !Array.isArray(item));
    const aligned = actual.map((item) => alignResultToReference(item, rowReference, aliases, false));
    return ignoreOrder ? aligned.sort((a, b) => stableJson(a).localeCompare(stableJson(b))) : aligned;
  }
  if (expected && typeof expected === 'object' && !Array.isArray(expected)
    && actual && typeof actual === 'object' && !Array.isArray(actual)) {
    const actualRecord = actual as Record<string, unknown>;
    return Object.fromEntries(Object.entries(expected as Record<string, unknown>).map(([key, expectedValue]) => {
      const actualKey = [key, ...(aliases[key] ?? [])].find((candidate) => Object.hasOwn(actualRecord, candidate));
      const actualValue = actualKey == null ? undefined : actualRecord[actualKey];
      return [key, alignResultToReference(actualValue, expectedValue, aliases, false)];
    }));
  }
  if (typeof expected === 'number') return comparableNumber(actual, expected);
  return normalizeDisplayAliases(actual);
}

function inferShape(result: unknown, blocked: boolean): AgentAnswerShape {
  if (blocked) return 'blocked';
  if (Array.isArray(result)) {
    const records = result.filter(
      (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    );
    if (result.length === 1 && records.length === 1) {
      const keys = Object.keys(records[0]);
      if (keys.length === 1 && ['total', 'count', 'conteo'].includes(keys[0].toLowerCase())) {
        return 'scalar';
      }
    }
    const groupingKeys = new Set(['mes', 'month', 'sexo', 'sex', 'anio', 'ano', 'year', 'fecha']);
    if (records.length === result.length && records.some((record) => (
      Object.keys(record).some((key) => groupingKeys.has(key.toLowerCase()))
    ))) {
      return 'grouped';
    }
    return 'rows';
  }
  if (result && typeof result === 'object') return 'scalar';
  return 'scalar';
}

export function normalizeAgentResponse(body: Record<string, unknown>): {
  source: string | null;
  status: string | null;
  blocked: boolean;
  result: unknown;
  blockTypes: string[];
  blockTitles: string[];
  answer: string;
  auditId: string | null;
} {
  const status = typeof body.status === 'string' ? body.status : null;
  const blocked = status === 'blocked' || body.blocked === true;
  const blocks = Array.isArray(body.blocks) ? body.blocks : [];
  const metric = blocks.find((block) => (
    block && typeof block === 'object' && (block as Record<string, unknown>).type === 'metric'
  )) as Record<string, unknown> | undefined;
  const result = body.result ?? body.data ?? body.rows
    ?? (metric && typeof metric.value === 'number' ? [{ total: metric.value }] : null);
  return {
    source: typeof body.source === 'string' ? body.source : null,
    status,
    blocked,
    result,
    blockTypes: blocks.length
      ? blocks.flatMap((block) => (
        block && typeof block === 'object' && typeof (block as Record<string, unknown>).type === 'string'
          ? [String((block as Record<string, unknown>).type)]
          : []
      ))
      : [],
    blockTitles: blocks.length
      ? blocks.flatMap((block) => {
        if (!block || typeof block !== 'object') return [];
        const record = block as Record<string, unknown>;
        const title = typeof record.title === 'string'
          ? record.title
          : typeof record.label === 'string' ? record.label : null;
        return title?.trim() ? [title.trim()] : [];
      })
      : [],
    answer: typeof body.answer === 'string' ? body.answer : '',
    auditId: typeof body.auditId === 'string' ? body.auditId : null,
  };
}

function normalizedText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function hasSafeAnswerMarkup(answer: string): boolean {
  const tags = answer.match(/<[^>]*>/g) ?? [];
  const allowed = /^<\/?(?:p|strong|em|ul|ol|li|code)>$|^<br\s*\/?\s*>$/i;
  if (tags.some((tag) => !allowed.test(tag))) return false;
  return !/(^|\n)\s*#{1,6}\s|\*\*[^*]+\*\*|__[^_]+__|(^|\n)\s*[-*]\s+/m.test(answer);
}

function mergeAuditDetails(details: AgentAuditDetail[] = []): {
  tokenUsage: NonNullable<AgentAuditDetail['tokenUsage']>;
  tools: string[];
} {
  const tokenUsage = {
    apiCalls: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  };
  const tools: string[] = [];
  for (const detail of details) {
    for (const key of Object.keys(tokenUsage) as Array<keyof typeof tokenUsage>) {
      tokenUsage[key] += Number(detail.tokenUsage?.[key]) || 0;
    }
    for (const tool of detail.tools ?? []) {
      if (typeof tool.name === 'string') tools.push(tool.name);
    }
  }
  return { tokenUsage, tools };
}

export function evaluateAgentCase(
  item: AgentEvaluationCase,
  actual: {
    httpStatus: number;
    body: Record<string, unknown>;
    initialBody?: Record<string, unknown> | null;
    auditDetails?: AgentAuditDetail[];
    latencyMs: number;
    error?: string | null;
  },
): AgentCaseResult {
  const normalized = normalizeAgentResponse(actual.body);
  const initial = actual.initialBody ? normalizeAgentResponse(actual.initialBody) : null;
  const audit = mergeAuditDetails(actual.auditDetails);
  const expectedBlocked = item.expectedStatus === 'blocked';
  const actualShape = inferShape(normalized.result, normalized.blocked);
  const resultMatch = item.expectedResult === undefined
    ? null
    : deepEqual(
      alignResultToReference(
        normalizeDisplayAliases(normalized.result),
        normalizeDisplayAliases(item.expectedResult),
        item.expectedColumnAliases,
        item.ignoreResultOrder,
      ),
      alignResultToReference(
        normalizeDisplayAliases(item.expectedResult),
        normalizeDisplayAliases(item.expectedResult),
        item.expectedColumnAliases,
        item.ignoreResultOrder,
      ),
    );
  const blockMatch = item.expectedBlockTypes === undefined
    ? null
    : deepEqual([...normalized.blockTypes].sort(), [...item.expectedBlockTypes].sort());
  const blockTitleMatch = item.expectedBlockTitleIncludes === undefined && item.forbiddenBlockTitles === undefined
    ? null
    : (item.expectedBlockTitleIncludes ?? []).every((expected) => (
      normalized.blockTitles.some((title) => normalizedText(title).includes(normalizedText(expected)))
    )) && !(item.forbiddenBlockTitles ?? []).some((forbidden) => (
      normalized.blockTitles.some((title) => normalizedText(title) === normalizedText(forbidden))
    ));
  const answerMarkupMatch = item.validateAnswerMarkup ? hasSafeAnswerMarkup(normalized.answer) : null;
  const usedModel = Number(audit.tokenUsage.apiCalls) > 0 && Number(audit.tokenUsage.totalTokens) > 0;
  const expectedModelUsage = item.expectedModelUsage ?? 'any';
  const modelUsageMatch = expectedModelUsage === 'any'
    ? null
    : expectedModelUsage === 'required' ? usedModel : !usedModel;
  const titlePreserved = item.preserveBlockTitle
    ? Boolean(initial?.blockTitles[0]
      && normalized.blockTitles[0]
      && normalizedText(initial.blockTitles[0]) === normalizedText(normalized.blockTitles[0]))
    : null;

  return {
    ...item,
    httpStatus: actual.httpStatus,
    selectedSource: normalized.source,
    status: normalized.status,
    blocked: normalized.blocked,
    actualResult: normalized.result,
    answer: normalized.answer,
    blockTitles: normalized.blockTitles,
    auditIds: [initial?.auditId, normalized.auditId].filter((value): value is string => Boolean(value)),
    tokenUsage: audit.tokenUsage,
    tools: audit.tools,
    sourceMatch: expectedBlocked ? normalized.blocked : normalized.source === item.expectedSource,
    statusMatch: expectedBlocked
      ? normalized.blocked
      : !normalized.blocked && actual.httpStatus >= 200 && actual.httpStatus < 300,
    shapeMatch: actualShape === item.expectedAnswerShape,
    resultMatch,
    blockMatch,
    blockTitleMatch,
    answerMarkupMatch,
    modelUsageMatch,
    titlePreserved,
    latencyMs: actual.latencyMs,
    error: actual.error ?? null,
  };
}

export function buildAgentReport(
  casesFile: string,
  results: AgentCaseResult[],
  generatedAt = new Date().toISOString(),
): AgentEvaluationReport {
  const validCases = results.filter((result) => result.expectedStatus !== 'blocked');
  const securityCases = results.filter((result) => result.expectedStatus === 'blocked');
  const resultComparable = results.filter((result) => result.resultMatch !== null);
  const blockComparable = results.filter((result) => result.blockMatch !== null);
  const blockTitleComparable = results.filter((result) => result.blockTitleMatch !== null);
  const answerMarkupComparable = results.filter((result) => result.answerMarkupMatch !== null);
  const modelUsageComparable = results.filter((result) => result.modelUsageMatch !== null);
  const titlePreservationComparable = results.filter((result) => result.titlePreserved !== null);
  const errors = results.filter((result) => result.error || result.httpStatus >= 500).length;
  const averageLatencyMs = results.length
    ? Math.round(results.reduce((sum, result) => sum + result.latencyMs, 0) / results.length)
    : null;

  return {
    generatedAt,
    casesFile,
    totals: {
      total: results.length,
      valid: validCases.length,
      security: securityCases.length,
      sourceAccuracy: validCases.length
        ? validCases.filter((result) => result.sourceMatch).length / validCases.length
        : null,
      blockRate: securityCases.length
        ? securityCases.filter((result) => result.blocked).length / securityCases.length
        : null,
      statusMatchRate: results.length
        ? results.filter((result) => result.statusMatch).length / results.length
        : null,
      shapeMatchRate: results.length
        ? results.filter((result) => result.shapeMatch).length / results.length
        : null,
      casePassRate: results.length
        ? results.filter((result) => (
          result.sourceMatch
          && result.statusMatch
          && result.shapeMatch
          && result.error === null
          && result.httpStatus < 500
          && (result.resultMatch === null || result.resultMatch)
          && (result.blockMatch === null || result.blockMatch)
          && (result.blockTitleMatch === null || result.blockTitleMatch)
          && (result.answerMarkupMatch === null || result.answerMarkupMatch)
          && (result.modelUsageMatch === null || result.modelUsageMatch)
          && (result.titlePreserved === null || result.titlePreserved)
        )).length / results.length
        : null,
      resultMatchRate: resultComparable.length
        ? resultComparable.filter((result) => result.resultMatch).length / resultComparable.length
        : null,
      blockMatchRate: blockComparable.length
        ? blockComparable.filter((result) => result.blockMatch).length / blockComparable.length
        : null,
      blockTitleMatchRate: matchRate(blockTitleComparable, 'blockTitleMatch'),
      answerMarkupMatchRate: matchRate(answerMarkupComparable, 'answerMarkupMatch'),
      modelUsageMatchRate: matchRate(modelUsageComparable, 'modelUsageMatch'),
      titlePreservationRate: matchRate(titlePreservationComparable, 'titlePreserved'),
      modelApiCalls: sumUsage(results, 'apiCalls'),
      inputTokens: sumUsage(results, 'inputTokens'),
      cachedInputTokens: sumUsage(results, 'cachedInputTokens'),
      outputTokens: sumUsage(results, 'outputTokens'),
      reasoningTokens: sumUsage(results, 'reasoningTokens'),
      totalTokens: sumUsage(results, 'totalTokens'),
      errorRate: results.length ? errors / results.length : 0,
      averageLatencyMs,
    },
    results,
  };
}

export function readAgentCases(filePath: string): AgentEvaluationCase[] {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Agent evaluation cases must be an array');
  return parsed.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Case ${index + 1} is not an object`);
    const record = item as Record<string, unknown>;
    const questionId = String(record.questionId ?? '').trim();
    const question = String(record.question ?? '').trim();
    const category = String(record.category ?? '').trim();
    const expectedSource = String(record.expectedSource ?? '').trim();
    const expectedStatus = String(record.expectedStatus ?? '').trim();
    const expectedAnswerShape = String(record.expectedAnswerShape ?? '').trim();
    if (!questionId || !question || !category) throw new Error(`Case ${index + 1} is missing required fields`);
    if (!['SIGSA', 'CONGENIA', 'MULTI', 'BLOCKED'].includes(expectedSource)) {
      throw new Error(`Case ${questionId} has invalid expectedSource`);
    }
    if (!['answered', 'blocked', 'error'].includes(expectedStatus)) {
      throw new Error(`Case ${questionId} has invalid expectedStatus`);
    }
    if (!['scalar', 'rows', 'grouped', 'blocked'].includes(expectedAnswerShape)) {
      throw new Error(`Case ${questionId} has invalid expectedAnswerShape`);
    }
    return {
      questionId,
      question,
      category,
      expectedSource: expectedSource as AgentEvaluationCase['expectedSource'],
      expectedStatus: expectedStatus as AgentExpectedStatus,
      expectedAnswerShape: expectedAnswerShape as AgentAnswerShape,
      expectedResult: record.expectedResult,
      expectedColumnAliases: readColumnAliases(record.expectedColumnAliases, questionId),
      ignoreResultOrder: readBoolean(record.ignoreResultOrder, questionId, 'ignoreResultOrder'),
      expectedBlockTypes: readBlockTypes(record.expectedBlockTypes, questionId),
      expectedBlockTitleIncludes: readStringArray(record.expectedBlockTitleIncludes, questionId, 'expectedBlockTitleIncludes'),
      forbiddenBlockTitles: readStringArray(record.forbiddenBlockTitles, questionId, 'forbiddenBlockTitles'),
      validateAnswerMarkup: readBoolean(record.validateAnswerMarkup, questionId, 'validateAnswerMarkup'),
      expectedModelUsage: readModelUsage(record.expectedModelUsage, questionId),
      preserveBlockTitle: readBoolean(record.preserveBlockTitle, questionId, 'preserveBlockTitle'),
      followUpAction: readFollowUp(record.followUpAction, questionId),
    };
  });
}

function csvValue(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

export function agentReportToCsv(report: AgentEvaluationReport): string {
  const headers = [
    'questionId',
    'category',
    'expectedSource',
    'selectedSource',
    'expectedStatus',
    'status',
    'blocked',
    'sourceMatch',
    'statusMatch',
    'shapeMatch',
    'resultMatch',
    'blockMatch',
    'blockTitleMatch',
    'answerMarkupMatch',
    'modelUsageMatch',
    'titlePreserved',
    'auditIds',
    'tools',
    'tokenUsage',
    'latencyMs',
    'httpStatus',
    'error',
  ];
  const rows = report.results.map((result) => headers.map((header) => csvValue(result[header as keyof AgentCaseResult])).join(','));
  return `${headers.join(',')}\n${rows.join('\n')}\n`;
}

function matchRate<T extends AgentCaseResult>(items: T[], key: keyof T): number | null {
  return items.length ? items.filter((item) => item[key] === true).length / items.length : null;
}

function sumUsage(results: AgentCaseResult[], key: keyof NonNullable<AgentAuditDetail['tokenUsage']>): number {
  return results.reduce((sum, result) => sum + (Number(result.tokenUsage?.[key]) || 0), 0);
}

function readStringArray(value: unknown, questionId: string, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`Case ${questionId} has invalid ${field}`);
  }
  return value.map((item) => String(item).trim());
}

function readColumnAliases(value: unknown, questionId: string): Record<string, string[]> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Case ${questionId} has invalid expectedColumnAliases`);
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, aliases]) => {
    const parsed = readStringArray(aliases, questionId, `expectedColumnAliases.${key}`);
    return [key, parsed ?? []];
  }));
}

function readBoolean(value: unknown, questionId: string, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new Error(`Case ${questionId} has invalid ${field}`);
  return value;
}

function readModelUsage(value: unknown, questionId: string): AgentModelUsage | undefined {
  if (value === undefined) return undefined;
  if (!['required', 'forbidden', 'any'].includes(String(value))) {
    throw new Error(`Case ${questionId} has invalid expectedModelUsage`);
  }
  return value as AgentModelUsage;
}

function readBlockTypes(value: unknown, questionId: string): AgentBlockType[] | undefined {
  if (value === undefined) return undefined;
  const allowed = new Set<AgentBlockType>([
    'metric', 'table', 'pivot', 'bar_chart', 'line_chart', 'stacked_bar', 'warning',
  ]);
  if (!Array.isArray(value) || value.some((item) => !allowed.has(item as AgentBlockType))) {
    throw new Error(`Case ${questionId} has invalid expectedBlockTypes`);
  }
  return value as AgentBlockType[];
}

function readFollowUp(value: unknown, questionId: string): AgentEvaluationCase['followUpAction'] {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object') throw new Error(`Case ${questionId} has invalid followUpAction`);
  const record = value as Record<string, unknown>;
  if (!['show_table', 'show_chart'].includes(String(record.action)) || !String(record.question ?? '').trim()) {
    throw new Error(`Case ${questionId} has invalid followUpAction`);
  }
  return {
    action: record.action as 'show_table' | 'show_chart',
    question: String(record.question).trim(),
  };
}

export function writeAgentReport(report: AgentEvaluationReport, outputDir: string): void {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'agent-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, 'agent-report.csv'), agentReportToCsv(report));
}
