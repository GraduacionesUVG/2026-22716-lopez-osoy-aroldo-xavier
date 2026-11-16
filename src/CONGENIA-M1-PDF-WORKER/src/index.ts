import type { Channel, ConsumeMessage } from 'amqplib';
import { env, buildRabbitMqUrl } from './config/env';
import { logger } from './config/logger';
import { closeDbPool } from './lib/db';
import { closeRabbitContext, createRabbitContext, type RabbitContext } from './lib/rabbit';
import { ensureBucketExists } from './lib/s3';
import { processConsentPdfEvent, PermanentProcessingError } from './services/consent-pdf-processor';
import {
  consentPdfGenerateRequestedSchema,
  type ConsentPdfGenerateRequestedEvent,
} from './types/event';

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getRetryCount(message: ConsumeMessage): number {
  const headers = message.properties.headers ?? {};
  const value = headers['x-retry-count'];
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.trunc(parsed);
}

function calculateBackoffMs(nextAttempt: number): number {
  const base = env.WORKER_RETRY_BACKOFF_MS;
  const multiplier = env.WORKER_RETRY_BACKOFF_MULTIPLIER;
  return Math.round(base * multiplier ** Math.max(nextAttempt - 1, 0));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function sendToDlq(
  channel: Channel,
  sourceMessage: ConsumeMessage,
  payload: {
    reason: 'INVALID_PAYLOAD' | 'PERMANENT_ERROR' | 'MAX_RETRIES_REACHED';
    retryCount: number;
    error: string;
    originalMessage: unknown;
  }
): void {
  const dlqBody = {
    failedAt: new Date().toISOString(),
    ...payload,
  };

  channel.sendToQueue(
    env.RABBITMQ_QUEUE_DLQ,
    Buffer.from(JSON.stringify(dlqBody)),
    {
      persistent: true,
      contentType: 'application/json',
      headers: {
        sourceQueue: env.RABBITMQ_QUEUE_MAIN,
        sourceMessageId: sourceMessage.properties.messageId ?? null,
      },
    }
  );
}

async function processMessage(channel: Channel, message: ConsumeMessage): Promise<void> {
  const rawBody = message.content.toString('utf8');
  const parsedJson = safeParseJson(rawBody);

  const eventValidation = consentPdfGenerateRequestedSchema.safeParse(parsedJson);
  if (!eventValidation.success) {
    logger.warn('Dropping invalid message payload to DLQ', {
      error: eventValidation.error.message,
      rawBody,
    });

    sendToDlq(channel, message, {
      reason: 'INVALID_PAYLOAD',
      retryCount: getRetryCount(message),
      error: eventValidation.error.message,
      originalMessage: parsedJson,
    });

    channel.ack(message);
    return;
  }

  const event: ConsentPdfGenerateRequestedEvent = eventValidation.data;

  try {
    const result = await processConsentPdfEvent(event);

    logger.info('Message processed', {
      jobId: event.jobId,
      consentimiento_id: event.consentimiento_id,
      ficha_id: event.ficha_id,
      status: result.status,
      ...(result.status === 'processed'
        ? { pdf_ref: result.pdfKey, pdf_hash_sha256: result.pdfHashSha256 }
        : { reason: result.reason, pdf_ref: result.pdfKey ?? null }),
    });

    channel.ack(message);
    return;
  } catch (error) {
    const retryCount = getRetryCount(message);
    const isPermanent = error instanceof PermanentProcessingError;

    if (isPermanent || retryCount >= env.WORKER_MAX_RETRIES) {
      const reason = isPermanent ? 'PERMANENT_ERROR' : 'MAX_RETRIES_REACHED';

      logger.error('Sending message to DLQ', {
        jobId: event.jobId,
        consentimiento_id: event.consentimiento_id,
        ficha_id: event.ficha_id,
        reason,
        retryCount,
        error,
      });

      sendToDlq(channel, message, {
        reason,
        retryCount,
        error: toErrorMessage(error),
        originalMessage: event,
      });

      channel.ack(message);
      return;
    }

    const nextRetry = retryCount + 1;
    const backoffMs = calculateBackoffMs(nextRetry);

    logger.warn('Retrying message after processing error', {
      jobId: event.jobId,
      consentimiento_id: event.consentimiento_id,
      ficha_id: event.ficha_id,
      retryCount,
      nextRetry,
      backoffMs,
      error,
    });

    await sleep(backoffMs);

    channel.sendToQueue(env.RABBITMQ_QUEUE_MAIN, message.content, {
      persistent: true,
      contentType: message.properties.contentType ?? 'application/json',
      headers: {
        ...(message.properties.headers ?? {}),
        'x-retry-count': nextRetry,
        'x-last-error': toErrorMessage(error),
      },
    });

    channel.ack(message);
  }
}

let rabbitContext: RabbitContext | undefined;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info('Shutting down worker', { signal });

  try {
    await closeRabbitContext(rabbitContext);
  } catch (error) {
    logger.error('Error closing RabbitMQ connection', { error });
  }

  try {
    await closeDbPool();
  } catch (error) {
    logger.error('Error closing PostgreSQL pool', { error });
  }
}

async function start(): Promise<void> {
  logger.info('Starting CONGENIA PDF worker', {
    queueMain: env.RABBITMQ_QUEUE_MAIN,
    queueDlq: env.RABBITMQ_QUEUE_DLQ,
    bucket: env.S3_BUCKET,
    prefetch: env.WORKER_PREFETCH,
    maxRetries: env.WORKER_MAX_RETRIES,
  });

  await ensureBucketExists(env.S3_BUCKET);

  rabbitContext = await createRabbitContext(buildRabbitMqUrl(), env.WORKER_PREFETCH, {
    mainQueue: env.RABBITMQ_QUEUE_MAIN,
    dlqQueue: env.RABBITMQ_QUEUE_DLQ,
  });

  rabbitContext.connection.on('error', (error) => {
    logger.error('RabbitMQ connection error', { error });
  });

  rabbitContext.connection.on('close', () => {
    if (shuttingDown) return;
    logger.error('RabbitMQ connection closed unexpectedly');
    process.exit(1);
  });

  await rabbitContext.channel.consume(
    env.RABBITMQ_QUEUE_MAIN,
    (message) => {
      if (!message) return;

      void processMessage(rabbitContext!.channel, message).catch((error) => {
        logger.error('Unhandled message processing failure', { error });
        rabbitContext!.channel.nack(message, false, true);
      });
    },
    { noAck: false }
  );

  logger.info('Worker is now consuming messages', {
    queue: env.RABBITMQ_QUEUE_MAIN,
  });
}

process.on('SIGINT', () => {
  void shutdown('SIGINT').finally(() => process.exit(0));
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM').finally(() => process.exit(0));
});

void start().catch(async (error) => {
  logger.error('Worker failed to start', { error });
  await shutdown('startup_error');
  process.exit(1);
});
