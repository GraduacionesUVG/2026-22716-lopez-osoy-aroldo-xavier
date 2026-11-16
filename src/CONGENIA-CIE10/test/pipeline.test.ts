import test from "node:test";
import assert from "node:assert/strict";
import type { AppConfig } from "../src/config.js";
import { runCie10Batch } from "../src/pipeline/run.js";
import type {
  AiProvider,
  Cie10CatalogCsvRow,
  Cie10TranslatorCsvRow,
  ClinicalRecordSource,
  SuggestionResult,
} from "../src/types.js";

class MemorySource implements ClinicalRecordSource {
  readonly sourceCatalogUri = "memory://catalog";
  readonly sourceTranslatorUri = "memory://translator";

  constructor(
    private readonly catalogRows: Cie10CatalogCsvRow[],
    private readonly translatorRows: Cie10TranslatorCsvRow[],
  ) {}

  async readCatalog(): Promise<Cie10CatalogCsvRow[]> {
    return this.catalogRows;
  }

  async readTranslator(): Promise<Cie10TranslatorCsvRow[]> {
    return this.translatorRows;
  }
}

class MemoryRepository {
  catalogCount = 0;
  saved: SuggestionResult[] = [];
  finished: Array<{ status: string; counts: unknown }> = [];
  processed = new Set<string>();
  decided = new Set<string>();
  runMetadata: Record<string, unknown> | null = null;

  async createRun(metadata: Record<string, unknown>): Promise<string> {
    this.runMetadata = metadata;
    return "11111111-2222-4333-8444-555555555555";
  }

  async finishRun(_runId: string, status: "COMPLETED" | "FAILED", counts: unknown): Promise<void> {
    this.finished.push({ status, counts });
  }

  async replaceCatalog(entries: unknown[]): Promise<void> {
    this.catalogCount = entries.length;
  }

  async alreadyProcessed(codigoTraductor: string): Promise<boolean> {
    return this.processed.has(codigoTraductor);
  }

  async hasMedicalDecision(codigoTraductor: string): Promise<boolean> {
    return this.decided.has(codigoTraductor);
  }

  async saveSuggestion(_runId: string, result: SuggestionResult): Promise<void> {
    this.saved.push(result);
  }
}

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    openAiApiKey: "test",
    openAiModel: "gpt-6-luna",
    openAiReasoningEffort: "medium",
    promptVersion: "test",
    requestDelayMs: 0,
    maxRetries: 0,
    repairAttempts: 2,
    retryBaseDelayMs: 0,
    maxRecords: null,
    force: false,
    csvMode: "local",
    localCatalogPath: "CIE10.csv",
    localTranslatorPath: "CIE10_Traductor.csv",
    catalogS3Uri: null,
    translatorS3Uri: null,
    referenceCatalogS3Uri: null,
    localReferenceCatalogPath: "cie-10-reference.csv",
    command: "batch",
    batchPeriod: "2026-09",
    embeddingProvider: "openai",
    embeddingModel: "text-embedding-3-small",
    embeddingDimensions: 512,
    ragVersion: "test-v1",
    activateRagVersion: true,
    vectorBucketName: "test-vectors",
    vectorIndexName: "cie10",
    s3: {
      endpoint: null,
      region: "us-east-1",
      accessKeyId: null,
      secretAccessKey: null,
      forcePathStyle: false,
    },
    postgres: {
      host: "localhost",
      port: 5432,
      database: "congenia",
      user: "congenia",
      password: "congenia",
      sslMode: "disable",
    },
    ...overrides,
  };
}

const ragCatalog = {
  async activeVersion() { return "test-v1"; },
  async search() {
    return [{
      codigo: "N10",
      nombreInstitucional: "Nefritis tubulointersticial aguda",
      descripcionReferencia: null,
      jerarquia: [],
      enCatalogoInstitucional: true,
      enReferenciaExterna: false,
      distance: 0.1,
    }];
  },
};

test("batch preserves institutional and out-of-catalog suggestions with provenance", async () => {
  const source = new MemorySource(
    [
      { Codigo: "6001", Codigo_Enfermedad: "N10", Nombre: "Nefritis tubulointersticial aguda" },
      { Codigo: "5914", Codigo_Enfermedad: "R10.4", Nombre: "Dolor abdominal inespecifico" },
      { Codigo: "6002", Codigo_Enfermedad: "J00", Nombre: "Rinofaringitis aguda" },
      { Codigo: "6003", Codigo_Enfermedad: "A09", Nombre: "Gastroenteritis infecciosa" },
      { Codigo: "6004", Codigo_Enfermedad: "R50.9", Nombre: "Fiebre no especificada" },
    ],
    [
      { Codigo: "1", Diagnostico: "dolor abdominal", CIE_10: "5914" },
      { Codigo: "2", Diagnostico: "inflamacion renal", CIE_10: "-1" },
    ],
  );
  const repository = new MemoryRepository();
  let calls = 0;
  const aiProvider: AiProvider = {
    async classify() {
      calls += 1;
      return {
        status: "suggestions",
        reason: "Texto compatible con nefritis.",
        usage: { apiCalls: 1, inputTokens: 100, cachedInputTokens: 0, outputTokens: 50, reasoningTokens: 10, totalTokens: 150 },
        suggestions: [
          { codigo: "N10", descripcion: "Nefritis aguda", razonamiento: "Inflamacion renal aguda" },
          { codigo: "Z99.99", descripcion: "Inventado", razonamiento: "No debe pasar" },
          { codigo: "Z99.98", descripcion: "Inventado", razonamiento: "No debe pasar" },
          { codigo: "Z99.97", descripcion: "Inventado", razonamiento: "No debe pasar" },
          { codigo: "Z99.96", descripcion: "Inventado", razonamiento: "No debe pasar" },
        ],
      };
    },
  };

  const result = await runCie10Batch({
    config: config(),
    source,
    repository: repository as never,
    aiProvider,
    ragCatalog,
  });

  assert.equal(result.runId, "11111111-2222-4333-8444-555555555555");
  assert.equal(repository.runMetadata?.periodo, "2026-09");
  assert.equal(repository.catalogCount, 5);
  assert.equal(repository.saved.length, 1);
  assert.equal(repository.saved[0].codigoTraductor, "2");
  assert.deepEqual(repository.saved[0].sugerencias.map((s) => s.codigo), ["N10", "Z99.99", "Z99.98", "Z99.97", "Z99.96"]);
  assert.equal(repository.saved[0].sugerencias[0].soporte, "VALIDADO_INSTITUCIONAL");
  assert.equal(repository.saved[0].sugerencias[1].soporte, "REQUIERE_ATENCION");
  assert.equal(calls, 1);
  assert.deepEqual(repository.saved[0].tokenUsage, {
    apiCalls: 1,
    inputTokens: 100,
    cachedInputTokens: 0,
    outputTokens: 50,
    reasoningTokens: 10,
    totalTokens: 150,
  });
  assert.deepEqual((repository.finished[0].counts as { tokenUsage: unknown }).tokenUsage, repository.saved[0].tokenUsage);
  assert.equal(repository.finished[0].status, "COMPLETED");
});

test("batch persists valid suggestions when repair attempts cannot complete five", async () => {
  const source = new MemorySource(
    [
      { Codigo: "7001", Codigo_Enfermedad: "M75.2", Nombre: "Tendinitis del biceps" },
      { Codigo: "7002", Codigo_Enfermedad: "N10", Nombre: "Nefritis tubulointersticial aguda" },
    ],
    [{ Codigo: "2", Diagnostico: "inflamacion renal", CIE_10: "-1" }],
  );
  const repository = new MemoryRepository();
  let calls = 0;
  const aiProvider: AiProvider = {
    async classify() {
      calls += 1;
      return {
        status: "suggestions",
        reason: "Texto compatible con inflamacion renal.",
        suggestions: [
          { codigo: "M75.2", descripcion: "Bursitis subacromial", razonamiento: "No debe guardarse" },
          { codigo: "N10", descripcion: "Nefritis aguda", razonamiento: "Valida pero insuficiente" },
        ],
      };
    },
  };

  await runCie10Batch({
    config: config(),
    source,
    repository: repository as never,
    aiProvider,
    ragCatalog,
  });

  assert.equal(repository.saved.length, 1);
  assert.equal(repository.saved[0].aiStatus, "suggestions");
  assert.deepEqual(repository.saved[0].sugerencias.map((suggestion) => suggestion.codigo), ["M75.2", "N10"]);
  assert.equal(repository.saved[0].error, null);
  assert.equal(calls, 3);
});

test("batch skips already processed records unless force is enabled", async () => {
  const source = new MemorySource(
    [{ Codigo: "6001", Codigo_Enfermedad: "N10", Nombre: "Nefritis" }],
    [{ Codigo: "2", Diagnostico: "inflamacion renal", CIE_10: "-1" }],
  );
  const repository = new MemoryRepository();
  repository.processed.add("2");
  const aiProvider: AiProvider = {
    async classify() {
      throw new Error("should not call provider");
    },
  };

  await runCie10Batch({
    config: config(),
    source,
    repository: repository as never,
    aiProvider,
    ragCatalog,
  });

  assert.equal(repository.saved.length, 0);
});

test("force never overwrites a medically confirmed decision", async () => {
  const source = new MemorySource(
    [{ Codigo: "6001", Codigo_Enfermedad: "N10", Nombre: "Nefritis" }],
    [{ Codigo: "2", Diagnostico: "inflamacion renal", CIE_10: "-1" }],
  );
  const repository = new MemoryRepository();
  repository.decided.add("2");
  const aiProvider: AiProvider = {
    async classify() {
      throw new Error("should not call provider");
    },
  };

  await runCie10Batch({
    config: config({ force: true }), source,
    repository: repository as never, aiProvider, ragCatalog,
  });

  assert.equal(repository.saved.length, 0);
});

test("batch stores per-item model failures and respects max records", async () => {
  const source = new MemorySource(
    [{ Codigo: "6001", Codigo_Enfermedad: "N10", Nombre: "Nefritis" }],
    [
      { Codigo: "2", Diagnostico: "inflamacion renal", CIE_10: "-1" },
      { Codigo: "3", Diagnostico: "otra cosa", CIE_10: "-1" },
    ],
  );
  const repository = new MemoryRepository();
  const aiProvider: AiProvider = {
    async classify() {
      throw new Error("rate limit");
    },
  };

  await runCie10Batch({
    config: config({ maxRecords: 1 }),
    source,
    repository: repository as never,
    aiProvider,
    ragCatalog,
  });

  assert.equal(repository.saved.length, 1);
  assert.equal(repository.saved[0].aiStatus, "error");
  assert.equal(repository.saved[0].error, "rate limit");
  assert.equal((repository.finished[0].counts as { errorCount: number }).errorCount, 1);
});

test("record limit counts new work after skipping previously processed items", async () => {
  const source = new MemorySource(
    [{ Codigo: "6001", Codigo_Enfermedad: "N10", Nombre: "Nefritis" }],
    [
      { Codigo: "2", Diagnostico: "ya procesado", CIE_10: "-1" },
      { Codigo: "3", Diagnostico: "nuevo pendiente", CIE_10: "-1" },
      { Codigo: "4", Diagnostico: "fuera del limite", CIE_10: "-1" },
    ],
  );
  const repository = new MemoryRepository();
  repository.processed.add("2");
  let calls = 0;
  const aiProvider: AiProvider = {
    async classify() {
      calls += 1;
      return { status: "insufficient_information", reason: "Texto insuficiente", suggestions: [] };
    },
  };
  const result = await runCie10Batch({
    config: config({ maxRecords: 1 }), source,
    repository: repository as never, aiProvider, ragCatalog,
  });
  assert.equal(calls, 1);
  assert.equal(repository.saved[0].codigoTraductor, "3");
  assert.equal(result.counts.processedCount, 1);
});
