import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, argString } from '../lib/args.js';
import { readCsv, sha256File, writeCsv } from '../lib/csv.js';
import { anonymizeRows, FORBIDDEN_COLUMNS, OUTPUT_HEADERS } from '../lib/sigsa.js';

const args = parseArgs();
const input = argString(args, 'input');
const output = argString(args, 'output', 'output/sigsa_desidentified.csv');
const manifestPath = argString(args, 'manifest', 'output/manifest.json');
const datasetVersion = argString(args, 'dataset-version', process.env.DATASET_VERSION ?? 'sigsa-dev');
const schemaVersion = argString(args, 'schema-version', process.env.REPORTING_SCHEMA_VERSION ?? 'reporting-v1');

const rows = await readCsv(input);
const transformed = anonymizeRows(rows, datasetVersion);
fs.mkdirSync(path.dirname(output), { recursive: true });
writeCsv(output, transformed, [...OUTPUT_HEADERS]);

const manifest = {
  dataset_version: datasetVersion,
  schema_version: schemaVersion,
  source_filename: path.basename(input),
  generated_at: new Date().toISOString(),
  row_count: transformed.length,
  sha256: sha256File(output),
  removed_columns: FORBIDDEN_COLUMNS,
  transformed_columns: {
    FechaHora: 'fecha only',
    IdConsulta: 'sequential internal consulta_id',
    boolean_flags: 'normalized to true/false',
  },
};

fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Generated ${output} (${transformed.length} rows)`);
console.log(`Generated ${manifestPath}`);
