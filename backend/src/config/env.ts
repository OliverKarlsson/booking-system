import { z } from 'zod';

/**
 * Environment configuration, validated once at import time.
 *
 * Fail-fast is the point: a missing DATABASE_URL should stop the process at boot with a
 * readable message, not surface as an unhandled connection error on whichever request
 * happens to arrive first. Every value below is also coerced here, so the rest of the
 * codebase reads `env.PORT` as a number and never re-parses a string.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PORT: z.coerce.number().int().positive().max(65535).default(5006),

  // No default. A default here would be actively harmful: it would let a
  // misconfigured deployment silently connect to the wrong database instead of refusing
  // to start.
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Comma-separated list of allowed origins, or '*'. See middleware/security.ts.
  CORS_ORIGIN: z.string().default('*'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

  // Pool size is a database-side budget, not an application one: every connection is a
  // Postgres backend process. 10 per API instance is comfortable for this workload and
  // leaves room for psql and the test runner.
  PG_POOL_MAX: z.coerce.number().int().positive().default(10),

  // Consumed by src/server.ts; the seed itself is owned by T3.4.
  SEED_ON_STARTUP: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Exported separately from `env` so it can be exercised in unit tests without mutating
 * `process.env` — validation logic is worth testing, and a module-level side effect is
 * not testable.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}

export const env: Env = parseEnv();

export const isProduction = (): boolean => env.NODE_ENV === 'production';
export const isTest = (): boolean => env.NODE_ENV === 'test';
