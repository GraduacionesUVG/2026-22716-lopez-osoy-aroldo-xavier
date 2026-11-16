import path from "node:path";
import type { ReasoningEffort } from "openai/resources/shared";

export interface AppConfig {
  openAiApiKey: string | null;
  openAiModel: string;
  openAiReasoningEffort: ReasoningEffort;
  promptVersion: string;
  requestDelayMs: number;
  maxRetries: number;
  repairAttempts: number;
  retryBaseDelayMs: number;
  maxRecords: number | null;
  force: boolean;
  csvMode: "local" | "s3";
  localCatalogPath: string;
  localTranslatorPath: string;
  catalogS3Uri: string | null;
  translatorS3Uri: string | null;
  referenceCatalogS3Uri: string | null;
  localReferenceCatalogPath: string;
  command: "batch" | "index";
  embeddingModel: string;
  embeddingProvider: "openai";
  embeddingDimensions: number;
  ragVersion: string;
  activateRagVersion: boolean;
  batchPeriod: string;
  vectorBucketName: string | null;
  vectorIndexName: string | null;
  s3: {
    endpoint: string | null;
    region: string;
    accessKeyId: string | null;
    secretAccessKey: string | null;
    forcePathStyle: boolean;
  };
  postgres: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string | undefined;
    sslMode: string;
  };
}

function optionalPositiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function intEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function boolEnv(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function reasoningEffortEnv(name: string, fallback: ReasoningEffort): ReasoningEffort {
  const value = process.env[name]?.trim().toLowerCase();
  if (["none", "minimal", "low", "medium", "high", "xhigh", "max"].includes(value ?? "")) {
    return value as ReasoningEffort;
  }
  return fallback;
}

export function previousMonthInGuatemala(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guatemala",
    year: "numeric",
    month: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
}

function batchPeriodEnv(): string {
  const value = process.env.CIE10_BATCH_PERIOD?.trim() || previousMonthInGuatemala();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new Error("CIE10_BATCH_PERIOD must use YYYY-MM format");
  }
  return value;
}

export function loadConfig(): AppConfig {
  const csvMode = (process.env.CIE10_SOURCE_MODE ?? "local").trim().toLowerCase() === "s3" ? "s3" : "local";

  const openAiModel = process.env.CIE10_OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-6-luna";
  const openAiReasoningEffort = reasoningEffortEnv("CIE10_REASONING_EFFORT", "medium");
  if (openAiModel !== "gpt-6-luna") {
    throw new Error("CIE10_OPENAI_MODEL must be gpt-6-luna");
  }
  if (openAiReasoningEffort !== "medium") {
    throw new Error("CIE10_REASONING_EFFORT must be medium");
  }

  const embeddingProviderValue = process.env.CIE10_EMBEDDING_PROVIDER?.trim().toLowerCase() || "openai";
  if (embeddingProviderValue !== "openai") {
    throw new Error("CIE10_EMBEDDING_PROVIDER must be openai");
  }
  const embeddingProvider = "openai" as const;
  const embeddingModel = process.env.CIE10_EMBEDDING_MODEL ?? "text-embedding-3-small";
  const ragVersionBase = process.env.CIE10_RAG_VERSION ?? new Date().toISOString().slice(0, 10);
  const embeddingDimensions = intEnv("CIE10_EMBEDDING_DIMENSIONS", 512);
  if (embeddingDimensions !== 512) {
    throw new Error("CIE10_EMBEDDING_DIMENSIONS must remain 512");
  }

  return {
    openAiApiKey: process.env.OPENAI_API_KEY ?? null,
    openAiModel,
    openAiReasoningEffort,
    promptVersion: process.env.CIE10_PROMPT_VERSION ?? "CIE10_PROMPT_V1",
    requestDelayMs: intEnv("OPENAI_REQUEST_DELAY_MS", 750),
    maxRetries: intEnv("OPENAI_MAX_RETRIES", 2),
    repairAttempts: intEnv("CIE10_REPAIR_ATTEMPTS", 2),
    retryBaseDelayMs: intEnv("OPENAI_RETRY_BASE_DELAY_MS", 1_000),
    maxRecords: optionalPositiveInt(process.env.CIE10_MAX_RECORDS ?? process.env.MAX_PENDING_RECORDS),
    force: ["1", "true", "yes", "on"].includes((process.env.CIE10_FORCE ?? "").toLowerCase()),
    csvMode,
    localCatalogPath: path.resolve(process.cwd(), process.env.CIE10_CATALOG_CSV_PATH ?? "CIE10.csv"),
    localTranslatorPath: path.resolve(process.cwd(), process.env.CIE10_TRANSLATOR_CSV_PATH ?? "CIE10_Traductor.csv"),
    catalogS3Uri: process.env.CIE10_CATALOG_S3_URI ?? null,
    translatorS3Uri: process.env.CIE10_TRANSLATOR_S3_URI ?? null,
    referenceCatalogS3Uri: process.env.CIE10_REFERENCE_CATALOG_S3_URI ?? null,
    localReferenceCatalogPath: path.resolve(process.cwd(), process.env.CIE10_REFERENCE_CSV_PATH ?? "cie-10-reference.csv"),
    command: (process.env.CIE10_COMMAND ?? "batch").trim().toLowerCase() === "index" ? "index" : "batch",
    embeddingProvider,
    embeddingModel,
    embeddingDimensions,
    ragVersion: `${ragVersionBase}-${embeddingProvider}`,
    activateRagVersion: process.env.CIE10_ACTIVATE_RAG == null
      ? true
      : boolEnv("CIE10_ACTIVATE_RAG"),
    batchPeriod: batchPeriodEnv(),
    vectorBucketName: process.env.CIE10_VECTOR_BUCKET_NAME ?? null,
    vectorIndexName: process.env.CIE10_VECTOR_INDEX_NAME ?? null,
    s3: {
      endpoint: process.env.CIE10_S3_ENDPOINT ?? process.env.S3_ENDPOINT ?? process.env.AWS_ENDPOINT_URL_S3 ?? null,
      region: process.env.CIE10_S3_REGION ?? process.env.S3_REGION ?? process.env.AWS_REGION ?? "us-east-1",
      accessKeyId: process.env.CIE10_S3_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID ?? null,
      secretAccessKey: process.env.CIE10_S3_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY ?? null,
      forcePathStyle: boolEnv("CIE10_S3_FORCE_PATH_STYLE", boolEnv("S3_FORCE_PATH_STYLE", boolEnv("AWS_S3_FORCE_PATH_STYLE"))),
    },
    postgres: {
      host: process.env.POSTGRES_HOST ?? process.env.PGHOST ?? "localhost",
      port: Number(process.env.POSTGRES_PORT ?? process.env.PGPORT ?? 5432),
      database: process.env.POSTGRES_DB ?? process.env.PGDATABASE ?? "congenia",
      user: process.env.POSTGRES_USER ?? process.env.PGUSER ?? "congenia",
      password: process.env.POSTGRES_PASSWORD ?? process.env.PGPASSWORD,
      sslMode: process.env.POSTGRES_SSL_MODE ?? process.env.PGSSLMODE ?? "disable",
    },
  };
}
