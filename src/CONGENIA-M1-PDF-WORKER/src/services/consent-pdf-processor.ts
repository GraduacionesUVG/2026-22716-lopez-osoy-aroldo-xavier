import { env } from '../config/env';
import { sha256Hex } from '../lib/hash';
import { getObjectBuffer, parseS3Ref, putObjectBuffer } from '../lib/s3';
import {
  findConsentPdfSourceById,
  updateConsentPdfRefIfMissing,
  type ConsentPdfSourceRecord,
} from '../repositories/consent.repository';
import { renderConsentPdf } from './pdf.service';
import type { ConsentPdfGenerateRequestedEvent } from '../types/event';

export class PermanentProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentProcessingError';
  }
}

export type ProcessResult =
  | {
      status: 'processed';
      pdfKey: string;
      pdfHashSha256: string;
    }
  | {
      status: 'skipped';
      reason: string;
      pdfKey?: string;
    };

function toBase64Payload(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const commaIdx = trimmed.indexOf(',');
  const payload = commaIdx >= 0 ? trimmed.slice(commaIdx + 1) : trimmed;
  return payload || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Formato anterior: la firma venia en base64 dentro de firma_evidencia_tecnica.
 * Solo sirve para filas que el backfill del server aun no movio a S3; se
 * elimina cuando chk_evidencia_sin_png quede validada.
 */
function findEmbeddedSignaturePng(source: unknown): Buffer | null {
  if (!isRecord(source)) return null;

  const candidates: unknown[] = [
    source.firmaBase64,
    source.firma,
    source.signatureBase64,
    source.signature,
  ];

  if (isRecord(source.consentimiento)) {
    candidates.push(
      source.consentimiento.firmaBase64,
      source.consentimiento.firma,
      source.consentimiento.signatureBase64,
      source.consentimiento.signature
    );
  }

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const payload = toBase64Payload(candidate);
    if (!payload) continue;

    try {
      const data = Buffer.from(payload, 'base64');
      if (data.length > 0) return data;
    } catch {
      // ignore invalid base64 candidate
    }
  }

  return null;
}

/**
 * La firma vive en S3 (firma_png_ref) y se dibuja solo si sus bytes coinciden
 * con firma_png_hash_sha256: un objeto alterado o reemplazado nunca llega a un
 * PDF. Un descalce es permanente y manda el job a la DLQ.
 */
async function loadSignaturePng(record: ConsentPdfSourceRecord): Promise<Buffer | undefined> {
  const ref = record.firma_png_ref?.trim();
  if (!ref) {
    return findEmbeddedSignaturePng(record.firma_evidencia_tecnica) ?? undefined;
  }

  const { bucket, key } = parseS3Ref(ref, env.S3_BUCKET);
  const png = await getObjectBuffer(bucket, key);
  if (sha256Hex(png) !== record.firma_png_hash_sha256) {
    throw new PermanentProcessingError('signature_hash_mismatch');
  }
  return png;
}

export async function processConsentPdfEvent(
  event: ConsentPdfGenerateRequestedEvent
): Promise<ProcessResult> {
  const record = await findConsentPdfSourceById(event.consentimiento_id);

  if (!record) {
    throw new PermanentProcessingError('consentimiento_not_found');
  }

  if (record.ficha_id !== event.ficha_id) {
    throw new PermanentProcessingError('ficha_id_mismatch');
  }

  if (record.pdf_ref && record.pdf_ref.trim().length > 0) {
    return {
      status: 'skipped',
      reason: 'pdf_already_exists',
      pdfKey: record.pdf_ref,
    };
  }

  const signaturePng = await loadSignaturePng(record);

  const pdfBuffer = await renderConsentPdf({
    event,
    record,
    signaturePng,
  });

  const environment = env.APP_ENV.toLowerCase();
  const tenant = record.system_id.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(tenant)) {
    throw new PermanentProcessingError('invalid_tenant_id');
  }

  const pdfKey = `${environment}/tenants/${tenant}/patients/${record.paciente_id}/consents/${record.consentimiento_id}.pdf`;
  const pdfHashSha256 = sha256Hex(pdfBuffer);

  await putObjectBuffer(env.S3_BUCKET, pdfKey, pdfBuffer, 'application/pdf', {
    jobid: event.jobId,
    consentimientoid: record.consentimiento_id,
    fichaid: record.ficha_id,
  });

  const updated = await updateConsentPdfRefIfMissing(
    record.consentimiento_id,
    pdfKey,
    pdfHashSha256,
    {
      jobId: event.jobId,
      fichaId: record.ficha_id,
      firmaPngHashSha256: signaturePng ? sha256Hex(signaturePng) : null,
    }
  );

  if (!updated) {
    return {
      status: 'skipped',
      reason: 'pdf_set_by_other_worker',
      pdfKey,
    };
  }

  return {
    status: 'processed',
    pdfKey,
    pdfHashSha256,
  };
}
