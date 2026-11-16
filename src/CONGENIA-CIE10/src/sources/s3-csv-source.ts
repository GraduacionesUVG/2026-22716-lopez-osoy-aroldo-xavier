import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { readCsvStream } from "../csv.js";
import type { Cie10CatalogCsvRow, Cie10ReferenceCsvRow, Cie10TranslatorCsvRow, ClinicalRecordSource } from "../types.js";

interface S3Location {
  bucket: string;
  key: string;
}

function parseS3Uri(uri: string): S3Location {
  const parsed = new URL(uri);
  if (parsed.protocol !== "s3:" || !parsed.hostname || !parsed.pathname.slice(1)) {
    throw new Error(`Invalid S3 URI: ${uri}`);
  }
  return { bucket: parsed.hostname, key: decodeURIComponent(parsed.pathname.slice(1)) };
}

async function objectStream(client: S3Client, uri: string): Promise<Readable> {
  const location = parseS3Uri(uri);
  const response = await client.send(new GetObjectCommand({ Bucket: location.bucket, Key: location.key }));
  if (!(response.Body instanceof Readable)) {
    throw new Error(`S3 object is not a readable stream: ${uri}`);
  }
  return response.Body;
}

export class S3CsvClinicalRecordSource implements ClinicalRecordSource {
  constructor(
    private readonly s3: S3Client,
    readonly sourceCatalogUri: string,
    readonly sourceTranslatorUri: string,
    readonly sourceReferenceCatalogUri: string,
  ) {}

  async readCatalog(): Promise<Cie10CatalogCsvRow[]> {
    return readCsvStream<Cie10CatalogCsvRow>(await objectStream(this.s3, this.sourceCatalogUri));
  }

  async readTranslator(): Promise<Cie10TranslatorCsvRow[]> {
    return readCsvStream<Cie10TranslatorCsvRow>(await objectStream(this.s3, this.sourceTranslatorUri));
  }

  async readReferenceCatalog(): Promise<Cie10ReferenceCsvRow[]> {
    return readCsvStream<Cie10ReferenceCsvRow>(await objectStream(this.s3, this.sourceReferenceCatalogUri));
  }
}
