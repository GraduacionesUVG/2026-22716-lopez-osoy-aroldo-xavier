'use strict';

const { createClient } = require('redis');

let client;
let connectPromise;

function parseBoolean(value) {
  if (value == null || String(value).trim() === '') return false;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error('REDIS_TLS must be true or false');
}

function getRedisClient() {
  if (!client) {
    const password = process.env.REDIS_PASSWORD || undefined;
    const username = process.env.REDIS_USERNAME || undefined;
    const url = process.env.REDIS_URL;
    const options = url
      ? { url, password, username }
      : {
          password,
          username,
          socket: {
            host: process.env.REDIS_HOST || 'localhost',
            port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
            tls: parseBoolean(process.env.REDIS_TLS),
          },
        };

    client = createClient(options);

    client.on('error', (err) => {
      console.error('[REDIS] Client error:', err.message);
    });
  }

  return client;
}

async function connectRedis() {
  const redis = getRedisClient();
  if (redis.isOpen) return redis;

  if (!connectPromise) {
    connectPromise = redis.connect().finally(() => {
      connectPromise = null;
    });
  }

  await connectPromise;
  return redis;
}

module.exports = { connectRedis };
