import {
  PutVectorsCommand,
  QueryVectorsCommand,
  S3VectorsClient,
  UpdateIndexModeCommand,
} from "@aws-sdk/client-s3vectors";
import OpenAI from "openai";
import type {
  CatalogEntry,
  Cie10ReferenceCsvRow,
  EmbeddingProvider,
  RagCandidate,
  RagCatalog,
} from "../types.js";
import { normalizeCie10Code, referenceCatalogEntries } from "../pipeline/normalize.js";

export interface VectorCatalogEntry {
  codigo: string;
  codigoInterno: string | null;
  nombreInstitucional: string | null;
  descripcionReferencia: string | null;
  jerarquia: string[];
  nivel: number | null;
  parentCodigo: string | null;
  ancestros: string[];
  enCatalogoInstitucional: boolean;
  enReferenciaExterna: boolean;
  source: string;
}

export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  private readonly openai: OpenAI;
  private readonly counters = { requests: 0, inputTokens: 0, errors: 0, totalLatencyMs: 0 };

  constructor(apiKey: string, private readonly model: string, private readonly dimensions: number) {
    this.openai = new OpenAI({ apiKey });
  }

  async embed(inputs: string[]): Promise<number[][]> {
    if (inputs.length === 0) return [];
    const started = Date.now();
    this.counters.requests += 1;
    try {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: inputs,
        dimensions: this.dimensions,
        encoding_format: "float",
      });
      this.counters.inputTokens += response.usage?.prompt_tokens ?? 0;
      return response.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
    } catch (error) {
      this.counters.errors += 1;
      throw error;
    } finally {
      this.counters.totalLatencyMs += Date.now() - started;
    }
  }

  metrics() {
    return { ...this.counters };
  }
}

export function mergeCatalogs(
  institutional: CatalogEntry[],
  referenceRows: Cie10ReferenceCsvRow[],
): VectorCatalogEntry[] {
  const references = referenceCatalogEntries(referenceRows);
  const institutionalByCode = new Map(institutional.map((entry) => [entry.codigo, entry]));
  const codes = new Set([...institutionalByCode.keys(), ...references.keys()]);
  return [...codes].sort().map((codigo) => {
    const local = institutionalByCode.get(codigo);
    const reference = references.get(codigo);
    return {
      codigo,
      codigoInterno: local?.codigoInterno ?? null,
      nombreInstitucional: local?.nombre ?? null,
      descripcionReferencia: reference?.descripcion ?? null,
      jerarquia: reference?.jerarquia ?? [],
      nivel: reference?.nivel ?? null,
      parentCodigo: reference?.parentCodigo ?? null,
      ancestros: reference?.ancestros ?? [],
      enCatalogoInstitucional: Boolean(local),
      enReferenciaExterna: Boolean(reference),
      source: reference?.source ?? "catalogo-institucional",
    };
  });
}

function embeddingText(entry: VectorCatalogEntry): string {
  return [
    entry.descripcionReferencia ? `Diagnostico: ${entry.descripcionReferencia}` : null,
    entry.nombreInstitucional ? `Sinonimo institucional: ${entry.nombreInstitucional}` : null,
    entry.jerarquia.length ? `Contexto clinico: ${entry.jerarquia.join(" > ")}` : null,
    `Codigo CIE-10: ${entry.codigo}`,
  ].filter(Boolean).join(". ");
}

function chunks<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

function metadataString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hierarchyCoherence(query: string, hierarchy: unknown): number {
  if (!Array.isArray(hierarchy)) return 0;
  const terms = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().split(/\W+/).filter((term) => term.length >= 4);
  const context = hierarchy.join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return Math.min(4, terms.filter((term) => context.includes(term)).length);
}

function normalizedSearchText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();
}

const SEARCH_STOP_WORDS = new Set(["del", "con", "sin", "los", "las", "por", "para", "una", "uno", "tipo"]);

export function searchCatalogEntries(
  entries: VectorCatalogEntry[],
  query: string,
  limit: number,
): RagCandidate[] {
  const normalizedQuery = normalizedSearchText(query);
  const explicitCode = normalizeCie10Code(query.toUpperCase().match(/\b[A-Z]\d{2}(?:\.[0-9A-Z]{1,4})?\b/)?.[0]);
  const terms = normalizedQuery.split(/\s+/)
    .filter((term) => term.length >= 3 && !SEARCH_STOP_WORDS.has(term));

  return entries.flatMap((entry): RagCandidate[] => {
    const descriptions = [entry.nombreInstitucional, entry.descripcionReferencia].filter(Boolean).map(String);
    const searchable = normalizedSearchText([...descriptions, ...entry.jerarquia].join(" "));
    const exactText = descriptions.some((description) => normalizedSearchText(description) === normalizedQuery);
    const matchedTerms = terms.filter((term) => searchable.includes(term)).length;
    if (entry.codigo !== explicitCode && !exactText && matchedTerms === 0) return [];
    const score = entry.codigo === explicitCode
      ? 130
      : exactText
        ? 120
        : 35 + 30 * (matchedTerms / Math.max(terms.length, 1))
          + (searchable.includes(normalizedQuery) ? 10 : 0)
          + (entry.enCatalogoInstitucional ? 0.5 : 0);
    return [{
      codigo: entry.codigo,
      nombreInstitucional: entry.nombreInstitucional,
      descripcionReferencia: entry.descripcionReferencia,
      jerarquia: entry.jerarquia,
      enCatalogoInstitucional: entry.enCatalogoInstitucional,
      enReferenciaExterna: entry.enReferenciaExterna,
      distance: null,
      matchType: entry.codigo === explicitCode ? "EXACT_CODE" : exactText ? "EXACT_TEXT" : "LEXICAL",
      score,
    }];
  }).sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || left.codigo.localeCompare(right.codigo))
    .slice(0, limit);
}

export class S3VectorCatalog implements RagCatalog {
  constructor(
    private readonly client: S3VectorsClient,
    private readonly embeddings: EmbeddingProvider,
    private readonly bucketName: string,
    private readonly indexName: string,
    private readonly resolveActiveVersion: () => Promise<string>,
    private readonly searchTextCatalog?: (version: string, query: string, limit: number) => Promise<RagCandidate[]>,
  ) {}

  activeVersion(): Promise<string> {
    return this.resolveActiveVersion();
  }

  async search(diagnosisText: string, version: string, topK = 20): Promise<RagCandidate[]> {
    const [textual, queryVector] = await Promise.all([
      this.searchTextCatalog?.(version, diagnosisText, topK) ?? Promise.resolve([]),
      this.embeddings.embed([diagnosisText]).then(([vector]) => vector),
    ]);
    const semanticPoolSize = Math.min(100, Math.max(topK * 3, 50));
    const response = await this.client.send(new QueryVectorsCommand({
      vectorBucketName: this.bucketName,
      indexName: this.indexName,
      topK: semanticPoolSize,
      queryMode: "ENHANCED",
      queryVector: { float32: queryVector },
      filter: { corpusVersion: { $eq: version } },
      returnDistance: true,
      returnMetadata: true,
    }));
    const semantic = (response.vectors ?? []).map((vector) => {
      const metadata = (vector.metadata && typeof vector.metadata === "object" && !Array.isArray(vector.metadata)
        ? vector.metadata
        : {}) as Record<string, unknown>;
      return {
        codigo: normalizeCie10Code(metadataString(metadata.codigo) ?? vector.key?.split(":").at(-1) ?? ""),
        nombreInstitucional: metadataString(metadata.nombreInstitucional),
        descripcionReferencia: metadataString(metadata.descripcionReferencia),
        jerarquia: Array.isArray(metadata.jerarquia)
          ? metadata.jerarquia.map(String)
          : [],
        enCatalogoInstitucional: metadata.enCatalogoInstitucional === true,
        enReferenciaExterna: metadata.enReferenciaExterna === true,
        distance: vector.distance ?? null,
        matchType: "SEMANTIC" as const,
        score: 60 - (vector.distance ?? 1) * 20
          + (metadata.enCatalogoInstitucional === true ? 0.5 : 0)
          + hierarchyCoherence(diagnosisText, metadata.jerarquia),
      };
    }).filter((candidate) => candidate.codigo);
    const byCode = new Map<string, RagCandidate>();
    for (const candidate of [...semantic, ...textual]) {
      const current = byCode.get(candidate.codigo);
      if (!current || (candidate.score ?? 0) > (current.score ?? 0)) byCode.set(candidate.codigo, candidate);
    }
    return [...byCode.values()]
      .sort((left, right) => (right.score ?? 0) - (left.score ?? 0) || left.codigo.localeCompare(right.codigo))
      .slice(0, topK);
  }

  async index(version: string, entries: VectorCatalogEntry[]): Promise<number> {
    await this.client.send(new UpdateIndexModeCommand({
      vectorBucketName: this.bucketName,
      indexName: this.indexName,
      indexMode: "ENHANCED",
    }));
    let written = 0;
    for (const group of chunks(entries, 100)) {
      const vectors = await this.embeddings.embed(group.map(embeddingText));
      await this.client.send(new PutVectorsCommand({
        vectorBucketName: this.bucketName,
        indexName: this.indexName,
        vectors: group.map((entry, index) => ({
          key: `${version}:${entry.codigo}`,
          data: { float32: vectors[index] },
          metadata: {
            corpusVersion: version,
            codigo: entry.codigo,
            nombreInstitucional: entry.nombreInstitucional ?? "",
            descripcionReferencia: entry.descripcionReferencia ?? "",
            // S3 Vectors rejects empty metadata arrays; absence is read as [].
            ...(entry.jerarquia.length ? { jerarquia: entry.jerarquia } : {}),
            nivel: entry.nivel ?? -1,
            parentCodigo: entry.parentCodigo ?? "",
            ...(entry.ancestros.length ? { ancestros: entry.ancestros } : {}),
            enCatalogoInstitucional: entry.enCatalogoInstitucional,
            enReferenciaExterna: entry.enReferenciaExterna,
            source: entry.source,
          },
        })),
      }));
      written += group.length;
    }
    return written;
  }
}
