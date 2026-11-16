'use strict';

const crypto = require('crypto');
const { connectRedis } = require('../config/redis');

const CONVERSATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TTL_SECONDS = Math.max(Number.parseInt(process.env.REPORTING_CONVERSATION_TTL_SECONDS || '1800', 10), 60);
const MAX_TURNS = Math.min(Math.max(Number.parseInt(process.env.REPORTING_CONVERSATION_MAX_TURNS || '8', 10), 1), 20);
const LOCK_TTL_SECONDS = Math.max(Number.parseInt(process.env.REPORTING_CONVERSATION_LOCK_SECONDS || '90', 10), 15);

function appError(status, code, message) {
  const err = new Error(message ?? code);
  err.status = status;
  err.code = code;
  return err;
}

function conversationKey(conversationId) {
  return `reporting:conversation:${conversationId}`;
}

function validateConversationId(conversationId) {
  const value = String(conversationId ?? '').trim();
  if (!CONVERSATION_ID_PATTERN.test(value)) {
    throw appError(400, 'INVALID_CONVERSATION_ID', 'El identificador de conversación no es válido.');
  }
  return value;
}

function compactResult(result) {
  if (!Array.isArray(result)) return [];
  return result.slice(0, 10).map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return {};
    return Object.fromEntries(Object.entries(row).slice(0, 10).map(([key, value]) => {
      if (value == null || typeof value === 'number' || typeof value === 'boolean') return [key, value];
      return [key, String(value).slice(0, 200)];
    }));
  });
}

function conversationTurn(question, response) {
  return {
    question: String(question).slice(0, 500),
    answer: String(response.answer ?? '').slice(0, 1200),
    source: response.source ?? 'OUT_OF_SCOPE',
    result: compactResult(response.result),
    resultId: response.resultId ?? null,
  };
}

async function createAgentConversation(ownerSub) {
  if (!ownerSub) throw appError(401, 'UNAUTHORIZED', 'El usuario autenticado no tiene identificador.');
  const redis = await connectRedis();
  const conversationId = crypto.randomUUID();
  const now = new Date().toISOString();
  await redis.set(conversationKey(conversationId), JSON.stringify({
    version: 1,
    ownerSub,
    createdAt: now,
    updatedAt: now,
    turns: [],
  }), { EX: TTL_SECONDS });
  return { conversationId, expiresIn: TTL_SECONDS };
}

async function readOwnedConversation(redis, conversationId, ownerSub) {
  const raw = await redis.get(conversationKey(conversationId));
  if (!raw) {
    throw appError(410, 'AGENT_CONVERSATION_EXPIRED', 'La conversación expiró. Inicia una nueva consulta.');
  }
  const conversation = JSON.parse(raw);
  if (conversation.ownerSub !== ownerSub) {
    throw appError(404, 'AGENT_CONVERSATION_NOT_FOUND', 'La conversación no existe.');
  }
  return conversation;
}

async function withAgentConversation({ conversationId, ownerSub, question }, handler) {
  const id = validateConversationId(conversationId);
  const redis = await connectRedis();
  const key = conversationKey(id);
  const lockKey = `${key}:lock`;
  const lockToken = crypto.randomUUID();
  const acquired = await redis.set(lockKey, lockToken, { NX: true, EX: LOCK_TTL_SECONDS });
  if (!acquired) {
    throw appError(409, 'AGENT_CONVERSATION_BUSY', 'La conversación ya tiene una consulta en curso.');
  }

  try {
    const conversation = await readOwnedConversation(redis, id, ownerSub);
    const turns = Array.isArray(conversation.turns) ? conversation.turns.slice(-MAX_TURNS) : [];
    const response = await handler(turns);
    const updated = {
      ...conversation,
      updatedAt: new Date().toISOString(),
      turns: response.status === 'success'
        ? [...turns, conversationTurn(question, response)].slice(-MAX_TURNS)
        : turns,
    };
    await redis.set(key, JSON.stringify(updated), { EX: TTL_SECONDS });
    return response;
  } finally {
    await redis.eval(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
      { keys: [lockKey], arguments: [lockToken] },
    ).catch(() => {});
  }
}

async function deleteAgentConversation(conversationId, ownerSub) {
  const id = validateConversationId(conversationId);
  const redis = await connectRedis();
  await readOwnedConversation(redis, id, ownerSub);
  await redis.del(conversationKey(id));
}

module.exports = {
  TTL_SECONDS,
  createAgentConversation,
  deleteAgentConversation,
  withAgentConversation,
};
