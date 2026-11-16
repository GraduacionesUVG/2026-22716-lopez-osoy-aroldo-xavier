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
const consentSignature = require('../src/services/consent-signature.service');

function signedHeaders(url) {
  return new URL(url).searchParams.get('X-Amz-SignedHeaders').split(';');
}

test('sin S3_SERVER_SIDE_ENCRYPTION la subida no exige cabecera (entorno local)', async () => {
  delete process.env.S3_SERVER_SIDE_ENCRYPTION;
  const result = await upload.generatePresignedUploadUrl({
    redisKey: 'k', category: 'exam', contentType: 'image/png', sizeBytes: 10,
  });
  assert.deepEqual(result.headers, {});
  assert.ok(!signedHeaders(result.presignedUrl).includes('x-amz-server-side-encryption'));
});

test('con AES256 la URL de sesion firma la cabecera y la devuelve para el PUT', async () => {
  process.env.S3_SERVER_SIDE_ENCRYPTION = 'AES256';
  const result = await upload.generatePresignedUploadUrl({
    redisKey: 'k', category: 'exam', contentType: 'image/png', sizeBytes: 10,
  });
  assert.deepEqual(result.headers, { 'x-amz-server-side-encryption': 'AES256' });
  assert.ok(signedHeaders(result.presignedUrl).includes('x-amz-server-side-encryption'));
  // No viaja como parametro: si el navegador la omite, S3 rechaza la firma.
  assert.equal(new URL(result.presignedUrl).searchParams.get('x-amz-server-side-encryption'), null);
});

test('la URL de paciente (adendas) tambien firma la cabecera', async () => {
  process.env.S3_SERVER_SIDE_ENCRYPTION = 'AES256';
  const result = await upload.generatePresignedPatientUploadUrl({
    pacienteId: '11111111-1111-4111-8111-111111111111', tenantId: '254',
    category: 'profile', contentType: 'image/jpeg', sizeBytes: 10,
  });
  assert.deepEqual(result.headers, { 'x-amz-server-side-encryption': 'AES256' });
  assert.ok(signedHeaders(result.presignedUrl).includes('x-amz-server-side-encryption'));
});

test('la firma PNG del consentimiento se escribe con cifrado declarado', async () => {
  process.env.S3_SERVER_SIDE_ENCRYPTION = 'AES256';
  const sent = [];
  const client = upload.getInternalS3Client();
  const original = client.send;
  client.send = async (command) => { sent.push(command.input); return {}; };
  try {
    await consentSignature.putSignaturePng({
      key: 'test/firma.png', buffer: Buffer.from('png'), sha256: 'a'.repeat(64), consentimientoId: 'c',
    });
  } finally {
    client.send = original;
  }
  assert.equal(sent.length, 1);
  assert.equal(sent[0].ServerSideEncryption, 'AES256');
});

test('un valor de cifrado desconocido es un error de configuracion', () => {
  process.env.S3_SERVER_SIDE_ENCRYPTION = 'SSE-C';
  assert.throws(() => upload.getServerSideEncryption(), { code: 'UPLOAD_CONFIG_INVALID' });
  delete process.env.S3_SERVER_SIDE_ENCRYPTION;
});
