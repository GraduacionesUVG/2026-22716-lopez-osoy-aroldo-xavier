import "dotenv/config";
import { S3Client } from "@aws-sdk/client-s3";
import { S3VectorsClient } from "@aws-sdk/client-s3vectors";
import { loadConfig } from "./src/config.js";
import { OpenAiCie10Provider } from "./src/ai/openai-provider.js";
import { createPool, Cie10Repository } from "./src/db/postgres.js";
import { runCie10Batch } from "./src/pipeline/run.js";
import { LocalCsvClinicalRecordSource } from "./src/sources/local-csv-source.js";
import { S3CsvClinicalRecordSource } from "./src/sources/s3-csv-source.js";
import type { ClinicalRecordSource } from "./src/types.js";
import { OpenAiEmbeddingProvider, S3VectorCatalog } from "./src/rag/s3-vector-catalog.js";
import { buildRagIndex } from "./src/pipeline/index-catalog.js";

function buildS3Client(config: ReturnType<typeof loadConfig>): S3Client {
  return new S3Client({
    ...(config.s3.endpoint ? { endpoint: config.s3.endpoint } : {}),
    region: config.s3.region,
    forcePathStyle: config.s3.forcePathStyle,
    ...(config.s3.accessKeyId && config.s3.secretAccessKey
      ? {
          credentials: {
            accessKeyId: config.s3.accessKeyId,
            secretAccessKey: config.s3.secretAccessKey,
          },
        }
      : {}),
  });
}

function buildSource(config: ReturnType<typeof loadConfig>, s3: S3Client): ClinicalRecordSource {
  if (config.csvMode === "s3") {
    if (!config.catalogS3Uri || !config.translatorS3Uri) {
      throw new Error("CIE10_CATALOG_S3_URI and CIE10_TRANSLATOR_S3_URI are required in s3 mode");
    }
    if (!config.referenceCatalogS3Uri) {
      throw new Error("CIE10_REFERENCE_CATALOG_S3_URI is required in s3 mode");
    }
    return new S3CsvClinicalRecordSource(
      s3,
      config.catalogS3Uri,
      config.translatorS3Uri,
      config.referenceCatalogS3Uri,
    );
  }
  return new LocalCsvClinicalRecordSource(
    config.localCatalogPath,
    config.localTranslatorPath,
    config.localReferenceCatalogPath,
  );
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.openAiApiKey && (config.command === "batch" || config.embeddingProvider === "openai")) {
    throw new Error("OPENAI_API_KEY is required for classification and OpenAI embeddings");
  }

  const s3 = buildS3Client(config);
  const pool = createPool(config);
  const repository = new Cie10Repository(pool);
  const source = buildSource(config, s3);
  if (!config.vectorBucketName || !config.vectorIndexName) {
    throw new Error("CIE10_VECTOR_BUCKET_NAME and CIE10_VECTOR_INDEX_NAME are required");
  }
  const vectorClient = new S3VectorsClient({ region: config.s3.region });
  const embeddingProvider = new OpenAiEmbeddingProvider(
    config.openAiApiKey!,
    config.embeddingModel,
    config.embeddingDimensions,
  );
  const vectorCatalog = new S3VectorCatalog(
    vectorClient,
    embeddingProvider,
    config.vectorBucketName,
    config.vectorIndexName,
    () => repository.activeRagVersion(),
    (version, query, limit) => repository.searchRagCatalog(version, query, limit),
  );

  try {
    if (config.command === "index") {
      const result = await buildRagIndex({ config, source, repository, vectorCatalog });
      console.log(JSON.stringify({ event: "CIE10_RAG_INDEX_COMPLETED", ...result }));
    } else {
      const aiProvider = new OpenAiCie10Provider(
        config.openAiApiKey!,
        config.openAiModel,
        config.openAiReasoningEffort,
      );
      const result = await runCie10Batch({ config, source, repository, aiProvider, ragCatalog: vectorCatalog });
      console.log(JSON.stringify({ event: "CIE10_BATCH_COMPLETED", ...result }));
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ event: "CIE10_BATCH_FAILED", error: errorToMessage(error) }));
  process.exitCode = 1;
});
