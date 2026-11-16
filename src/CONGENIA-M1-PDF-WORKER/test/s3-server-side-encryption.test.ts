import test from 'node:test';
import assert from 'node:assert/strict';
import { S3Client } from '@aws-sdk/client-s3';

// env.ts valida al importarse: se fija un entorno minimo antes de cargar s3.ts.
Object.assign(process.env, {
  POSTGRES_DB: 'congenia',
  POSTGRES_USER: 'congenia_app',
  POSTGRES_PASSWORD: 'test',
  RABBITMQ_USER: 'congenia',
  RABBITMQ_PASSWORD: 'test',
  S3_REGION: 'us-east-1',
  S3_SERVER_SIDE_ENCRYPTION: 'AES256',
  AWS_ACCESS_KEY_ID: 'AKIAEXAMPLETEST00000',
  AWS_SECRET_ACCESS_KEY: 'test-secret-not-real',
});

test('el PDF se escribe declarando el cifrado configurado', async () => {
  const sent: Array<Record<string, unknown>> = [];
  const original = S3Client.prototype.send;
  S3Client.prototype.send = async function send(command: { input: Record<string, unknown> }) {
    sent.push(command.input);
    return {};
  } as typeof S3Client.prototype.send;
  try {
    const { putObjectBuffer } = await import('../src/lib/s3');
    await putObjectBuffer('bucket', 'prod/x.pdf', Buffer.from('%PDF-'), 'application/pdf', { sha256: 'a' });
  } finally {
    S3Client.prototype.send = original;
  }
  assert.equal(sent.length, 1);
  assert.equal(sent[0].ServerSideEncryption, 'AES256');
  assert.equal(sent[0].ContentType, 'application/pdf');
});
