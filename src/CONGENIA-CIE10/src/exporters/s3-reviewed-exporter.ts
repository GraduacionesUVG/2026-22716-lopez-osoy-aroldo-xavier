import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Cie10Repository } from "../db/postgres.js";
import type { ClinicalRecordExporter } from "../types.js";

function parseS3Prefix(uri: string): { bucket: string; prefix: string } {
  const parsed = new URL(uri);
  if (parsed.protocol !== "s3:" || !parsed.hostname) {
    throw new Error(`Invalid S3 URI: ${uri}`);
  }
  return { bucket: parsed.hostname, prefix: decodeURIComponent(parsed.pathname.slice(1)).replace(/\/?$/, "/") };
}

function csvEscape(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function toCsv(rows: Array<Record<string, string>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(",")),
  ];
  return `${lines.join("\n")}\n`;
}

// El bucket de documentos rechaza escrituras sin x-amz-server-side-encryption.
type ServerSideEncryption = "AES256" | "aws:kms";

function serverSideEncryptionFromEnv(): ServerSideEncryption | undefined {
  const value = process.env.S3_SERVER_SIDE_ENCRYPTION?.trim();
  if (!value) return undefined;
  if (value !== "AES256" && value !== "aws:kms") {
    throw new Error(`S3_SERVER_SIDE_ENCRYPTION must be AES256 or aws:kms. Received: ${value}`);
  }
  return value;
}

export class S3CsvReviewedExporter implements ClinicalRecordExporter {
  constructor(
    private readonly s3: S3Client,
    private readonly repository: Cie10Repository,
    private readonly exportPrefix: string | null,
    private readonly serverSideEncryption: ServerSideEncryption | undefined = serverSideEncryptionFromEnv(),
  ) {}

  async exportReviewedRecords(): Promise<void> {
    if (!this.exportPrefix) return;
    const client = await this.repository.connect();
    try {
      const rows = await this.repository.exportReviewedRows(client);
      const { bucket, prefix } = parseS3Prefix(this.exportPrefix);
      const key = `${prefix}cie10-reviewed-${new Date().toISOString().slice(0, 10)}.csv`;
      await this.s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: toCsv(rows),
        ContentType: "text/csv; charset=utf-8",
        ...(this.serverSideEncryption ? { ServerSideEncryption: this.serverSideEncryption } : {}),
      }));
    } finally {
      client.release();
    }
  }
}
