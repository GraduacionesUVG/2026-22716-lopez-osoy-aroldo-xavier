'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.S3_BUCKET = 'congenia-test-docs';
process.env.S3_REGION = 'us-east-1';
process.env.S3_FORCE_PATH_STYLE = 'false';
delete process.env.S3_ENDPOINT;
delete process.env.S3_PUBLIC_ENDPOINT;
process.env.AWS_ACCESS_KEY_ID = 'AKIAEXAMPLETEST00000';
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-not-real';

const patientSession = require('../src/services/patient-session.service');

patientSession.getActiveSession = async () => ({
  systemId: 'sadc',
  paciente: { patientId: '11111111-1111-4111-8111-111111111111', tenantId: '254' },
});
patientSession.registerUpload = async () => {};

const upload = require('../src/services/upload.service');

test('la URL de subida vence a los 300 s si no se configura otra vigencia', () => {
  delete process.env.S3_PRESIGN_EXPIRY_SECONDS;
  assert.equal(upload.DEFAULT_PRESIGN_EXPIRY_SECONDS, 300);
  assert.equal(upload.getPresignExpirySeconds(), 300);
});

test('la vigencia sigue siendo configurable y se valida', () => {
  process.env.S3_PRESIGN_EXPIRY_SECONDS = '120';
  assert.equal(upload.getPresignExpirySeconds(), 120);
  process.env.S3_PRESIGN_EXPIRY_SECONDS = '0';
  assert.throws(() => upload.getPresignExpirySeconds(), { code: 'UPLOAD_CONFIG_INVALID' });
  delete process.env.S3_PRESIGN_EXPIRY_SECONDS;
});

test('la URL firmada declara la vigencia por omision', async () => {
  delete process.env.S3_PRESIGN_EXPIRY_SECONDS;
  const { presignedUrl } = await upload.generatePresignedUploadUrl({
    redisKey: 'session-key', category: 'exam', contentType: 'image/png', sizeBytes: 10,
  });
  assert.equal(new URL(presignedUrl).searchParams.get('X-Amz-Expires'), '300');
});
