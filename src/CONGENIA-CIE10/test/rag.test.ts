import test from "node:test";
import assert from "node:assert/strict";
import { mergeCatalogs, S3VectorCatalog, searchCatalogEntries } from "../src/rag/s3-vector-catalog.js";
import { enrichSuggestions } from "../src/pipeline/run.js";
import { normalizeCie10Code } from "../src/pipeline/normalize.js";
import { PutVectorsCommand } from "@aws-sdk/client-s3vectors";

test("merged RAG corpus preserves institutional and external provenance", () => {
  const merged = mergeCatalogs(
    [{ codigoInterno: "10", codigo: "N10", nombre: "Nefritis aguda" }],
    [
      { code: "N10", description: "Nefritis tubulointersticial aguda", level: "0", source: "reference" },
      { code: "S836", description: "Esguince de otras partes de la rodilla", level: "0", source: "reference" },
    ],
  );

  assert.deepEqual(merged.map((item) => item.codigo), ["N10", "S83.6"]);
  assert.equal(merged[0].enCatalogoInstitucional, true);
  assert.equal(merged[0].enReferenciaExterna, true);
  assert.equal(merged[1].enCatalogoInstitucional, false);
  assert.equal(merged[1].enReferenciaExterna, true);
});

test("suggestions outside the institutional catalog remain visible with low support", () => {
  const suggestions = enrichSuggestions(
    [
      { codigo: "N10", descripcion: "Nefritis", razonamiento: "Coincide con el texto." },
      { codigo: "S83.6", descripcion: "Esguince de rodilla", razonamiento: "Alternativa compatible." },
      { codigo: "Q99.99", descripcion: "Código no recuperado", razonamiento: "Requiere revisión." },
    ],
    new Map([["N10", { codigoInterno: "10", codigo: "N10", nombre: "Nefritis aguda" }]]),
    [{
      codigo: "S83.6", nombreInstitucional: null,
      descripcionReferencia: "Esguince de otras partes de la rodilla", jerarquia: [],
      enCatalogoInstitucional: false, enReferenciaExterna: true, distance: 0.31,
    }],
  );

  assert.deepEqual(suggestions.map((item) => item.soporte), [
    "VALIDADO_INSTITUCIONAL", "REFERENCIA_EXTERNA", "REQUIERE_ATENCION",
  ]);
  assert.equal(suggestions[2].codigoInternoCatalogo, null);
  assert.equal(suggestions[2].confianza, "BAJA");
});

test("confidence uses exact, lexical and semantic retrieval evidence", () => {
  const institutional = new Map([
    ["N10", { codigoInterno: "10", codigo: "N10", nombre: "Nefritis aguda" }],
    ["J00", { codigoInterno: "11", codigo: "J00", nombre: "Rinofaringitis aguda" }],
    ["A09", { codigoInterno: "12", codigo: "A09", nombre: "Diarrea infecciosa" }],
  ]);
  const suggestions = enrichSuggestions(
    [
      { codigo: "N10", descripcion: "Nefritis aguda" },
      { codigo: "J00", descripcion: "Rinofaringitis aguda" },
      { codigo: "A09", descripcion: "Diarrea infecciosa" },
      { codigo: "S83.6", descripcion: "Esguince de rodilla" },
    ],
    institutional,
    [
      {
        codigo: "N10", nombreInstitucional: "Nefritis aguda", descripcionReferencia: null,
        jerarquia: [], enCatalogoInstitucional: true, enReferenciaExterna: true,
        distance: null, matchType: "EXACT_TEXT", score: 120,
      },
      {
        codigo: "J00", nombreInstitucional: "Rinofaringitis aguda", descripcionReferencia: null,
        jerarquia: [], enCatalogoInstitucional: true, enReferenciaExterna: true,
        distance: null, matchType: "LEXICAL", score: 68,
      },
      {
        codigo: "A09", nombreInstitucional: "Diarrea infecciosa", descripcionReferencia: null,
        jerarquia: [], enCatalogoInstitucional: true, enReferenciaExterna: true,
        distance: 0.32, matchType: "SEMANTIC", score: 53,
      },
      {
        codigo: "S83.6", nombreInstitucional: null, descripcionReferencia: "Esguince de rodilla",
        jerarquia: [], enCatalogoInstitucional: false, enReferenciaExterna: true,
        distance: 0.3, matchType: "SEMANTIC", score: 54,
      },
    ],
  );

  assert.deepEqual(suggestions.map((suggestion) => suggestion.confianza), [
    "ALTA", "ALTA", "MEDIA", "MEDIA",
  ]);
});

test("undotted detailed codes are normalized before indexing", () => {
  assert.equal(normalizeCie10Code("s836"), "S83.6");
  assert.equal(normalizeCie10Code("N10"), "N10");
  assert.equal(normalizeCie10Code("S83004A"), "S83.004A");
});

test("reference hierarchy rejects missing parents before indexing", () => {
  assert.throws(() => mergeCatalogs([], [{
    code: "N10",
    code_0: "A00-B99",
    description: "Nefritis",
    level: "1",
  }]), /Missing ancestor/);
});

test("hybrid retrieval ranks exact catalog matches before semantic candidates", async () => {
  const queryInputs: Array<Record<string, unknown>> = [];
  const client = {
    async send(command: { input: Record<string, unknown> }) {
      queryInputs.push(command.input);
      return { vectors: [{
        key: "v1:N10",
        distance: 0.1,
        metadata: {
          codigo: "N10", descripcionReferencia: "Nefritis", jerarquia: [],
          enCatalogoInstitucional: true, enReferenciaExterna: true,
        },
      }] };
    },
  };
  const catalog = new S3VectorCatalog(
    client as never,
    { async embed() { return [[0.1, 0.2]]; } },
    "bucket",
    "index",
    async () => "v1",
    async () => [{
      codigo: "S83.6", nombreInstitucional: null, descripcionReferencia: "Esguince de rodilla",
      jerarquia: [], enCatalogoInstitucional: false, enReferenciaExterna: true,
      distance: null, matchType: "EXACT_TEXT", score: 90,
    }],
  );

  const result = await catalog.search("esguince de rodilla", "v1", 5);
  assert.equal(result[0].codigo, "S83.6");
  assert.equal(queryInputs[0]?.queryMode, "ENHANCED");
  assert.equal(queryInputs[0]?.topK, 50);
});

test("lexical retrieval tolerates partial terms and prioritizes exact descriptions", () => {
  const entries = mergeCatalogs([], [
    { code: "Q21.0", description: "Comunicacion interventricular", level: "0" },
    { code: "Q21.1", description: "Comunicacion interauricular", level: "0" },
    { code: "Q20.9", description: "Malformacion congenita cardiaca", level: "0" },
  ]);
  const exact = searchCatalogEntries(entries, "comunicacion interventricular", 5);
  assert.equal(exact[0]?.codigo, "Q21.0");
  const partial = searchCatalogEntries(entries, "comunicacion ventricular congenita", 5);
  assert.ok(partial.some((candidate) => candidate.codigo === "Q21.0"));
});

test("indexing omits empty metadata arrays and preserves populated hierarchy and version", async () => {
  const entries = mergeCatalogs(
    [{ codigoInterno: "10", codigo: "A00", nombre: "Colera" }], [],
  );
  entries.push({
    ...entries[0], codigo: "A00.8", codigoInterno: null,
    jerarquia: ["Colera"], ancestros: ["A00"], parentCodigo: "A00", nivel: 1,
    enCatalogoInstitucional: false,
  });
  const written: PutVectorsCommand["input"]["vectors"] = [];
  const client = {
    async send(command: unknown) {
      if (command instanceof PutVectorsCommand) {
        for (const vector of command.input.vectors ?? []) {
          const metadata = vector.metadata as Record<string, unknown>;
          assert.ok(Object.values(metadata).every((value) => !Array.isArray(value) || value.length > 0));
          written.push(vector);
        }
      }
      return {};
    },
  };
  const catalog = new S3VectorCatalog(
    client as never, { async embed(inputs) { return inputs.map(() => [0.1, 0.2]); } },
    "bucket", "index", async () => "production-active",
  );
  assert.equal(await catalog.index("eval-openai", entries), 2);
  const root = written[0].metadata as Record<string, unknown>;
  const child = written[1].metadata as Record<string, unknown>;
  assert.equal("jerarquia" in root, false);
  assert.equal("ancestros" in root, false);
  assert.equal(root.corpusVersion, "eval-openai");
  assert.equal(root.enReferenciaExterna, false);
  assert.deepEqual(child.jerarquia, ["Colera"]);
  assert.deepEqual(child.ancestros, ["A00"]);
  assert.equal(child.corpusVersion, "eval-openai");
  assert.deepEqual(written.map((vector) => vector.key), ["eval-openai:A00", "eval-openai:A00.8"]);
});
