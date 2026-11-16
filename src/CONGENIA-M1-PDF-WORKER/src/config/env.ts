import { z } from 'zod';

const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'off']);

/**
 * Boolean read from the environment.
 *
 * `z.coerce.boolean()` cannot be used here: it applies `Boolean(value)`, so the
 * string "false" becomes `true` and the flag can never be turned off from the
 * environment. That is not a hypothetical — S3_FORCE_PATH_STYLE was unsettable
 * for exactly this reason.
 */
const envBoolean = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (raw === undefined || raw.trim() === '') return defaultValue;

      const value = raw.trim().toLowerCase();
      if (TRUE_VALUES.has(value)) return true;
      if (FALSE_VALUES.has(value)) return false;

      ctx.addIssue({
        code: 'custom',
        message: `must be a boolean ("true" or "false"), received: ${raw}`,
      });
      return z.NEVER;
    });

/**
 * Optional string where an empty value means "not set". Container platforms
 * routinely inject empty variables, and an empty credential must be treated as
 * an absent credential, not as a credential that happens to be blank.
 */
const optionalEnvString = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value.trim() === '' ? undefined : value));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.string().regex(/^[a-zA-Z0-9_-]+$/).default('development'),

  POSTGRES_HOST: z.string().min(1).default('postgres'),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432),
  POSTGRES_DB: z.string().min(1),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),

  RABBITMQ_HOST: z.string().min(1).default('rabbitmq'),
  RABBITMQ_PORT: z.coerce.number().int().positive().default(5672),
  RABBITMQ_USER: z.string().min(1),
  RABBITMQ_PASSWORD: z.string().min(1),
  RABBITMQ_VHOST: z.string().min(1).default('/'),
  RABBITMQ_QUEUE_MAIN: z.string().min(1).default('consent.pdf.generate'),
  RABBITMQ_QUEUE_DLQ: z.string().min(1).default('consent.pdf.generate.dlq'),

  // No default endpoint any more. The old `http://seaweedfs:8333` fallback made
  // a missing configuration look like a DNS failure once SeaweedFS was replaced
  // by S3: the worker died on boot with `getaddrinfo ENOTFOUND seaweedfs`.
  // Left unset, the SDK resolves the regional S3 endpoint, which is correct.
  S3_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: z.string().min(1).default('congenia-docs'),
  S3_REGION: z.string().min(1).default('us-east-1'),

  // Optional: when both are absent the SDK falls back to its credential chain
  // and picks up the IAM role of the ECS task. The previous 'congenia'
  // defaults guaranteed a 403 against real S3 instead of a clear failure.
  S3_ACCESS_KEY_ID: optionalEnvString,
  S3_SECRET_ACCESS_KEY: optionalEnvString,

  S3_FORCE_PATH_STYLE: envBoolean(true),

  // SeaweedFS starts empty and the worker used to create the bucket itself. In
  // AWS the bucket belongs to Terraform and the task role has no
  // s3:CreateBucket on purpose, so this is turned off there.
  S3_AUTO_CREATE_BUCKET: envBoolean(true),

  // Cifrado declarado en cada PutObject. En AWS la politica del bucket rechaza
  // escrituras sin la cabecera x-amz-server-side-encryption; vacio en local.
  S3_SERVER_SIDE_ENCRYPTION: optionalEnvString.pipe(z.enum(['AES256', 'aws:kms']).optional()),

  WORKER_PREFETCH: z.coerce.number().int().positive().default(3),
  WORKER_MAX_RETRIES: z.coerce.number().int().min(0).default(5),
  WORKER_RETRY_BACKOFF_MS: z.coerce.number().int().positive().default(2000),
  WORKER_RETRY_BACKOFF_MULTIPLIER: z.coerce.number().positive().default(2),
});

/**
 * Half a credential pair is always a mistake: it silently degrades to the
 * credential chain and the resulting 403 points nowhere near the cause.
 */
const envSchemaWithChecks = envSchema.refine(
  (env) =>
    (env.S3_ACCESS_KEY_ID === undefined) === (env.S3_SECRET_ACCESS_KEY === undefined),
  {
    message:
      'S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set together, or both left empty to use the IAM role of the task',
    path: ['S3_ACCESS_KEY_ID'],
  }
);

const parsed = envSchemaWithChecks.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

export const env = parsed.data;

export function buildRabbitMqUrl(): string {
  const user = encodeURIComponent(env.RABBITMQ_USER);
  const password = encodeURIComponent(env.RABBITMQ_PASSWORD);
  const host = env.RABBITMQ_HOST;
  const port = env.RABBITMQ_PORT;
  const normalizedVhost = env.RABBITMQ_VHOST === '/' ? '' : env.RABBITMQ_VHOST.replace(/^\//, '');
  const vhostPath = encodeURIComponent(normalizedVhost);

  return `amqp://${user}:${password}@${host}:${port}/${vhostPath}`;
}
