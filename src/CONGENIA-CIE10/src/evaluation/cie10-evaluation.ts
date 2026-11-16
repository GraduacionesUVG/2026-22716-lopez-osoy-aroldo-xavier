import fs from "node:fs";
import path from "node:path";
import type { AiProvider, AiResponse, Cie10CatalogCsvRow, Cie10ReferenceCsvRow, RagCandidate } from "../types.js";
import { catalogEntries, normalizeCie10Code, referenceCatalogEntries } from "../pipeline/normalize.js";
import {
  addTokenUsage,
  emptyTokenUsage,
  type TokenUsage,
} from "../ai/usage.js";
import { MAX_CIE10_SUGGESTIONS } from "../suggestion-limits.js";

export interface Cie10EvaluationCase {
  codigoTraductor: string;
  diagnostico: string;
  expectedCodes: string[];
  notes?: string;
  fixtureSuggestions?: string[];
}

export interface Cie10EvaluationResult extends Cie10EvaluationCase {
  status: "suggestions" | "insufficient_information" | "error";
  suggestedCodes: string[];
  invalidCodes: string[];
  top1Match: boolean;
  top3Match: boolean;
  top5Match: boolean;
  top10Match: boolean;
  reciprocalRank: number;
  retrievalEvaluated: boolean;
  retrievedCodes: string[];
  retrievalTop1Match: boolean;
  retrievalTop3Match: boolean;
  retrievalTop5Match: boolean;
  retrievalReciprocalRank: number;
  abstained: boolean;
  emptySuggestion: boolean;
  error: string | null;
  latencyMs: number;
  tokenUsage: TokenUsage;
}

export interface Cie10EvaluationReport {
  generatedAt: string;
  casesFile: string;
  provider: string;
  totals: {
    total: number;
    top1Accuracy: number;
    top3Accuracy: number;
    top5Accuracy: number;
    meanReciprocalRank: number;
    suggestionResponseRate: number;
    averageSuggestionCount: number;
    minimumSuggestionComplianceRate: number;
    top10Accuracy: number;
    abstentionRate: number;
    invalidCodeRate: number;
    catalogMismatchRate: number;
    emptySuggestionRate: number;
    errorRate: number;
    averageLatencyMs: number | null;
    tokenUsage: TokenUsage;
    retrieval: {
      evaluatedCases: number;
      recallAt1: number | null;
      recallAt3: number | null;
      recallAt5: number | null;
      meanReciprocalRank: number | null;
    };
  };
  embeddingMetrics?: {
    requests: number;
    inputTokens: number;
    errors: number;
    totalLatencyMs: number;
  };
  results: Cie10EvaluationResult[];
}

export function readCie10EvaluationCases(filePath: string): Cie10EvaluationCase[] {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  if (!Array.isArray(parsed)) throw new Error("CIE10 evaluation cases must be an array");
  return parsed.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`Case ${index + 1} is not an object`);
    const record = item as Record<string, unknown>;
    const codigoTraductor = String(record.codigoTraductor ?? "").trim();
    const diagnostico = String(record.diagnostico ?? "").trim();
    const expectedCodes = Array.isArray(record.expectedCodes)
      ? record.expectedCodes.map((code) => normalizeCie10Code(String(code))).filter(Boolean)
      : [];
    if (!codigoTraductor || !diagnostico || expectedCodes.length === 0) {
      throw new Error(`Case ${index + 1} is missing codigoTraductor, diagnostico or expectedCodes`);
    }
    return {
      codigoTraductor,
      diagnostico,
      expectedCodes,
      notes: typeof record.notes === "string" ? record.notes : undefined,
      fixtureSuggestions: Array.isArray(record.fixtureSuggestions)
        ? record.fixtureSuggestions.map((code) => normalizeCie10Code(String(code))).filter(Boolean)
        : undefined,
    };
  });
}

export function catalogCodeSet(rows: Cie10CatalogCsvRow[]): Set<string> {
  return new Set(catalogEntries(rows).map((entry) => entry.codigo));
}

export function referenceCodeSet(rows: Cie10ReferenceCsvRow[]): Set<string> {
  return new Set(referenceCatalogEntries(rows).keys());
}

export class FixtureCie10Provider implements AiProvider {
  constructor(private readonly cases: Cie10EvaluationCase[]) {}

  async classify(diagnosisText: string): Promise<AiResponse> {
    const item = this.cases.find((candidate) => candidate.diagnostico === diagnosisText);
    const codes = item?.fixtureSuggestions ?? item?.expectedCodes ?? [];
    if (codes.length === 0) {
      return { status: "insufficient_information", suggestions: [], reason: "No fixture suggestions configured." };
    }
    return {
      status: "suggestions",
      reason: "Fixture provider for deterministic evaluation smoke tests.",
      suggestions: codes.slice(0, MAX_CIE10_SUGGESTIONS).map((codigo) => ({
        codigo,
        descripcion: `Fixture ${codigo}`,
        razonamiento: "Sugerencia deterministica de prueba.",
      })),
    };
  }
}

function uniqueCodes(codes: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const code of codes.map(normalizeCie10Code).filter(Boolean)) {
    if (seen.has(code)) continue;
    seen.add(code);
    output.push(code);
  }
  return output;
}

export async function evaluateCie10Cases(options: {
  cases: Cie10EvaluationCase[];
  provider: AiProvider;
  providerName: string;
  casesFile: string;
  catalogCodes?: Set<string>;
  resolveCandidates?: (diagnosisText: string) => Promise<RagCandidate[]>;
  generatedAt?: string;
}): Promise<Cie10EvaluationReport> {
  const results: Cie10EvaluationResult[] = [];
  const catalogCodes = options.catalogCodes ?? new Set(options.cases.flatMap((item) => item.expectedCodes));

  for (const item of options.cases) {
    const started = Date.now();
    try {
      const candidates = options.resolveCandidates ? await options.resolveCandidates(item.diagnostico) : [];
      const retrievedCodes = uniqueCodes(candidates.map((candidate) => candidate.codigo));
      let response = await options.provider.classify(item.diagnostico, candidates);
      let tokenUsage = response.usage ?? emptyTokenUsage();
      for (let attempt = 0;
        response.status === "suggestions" && response.suggestions.length < MAX_CIE10_SUGGESTIONS && attempt < 2;
        attempt += 1) {
        const acceptedCodes = uniqueCodes(response.suggestions.map((suggestion) => suggestion.codigo));
        response = await options.provider.classify(item.diagnostico, candidates, {
          acceptedCodes,
          rejectedCodes: [],
        });
        tokenUsage = addTokenUsage(tokenUsage, response.usage);
      }
      const suggestedCodes = uniqueCodes(response.suggestions.map((suggestion) => suggestion.codigo))
        .slice(0, MAX_CIE10_SUGGESTIONS);
      const invalidCodes = suggestedCodes.filter((code) => !catalogCodes.has(code));
      const validSuggestedCodes = suggestedCodes.filter((code) => catalogCodes.has(code));
      const expected = new Set(item.expectedCodes.map(normalizeCie10Code));
      const firstMatch = validSuggestedCodes.findIndex((code) => expected.has(code));
      const firstRetrievedMatch = retrievedCodes.findIndex((code) => expected.has(code));
      results.push({
        ...item,
        status: response.status,
        suggestedCodes,
        invalidCodes,
        top1Match: validSuggestedCodes.slice(0, 1).some((code) => expected.has(code)),
        top3Match: validSuggestedCodes.slice(0, 3).some((code) => expected.has(code)),
        top5Match: validSuggestedCodes.slice(0, 5).some((code) => expected.has(code)),
        top10Match: validSuggestedCodes.some((code) => expected.has(code)),
        reciprocalRank: firstMatch >= 0 ? 1 / (firstMatch + 1) : 0,
        retrievalEvaluated: Boolean(options.resolveCandidates),
        retrievedCodes,
        retrievalTop1Match: retrievedCodes.slice(0, 1).some((code) => expected.has(code)),
        retrievalTop3Match: retrievedCodes.slice(0, 3).some((code) => expected.has(code)),
        retrievalTop5Match: retrievedCodes.slice(0, 5).some((code) => expected.has(code)),
        retrievalReciprocalRank: firstRetrievedMatch >= 0 ? 1 / (firstRetrievedMatch + 1) : 0,
        abstained: response.status === "insufficient_information",
        emptySuggestion: response.status === "suggestions" && suggestedCodes.length === 0,
        error: null,
        latencyMs: Date.now() - started,
        tokenUsage,
      });
    } catch (error) {
      results.push({
        ...item,
        status: "error",
        suggestedCodes: [],
        invalidCodes: [],
        top1Match: false,
        top3Match: false,
        top5Match: false,
        top10Match: false,
        reciprocalRank: 0,
        retrievalEvaluated: Boolean(options.resolveCandidates),
        retrievedCodes: [],
        retrievalTop1Match: false,
        retrievalTop3Match: false,
        retrievalTop5Match: false,
        retrievalReciprocalRank: 0,
        abstained: false,
        emptySuggestion: true,
        error: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - started,
        tokenUsage: emptyTokenUsage(),
      });
    }
  }

  return buildCie10Report(options.casesFile, options.providerName, results, options.generatedAt);
}

export function buildCie10Report(
  casesFile: string,
  provider: string,
  results: Cie10EvaluationResult[],
  generatedAt = new Date().toISOString(),
): Cie10EvaluationReport {
  const total = results.length;
  const invalidSuggestions = results.reduce((sum, result) => sum + result.invalidCodes.length, 0);
  const totalSuggestions = results.reduce((sum, result) => sum + result.suggestedCodes.length, 0);
  const suggestionResults = results.filter((result) => result.status === "suggestions");
  const catalogMismatchCount = results.filter(
    (result) => result.suggestedCodes.length > 0 && result.suggestedCodes.every((code) => !result.expectedCodes.includes(code)),
  ).length;
  const averageLatencyMs = total
    ? Math.round(results.reduce((sum, result) => sum + result.latencyMs, 0) / total)
    : null;
  const tokenUsage = results.reduce(
    (sum, result) => addTokenUsage(sum, result.tokenUsage),
    emptyTokenUsage(),
  );
  const retrievalResults = results.filter((result) => result.retrievalEvaluated);
  const retrievalTotal = retrievalResults.length;

  return {
    generatedAt,
    casesFile,
    provider,
    totals: {
      total,
      top1Accuracy: total ? results.filter((result) => result.top1Match).length / total : 0,
      top3Accuracy: total ? results.filter((result) => result.top3Match).length / total : 0,
      top5Accuracy: total ? results.filter((result) => result.top5Match).length / total : 0,
      meanReciprocalRank: total ? results.reduce((sum, result) => sum + result.reciprocalRank, 0) / total : 0,
      top10Accuracy: total ? results.filter((result) => result.top10Match).length / total : 0,
      suggestionResponseRate: total ? suggestionResults.length / total : 0,
      averageSuggestionCount: suggestionResults.length
        ? suggestionResults.reduce((sum, result) => sum + result.suggestedCodes.length, 0) / suggestionResults.length
        : 0,
      minimumSuggestionComplianceRate: suggestionResults.length
        ? suggestionResults.filter((result) => result.suggestedCodes.length === MAX_CIE10_SUGGESTIONS).length
          / suggestionResults.length
        : 0,
      abstentionRate: total ? results.filter((result) => result.abstained).length / total : 0,
      invalidCodeRate: totalSuggestions ? invalidSuggestions / totalSuggestions : 0,
      catalogMismatchRate: total ? catalogMismatchCount / total : 0,
      emptySuggestionRate: total ? results.filter((result) => result.emptySuggestion).length / total : 0,
      errorRate: total ? results.filter((result) => result.status === "error").length / total : 0,
      averageLatencyMs,
      tokenUsage,
      retrieval: {
        evaluatedCases: retrievalTotal,
        recallAt1: retrievalTotal
          ? retrievalResults.filter((result) => result.retrievalTop1Match).length / retrievalTotal
          : null,
        recallAt3: retrievalTotal
          ? retrievalResults.filter((result) => result.retrievalTop3Match).length / retrievalTotal
          : null,
        recallAt5: retrievalTotal
          ? retrievalResults.filter((result) => result.retrievalTop5Match).length / retrievalTotal
          : null,
        meanReciprocalRank: retrievalTotal
          ? retrievalResults.reduce((sum, result) => sum + result.retrievalReciprocalRank, 0) / retrievalTotal
          : null,
      },
    },
    results,
  };
}

function csvValue(value: unknown): string {
  const text = Array.isArray(value)
    ? value.join("|")
    : value && typeof value === "object"
      ? JSON.stringify(value)
      : String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export function cie10ReportToCsv(report: Cie10EvaluationReport): string {
  const headers = [
    "codigoTraductor",
    "diagnostico",
    "expectedCodes",
    "suggestedCodes",
    "invalidCodes",
    "status",
    "top1Match",
    "top3Match",
    "top5Match",
    "top10Match",
    "reciprocalRank",
    "retrievedCodes",
    "retrievalTop1Match",
    "retrievalTop3Match",
    "retrievalTop5Match",
    "retrievalReciprocalRank",
    "abstained",
    "latencyMs",
    "tokenUsage",
    "notes",
    "error",
  ];
  const rows = report.results.map((result) => headers.map((header) => csvValue(result[header as keyof Cie10EvaluationResult])).join(","));
  return `${headers.join(",")}\n${rows.join("\n")}\n`;
}

export function writeCie10Report(report: Cie10EvaluationReport, outputDir: string, name: string): void {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, `${name}-report.json`), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, `${name}-report.csv`), cie10ReportToCsv(report));
}
