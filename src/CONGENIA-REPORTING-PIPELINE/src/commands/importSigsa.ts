import fs from 'node:fs';
import { Pool } from 'pg';
import { parseArgs, argString } from '../lib/args.js';
import { readCsv } from '../lib/csv.js';

const args = parseArgs();
const input = argString(args, 'input');
const manifestFile = argString(args, 'manifest');
const databaseUrl = process.env.REPORTING_DATABASE_ADMIN_URL;
const batchSize = Math.min(
  2000,
  Math.max(1, Number.parseInt(argString(args, 'batch-size', process.env.SIGSA_IMPORT_BATCH_SIZE ?? '1000'), 10) || 1000),
);

if (!databaseUrl) throw new Error('REPORTING_DATABASE_ADMIN_URL is required');

const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const rows = await readCsv(input);
const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

const columns = [
  'consulta_id',
  'fecha',
  'turno',
  'clinica',
  'tipo_clinica',
  'servicio',
  'departamento_hospitalario',
  'sexo',
  'edad_dias',
  'edad_meses',
  'edad_anios',
  'pueblo',
  'comunidad_linguistica',
  'departamento',
  'municipio',
  'diagnostico',
  'cie10',
  'cie10_descripcion',
  'nuevo',
  'primera',
  'reconsulta',
  'interconsulta',
  'emergencia',
  'dataset_version',
] as const;

function rowValues(row: Record<string, string>): unknown[] {
  return [
    row.consulta_id,
    row.fecha,
    row.turno,
    row.clinica,
    row.tipo_clinica,
    row.servicio,
    row.departamento_hospitalario,
    row.sexo,
    row.edad_dias || null,
    row.edad_meses || null,
    row.edad_anios || null,
    row.pueblo,
    row.comunidad_linguistica,
    row.departamento,
    row.municipio,
    row.diagnostico,
    row.cie10,
    row.cie10_descripcion,
    row.nuevo === 'true',
    row.primera === 'true',
    row.reconsulta === 'true',
    row.interconsulta === 'true',
    row.emergencia === 'true',
    row.dataset_version,
  ];
}

async function insertRowsInBatches(): Promise<void> {
  const columnCount = columns.length;
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const values: unknown[] = [];
    const placeholders = batch.map((row, rowIndex) => {
      values.push(...rowValues(row));
      const offset = rowIndex * columnCount;
      return `(${columns.map((_, colIndex) => `$${offset + colIndex + 1}`).join(',')})`;
    });

    await client.query(
      `INSERT INTO sigsa_consultas_mock (${columns.join(',')})
       VALUES ${placeholders.join(',')}`,
      values,
    );
    console.log(`Imported ${Math.min(start + batch.length, rows.length)} / ${rows.length} rows`);
  }
}

try {
  await client.query('BEGIN');
  await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await client.query(`
    CREATE TABLE IF NOT EXISTS dataset_versions (
      dataset_version text PRIMARY KEY,
      schema_version text NOT NULL,
      source_filename text NOT NULL,
      generated_at timestamptz NOT NULL,
      row_count integer NOT NULL,
      sha256 text NOT NULL,
      manifest jsonb NOT NULL,
      imported_at timestamptz NOT NULL DEFAULT now()
    )`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS sigsa_consultas_mock (
      consulta_id text PRIMARY KEY,
      fecha date NOT NULL,
      turno text,
      clinica text,
      tipo_clinica text,
      servicio text,
      departamento_hospitalario text,
      sexo text,
      edad_dias integer,
      edad_meses integer,
      edad_anios integer,
      pueblo text,
      comunidad_linguistica text,
      departamento text,
      municipio text,
      diagnostico text,
      cie10 text,
      cie10_descripcion text,
      nuevo boolean,
      primera boolean,
      reconsulta boolean,
      interconsulta boolean,
      emergencia boolean,
      dataset_version text NOT NULL REFERENCES dataset_versions(dataset_version)
    )`);
  await client.query(`
    CREATE OR REPLACE VIEW vw_sigsa_consultas_anon AS
    SELECT consulta_id, fecha, turno, clinica, tipo_clinica, servicio,
           departamento_hospitalario, sexo, edad_dias, edad_meses, edad_anios,
           pueblo, comunidad_linguistica, departamento, municipio, diagnostico,
           cie10, cie10_descripcion, nuevo, primera, reconsulta, interconsulta,
           emergencia, dataset_version
    FROM sigsa_consultas_mock`);
  await client.query(
    `INSERT INTO dataset_versions (
       dataset_version, schema_version, source_filename, generated_at, row_count, sha256, manifest
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (dataset_version) DO UPDATE SET
       schema_version = EXCLUDED.schema_version,
       source_filename = EXCLUDED.source_filename,
       generated_at = EXCLUDED.generated_at,
       row_count = EXCLUDED.row_count,
       sha256 = EXCLUDED.sha256,
       manifest = EXCLUDED.manifest`,
    [
      manifest.dataset_version,
      manifest.schema_version,
      manifest.source_filename,
      manifest.generated_at,
      manifest.row_count,
      manifest.sha256,
      manifest,
    ]
  );

  await client.query('DELETE FROM sigsa_consultas_mock WHERE dataset_version = $1', [manifest.dataset_version]);
  await insertRowsInBatches();
  await client.query('COMMIT');
  console.log(`Imported ${rows.length} rows for ${manifest.dataset_version}`);
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
  await pool.end();
}
