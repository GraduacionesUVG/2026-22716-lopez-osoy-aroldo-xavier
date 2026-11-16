import type { AppConfig } from "../config.js";
import { createHash } from "node:crypto";
import type { Cie10Repository } from "../db/postgres.js";
import type {
  AiProvider,
  CatalogEntry,
  ClinicalRecordSource,
  RagCandidate,
  RagCatalog,
  SuggestionResult,
  ValidatedSuggestion,
} from "../types.js";
import {
  buildCatalogMaps,
  catalogEntries,
  normalizeCie10Code,
  normalizeText,
  pendingRecords,
} from "./normalize.js";
import { MAX_CIE10_SUGGESTIONS, MIN_CIE10_SUGGESTIONS } from "../suggestion-limits.js";
import {
  addTokenUsage,
  emptyTokenUsage,
  type TokenUsage,
} from "../ai/usage.js";

interface RunCounts {
  processedCount: number;
  suggestionCount: number;
  errorCount: number;
  tokenUsage: TokenUsage;
}

class ClassificationError extends Error {
  constructor(message: string, readonly tokenUsage: TokenUsage) {
    super(message);
  }
}

function confidenceForSuggestion(
  support: ValidatedSuggestion["soporte"],
  candidate: RagCandidate | undefined,
): ValidatedSuggestion["confianza"] {
  const exactMatch = candidate?.matchType === "EXACT_CODE" || candidate?.matchType === "EXACT_TEXT";
  const strongLexicalMatch = candidate?.matchType === "LEXICAL" && (candidate.score ?? 0) >= 65;
  const supportedLexicalMatch = candidate?.matchType === "LEXICAL" && (candidate.score ?? 0) >= 45;
  const strongSemanticMatch = candidate?.matchType === "SEMANTIC"
    && candidate.distance != null && candidate.distance <= 0.25;
  const supportedSemanticMatch = candidate?.matchType === "SEMANTIC"
    && candidate.distance != null && candidate.distance <= 0.45;

  if (support === "VALIDADO_INSTITUCIONAL"
    && (exactMatch || strongLexicalMatch || strongSemanticMatch)) return "ALTA";
  if (support !== "REQUIERE_ATENCION"
    && (exactMatch || supportedLexicalMatch || supportedSemanticMatch)) return "MEDIA";
  return "BAJA";
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry<T>(
  operation: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number,
  onError?: (error: unknown) => void,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      onError?.(error);
      if (attempt === maxRetries) break;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}

function errorTokenUsage(error: unknown): TokenUsage | null {
  if (!error || typeof error !== "object" || !("tokenUsage" in error)) return null;
  const usage = (error as { tokenUsage?: TokenUsage | null }).tokenUsage;
  return usage ?? null;
}

export function enrichSuggestions(
  rawSuggestions: Array<{
    codigo: string;
    descripcion: string;
    razonamiento?: string | null;
    informacionFaltante?: string[];
  }>,
  byCodigo: Map<string, CatalogEntry>,
  candidates: RagCandidate[],
): ValidatedSuggestion[] {
  const seen = new Set<string>();
  const validated: ValidatedSuggestion[] = [];
  const candidateByCode = new Map(candidates.map((candidate) => [candidate.codigo, candidate]));
  for (const suggestion of rawSuggestions.slice(0, MAX_CIE10_SUGGESTIONS)) {
    const code = normalizeCie10Code(suggestion.codigo);
    if (!/^[A-Z]\d{2}(?:\.[0-9A-Z]{1,4})?$/.test(code) || seen.has(code)) continue;
    const entry = byCodigo.get(code);
    const candidate = candidateByCode.get(code);
    const descripcionModelo = normalizeText(suggestion.descripcion);
    seen.add(code);
    const soporte = entry
      ? "VALIDADO_INSTITUCIONAL"
      : candidate?.enReferenciaExterna
        ? "REFERENCIA_EXTERNA"
        : "REQUIERE_ATENCION";
    const confianza = confidenceForSuggestion(soporte, candidate);
    validated.push({
      codigo: code,
      descripcionModelo,
      codigoInternoCatalogo: entry?.codigoInterno ?? null,
      nombreCatalogo: entry?.nombre ?? candidate?.descripcionReferencia ?? descripcionModelo,
      razonamiento: suggestion.razonamiento ? normalizeText(suggestion.razonamiento).slice(0, 200) : null,
      soporte,
      confianza,
      distanciaRag: candidate?.distance ?? null,
      informacionFaltante: Array.isArray(suggestion.informacionFaltante)
        ? suggestion.informacionFaltante.map(normalizeText).filter(Boolean).slice(0, 6)
        : [],
    });
  }
  return validated;
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function classifyWithRag({
  diagnosisText,
  aiProvider,
  byCodigo,
  maxRetries,
  retryBaseDelayMs,
  repairAttempts,
  candidates,
}: {
  diagnosisText: string;
  aiProvider: AiProvider;
  byCodigo: Map<string, CatalogEntry>;
  maxRetries: number;
  retryBaseDelayMs: number;
  repairAttempts: number;
  candidates: RagCandidate[];
}): Promise<{
  response: Awaited<ReturnType<AiProvider["classify"]>>;
  suggestions: ValidatedSuggestion[];
  tokenUsage: TokenUsage;
}> {
  let tokenUsage = emptyTokenUsage();
  let response;
  try {
    response = await retry(
      () => aiProvider.classify(diagnosisText, candidates),
      maxRetries,
      retryBaseDelayMs,
      (error) => { tokenUsage = addTokenUsage(tokenUsage, errorTokenUsage(error)); },
    );
  } catch (error) {
    throw new ClassificationError(errorToMessage(error), tokenUsage);
  }
  tokenUsage = addTokenUsage(tokenUsage, response.usage);

  if (response.status === "insufficient_information") return { response, suggestions: [], tokenUsage };
  let suggestions = enrichSuggestions(response.suggestions, byCodigo, candidates);
  for (let attempt = 0; suggestions.length < MAX_CIE10_SUGGESTIONS && attempt < repairAttempts; attempt += 1) {
    const acceptedCodes = suggestions.map((suggestion) => suggestion.codigo);
    const accepted = new Set(acceptedCodes);
    const rejectedCodes = response.suggestions
      .map((suggestion) => normalizeCie10Code(suggestion.codigo))
      .filter((code) => code && !accepted.has(code));
    response = await aiProvider.classify(diagnosisText, candidates, { acceptedCodes, rejectedCodes });
    tokenUsage = addTokenUsage(tokenUsage, response.usage);
    if (response.status === "insufficient_information") return { response, suggestions: [], tokenUsage };
    suggestions = enrichSuggestions(response.suggestions, byCodigo, candidates);
  }
  if (suggestions.length < MIN_CIE10_SUGGESTIONS) {
    throw new ClassificationError("CIE10_NO_VALID_SUGGESTIONS", tokenUsage);
  }
  return { response, suggestions, tokenUsage };
}

export async function runCie10Batch(options: {
  config: AppConfig;
  source: ClinicalRecordSource;
  repository: Cie10Repository;
  aiProvider: AiProvider;
  ragCatalog: RagCatalog;
}): Promise<{ runId: string; counts: RunCounts }> {
  const { config, source, repository, aiProvider, ragCatalog } = options;
  const ragVersion = await ragCatalog.activeVersion();
  const runId = await repository.createRun({
    model: config.openAiModel,
    promptVersion: config.promptVersion,
    sourceCatalogUri: source.sourceCatalogUri,
    sourceTranslatorUri: source.sourceTranslatorUri,
    maxRecords: config.maxRecords,
    ragVersion,
    periodo: config.batchPeriod,
  });
  const counts: RunCounts = {
    processedCount: 0,
    suggestionCount: 0,
    errorCount: 0,
    tokenUsage: emptyTokenUsage(),
  };

  try {
    const [catalogRows, translatorRows] = await Promise.all([
      source.readCatalog(),
      source.readTranslator(),
    ]);
    const entries = catalogEntries(catalogRows);
    if (entries.length === 0) {
      throw new Error("CIE10 catalog snapshot did not produce any valid entries");
    }
    const catalogMaps = buildCatalogMaps(entries);
    await repository.replaceCatalog(entries);

    const records = pendingRecords(translatorRows, catalogMaps);

    for (const [index, record] of records.entries()) {
      if (config.maxRecords !== null && counts.processedCount >= config.maxRecords) break;
      if (await repository.hasMedicalDecision(record.codigoTraductor)) {
        continue;
      }
      if (!config.force && await repository.alreadyProcessed(record.codigoTraductor)) {
        continue;
      }

      let result: SuggestionResult;
      const inputSha256 = createHash("sha256").update(record.diagnostico).digest("hex");
      try {
        const candidates = await ragCatalog.search(record.diagnostico, ragVersion, 20);
        const { response: aiResponse, suggestions, tokenUsage } = await classifyWithRag({
          diagnosisText: record.diagnostico,
          aiProvider,
          byCodigo: catalogMaps.byCodigo,
          maxRetries: config.maxRetries,
          retryBaseDelayMs: config.retryBaseDelayMs,
          repairAttempts: config.repairAttempts,
          candidates,
        });
        result = {
          codigoTraductor: record.codigoTraductor,
          diagnostico: record.diagnostico,
          cie10Original: record.cie10Original,
          aiStatus: aiResponse.status === "suggestions" && suggestions.length > 0
            ? "suggestions"
            : "insufficient_information",
          sugerencias: suggestions,
          razonamientoClinico: aiResponse.reason,
          error: null,
          modelo: config.openAiModel,
          procesadoEn: new Date().toISOString(),
          tokenUsage,
          ragVersion,
          inputSha256,
        };
      } catch (error) {
        counts.errorCount += 1;
        const tokenUsage = error instanceof ClassificationError ? error.tokenUsage : emptyTokenUsage();
        result = {
          codigoTraductor: record.codigoTraductor,
          diagnostico: record.diagnostico,
          cie10Original: record.cie10Original,
          aiStatus: "error",
          sugerencias: [],
          razonamientoClinico: null,
          error: errorToMessage(error),
          modelo: config.openAiModel,
          procesadoEn: new Date().toISOString(),
          tokenUsage,
          ragVersion,
          inputSha256,
        };
      }

      counts.processedCount += 1;
      counts.suggestionCount += result.sugerencias.length;
      counts.tokenUsage = addTokenUsage(counts.tokenUsage, result.tokenUsage);
      await repository.saveSuggestion(runId, result, config.force);

      if (index < records.length - 1) {
        await sleep(config.requestDelayMs);
      }
    }

    await repository.finishRun(runId, "COMPLETED", counts);
    return { runId, counts };
  } catch (error) {
    await repository.finishRun(runId, "FAILED", { ...counts, error: errorToMessage(error) }).catch(() => {});
    throw error;
  }
}
