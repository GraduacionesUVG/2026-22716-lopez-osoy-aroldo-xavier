import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function loadDotEnv(filePath: string): void {
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    value = value.replace(/\s+#.*$/, '').trim();
    value = value.replace(/^"(.*)"$/, '$1');
    value = value.replace(/^'(.*)'$/, '$1');

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

interface Args {
  consentimientoId?: string;
  fichaId?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--consentimiento-id' && next) {
      args.consentimientoId = next;
      i += 1;
      continue;
    }

    if (arg === '--ficha-id' && next) {
      args.fichaId = next;
      i += 1;
    }
  }

  return args;
}

function managementBaseUrl(): string {
  const host = process.env.RABBITMQ_HOST ?? 'localhost';
  const port = Number(process.env.RABBITMQ_MANAGEMENT_PORT ?? '15672');
  return `http://${host}:${port}`;
}

function queueApiUrl(vhost: string, queueName: string): string {
  return `${managementBaseUrl()}/api/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(queueName)}`;
}

function publishApiUrl(vhost: string): string {
  return `${managementBaseUrl()}/api/exchanges/${encodeURIComponent(vhost)}/amq.default/publish`;
}

function authHeader(): string {
  const user = process.env.RABBITMQ_USER ?? process.env.RABBITMQ_DEFAULT_USER ?? 'congenia';
  const pass = process.env.RABBITMQ_PASSWORD ?? process.env.RABBITMQ_DEFAULT_PASS ?? 'congenia';
  const token = Buffer.from(`${user}:${pass}`).toString('base64');
  return `Basic ${token}`;
}

async function publishEvent(queueName: string, event: Record<string, unknown>): Promise<void> {
  const vhost = process.env.RABBITMQ_VHOST ?? process.env.RABBITMQ_DEFAULT_VHOST ?? '/';
  const queueResponse = await fetch(queueApiUrl(vhost, queueName), {
    method: 'PUT',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      durable: true,
      auto_delete: false,
      arguments: {},
    }),
  });

  if (!queueResponse.ok) {
    const details = await queueResponse.text();
    throw new Error(`RabbitMQ queue declare failed: HTTP ${queueResponse.status} - ${details}`);
  }

  const response = await fetch(publishApiUrl(vhost), {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        delivery_mode: 2,
        content_type: 'application/json',
      },
      routing_key: queueName,
      payload: JSON.stringify(event),
      payload_encoding: 'string',
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`RabbitMQ publish failed: HTTP ${response.status} - ${details}`);
  }

  const body = (await response.json()) as { routed?: boolean };
  if (!body.routed) {
    throw new Error(`RabbitMQ publish was accepted but not routed to queue '${queueName}'`);
  }
}

async function main(): Promise<void> {
  loadDotEnv(path.join(projectRoot, '.env'));

  const args = parseArgs(process.argv.slice(2));
  const queueName = process.env.RABBITMQ_QUEUE_MAIN ?? 'consent.pdf.generate';

  const event = {
    schemaVersion: '1.0',
    eventType: 'consent.pdf.generate.requested',
    jobId: randomUUID(),
    requestedAt: new Date().toISOString(),
    consentimiento_id: args.consentimientoId ?? randomUUID(),
    ficha_id: args.fichaId ?? randomUUID(),
  };

  await publishEvent(queueName, event);

  console.log('[publish_test] Event published');
  console.log(JSON.stringify({ queue: queueName, event }, null, 2));

  if (!args.consentimientoId || !args.fichaId) {
    console.log('[publish_test] Warning: generated UUIDs may not exist in DB.');
    console.log('[publish_test] Use --consentimiento-id and --ficha-id for an end-to-end success test.');
  }
}

main().catch((error) => {
  console.error('[publish_test] Failed to publish event:', error);
  process.exit(1);
});
