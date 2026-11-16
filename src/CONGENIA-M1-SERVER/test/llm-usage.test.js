'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeUsage } = require('../src/utils/llmUsage');

test('normalizes Responses API usage including cache and reasoning details', () => {
  assert.deepEqual(normalizeUsage({
    input_tokens: 1_000,
    input_tokens_details: { cached_tokens: 200 },
    output_tokens: 500,
    output_tokens_details: { reasoning_tokens: 300 },
    total_tokens: 1_500,
  }), {
    apiCalls: 1,
    inputTokens: 1_000,
    cachedInputTokens: 200,
    outputTokens: 500,
    reasoningTokens: 300,
    totalTokens: 1_500,
  });
});
