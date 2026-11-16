'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

function loadArtifactStore() {
  const values = new Map();
  const redis = {
    async set(key, value, options) {
      values.set(key, { value, options });
    },
    async get(key) {
      return values.get(key)?.value ?? null;
    },
  };
  const redisPath = require.resolve(path.join(SRC, 'config/redis.js'));
  require.cache[redisPath] = {
    id: redisPath,
    filename: redisPath,
    loaded: true,
    exports: { connectRedis: async () => redis },
  };
  const artifactPath = require.resolve(path.join(SRC, 'services/reporting-artifact.service.js'));
  delete require.cache[artifactPath];
  return { ...require(artifactPath), values };
}

test('reporting artifacts expire after 30 minutes and are owner-bound', async () => {
  const store = loadArtifactStore();
  const owner = { ownerSub: 'admin-1', conversationId: 'conversation-1' };
  const id = await store.saveArtifact('result', { rows: [{ total: 2 }] }, owner);
  const entry = [...store.values.values()][0];

  assert.equal(entry.options.EX, 1800);
  assert.deepEqual(await store.readArtifact('result', id, owner), { rows: [{ total: 2 }] });
  await assert.rejects(
    store.readArtifact('result', id, { ...owner, ownerSub: 'admin-2' }),
    { code: 'REPORTING_ARTIFACT_NOT_FOUND', status: 404 }
  );
  await assert.rejects(
    store.readArtifact('result', id, { ...owner, conversationId: 'conversation-2' }),
    { code: 'REPORTING_ARTIFACT_NOT_FOUND', status: 404 }
  );
});

test('missing reporting artifacts are reported as expired', async () => {
  const store = loadArtifactStore();
  await assert.rejects(store.readArtifact(
    'result',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    { ownerSub: 'admin-1', conversationId: 'conversation-1' }
  ), { code: 'REPORTING_ARTIFACT_EXPIRED', status: 410 });
});
