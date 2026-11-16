import { Readable } from 'node:stream';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Builds the S3 client, omitting whatever the environment did not provide.
 *
 * The keys matter: passing a `credentials` block unconditionally stops the SDK
 * from ever walking its credential chain, and with it the IAM role attached to
 * the ECS task. That is why an environment without keys must produce a client
 * *without* the property, not a client with empty strings in it.
 */
function buildS3Client(): S3Client {
  const config: S3ClientConfig = {
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  };

  // Absent endpoint means real S3: the SDK resolves the regional one.
  if (env.S3_ENDPOINT) {
    config.endpoint = env.S3_ENDPOINT;
  }

  if (env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    };
  }

  logger.info('S3 client configured', {
    endpoint: config.endpoint ?? '(SDK regional endpoint)',
    forcePathStyle: config.forcePathStyle,
    credentials: config.credentials ? 'static keys' : 'task IAM role',
  });

  return new S3Client(config);
}

const s3Client = buildS3Client();

export interface ParsedS3Ref {
  bucket: string;
  key: string;
}

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const anyError = error as Error & { $metadata?: { httpStatusCode?: number } };
  return (
    anyError.name === 'NotFound' ||
    anyError.name === 'NoSuchBucket' ||
    anyError.$metadata?.httpStatusCode === 404
  );
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    throw new Error('S3 object response has empty body');
  }

  if (Buffer.isBuffer(body)) {
    return body;
  }

  const withTransform = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof withTransform.transformToByteArray === 'function') {
    const bytes = await withTransform.transformToByteArray();
    return Buffer.from(bytes);
  }

  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  throw new Error('Unsupported S3 body type');
}

export function parseS3Ref(ref: string, fallbackBucket: string): ParsedS3Ref {
  const trimmed = ref.trim();

  if (trimmed.startsWith('s3://')) {
    const withoutScheme = trimmed.slice('s3://'.length);
    const [bucket, ...keyParts] = withoutScheme.split('/');
    return {
      bucket,
      key: keyParts.join('/'),
    };
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const url = new URL(trimmed);
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 2) {
      return {
        bucket: pathParts[0],
        key: pathParts.slice(1).join('/'),
      };
    }
  }

  return {
    bucket: fallbackBucket,
    key: trimmed.replace(/^\/+/, ''),
  };
}

export async function ensureBucketExists(bucket: string): Promise<void> {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }

  if (!env.S3_AUTO_CREATE_BUCKET) {
    throw new Error(
      `S3 bucket "${bucket}" does not exist and S3_AUTO_CREATE_BUCKET is off. ` +
        'In AWS the bucket is owned by Terraform (modules/data) and the task role ' +
        'deliberately has no s3:CreateBucket permission — check S3_BUCKET instead.'
    );
  }

  logger.info('Creating missing S3 bucket', { bucket });
  await s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
}

export async function getObjectBuffer(bucket: string, key: string): Promise<Buffer> {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  return bodyToBuffer(response.Body);
}

export async function putObjectBuffer(
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
  metadata?: Record<string, string>
): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
      ...(env.S3_SERVER_SIDE_ENCRYPTION ? { ServerSideEncryption: env.S3_SERVER_SIDE_ENCRYPTION } : {}),
    })
  );
}
