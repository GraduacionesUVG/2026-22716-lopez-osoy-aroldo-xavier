import { pool, query } from '../lib/db';

export interface ConsentPdfSourceRecord {
  consentimiento_id: string;
  ficha_id: string;
  paciente_id: string;
  paciente_ext_id: string | null;
  system_id: string;
  medico_id: string;
  tipo_firmante: string;
  nombre_firmante: string | null;
  idioma_consentimiento: string;
  version_texto_legal: string;
  fecha_hora_aceptacion: string;
  firma_evidencia_tecnica: unknown;
  firma_png_ref: string | null;
  firma_png_hash_sha256: string;
  pdf_ref: string | null;
  fecha_consulta: string;
  medico_nombre: string | null;
  especialidad_medico: string;
  diagnosticos_ext_texto: string | null;
}

export async function findConsentPdfSourceById(
  consentimientoId: string
): Promise<ConsentPdfSourceRecord | null> {
  const result = await query<ConsentPdfSourceRecord>(
    `SELECT
       c.consentimiento_id::text,
       c.ficha_id::text,
       f.paciente_id::text,
       p.paciente_ext_id,
       p.system_id,
       c.medico_id::text,
       c.tipo_firmante,
       c.nombre_firmante,
       c.idioma_consentimiento,
       COALESCE(
         c.firma_evidencia_tecnica->>'codigoDocumento',
         c.firma_evidencia_tecnica->>'versionTextoLegal',
         c.firma_evidencia_tecnica->>'version_texto_legal',
         'CONSENTIMIENTO_V1'
       ) AS version_texto_legal,
       c.fecha_hora_aceptacion::text,
       c.firma_evidencia_tecnica,
       c.firma_png_ref,
       c.firma_png_hash_sha256,
       c.pdf_ref,
       f.fecha_consulta::text,
       u.nombre AS medico_nombre,
       u.especialidad AS especialidad_medico,
       f.diagnosticos_ext_texto
     FROM consentimiento c
     JOIN ficha_clinica f ON f.ficha_id = c.ficha_id
     JOIN paciente p ON p.paciente_id = f.paciente_id
     JOIN usuario u ON u.usuario_id = c.medico_id
     WHERE c.consentimiento_id = $1`,
    [consentimientoId]
  );

  return result.rows[0] ?? null;
}

export interface PdfAuditInfo {
  jobId: string;
  fichaId: string;
  /** Hash del PNG de la firma que se dibujo; null si el PDF salio sin firma. */
  firmaPngHashSha256: string | null;
}

/**
 * Stores the PDF reference and, in the same transaction, the
 * PDF_CONSENTIMIENTO_GENERADO row of the audit trail: the reference never
 * lands without its audit event. The hash chain is set by the database trigger
 * (CONGENIA-M1-SERVER/db/init/06_audit_trail.sql).
 */
export async function updateConsentPdfRefIfMissing(
  consentimientoId: string,
  pdfRef: string,
  pdfHashSha256: string,
  audit: PdfAuditInfo
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE consentimiento
       SET pdf_ref = $1,
           pdf_hash_sha256 = $2
       WHERE consentimiento_id = $3
         AND (pdf_ref IS NULL OR btrim(pdf_ref) = '')`,
      [pdfRef, pdfHashSha256, consentimientoId]
    );
    const updated = (result.rowCount ?? 0) > 0;

    if (updated) {
      await client.query(
        `INSERT INTO auditoria_evento (
           tipo_evento, entidad_tipo, entidad_id, ip_origen, resultado,
           detalle_json, actor_sub, id_tenant, request_id
         )
         SELECT 'PDF_CONSENTIMIENTO_GENERADO', 'Consentimiento', $1, '0.0.0.0', 'EXITOSO',
                $2::jsonb, 'system:pdf-worker', f.id_tenant, $3
         FROM ficha_clinica f
         WHERE f.ficha_id = $4`,
        [
          consentimientoId,
          JSON.stringify({
            fichaId: audit.fichaId,
            pdfRef,
            pdfHashSha256,
            firmaPngHashSha256: audit.firmaPngHashSha256,
          }),
          audit.jobId,
          audit.fichaId,
        ]
      );
    }

    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
