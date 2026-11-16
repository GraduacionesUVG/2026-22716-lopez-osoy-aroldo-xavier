'use strict';

const crypto = require('crypto');
const { connectRedis } = require('../config/redis');

const TTL_SECONDS = 1800;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function appError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function contextOwner(context = {}) {
  const ownerSub = String(context.ownerSub ?? '').trim();
  const conversationId = String(context.conversationId ?? '').trim();
  if (!ownerSub || !conversationId) {
    throw appError(400, 'REPORTING_CONTEXT_REQUIRED', 'La herramienta requiere usuario y conversación.');
  }
  return { ownerSub, conversationId };
}

function artifactKey(kind, id) {
  return `reporting:artifact:${kind}:${id}`;
}

async function saveArtifact(kind, payload, context) {
  const owner = contextOwner(context);
  const redis = await connectRedis();
  const id = crypto.randomUUID();
  await redis.set(artifactKey(kind, id), JSON.stringify({
    version: 1,
    ...owner,
    createdAt: new Date().toISOString(),
    payload,
  }), { EX: TTL_SECONDS });
  return id;
}

async function readArtifact(kind, id, context) {
  const artifactId = String(id ?? '').trim();
  if (!ID_PATTERN.test(artifactId)) {
    throw appError(400, 'INVALID_ARTIFACT_ID', 'El identificador temporal no es válido.');
  }
  const owner = contextOwner(context);
  const redis = await connectRedis();
  const raw = await redis.get(artifactKey(kind, artifactId));
  if (!raw) throw appError(410, 'REPORTING_ARTIFACT_EXPIRED', 'El resultado temporal expiró.');
  const artifact = JSON.parse(raw);
  if (artifact.ownerSub !== owner.ownerSub || artifact.conversationId !== owner.conversationId) {
    throw appError(404, 'REPORTING_ARTIFACT_NOT_FOUND', 'El resultado temporal no existe.');
  }
  return artifact.payload;
}

module.exports = {
  TTL_SECONDS,
  readArtifact,
  saveArtifact,
};
