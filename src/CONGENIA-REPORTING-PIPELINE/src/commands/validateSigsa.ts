import { parseArgs, argString } from '../lib/args.js';
import { readCsv } from '../lib/csv.js';
import { validateDesidentifiedHeaders } from '../lib/sigsa.js';

const args = parseArgs();
const input = argString(args, 'input');
const rows = await readCsv(input);
const headers = rows[0] ? Object.keys(rows[0]) : [];
const errors = validateDesidentifiedHeaders(headers);

for (const [index, row] of rows.entries()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.fecha ?? '')) {
    errors.push(`Row ${index + 1}: fecha must be YYYY-MM-DD`);
  }
  if (!row.consulta_id) errors.push(`Row ${index + 1}: consulta_id is required`);
  if (!row.dataset_version) errors.push(`Row ${index + 1}: dataset_version is required`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log(`Validated ${rows.length} desidentified SIGSA rows`);
