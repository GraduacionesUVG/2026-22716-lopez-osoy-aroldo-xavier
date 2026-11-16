import path from "node:path";
import { S3VectorsClient } from "@aws-sdk/client-s3vectors";
import { OpenAiCie10Provider } from "../ai/openai-provider.js";
import { readCsvFile } from "../csv.js";
import {
  FixtureCie10Provider,
  catalogCodeSet,
  evaluateCie10Cases,
  readCie10EvaluationCases,
  referenceCodeSet,
  writeCie10Report,
} from "../evaluation/cie10-evaluation.js";
import type { Cie10CatalogCsvRow, Cie10ReferenceCsvRow, EmbeddingProvider } from "../types.js";
import {
  mergeCatalogs,
  OpenAiEmbeddingProvider,
  S3VectorCatalog,
  searchCatalogEntries,
} from "../rag/s3-vector-catalog.js";
import { catalogEntries } from "../pipeline/normalize.js";

function parseArgs(argv = process.argv.slice(2)): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}

function argString(args: Record<string, string | boolean>, key: string, fallback?: string): string {
  const value = args[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (fallback != null) return fallback;
  throw new Error(`Missing required --${key}`);
}

const args = parseArgs();
const casesFile = argString(args, "cases", "evaluation/cie10/final-100.json");
const providerName = argString(args, "provider", "fixture");
const outputDir = argString(args, "output-dir", "output/evaluation");
const model = process.env.CIE10_OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-6-luna";
const reasoningEffort =
  process.env.CIE10_OPENAI_REASONING_EFFORT ?? process.env.CIE10_REASONING_EFFORT ?? "medium";
if (model !== "gpt-6-luna") throw new Error("CIE10 evaluation model must be gpt-6-luna");
if (reasoningEffort !== "medium") throw new Error("CIE10 evaluation reasoning effort must be medium");
const openAiApiKey = process.env.OPENAI_API_KEY ?? process.env.CIE10_OPENAI_API_KEY;
const embeddingProviderName = argString(args, "embedding-provider", process.env.CIE10_EMBEDDING_PROVIDER ?? "openai");
if (embeddingProviderName !== "openai") {
  throw new Error("--embedding-provider must be openai");
}

const cases = readCie10EvaluationCases(casesFile);
const catalogPath = typeof args.catalog === "string" ? args.catalog : null;
const referenceCatalogPath = typeof args["reference-catalog"] === "string" ? args["reference-catalog"] : null;
const catalogCodes = catalogPath || referenceCatalogPath ? new Set<string>() : undefined;
const catalogRows = catalogPath ? await readCsvFile<Cie10CatalogCsvRow>(catalogPath) : [];
const referenceRows = referenceCatalogPath ? await readCsvFile<Cie10ReferenceCsvRow>(referenceCatalogPath) : [];
if (catalogPath) {
  for (const code of catalogCodeSet(catalogRows)) catalogCodes?.add(code);
}
if (referenceCatalogPath) {
  for (const code of referenceCodeSet(referenceRows)) catalogCodes?.add(code);
}
const evaluationCatalog = catalogRows.length || referenceRows.length
  ? mergeCatalogs(catalogEntries(catalogRows), referenceRows)
  : [];

const provider = providerName === "openai"
  ? new OpenAiCie10Provider(openAiApiKey ?? argString({}, "OPENAI_API_KEY"), model, reasoningEffort as never)
  : new FixtureCie10Provider(cases);

const ragVersion = typeof args["rag-version"] === "string" ? args["rag-version"] : null;
let resolveCandidates: ((diagnosisText: string) => ReturnType<S3VectorCatalog["search"]>) | undefined;
let measuredEmbeddingProvider: EmbeddingProvider | undefined;
if (ragVersion) {
  if (embeddingProviderName === "openai" && !openAiApiKey) {
    throw new Error("OPENAI_API_KEY is required for OpenAI RAG evaluation");
  }
  const bucket = process.env.CIE10_VECTOR_BUCKET_NAME;
  const index = process.env.CIE10_VECTOR_INDEX_NAME;
  if (!bucket || !index) throw new Error("CIE10_VECTOR_BUCKET_NAME and CIE10_VECTOR_INDEX_NAME are required");
  const dimensions = Number.parseInt(process.env.CIE10_EMBEDDING_DIMENSIONS ?? "512", 10);
  const region = process.env.AWS_REGION ?? "us-east-1";
  const embeddings = new OpenAiEmbeddingProvider(
    openAiApiKey!,
    process.env.CIE10_EMBEDDING_MODEL ?? "text-embedding-3-small",
    dimensions,
  );
  measuredEmbeddingProvider = embeddings;
  const rag = new S3VectorCatalog(
    new S3VectorsClient({ region }),
    embeddings,
    bucket,
    index,
    async () => ragVersion,
    evaluationCatalog.length
      ? async (_version, query, limit) => searchCatalogEntries(evaluationCatalog, query, limit)
      : undefined,
  );
  resolveCandidates = (diagnosisText) => rag.search(diagnosisText, ragVersion, 20);
}

const report = await evaluateCie10Cases({
  cases,
  provider,
  providerName: ragVersion ? `${providerName}+${embeddingProviderName}` : providerName,
  casesFile,
  catalogCodes,
  resolveCandidates,
});
if (measuredEmbeddingProvider?.metrics) report.embeddingMetrics = measuredEmbeddingProvider.metrics();
const reportName = path.basename(casesFile).replace(/\.json$/i, "");
writeCie10Report(report, outputDir, reportName);

console.log(JSON.stringify(report, null, 2));
