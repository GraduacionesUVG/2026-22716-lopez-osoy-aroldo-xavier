import test from "node:test";
import assert from "node:assert/strict";
import {
  FixtureCie10Provider,
  buildCie10Report,
  evaluateCie10Cases,
  readCie10EvaluationCases,
} from "../src/evaluation/cie10-evaluation.js";

test("readCie10EvaluationCases parses pilot and final suites", () => {
  assert.equal(readCie10EvaluationCases("evaluation/cie10/pilot-40.json").length, 40);
  assert.equal(readCie10EvaluationCases("evaluation/cie10/final-100.json").length, 100);
});

test("evaluateCie10Cases calculates top-k matches with fixture provider", async () => {
  const cases = [
    {
      codigoTraductor: "1",
      diagnostico: "infeccion urinaria",
      expectedCodes: ["N39.0"],
      fixtureSuggestions: ["A00", "N39.0"],
    },
  ];
  const report = await evaluateCie10Cases({
    cases,
    provider: new FixtureCie10Provider(cases),
    providerName: "fixture",
    casesFile: "memory",
    catalogCodes: new Set(["A00", "N39.0"]),
    generatedAt: "2026-01-01T00:00:00.000Z",
  });

  assert.equal(report.totals.top1Accuracy, 0);
  assert.equal(report.totals.top3Accuracy, 1);
  assert.equal(report.totals.top5Accuracy, 1);
  assert.equal(report.totals.top10Accuracy, 1);
  assert.equal(report.totals.suggestionResponseRate, 1);
  assert.equal(report.totals.averageSuggestionCount, 2);
});

test("buildCie10Report tracks invalid codes and abstentions", () => {
  const report = buildCie10Report("memory", "fixture", [
    {
      codigoTraductor: "1",
      diagnostico: "texto insuficiente",
      expectedCodes: ["N39.0"],
      status: "insufficient_information",
      suggestedCodes: [],
      invalidCodes: [],
      top1Match: false,
      top3Match: false,
      top5Match: false,
      top10Match: false,
      reciprocalRank: 0,
      retrievalEvaluated: false,
      retrievedCodes: [],
      retrievalTop1Match: false,
      retrievalTop3Match: false,
      retrievalTop5Match: false,
      retrievalReciprocalRank: 0,
      abstained: true,
      emptySuggestion: false,
      error: null,
      latencyMs: 10,
      tokenUsage: { apiCalls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    },
    {
      codigoTraductor: "2",
      diagnostico: "codigo inventado",
      expectedCodes: ["N39.0"],
      status: "suggestions",
      suggestedCodes: ["ZZZ"],
      invalidCodes: ["ZZZ"],
      top1Match: false,
      top3Match: false,
      top5Match: false,
      top10Match: false,
      reciprocalRank: 0,
      retrievalEvaluated: false,
      retrievedCodes: [],
      retrievalTop1Match: false,
      retrievalTop3Match: false,
      retrievalTop5Match: false,
      retrievalReciprocalRank: 0,
      abstained: false,
      emptySuggestion: false,
      error: null,
      latencyMs: 30,
      tokenUsage: { apiCalls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
    },
  ], "2026-01-01T00:00:00.000Z");

  assert.equal(report.totals.abstentionRate, 0.5);
  assert.equal(report.totals.invalidCodeRate, 1);
  assert.equal(report.totals.suggestionResponseRate, 0.5);
  assert.equal(report.totals.averageSuggestionCount, 1);
  assert.equal(report.totals.averageLatencyMs, 20);
});

test("evaluation reports token totals", async () => {
  const cases = [{ codigoTraductor: "1", diagnostico: "infeccion urinaria", expectedCodes: ["N39.0"] }];
  const report = await evaluateCie10Cases({
    cases,
    providerName: "openai-test",
    casesFile: "memory",
    catalogCodes: new Set(["N39.0", "N30.0", "N10"]),
    provider: {
      async classify() {
        return {
          status: "suggestions",
          reason: null,
          suggestions: [
            { codigo: "N39.0", descripcion: "Infeccion urinaria" },
            { codigo: "N30.0", descripcion: "Cistitis aguda" },
            { codigo: "N10", descripcion: "Pielonefritis aguda" },
          ],
          usage: { apiCalls: 1, inputTokens: 1_000, cachedInputTokens: 200, outputTokens: 500, reasoningTokens: 300, totalTokens: 1_500 },
        };
      },
    },
  });

  assert.equal(report.totals.tokenUsage.apiCalls, 3);
  assert.equal(report.totals.tokenUsage.totalTokens, 4_500);
  assert.equal(report.totals.minimumSuggestionComplianceRate, 0);
});

test("evaluation reports retrieval recall and reciprocal rank separately", async () => {
  const cases = [{ codigoTraductor: "1", diagnostico: "esguince de rodilla", expectedCodes: ["S83.6"] }];
  const report = await evaluateCie10Cases({
    cases,
    provider: new FixtureCie10Provider(cases),
    providerName: "fixture+fake-embedding",
    casesFile: "memory",
    resolveCandidates: async () => [
      { codigo: "M25.5", nombreInstitucional: null, descripcionReferencia: null, jerarquia: [], enCatalogoInstitucional: false, enReferenciaExterna: true, distance: 0.1 },
      { codigo: "S83.6", nombreInstitucional: null, descripcionReferencia: null, jerarquia: [], enCatalogoInstitucional: false, enReferenciaExterna: true, distance: 0.2 },
    ],
  });

  assert.equal(report.totals.retrieval.recallAt1, 0);
  assert.equal(report.totals.retrieval.recallAt3, 1);
  assert.equal(report.totals.retrieval.meanReciprocalRank, 0.5);
});
