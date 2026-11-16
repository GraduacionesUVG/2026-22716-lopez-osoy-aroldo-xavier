import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig, previousMonthInGuatemala } from "../src/config.js";

test("batch period defaults to the previous Guatemala calendar month", () => {
  assert.equal(previousMonthInGuatemala(new Date("2026-01-01T05:30:00.000Z")), "2025-11");
  assert.equal(previousMonthInGuatemala(new Date("2026-01-01T06:30:00.000Z")), "2025-12");
});

test("OpenAI versions remain provider-isolated and active by default", { concurrency: false }, () => {
  const previous = {
    provider: process.env.CIE10_EMBEDDING_PROVIDER,
    version: process.env.CIE10_RAG_VERSION,
    activate: process.env.CIE10_ACTIVATE_RAG,
  };
  process.env.CIE10_EMBEDDING_PROVIDER = "openai";
  process.env.CIE10_RAG_VERSION = "catalog-test";
  delete process.env.CIE10_ACTIVATE_RAG;
  try {
    const config = loadConfig();
    assert.equal(config.ragVersion, "catalog-test-openai");
    assert.equal(config.activateRagVersion, true);
  } finally {
    if (previous.provider == null) delete process.env.CIE10_EMBEDDING_PROVIDER;
    else process.env.CIE10_EMBEDDING_PROVIDER = previous.provider;
    if (previous.version == null) delete process.env.CIE10_RAG_VERSION;
    else process.env.CIE10_RAG_VERSION = previous.version;
    if (previous.activate == null) delete process.env.CIE10_ACTIVATE_RAG;
    else process.env.CIE10_ACTIVATE_RAG = previous.activate;
  }
});
