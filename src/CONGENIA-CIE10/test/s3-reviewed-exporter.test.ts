import test from "node:test";
import assert from "node:assert/strict";
import type { S3Client } from "@aws-sdk/client-s3";
import type { Cie10Repository } from "../src/db/postgres.js";
import { S3CsvReviewedExporter } from "../src/exporters/s3-reviewed-exporter.js";

function fakes() {
  const sent: Array<Record<string, unknown>> = [];
  const s3 = { send: async (command: { input: Record<string, unknown> }) => { sent.push(command.input); return {}; } } as unknown as S3Client;
  const repository = {
    connect: async () => ({ release() {} }),
    exportReviewedRows: async () => [{ codigo: "Q35.9", decision: "ACEPTADA" }],
  } as unknown as Cie10Repository;
  return { sent, s3, repository };
}

test("la exportacion revisada declara el cifrado configurado", async () => {
  const { sent, s3, repository } = fakes();
  await new S3CsvReviewedExporter(s3, repository, "s3://docs/cie10/export/", "AES256").exportReviewedRecords();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].ServerSideEncryption, "AES256");
  assert.equal(sent[0].Bucket, "docs");
});

test("sin cifrado configurado no envia la cabecera (entorno local)", async () => {
  const { sent, s3, repository } = fakes();
  await new S3CsvReviewedExporter(s3, repository, "s3://docs/cie10/export/", undefined).exportReviewedRecords();
  assert.equal(sent[0].ServerSideEncryption, undefined);
});

test("un valor desconocido es un error de configuracion", () => {
  const { s3, repository } = fakes();
  process.env.S3_SERVER_SIDE_ENCRYPTION = "SSE-C";
  try {
    assert.throws(() => new S3CsvReviewedExporter(s3, repository, null), /S3_SERVER_SIDE_ENCRYPTION/);
  } finally {
    delete process.env.S3_SERVER_SIDE_ENCRYPTION;
  }
});
