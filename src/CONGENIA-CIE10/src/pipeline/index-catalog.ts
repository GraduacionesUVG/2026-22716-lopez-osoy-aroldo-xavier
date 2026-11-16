import { createHash } from "node:crypto";
import type { AppConfig } from "../config.js";
import type { Cie10Repository } from "../db/postgres.js";
import type { ClinicalRecordSource } from "../types.js";
import { catalogEntries } from "./normalize.js";
import { mergeCatalogs, S3VectorCatalog } from "../rag/s3-vector-catalog.js";

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function buildRagIndex(options: {
  config: AppConfig;
  source: ClinicalRecordSource;
  repository: Cie10Repository;
  vectorCatalog: S3VectorCatalog;
}): Promise<{ version: string; vectorCount: number }> {
  const { config, source, repository, vectorCatalog } = options;
  const [catalogRows, referenceRows] = await Promise.all([
    source.readCatalog(),
    source.readReferenceCatalog ? source.readReferenceCatalog() : Promise.resolve([]),
  ]);
  const institutional = catalogEntries(catalogRows);
  if (institutional.length === 0) throw new Error("Institutional CIE-10 catalog is empty");
  const merged = mergeCatalogs(institutional, referenceRows);
  const referenceCommit = process.env.CIE10_REFERENCE_COMMIT
    ?? "8e22d45e932badbc344f81e18e677a655ab3bc3a";

  await repository.beginRagVersion({
    version: config.ragVersion,
    institutionalSha256: sha256(catalogRows),
    referenceSha256: referenceRows.length ? sha256(referenceRows) : null,
    referenceCommit: referenceRows.length ? referenceCommit : null,
    embeddingModel: config.embeddingModel,
    embeddingDimensions: config.embeddingDimensions,
  });

  try {
    await repository.replaceCatalog(institutional);
    await repository.replaceRagCatalog(config.ragVersion, merged);
    const vectorCount = await vectorCatalog.index(config.ragVersion, merged);
    await repository.activateRagVersion(config.ragVersion, vectorCount, {
      institutionalCount: institutional.length,
      referenceCount: referenceRows.length,
      overlapCount: merged.filter((entry) => entry.enCatalogoInstitucional && entry.enReferenciaExterna).length,
      referenceCommit,
      embeddingProvider: config.embeddingProvider,
      embeddingModel: config.embeddingModel,
    }, config.activateRagVersion);
    return { version: config.ragVersion, vectorCount };
  } catch (error) {
    await repository.failRagVersion(
      config.ragVersion,
      error instanceof Error ? error.message : String(error),
    ).catch(() => {});
    throw error;
  }
}
