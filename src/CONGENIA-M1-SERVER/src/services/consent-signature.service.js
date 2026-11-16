'use strict';

const crypto = require('crypto');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const {
  getInternalS3Client,
  getUploadConfig,
  getEnvPrefix,
  sanitizeTenantId,
  serverSideEncryptionParams,
} = require('./upload.service');
const { logError } = require('../config/logger');

// La firma del consentimiento vive en S3, nunca en la base. La fila guarda
// solo su ruta (firma_png_ref) y su hash (firma_png_hash_sha256); el worker
// del PDF la descarga y verifica ese hash antes de dibujarla.

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DATA_URL_PREFIX = /^data:image\/png;base64,/i;
const DEFAULT_MAX_BYTES = 200 * 1024;

// Unicos campos de firmaEvidenciaTecnica que se persisten. Cualquier otro
// (firmaBase64, strokes con coordenadas y tiempos, etc.) se descarta.
const EVIDENCE_STRING_FIELDS = {
  timestamp: 40,
  userAgent: 500,
  source: 50,
  canvasHash: 64,
  version_texto_legal: 50,
  versionTextoLegal: 50,
  codigoDocumento: 50,
};
const MAX_DECLARACIONES = 20;

function appError(status, code, message) {
  const err = new Error(message ?? code);
  err.status = status;
  err.code = code;
  return err;
}

function getMaxSignatureBytes() {
  const raw = process.env.CONSENT_SIGNATURE_MAX_BYTES;
  if (raw == null || String(raw).trim() === '') return DEFAULT_MAX_BYTES;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw appError(500, 'CONSENT_SIGNATURE_CONFIG_INVALID', 'CONSENT_SIGNATURE_MAX_BYTES must be a positive integer');
  }
  return parsed;
}

/**
 * Firma enviada por el cliente. `consent.firmaPng` es el campo vigente;
 * `firmaEvidenciaTecnica.firmaBase64` es el formato anterior del frontend y se
 * acepta mientras dure la transicion.
 */
function resolveSignatureInput(consent) {
  if (typeof consent?.firmaPng === 'string' && consent.firmaPng.trim() !== '') {
    return consent.firmaPng;
  }
  const legacy = consent?.firmaEvidenciaTecnica?.firmaBase64;
  if (typeof legacy === 'string' && legacy.trim() !== '') return legacy;
  return null;
}

/** Decodifica y valida el PNG. Lanza 400 INVALID_SIGNATURE_PNG si no sirve. */
function parseSignaturePng(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    throw appError(400, 'INVALID_SIGNATURE_PNG', 'consent.firmaPng is required');
  }
  const payload = input.trim().replace(DATA_URL_PREFIX, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) {
    throw appError(400, 'INVALID_SIGNATURE_PNG', 'consent.firmaPng must be a base64 PNG');
  }
  const buffer = Buffer.from(payload, 'base64');
  if (buffer.length > getMaxSignatureBytes()) {
    throw appError(400, 'INVALID_SIGNATURE_PNG', 'consent.firmaPng exceeds the maximum size');
  }
  if (buffer.length <= PNG_MAGIC.length || !buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw appError(400, 'INVALID_SIGNATURE_PNG', 'consent.firmaPng is not a PNG image');
  }
  return {
    buffer,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

function boundedString(value, max) {
  if (typeof value !== 'string') return undefined;
  return value.slice(0, max);
}

/** Copia de la evidencia tecnica con solo los campos permitidos. */
function sanitizeEvidence(evidence) {
  const source = evidence && typeof evidence === 'object' && !Array.isArray(evidence) ? evidence : {};
  const clean = {};
  for (const [field, max] of Object.entries(EVIDENCE_STRING_FIELDS)) {
    const value = boundedString(source[field], max);
    if (value !== undefined) clean[field] = value;
  }
  if (Array.isArray(source.declaraciones)) {
    clean.declaraciones = source.declaraciones
      .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      .slice(0, MAX_DECLARACIONES)
      .map((item) => ({
        titulo: boundedString(item.titulo, 200) ?? '',
        descripcion: boundedString(item.descripcion, 2000) ?? '',
        aceptada: item.aceptada === true,
        obligatoria: item.obligatoria === true,
      }));
  }
  return clean;
}

/** Junto al PDF del mismo consentimiento (ver consent-pdf-processor del worker). */
function buildSignatureKey({ systemId, pacienteId, consentimientoId }) {
  const tenant = sanitizeTenantId(systemId);
  return `${getEnvPrefix()}/tenants/${tenant}/patients/${pacienteId}/consents/${consentimientoId}-firma.png`;
}

async function putSignaturePng({ key, buffer, sha256, consentimientoId }) {
  const { bucket } = getUploadConfig();
  await getInternalS3Client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: 'image/png',
    Metadata: { consentimientoid: consentimientoId, sha256 },
    ...serverSideEncryptionParams(),
  }));
}

/** Best-effort: limpia la firma de un alta que no llego a COMMIT. */
async function deleteSignaturePng(key) {
  try {
    const { bucket } = getUploadConfig();
    await getInternalS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    logError('FIRMA_PNG_DELETE_FAILED', { key, error: err.message });
  }
}

module.exports = {
  resolveSignatureInput,
  parseSignaturePng,
  sanitizeEvidence,
  buildSignatureKey,
  putSignaturePng,
  deleteSignaturePng,
};
