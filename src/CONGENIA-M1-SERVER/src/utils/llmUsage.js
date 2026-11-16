'use strict';

function normalizeUsage(usage) {
  if (!usage) return null;
  if ('inputTokens' in usage || 'apiCalls' in usage) {
    return {
      apiCalls: Number(usage.apiCalls) || 0,
      inputTokens: Number(usage.inputTokens) || 0,
      cachedInputTokens: Number(usage.cachedInputTokens) || 0,
      outputTokens: Number(usage.outputTokens) || 0,
      reasoningTokens: Number(usage.reasoningTokens) || 0,
      totalTokens: Number(usage.totalTokens) || 0,
    };
  }
  const inputTokens = Number(usage.input_tokens) || 0;
  const outputTokens = Number(usage.output_tokens) || 0;
  return {
    apiCalls: 1,
    inputTokens,
    cachedInputTokens: Number(usage.input_tokens_details?.cached_tokens) || 0,
    outputTokens,
    reasoningTokens: Number(usage.output_tokens_details?.reasoning_tokens) || 0,
    totalTokens: Number(usage.total_tokens) || inputTokens + outputTokens,
  };
}

module.exports = { normalizeUsage };
