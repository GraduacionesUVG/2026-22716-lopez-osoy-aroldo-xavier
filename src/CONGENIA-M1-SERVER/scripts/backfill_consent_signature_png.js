'use strict';

// Mueve a S3 las firmas de consentimientos historicos que quedaron dentro de
// firma_evidencia_tecnica (clave firmaBase64), y despues valida
// chk_evidencia_sin_png (12_firma_png_s3.sql).
//
//   node scripts/backfill_consent_signature_png.js --dry-run
//   node scripts/backfill_consent_signature_png.js
//
// Idempotente: solo toca filas que todavia tienen firmaBase64. Por fila sube
// el PNG y luego, en una transaccion, actualiza la fila y escribe
// FIRMA_EVIDENCIA_MIGRADA con el hash anterior y el nuevo de la evidencia.

const crypto = require('crypto');
const db = require('../src/config/db');
const { canonicalJson } = require('../src/utils/canonicalJson');
const {
  parseSignaturePng,
  buildSignatureKey,
  putSignaturePng,
} = require('../src/services/consent-signature.service');

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 50;
const ACTOR = 'system:backfill-firma-png';

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function fetchBatch(afterId) {
  const res = await db.query(
    `SELECT c.consentimiento_id::text, c.ficha_id::text, c.firma_evidencia_tecnica,
            c.json_hash_sha256, f.paciente_id::text, f.id_tenant, p.system_id
     FROM consentimiento c
     JOIN ficha_clinica f ON f.ficha_id = c.ficha_id
     JOIN paciente p ON p.paciente_id = f.paciente_id
     WHERE c.firma_evidencia_tecnica ? 'firmaBase64'
       AND c.consentimiento_id > $1::uuid
     ORDER BY c.consentimiento_id
     LIMIT $2`,
    [afterId, BATCH_SIZE]
  );
  return res.rows;
}

async function migrateRow(row, runId) {
  const signature = parseSignaturePng(row.firma_evidencia_tecnica.firmaBase64);
  const { firmaBase64: _omit, ...evidence } = row.firma_evidencia_tecnica;
  const jsonHashNuevo = sha256Hex(canonicalJson(evidence));
  const key = buildSignatureKey({
    systemId: row.system_id,
    pacienteId: row.paciente_id,
    consentimientoId: row.consentimiento_id,
  });

  if (DRY_RUN) return { key, signature };

  await putSignaturePng({
    key,
    buffer: signature.buffer,
    sha256: signature.sha256,
    consentimientoId: row.consentimiento_id,
  });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE consentimiento
       SET firma_png_ref = $1,
           firma_png_hash_sha256 = $2,
           firma_evidencia_tecnica = firma_evidencia_tecnica - 'firmaBase64',
           json_hash_sha256 = $3
       WHERE consentimiento_id = $4
         AND firma_evidencia_tecnica ? 'firmaBase64'`,
      [key, signature.sha256, jsonHashNuevo, row.consentimiento_id]
    );
    if (updated.rowCount === 1) {
      await client.query(
        `INSERT INTO auditoria_evento (
           tipo_evento, entidad_tipo, entidad_id, ip_origen, resultado,
           detalle_json, actor_sub, id_tenant, request_id
         ) VALUES ('FIRMA_EVIDENCIA_MIGRADA', 'Consentimiento', $1, '0.0.0.0', 'EXITOSO',
                   $2::jsonb, $3, $4, $5)`,
        [
          row.consentimiento_id,
          JSON.stringify({
            fichaId: row.ficha_id,
            firmaPngRef: key,
            firmaPngHashSha256: signature.sha256,
            jsonHashAnterior: row.json_hash_sha256,
            jsonHashNuevo,
          }),
          ACTOR,
          row.id_tenant,
          runId,
        ]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { key, signature };
}

async function validateConstraint() {
  try {
    await db.query('ALTER TABLE consentimiento VALIDATE CONSTRAINT chk_evidencia_sin_png');
    console.log('chk_evidencia_sin_png validada');
  } catch (err) {
    if (err.code !== '42501') throw err;
    // congenia_app no es dueno de la tabla.
    console.log(
      'Sin permiso para validar la restriccion con este usuario. Ejecutar como propietario:\n' +
        '  ALTER TABLE consentimiento VALIDATE CONSTRAINT chk_evidencia_sin_png;'
    );
  }
}

async function main() {
  const runId = crypto.randomUUID();
  let afterId = '00000000-0000-0000-0000-000000000000';
  let migrated = 0;
  let failed = 0;

  for (;;) {
    const rows = await fetchBatch(afterId);
    if (rows.length === 0) break;
    for (const row of rows) {
      afterId = row.consentimiento_id;
      try {
        const { key, signature } = await migrateRow(row, runId);
        migrated += 1;
        console.log(`${DRY_RUN ? '[dry-run] ' : ''}${row.consentimiento_id} -> ${key} (${signature.buffer.length} bytes)`);
      } catch (err) {
        failed += 1;
        console.error(`${row.consentimiento_id}: ${err.code ?? 'ERROR'} ${err.message}`);
      }
    }
  }

  console.log(`${DRY_RUN ? '[dry-run] ' : ''}Firmas migradas: ${migrated}; fallidas: ${failed}; run ${runId}`);

  if (!DRY_RUN) {
    if (failed === 0) {
      await validateConstraint();
    } else {
      console.log('Quedan filas con firmaBase64: la restriccion no se valida.');
      process.exitCode = 1;
    }
  }
}

main()
  .then(() => db.end())
  .catch((err) => {
    console.error(err);
    db.end().finally(() => process.exit(1));
  });
