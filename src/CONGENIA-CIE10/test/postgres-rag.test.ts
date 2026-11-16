import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { Cie10Repository } from "../src/db/postgres.js";

test("RAG state transitions execute against PostgreSQL without external credentials", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE cie10_rag_version (
        rag_version varchar(80) PRIMARY KEY,
        estado varchar(20) NOT NULL DEFAULT 'BUILDING'
          CHECK (estado IN ('BUILDING', 'READY', 'ACTIVE', 'FAILED', 'ARCHIVED')),
        institutional_sha256 char(64) NOT NULL,
        reference_sha256 char(64),
        reference_commit varchar(64),
        embedding_model varchar(100) NOT NULL,
        embedding_dimensions integer NOT NULL,
        vector_count integer NOT NULL DEFAULT 0,
        metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        activated_at timestamptz
      );
      CREATE UNIQUE INDEX ux_cie10_rag_active
        ON cie10_rag_version ((estado)) WHERE estado = 'ACTIVE';
    `);
    // Adapt the transport only: SQL parsing, parameter typing and transactions
    // execute inside PostgreSQL in memory, rather than a query-string mock.
    const client = {
      query: (sql: string, parameters?: unknown[]) => db.query(sql, parameters),
      release() {},
    };
    const repository = new Cie10Repository({
      query: client.query,
      async connect() { return client; },
    } as unknown as Pool);
    const meta = (version: string) => ({
      version,
      institutionalSha256: "a".repeat(64),
      referenceSha256: "b".repeat(64),
      referenceCommit: "reference-commit",
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 512,
    });
    const seedActive = async () => {
      await db.exec("TRUNCATE cie10_rag_version");
      await repository.beginRagVersion(meta("production-openai"));
      await db.query("UPDATE cie10_rag_version SET estado = 'ACTIVE', activated_at = '2026-10-01T00:00:00Z' WHERE rag_version = $1", ["production-openai"]);
    };

    await t.test("evaluation becomes READY without replacing the active version", async () => {
      await seedActive();
      await repository.beginRagVersion(meta("eval-openai"));
      await repository.activateRagVersion("eval-openai", 14247, { embeddingProvider: "openai" }, false);
      const { rows } = await db.query<{ estado: string; vector_count: number; activated_at: Date | null; metadata_json: unknown }>(
        "SELECT estado, vector_count, activated_at, metadata_json FROM cie10_rag_version WHERE rag_version = $1", ["eval-openai"],
      );
      assert.equal(rows[0].estado, "READY");
      assert.equal(rows[0].vector_count, 14247);
      assert.equal(rows[0].activated_at, null);
      assert.deepEqual(rows[0].metadata_json, { embeddingProvider: "openai" });
      const active = await db.query<{ rag_version: string; activated_at: Date }>("SELECT rag_version, activated_at FROM cie10_rag_version WHERE estado = 'ACTIVE'");
      assert.equal(active.rows.length, 1);
      assert.equal(active.rows[0].rag_version, "production-openai");
      assert.equal(active.rows[0].activated_at.toISOString(), "2026-10-01T00:00:00.000Z");
    });

    await t.test("explicit promotion activates the new version and archives the previous one", async () => {
      await seedActive();
      await repository.beginRagVersion(meta("new-production-openai"));
      await repository.activateRagVersion("new-production-openai", 14247, { embeddingProvider: "openai" }, true);
      const { rows } = await db.query<{ rag_version: string; estado: string; activated_at: Date | null }>("SELECT rag_version, estado, activated_at FROM cie10_rag_version ORDER BY rag_version");
      assert.equal(rows[0].rag_version, "new-production-openai");
      assert.equal(rows[0].estado, "ACTIVE");
      assert.ok(rows[0].activated_at instanceof Date);
      assert.equal(rows[1].estado, "ARCHIVED");
    });

    await t.test("a missing BUILDING version rolls back archival and keeps the active pointer", async () => {
      await seedActive();
      await assert.rejects(
        repository.activateRagVersion("missing-openai", 14247, {}, true), /not in BUILDING state/,
      );
      const { rows } = await db.query<{ rag_version: string }>("SELECT rag_version FROM cie10_rag_version WHERE estado = 'ACTIVE'");
      assert.deepEqual(rows, [{ rag_version: "production-openai" }]);
    });
  } finally {
    await db.close();
  }
});
