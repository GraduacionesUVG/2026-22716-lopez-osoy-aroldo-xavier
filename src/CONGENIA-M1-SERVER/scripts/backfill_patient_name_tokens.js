'use strict';

const db = require('../src/config/db');
const { decryptPatientName, patientNameToken, tokenizePatientName } = require('../src/utils/patientName');

async function main() {
  const res = await db.query(
    `SELECT paciente_id, nombre_enc, nombre_dek_enc
     FROM paciente p
     WHERE NOT EXISTS (
       SELECT 1 FROM paciente_nombre_token t WHERE t.paciente_id = p.paciente_id
     )`
  );

  let updated = 0;
  let skipped = 0;
  for (const row of res.rows) {
    let nombre;
    try {
      nombre = decryptPatientName(row.nombre_enc, row.nombre_dek_enc);
    } catch (_err) {
      skipped += 1;
      continue;
    }
    const tokens = tokenizePatientName(nombre);
    for (const token of tokens) {
      await db.query(
        `INSERT INTO paciente_nombre_token (paciente_id, token_hmac)
         VALUES ($1, $2)
         ON CONFLICT (paciente_id, token_hmac) DO NOTHING`,
        [row.paciente_id, patientNameToken(token)]
      );
    }
    updated += 1;
  }

  console.log(`Backfilled patient name tokens for ${updated} patients; skipped ${skipped} unreadable patients`);
}

main()
  .then(() => db.end())
  .catch((err) => {
    console.error(err);
    db.end().finally(() => process.exit(1));
  });
