import type { ResponseUsage } from "openai/resources/responses/responses";

export interface TokenUsage {
  apiCalls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

export function emptyTokenUsage(): TokenUsage {
  return {
    apiCalls: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  };
}

export function normalizeOpenAiUsage(usage: ResponseUsage | null | undefined): TokenUsage | null {
  if (!usage) return null;
  return {
    apiCalls: 1,
    inputTokens: usage.input_tokens ?? 0,
    cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
    totalTokens: usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
  };
}

export function addTokenUsage(left: TokenUsage, right: TokenUsage | null | undefined): TokenUsage {
  if (!right) return { ...left };
  return {
    apiCalls: left.apiCalls + right.apiCalls,
    inputTokens: left.inputTokens + right.inputTokens,
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    reasoningTokens: left.reasoningTokens + right.reasoningTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}
