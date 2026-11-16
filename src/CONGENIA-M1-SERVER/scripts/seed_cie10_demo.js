'use strict';

const crypto = require('node:crypto');
const db = require('../src/config/db');

const RUN_ID = 'd3f2a171-255a-4d78-9db5-c1e100000001';
const RAG_VERSION = 'demo-local-v1';

const CASES = [
  {
    id: 'DEMO-CIE10-001',
    diagnosis: 'Inflamacion renal aguda',
    suggestions: [
      option('N10', 'Nefritis tubulointersticial aguda', 'VALIDADO_INSTITUCIONAL', 'ALTA', 0.16,
        'El texto describe un proceso renal agudo compatible.', []),
      option('N12', 'Nefritis tubulointersticial no especificada como aguda o cronica', 'REFERENCIA_EXTERNA', 'MEDIA', 0.34,
        'Alternativa menos especifica si no se confirma el curso agudo.', ['confirmacion del curso agudo']),
    ],
  },
  {
    id: 'DEMO-CIE10-002',
    diagnosis: 'Esguince de rodilla sin lateralidad ni ligamento especificado',
    suggestions: [
      option('S83.6', 'Esguince de otras partes y las no especificadas de la rodilla', 'REFERENCIA_EXTERNA', 'MEDIA', 0.29,
        'Es compatible sin inferir una estructura lesionada.', ['lateralidad', 'estructura lesionada']),
      option('S83.9', 'Traumatismo de estructuras no especificadas de la rodilla', 'REFERENCIA_EXTERNA', 'BAJA', 0.43,
        'Alternativa amplia cuando el texto no permite mayor especificidad.', ['lateralidad', 'estructura lesionada']),
    ],
  },
  {
    id: 'DEMO-CIE10-003',
    diagnosis: 'Cefalea recurrente sin otros hallazgos descritos',
    suggestions: [
      option('R51.9', 'Cefalea, no especificada', 'REFERENCIA_EXTERNA', 'MEDIA', 0.27,
        'El texto solo permite codificar el sintoma no especificado.', ['tipo de cefalea', 'signos asociados']),
    ],
  },
  {
    id: 'DEMO-CIE10-004',
    diagnosis: 'Dolor de rodilla derecha',
    suggestions: [
      option('M25.561', 'Dolor en rodilla derecha', 'REQUIERE_ATENCION', 'BAJA', null,
        'El codigo conserva la lateralidad indicada, pero no fue recuperado del corpus demo.', []),
    ],
  },
  {
    id: 'DEMO-CIE10-005',
    diagnosis: 'Control administrativo',
    suggestions: [],
    status: 'insufficient_information',
    reason: 'El texto no contiene informacion clinica codificable.',
  },
  {
    id: 'DEMO-CIE10-006',
    diagnosis: 'Infeccion urinaria sin sitio especificado',
    suggestions: [
      option('N39.0', 'Infeccion de vias urinarias, sitio no especificado', 'VALIDADO_INSTITUCIONAL', 'ALTA', 0.12,
        'Coincide con el diagnostico y evita inferir un sitio anatomico.', []),
    ],
  },
];

function option(codigo, nombreCatalogo, soporte, confianza, distanciaRag, razonamiento, informacionFaltante) {
  return {
    codigo,
    descripcionModelo: nombreCatalogo,
    codigoInternoCatalogo: null,
    nombreCatalogo,
    razonamiento,
    soporte,
    confianza,
    distanciaRag,
    informacionFaltante,
  };
}

async function removeDemo(client) {
  await client.query('DELETE FROM cie10_decision_historial WHERE codigo_traductor LIKE $1', ['DEMO-CIE10-%']);
  await client.query('DELETE FROM cie10_decision WHERE codigo_traductor LIKE $1', ['DEMO-CIE10-%']);
  await client.query('DELETE FROM cie10_revision_item WHERE run_id = $1', [RUN_ID]);
  await client.query('DELETE FROM cie10_lote_confirmacion WHERE run_id = $1', [RUN_ID]);
  await client.query('DELETE FROM cie10_sugerencia WHERE run_id = $1', [RUN_ID]);
  await client.query('DELETE FROM cie10_run WHERE run_id = $1', [RUN_ID]);
  await client.query('DELETE FROM cie10_rag_version WHERE rag_version = $1', [RAG_VERSION]);
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The CIE-10 demo seed is disabled in production');
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await removeDemo(client);
    if (process.argv.includes('--clean')) {
      await client.query('COMMIT');
      console.log(JSON.stringify({ event: 'CIE10_DEMO_REMOVED', runId: RUN_ID }));
      return;
    }

    const active = await client.query(
      "SELECT rag_version FROM cie10_rag_version WHERE estado = 'ACTIVE' LIMIT 1"
    );
    if (active.rows[0]) {
      throw new Error(`Refusing to replace active RAG version ${active.rows[0].rag_version}`);
    }
    await client.query(
      `INSERT INTO cie10_rag_version (
         rag_version, estado, institutional_sha256, reference_sha256,
         reference_commit, embedding_model, embedding_dimensions, vector_count, activated_at
       ) VALUES ($1, 'ACTIVE', $2, $3, 'demo', 'fixture', 1, $4, now())`,
      [RAG_VERSION, 'a'.repeat(64), 'b'.repeat(64), CASES.length]
    );

    const catalog = CASES.flatMap((item) => item.suggestions)
      .filter((item, index, all) => all.findIndex((candidate) => candidate.codigo === item.codigo) === index);
    for (const item of catalog) {
      await client.query(
        `INSERT INTO cie10_rag_catalogo (
           rag_version, codigo, descripcion, codigo_interno,
           en_catalogo_institucional, en_referencia_externa
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [RAG_VERSION, item.codigo, item.nombreCatalogo, item.codigoInternoCatalogo,
          item.soporte === 'VALIDADO_INSTITUCIONAL', item.soporte !== 'REQUIERE_ATENCION']
      );
    }

    await client.query(
      `INSERT INTO cie10_run (
         run_id, estado, source_catalog_uri, source_translator_uri, model,
         prompt_version, processed_count, suggestion_count, finished_at, rag_version
       ) VALUES ($1, 'COMPLETED', 'fixture://cie10-demo', 'fixture://translator-demo',
                 'fixture-demo', 'rag-autocoding-demo-v1', $2, $3, now(), $4)`,
      [RUN_ID, CASES.length, catalog.length, RAG_VERSION]
    );

    for (const item of CASES) {
      await client.query(
        `INSERT INTO cie10_sugerencia (
           codigo_traductor, run_id, diagnostico, cie10_original, ai_status,
           sugerencias, razonamiento_clinico, modelo, procesado_en, rag_version, input_sha256
         ) VALUES ($1, $2, $3, '-1', $4, $5::jsonb, $6, 'fixture-demo', now(), $7, $8)`,
        [item.id, RUN_ID, item.diagnosis, item.status ?? 'suggestions', JSON.stringify(item.suggestions),
          item.reason ?? null, RAG_VERSION, crypto.createHash('sha256').update(item.diagnosis).digest('hex')]
      );
    }

    await client.query('COMMIT');
    console.log(JSON.stringify({ event: 'CIE10_DEMO_READY', runId: RUN_ID, records: CASES.length }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
