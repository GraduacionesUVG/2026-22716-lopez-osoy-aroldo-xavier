import fs from "node:fs";
import { Pool, type PoolClient } from "pg";
import type { AppConfig } from "../config.js";
import type { CatalogEntry, RunMetadata, SuggestionResult } from "../types.js";
import type { VectorCatalogEntry } from "../rag/s3-vector-catalog.js";

type SslOptions = { rejectUnauthorized: boolean; ca?: string; checkServerIdentity?: () => undefined };

/**
 * TLS hacia PostgreSQL con semantica de libpq. En AWS se usa verify-full con el
 * paquete de CA de RDS que va en la imagen (POSTGRES_SSL_CA_FILE).
 */
export function sslConfig(mode: string, caFile = process.env.POSTGRES_SSL_CA_FILE): false | SslOptions {
  const normalized = mode.trim().toLowerCase();
  switch (normalized) {
    case "disable":
      return false;
    case "prefer":
    case "require":
    case "no-verify":
      return { rejectUnauthorized: false };
    case "verify-ca":
    case "verify-full": {
      if (!caFile) throw new Error(`POSTGRES_SSL_MODE=${mode} requires POSTGRES_SSL_CA_FILE`);
      const ssl: SslOptions = { rejectUnauthorized: true, ca: fs.readFileSync(caFile, "utf8") };
      // Node valida el nombre del servidor por omision (verify-full); verify-ca no.
      if (normalized === "verify-ca") ssl.checkServerIdentity = () => undefined;
      return ssl;
    }
    default:
      throw new Error(`Invalid POSTGRES_SSL_MODE: ${mode}`);
  }
}

export function createPool(config: AppConfig): Pool {
  return new Pool({
    host: config.postgres.host,
    port: config.postgres.port,
    database: config.postgres.database,
    user: config.postgres.user,
    password: config.postgres.password,
    ssl: sslConfig(config.postgres.sslMode),
    max: 4,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
  });
}

export class Cie10Repository {
  constructor(private readonly pool: Pool) {}

  async createRun(meta: Omit<RunMetadata, "runId">): Promise<string> {
    const result = await this.pool.query(
      `INSERT INTO cie10_run (
         source_catalog_uri, source_translator_uri, model, prompt_version, max_records, rag_version, periodo
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING run_id`,
      [meta.sourceCatalogUri, meta.sourceTranslatorUri, meta.model, meta.promptVersion, meta.maxRecords,
        meta.ragVersion, meta.periodo],
    );
    return result.rows[0].run_id;
  }

  async finishRun(runId: string, status: "COMPLETED" | "FAILED", counts: {
    processedCount: number;
    suggestionCount: number;
    errorCount: number;
    tokenUsage: import("../ai/usage.js").TokenUsage;
    error?: string;
  }): Promise<void> {
    await this.pool.query(
      `UPDATE cie10_run
          SET estado = $2,
              processed_count = $3,
              suggestion_count = $4,
              error_count = $5,
              finished_at = now(),
              input_tokens = $6,
              cached_input_tokens = $7,
              output_tokens = $8,
              reasoning_tokens = $9,
              total_tokens = $10,
              api_call_count = $11,
              metadata_json = metadata_json || $12::jsonb
        WHERE run_id = $1`,
      [
        runId,
        status,
        counts.processedCount,
        counts.suggestionCount,
        counts.errorCount,
        counts.tokenUsage.inputTokens,
        counts.tokenUsage.cachedInputTokens,
        counts.tokenUsage.outputTokens,
        counts.tokenUsage.reasoningTokens,
        counts.tokenUsage.totalTokens,
        counts.tokenUsage.apiCalls,
        JSON.stringify(counts.error ? { error: counts.error } : {}),
      ],
    );
  }

  async replaceCatalog(entries: CatalogEntry[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE cie10_catalogo SET activo = false");
      for (const entry of entries) {
        await client.query(
          `INSERT INTO cie10_catalogo (codigo_interno, codigo, nombre, activo, importado_en)
           VALUES ($1, $2, $3, true, now())
           ON CONFLICT (codigo_interno) DO UPDATE SET
             codigo = EXCLUDED.codigo,
             nombre = EXCLUDED.nombre,
             activo = true,
             importado_en = now()`,
          [entry.codigoInterno, entry.codigo, entry.nombre],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async beginRagVersion(meta: {
    version: string;
    institutionalSha256: string;
    referenceSha256: string | null;
    referenceCommit: string | null;
    embeddingModel: string;
    embeddingDimensions: number;
  }): Promise<void> {
    const result = await this.pool.query(
      `INSERT INTO cie10_rag_version (
         rag_version, estado, institutional_sha256, reference_sha256,
         reference_commit, embedding_model, embedding_dimensions
       ) VALUES ($1, 'BUILDING', $2, $3, $4, $5, $6)
       ON CONFLICT (rag_version) DO UPDATE SET
         estado = 'BUILDING', institutional_sha256 = EXCLUDED.institutional_sha256,
         reference_sha256 = EXCLUDED.reference_sha256,
         reference_commit = EXCLUDED.reference_commit,
         embedding_model = EXCLUDED.embedding_model,
         embedding_dimensions = EXCLUDED.embedding_dimensions,
         vector_count = 0, metadata_json = '{}'::jsonb, activated_at = NULL
       WHERE cie10_rag_version.estado <> 'ACTIVE'
       RETURNING rag_version`,
      [meta.version, meta.institutionalSha256, meta.referenceSha256, meta.referenceCommit,
        meta.embeddingModel, meta.embeddingDimensions],
    );
    if (!result.rows[0]) {
      throw new Error(`RAG version ${meta.version} is already active; use a new version`);
    }
  }

  async activateRagVersion(
    version: string,
    vectorCount: number,
    metadata: Record<string, unknown>,
    activate = true,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (activate) {
        await client.query("UPDATE cie10_rag_version SET estado = 'ARCHIVED' WHERE estado = 'ACTIVE'");
      }
      // Bind the status consistently in SET and CASE; otherwise PostgreSQL
      // infers incompatible varchar/text types for the same parameter.
      const result = await client.query(
        `UPDATE cie10_rag_version
            SET estado = $4::varchar, vector_count = $2, metadata_json = $3::jsonb,
                activated_at = CASE WHEN $4::varchar = 'ACTIVE' THEN now() ELSE NULL END
          WHERE rag_version = $1 AND estado = 'BUILDING'
          RETURNING rag_version`,
        [version, vectorCount, JSON.stringify(metadata), activate ? "ACTIVE" : "READY"],
      );
      if (!result.rows[0]) throw new Error(`RAG version ${version} is not in BUILDING state`);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async replaceRagCatalog(version: string, entries: VectorCatalogEntry[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM cie10_rag_catalogo WHERE rag_version = $1", [version]);
      for (let offset = 0; offset < entries.length; offset += 500) {
        const rows = entries.slice(offset, offset + 500).map((entry) => ({
          codigo: entry.codigo,
          descripcion: entry.nombreInstitucional ?? entry.descripcionReferencia ?? entry.codigo,
          codigoInterno: entry.codigoInterno,
          institucional: entry.enCatalogoInstitucional,
          referencia: entry.enReferenciaExterna,
          descripcionNormalizada: entry.nombreInstitucional ?? entry.descripcionReferencia ?? entry.codigo,
          nivel: entry.nivel,
          parentCodigo: entry.parentCodigo,
          ancestros: entry.ancestros,
          source: entry.source,
          textoBusquedaNormalizado: [
            entry.nombreInstitucional,
            entry.descripcionReferencia,
            ...entry.jerarquia,
          ].filter(Boolean).join(" "),
        }));
        await client.query(
          `INSERT INTO cie10_rag_catalogo (
             rag_version, codigo, descripcion, codigo_interno,
             en_catalogo_institucional, en_referencia_externa,
             descripcion_normalizada, nivel, parent_codigo, ancestros, source,
             texto_busqueda_normalizado
           )
           SELECT $1, x.codigo, x.descripcion, x."codigoInterno", x.institucional, x.referencia,
                  lower(translate(x."descripcionNormalizada", 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')),
                  x.nivel, x."parentCodigo", x.ancestros, x.source,
                  lower(translate(x."textoBusquedaNormalizado", 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'))
             FROM jsonb_to_recordset($2::jsonb) AS x(
               codigo varchar, descripcion text, "codigoInterno" varchar,
               institucional boolean, referencia boolean, "descripcionNormalizada" text,
               nivel smallint, "parentCodigo" varchar, ancestros jsonb, source varchar,
               "textoBusquedaNormalizado" text
             )`,
          [version, JSON.stringify(rows)],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async searchRagCatalog(version: string, query: string, limit: number): Promise<import("../types.js").RagCandidate[]> {
    const normalized = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();
    const explicitCode = query.toUpperCase().match(/\b[A-Z]\d{2}(?:\.[0-9A-Z]{1,4})?\b/)?.[0] ?? null;
    const stopWords = new Set(["del", "con", "sin", "los", "las", "por", "para", "una", "uno", "tipo"]);
    const terms = normalized.split(/\s+/)
      .filter((term) => term.length >= 3 && !stopWords.has(term))
      .slice(0, 12);
    const result = await this.pool.query(
      `SELECT codigo, descripcion, en_catalogo_institucional, en_referencia_externa,
              ancestros, source,
              CASE
                WHEN $3::text IS NOT NULL AND codigo = $3 THEN 130
                WHEN descripcion_normalizada = $2 OR texto_busqueda_normalizado = $2 THEN 120
                ELSE 35 + (30.0 * matched.term_count / GREATEST(cardinality($4::text[]), 1))
                     + CASE WHEN en_catalogo_institucional THEN 0.5 ELSE 0 END
              END AS score,
              CASE
                WHEN $3::text IS NOT NULL AND codigo = $3 THEN 'EXACT_CODE'
                WHEN descripcion_normalizada = $2 OR texto_busqueda_normalizado = $2 THEN 'EXACT_TEXT'
                ELSE 'LEXICAL'
              END AS match_type
         FROM cie10_rag_catalogo
         CROSS JOIN LATERAL (
           SELECT count(*)::integer AS term_count
             FROM unnest($4::text[]) term
            WHERE COALESCE(texto_busqueda_normalizado, descripcion_normalizada) LIKE '%' || term || '%'
         ) matched
        WHERE rag_version = $1
          AND (($3::text IS NOT NULL AND codigo = $3)
            OR descripcion_normalizada = $2
            OR texto_busqueda_normalizado = $2
            OR matched.term_count > 0)
        ORDER BY score DESC, en_catalogo_institucional DESC, codigo ASC
        LIMIT $5`,
      [version, normalized, explicitCode, terms, limit],
    );
    return result.rows.map((row) => ({
      codigo: row.codigo,
      nombreInstitucional: row.en_catalogo_institucional ? row.descripcion : null,
      descripcionReferencia: row.descripcion,
      jerarquia: Array.isArray(row.ancestros) ? row.ancestros : [],
      enCatalogoInstitucional: row.en_catalogo_institucional,
      enReferenciaExterna: row.en_referencia_externa,
      distance: null,
      matchType: row.match_type,
      score: Number(row.score),
    }));
  }

  async failRagVersion(version: string, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE cie10_rag_version SET estado = 'FAILED', metadata_json = metadata_json || $2::jsonb
        WHERE rag_version = $1`,
      [version, JSON.stringify({ error: error.slice(0, 500) })],
    );
  }

  async activeRagVersion(): Promise<string> {
    const result = await this.pool.query(
      "SELECT rag_version FROM cie10_rag_version WHERE estado = 'ACTIVE' ORDER BY activated_at DESC LIMIT 1",
    );
    if (!result.rows[0]) throw new Error("CIE10_RAG_INDEX_NOT_READY");
    return result.rows[0].rag_version;
  }

  async alreadyProcessed(codigoTraductor: string): Promise<boolean> {
    const result = await this.pool.query(
      "SELECT 1 FROM cie10_sugerencia WHERE codigo_traductor = $1",
      [codigoTraductor],
    );
    return Boolean(result.rows[0]);
  }

  async hasMedicalDecision(codigoTraductor: string): Promise<boolean> {
    const result = await this.pool.query(
      "SELECT 1 FROM cie10_decision WHERE codigo_traductor = $1",
      [codigoTraductor],
    );
    return Boolean(result.rows[0]);
  }

  async saveSuggestion(runId: string, result: SuggestionResult, force: boolean): Promise<void> {
    const params = [
      result.codigoTraductor,
      runId,
      result.diagnostico,
      result.cie10Original,
      result.aiStatus,
      JSON.stringify(result.sugerencias),
      result.razonamientoClinico,
      result.error,
      result.modelo,
      result.procesadoEn,
      result.tokenUsage.inputTokens,
      result.tokenUsage.cachedInputTokens,
      result.tokenUsage.outputTokens,
      result.tokenUsage.reasoningTokens,
      result.tokenUsage.totalTokens,
      result.tokenUsage.apiCalls,
      result.ragVersion,
      result.inputSha256,
    ];

    if (force) {
      await this.pool.query(
        `INSERT INTO cie10_sugerencia (
           codigo_traductor, run_id, diagnostico, cie10_original, ai_status,
           sugerencias, razonamiento_clinico, error, modelo, procesado_en,
           input_tokens, cached_input_tokens, output_tokens, reasoning_tokens,
           total_tokens, api_call_count, rag_version, input_sha256
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10,
                   $11, $12, $13, $14, $15, $16, $17, $18)
         ON CONFLICT (codigo_traductor) DO UPDATE SET
           run_id = EXCLUDED.run_id,
           diagnostico = EXCLUDED.diagnostico,
           cie10_original = EXCLUDED.cie10_original,
           ai_status = EXCLUDED.ai_status,
           sugerencias = EXCLUDED.sugerencias,
           razonamiento_clinico = EXCLUDED.razonamiento_clinico,
           error = EXCLUDED.error,
           modelo = EXCLUDED.modelo,
           procesado_en = EXCLUDED.procesado_en,
           input_tokens = EXCLUDED.input_tokens,
           cached_input_tokens = EXCLUDED.cached_input_tokens,
           output_tokens = EXCLUDED.output_tokens,
           reasoning_tokens = EXCLUDED.reasoning_tokens,
           total_tokens = EXCLUDED.total_tokens,
           api_call_count = EXCLUDED.api_call_count,
           rag_version = EXCLUDED.rag_version,
           input_sha256 = EXCLUDED.input_sha256`,
        params,
      );
      return;
    }

    await this.pool.query(
      `INSERT INTO cie10_sugerencia (
         codigo_traductor, run_id, diagnostico, cie10_original, ai_status,
         sugerencias, razonamiento_clinico, error, modelo, procesado_en,
         input_tokens, cached_input_tokens, output_tokens, reasoning_tokens,
         total_tokens, api_call_count, rag_version, input_sha256
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10,
                 $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT (codigo_traductor) DO NOTHING`,
      params,
    );
  }

  async exportReviewedRows(client: PoolClient): Promise<Array<Record<string, string>>> {
    const result = await client.query(
      `SELECT d.codigo_traductor, s.diagnostico, d.decision, d.codigo_final,
              d.codigo_interno_catalogo, d.comentario, d.revisor_id,
              d.revisor_nombre, d.decidido_en
         FROM cie10_decision d
         JOIN cie10_sugerencia s ON s.codigo_traductor = d.codigo_traductor
        ORDER BY d.decidido_en ASC, d.codigo_traductor ASC`,
    );
    return result.rows.map((row) => ({
      Codigo: row.codigo_traductor,
      Diagnostico: row.diagnostico,
      Decision: row.decision,
      Sugerencia: row.decision === "ACEPTADA" ? row.codigo_final : "RECHAZADA",
      Correccion: row.decision === "RECHAZADA" ? row.codigo_final : "",
      CIE_10_Final: row.codigo_final,
      Codigo_Dictaminado_Medico: row.codigo_final,
      Codigo_Interno_Catalogo: row.codigo_interno_catalogo ?? "",
      Comentario: row.comentario ?? "",
      Justificacion_Rechazo: row.decision === "RECHAZADA" ? row.comentario ?? "" : "",
      RevisorId: row.revisor_id,
      RevisorNombre: row.revisor_nombre,
      DecididoEn: new Date(row.decidido_en).toISOString(),
    }));
  }

  connect(): Promise<PoolClient> {
    return this.pool.connect();
  }
}
