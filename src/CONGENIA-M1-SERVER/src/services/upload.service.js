'use strict';

const crypto = require('crypto');
const { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { sessionAuditActor } = require('./audit.service');
const { getActiveSession, registerUpload } = require('./patient-session.service');
const { logEvent, logError } = require('../config/logger');

// Valid upload categories and their bucket path segment
const CATEGORY_PATH = {
  profile: 'profile',
  exam: 'exams',
};

const CONTENT_TYPE_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const CATEGORY_CONTENT_TYPES = {
  profile: new Set(['image/jpeg', 'image/png', 'image/webp']),
  exam: new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
};

let s3PublicClient;
let s3InternalClient;

function getRequiredEnv(name, { allowEmpty = false } = {}) {
  const value = process.env[name];
  if (value == null || (!allowEmpty && String(value).trim() === '')) {
    const err = new Error(`${name} is required for uploads configuration`);
    err.code = 'UPLOAD_CONFIG_INVALID';
    err.status = 500;
    throw err;
  }
  return value;
}

/**
 * Reads a boolean from the environment without surprises.
 *
 * It exists because the lazy pattern (`Boolean(process.env.X)`) turns the
 * string "false" into `true`, the exact opposite of what whoever configured
 * the environment meant to write.
 */
function parseBooleanEnv(name, defaultValue) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return defaultValue;

  const value = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;

  const err = new Error(`${name} must be a boolean ("true" or "false"). Received: ${raw}`);
  err.code = 'UPLOAD_CONFIG_INVALID';
  err.status = 500;
  throw err;
}

// Vigencia de la URL de subida. 300 s cubren con holgura la carga mas lenta
// medida en la evaluacion (p95 de 6.8 s) y acotan el tiempo durante el cual
// una URL filtrada sirve; la ficha pide una nueva justo antes de cada subida.
const DEFAULT_PRESIGN_EXPIRY_SECONDS = 300;

function getPresignExpirySeconds() {
  const raw = process.env.S3_PRESIGN_EXPIRY_SECONDS ?? String(DEFAULT_PRESIGN_EXPIRY_SECONDS);
  const parsed = Number.parseInt(raw, 10);

  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 604800) {
    const err = new Error(
      `S3_PRESIGN_EXPIRY_SECONDS must be an integer between 1 and 604800. Received: ${raw}`
    );
    err.code = 'UPLOAD_CONFIG_INVALID';
    err.status = 500;
    throw err;
  }

  return parsed;
}

// Cifrado que cada escritura declara de forma explicita. En AWS la politica del
// bucket rechaza un PutObject sin la cabecera x-amz-server-side-encryption, asi
// que la API, el worker y CIE-10 la envian. Vacio en local: SeaweedFS no la
// necesita.
const SERVER_SIDE_ENCRYPTION_VALUES = new Set(['AES256', 'aws:kms']);

function getServerSideEncryption() {
  const raw = process.env.S3_SERVER_SIDE_ENCRYPTION;
  if (raw == null || String(raw).trim() === '') return null;
  const value = String(raw).trim();
  if (!SERVER_SIDE_ENCRYPTION_VALUES.has(value)) {
    const err = new Error(`S3_SERVER_SIDE_ENCRYPTION must be AES256 or aws:kms. Received: ${raw}`);
    err.code = 'UPLOAD_CONFIG_INVALID';
    err.status = 500;
    throw err;
  }
  return value;
}

/**
 * Campos que toda escritura agrega al PutObjectCommand y cabeceras que el
 * navegador debe repetir en el PUT de una URL prefirmada: el presigner deja las
 * cabeceras SSE como cabeceras firmadas, no como parametros de la URL.
 */
function serverSideEncryptionParams() {
  const sse = getServerSideEncryption();
  return sse ? { ServerSideEncryption: sse } : {};
}

function serverSideEncryptionHeaders() {
  const sse = getServerSideEncryption();
  return sse ? { 'x-amz-server-side-encryption': sse } : {};
}

function getUploadConfig() {
  // Endpoints are optional. SeaweedFS and MiniStack need to be pointed at
  // explicitly; against real S3, leaving them empty makes the SDK resolve the
  // regional endpoint, which is what we want.
  const internalEndpoint = process.env.S3_ENDPOINT || process.env.S3_PUBLIC_ENDPOINT || null;
  const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT || internalEndpoint;

  const bucket = getRequiredEnv('S3_BUCKET');
  const region = process.env.S3_REGION ?? 'us-east-1';
  const expiresIn = getPresignExpirySeconds();

  // Path-style is mandatory on SeaweedFS and MiniStack; against real S3 the
  // recommended addressing is virtual-hosted. Hence configurable, not fixed.
  const forcePathStyle = parseBooleanEnv('S3_FORCE_PATH_STYLE', true);

  // The keys are optional on purpose: when they are absent the SDK walks its
  // credential chain and picks up the task's IAM role (ECS exposes
  // AWS_CONTAINER_CREDENTIALS_RELATIVE_URI). Always passing a `credentials`
  // block — as this did before — cuts that chain short and makes static keys
  // the only option.
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  const hasAccessKey = accessKeyId != null && String(accessKeyId).trim() !== '';
  const hasSecretKey = secretAccessKey != null && String(secretAccessKey).trim() !== '';

  if (hasAccessKey !== hasSecretKey) {
    const err = new Error(
      'S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set together, or both left empty ' +
        'to use the IAM role of the task'
    );
    err.code = 'UPLOAD_CONFIG_INVALID';
    err.status = 500;
    throw err;
  }

  return {
    publicEndpoint,
    internalEndpoint,
    bucket,
    region,
    forcePathStyle,
    credentials: hasAccessKey ? { accessKeyId, secretAccessKey } : null,
    expiresIn,
  };
}

function createS3Client(endpoint, configLabel) {
  try {
    const cfg = getUploadConfig();

    const clientConfig = {
      region: cfg.region,
      forcePathStyle: cfg.forcePathStyle,
      requestChecksumCalculation: 'WHEN_REQUIRED',
    };

    // With no `endpoint` the SDK resolves the regional one. With no
    // `credentials` it walks the chain down to the task role. In both cases
    // omitting the key is worth more than setting it to null.
    if (endpoint) clientConfig.endpoint = endpoint;
    if (cfg.credentials) clientConfig.credentials = cfg.credentials;

    return new S3Client(clientConfig);
  } catch (err) {
    logError('UPLOAD_CONFIG_ERROR', {
      configLabel,
      endpoint,
      message: err.message,
      code: err.code,
    });
    throw err;
  }
}

/**
 * S3 client for generating presigned URLs that the browser will use.
 * Uses S3_PUBLIC_ENDPOINT (the hostname reachable by the browser)
 * so the signed Host header matches what the browser sends.
 *
 * Dev:  S3_PUBLIC_ENDPOINT=http://localhost:8333
 * Prod: S3_PUBLIC_ENDPOINT=https://storage.congenia.com (FOR EXAMPLE)
 */
function getPublicS3Client() {
  if (!s3PublicClient) {
    const cfg = getUploadConfig();
    s3PublicClient = createS3Client(cfg.publicEndpoint, 'public');
  }
  return s3PublicClient;
}

/**
 * Internal SeaweedFS endpoint (container-to-container path).
 * Kept to preserve split config between browser-facing signing
 * and internal service operations over the cluster network.
 */
function getInternalS3Client() {
  if (!s3InternalClient) {
    const cfg = getUploadConfig();
    s3InternalClient = createS3Client(cfg.internalEndpoint, 'internal');
  }
  return s3InternalClient;
}

function getEnvPrefix() {
  const env = (process.env.APP_ENV || process.env.NODE_ENV || 'development').trim().toLowerCase();
  const normalized = env.replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'development';
}

function getMaxUploadBytes() {
  const raw = process.env.S3_UPLOAD_MAX_BYTES ?? String(10 * 1024 * 1024);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    const err = new Error('S3_UPLOAD_MAX_BYTES must be a positive integer');
    err.code = 'UPLOAD_CONFIG_INVALID';
    err.status = 500;
    throw err;
  }
  return parsed;
}

function validateUpload({ category, contentType, sizeBytes }) {
  if (!CATEGORY_PATH[category]) {
    const err = new Error(`Invalid category '${category}'. Must be one of: ${Object.keys(CATEGORY_PATH).join(', ')}`);
    err.code = 'INVALID_CATEGORY';
    err.status = 400;
    throw err;
  }

  const normalizedContentType = typeof contentType === 'string' ? contentType.trim().toLowerCase() : '';
  if (!CATEGORY_CONTENT_TYPES[category].has(normalizedContentType)) {
    const err = new Error(`contentType is not allowed for category '${category}'`);
    err.code = 'INVALID_CONTENT_TYPE';
    err.status = 400;
    throw err;
  }

  const maxBytes = getMaxUploadBytes();
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes) {
    const err = new Error(`sizeBytes must be between 1 and ${maxBytes}`);
    err.code = 'INVALID_FILE_SIZE';
    err.status = 400;
    throw err;
  }

  return {
    contentType: normalizedContentType,
    extension: CONTENT_TYPE_EXTENSION[normalizedContentType],
  };
}

function sanitizeTenantId(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(normalized)) {
    const err = new Error('The authenticated tenant identifier cannot be used as an object path');
    err.code = 'INVALID_TENANT_ID';
    err.status = 500;
    throw err;
  }
  return normalized;
}

/**
 * Generates a presigned PUT URL for uploading a document to SeaweedFS.
 *
 * @param {object} opts
 * @param {string} opts.redisKey   - Decrypted Redis key from X-Session-Token
 * @param {string} opts.category   - 'exam' | 'profile'
 * @returns {{ presignedUrl: string, documentId: string, objectKey: string }}
 */
async function generatePresignedUploadUrl({ redisKey, category, contentType, sizeBytes }) {
  const validated = validateUpload({ category, contentType, sizeBytes });
  const session = await getActiveSession(redisKey);
  const patientId = session.paciente.patientId;
  const clientId = sanitizeTenantId(session.systemId);
  const documentId = crypto.randomUUID();
  const envPrefix = getEnvPrefix();
  const categoryPath = CATEGORY_PATH[category];

  // Path: {env}/tenants/{tenant}/patients/{patientId}/{category}/{documentUUID}.{extension}
  const objectKey = `${envPrefix}/tenants/${clientId}/patients/${patientId}/${categoryPath}/${documentId}.${validated.extension}`;

  const cfg = getUploadConfig();

  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: objectKey,
    ContentType: validated.contentType,
    ...serverSideEncryptionParams(),
  });

  const presignedUrl = await getSignedUrl(getPublicS3Client(), command, { expiresIn: cfg.expiresIn });
  await registerUpload(
    redisKey,
    objectKey,
    category,
    validated.contentType,
    sizeBytes
  );

  logEvent('PRESIGNED_URL_GENERATED', {
    clientId,
    category,
    documentId,
    contentType: validated.contentType,
    sizeBytes,
    expiresIn: cfg.expiresIn,
    publicEndpoint: cfg.publicEndpoint ?? '(SDK regional endpoint)',
    internalEndpoint: cfg.internalEndpoint ?? '(SDK regional endpoint)',
    credentialsSource: cfg.credentials ? 'static keys' : 'task IAM role',
  });

  return {
    presignedUrl,
    documentId,
    objectKey,
    // La ficha repite estas cabeceras en el PUT; sin ellas S3 rechaza la firma.
    headers: serverSideEncryptionHeaders(),
    // Solo para la bitacora; el controlador lo retira de la respuesta.
    audit: { actor: sessionAuditActor(session), idTenant: session.paciente.tenantId ?? null },
  };
}

/**
 * Generates a presigned PUT URL for authenticated clinical workflows that are
 * no longer backed by a Redis intake session, such as adenda image replacement.
 */
async function generatePresignedPatientUploadUrl({ pacienteId, tenantId, category, contentType, sizeBytes }) {
  const validated = validateUpload({ category, contentType, sizeBytes });
  const patientId = String(pacienteId ?? '').trim();
  if (!patientId) {
    const err = new Error('pacienteId is required');
    err.code = 'INVALID_PATIENT_ID';
    err.status = 400;
    throw err;
  }

  const clientId = sanitizeTenantId(tenantId);
  const documentId = crypto.randomUUID();
  const envPrefix = getEnvPrefix();
  const categoryPath = CATEGORY_PATH[category];
  const objectKey = `${envPrefix}/tenants/${clientId}/patients/${patientId}/${categoryPath}/${documentId}.${validated.extension}`;

  const cfg = getUploadConfig();
  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: objectKey,
    ContentType: validated.contentType,
    ...serverSideEncryptionParams(),
  });

  const presignedUrl = await getSignedUrl(getPublicS3Client(), command, { expiresIn: cfg.expiresIn });

  logEvent('PRESIGNED_URL_GENERATED', {
    clientId,
    category,
    documentId,
    contentType: validated.contentType,
    sizeBytes,
    expiresIn: cfg.expiresIn,
    publicEndpoint: cfg.publicEndpoint ?? '(SDK regional endpoint)',
    internalEndpoint: cfg.internalEndpoint ?? '(SDK regional endpoint)',
    credentialsSource: cfg.credentials ? 'static keys' : 'task IAM role',
    mode: 'bearer-patient',
  });

  return { presignedUrl, documentId, objectKey, headers: serverSideEncryptionHeaders() };
}

async function verifyUploadedObjects(sessionPayload, body) {
  // Una lista vacia pasa por Redis Lua como `{}` durante la activacion.
  const sessionUploads = Array.isArray(sessionPayload.uploads) ? sessionPayload.uploads : [];
  const uploads = new Map(
    sessionUploads.map((upload) => [upload.objectKey, upload])
  );
  const references = [
    ...(body.warningSigns ?? [])
      .filter((item) => item.imageResourceId != null)
      .map((item) => item.imageResourceId),
    ...(body.examDiagnoses ?? [])
      .filter((item) => item.examResourceId != null)
      .map((item) => item.examResourceId),
  ];
  const uniqueReferences = [...new Set(references)];
  if (uniqueReferences.length === 0) return;
  const cfg = getUploadConfig();

  await Promise.all(uniqueReferences.map(async (objectKey) => {
    const expected = uploads.get(objectKey);
    try {
      const head = await getInternalS3Client().send(new HeadObjectCommand({
        Bucket: cfg.bucket,
        Key: objectKey,
      }));
      if (
        head.ContentLength !== expected.sizeBytes ||
        String(head.ContentType ?? '').toLowerCase() !== expected.contentType
      ) {
        const err = new Error('An uploaded object does not match its signed metadata');
        err.code = 'UPLOAD_METADATA_MISMATCH';
        err.status = 400;
        throw err;
      }
    } catch (err) {
      if (err.code === 'UPLOAD_METADATA_MISMATCH') throw err;
      const missing = new Error('An uploaded object could not be verified');
      missing.code = 'UPLOAD_NOT_FOUND';
      missing.status = 400;
      throw missing;
    }
  }));
}

async function generatePresignedReadUrl(objectKey, {
  expiresIn = 900,
  bucket,
  responseContentDisposition = 'inline',
  responseContentType,
} = {}) {
  if (!objectKey) return null;
  const cfg = getUploadConfig();
  const targetBucket = bucket || cfg.bucket;
  try {
    const head = await getInternalS3Client().send(new HeadObjectCommand({
      Bucket: targetBucket,
      Key: objectKey,
    }));
    const command = new GetObjectCommand({
      Bucket: targetBucket,
      Key: objectKey,
      ResponseContentDisposition: responseContentDisposition,
      ResponseContentType: responseContentType || head.ContentType || undefined,
    });
    return await getSignedUrl(getPublicS3Client(), command, { expiresIn });
  } catch (err) {
    logError('PRESIGNED_READ_URL_FAILED', { objectKey, error: err.message, code: err.code });
    return null;
  }
}

module.exports = {
  generatePresignedUploadUrl,
  generatePresignedPatientUploadUrl,
  generatePresignedReadUrl,
  CATEGORY_PATH,
  validateUpload,
  verifyUploadedObjects,
  getInternalS3Client,
  getUploadConfig,
  getEnvPrefix,
  getPresignExpirySeconds,
  sanitizeTenantId,
  DEFAULT_PRESIGN_EXPIRY_SECONDS,
  getServerSideEncryption,
  serverSideEncryptionParams,
};
