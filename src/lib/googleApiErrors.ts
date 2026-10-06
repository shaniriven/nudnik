import { z } from 'zod';
import { logger } from './logger';
import { withRetry } from './withRetry';

const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ECONNREFUSED',
  'EAI_AGAIN',
]);

interface GoogleApiErrorLike {
  code?: string | number;
  response?: { status?: number };
}

function isGoogleApiErrorLike(err: unknown): err is GoogleApiErrorLike {
  return typeof err === 'object' && err !== null;
}

// Retry on network failure / 429 / 5xx (transient); never on 4xx auth,
// permission, or malformed-request errors — those won't succeed on retry.
export function isRetryableGoogleError(err: unknown): boolean {
  if (!isGoogleApiErrorLike(err)) {
    return false;
  }
  const status = err.response?.status;
  if (typeof status === 'number' && (status === 429 || status >= 500)) {
    return true;
  }
  return typeof err.code === 'string' && RETRYABLE_NETWORK_CODES.has(err.code);
}

export function withGoogleRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
  return withRetry(fn, {
    retries: 3,
    baseDelayMs: 200,
    isRetryable: isRetryableGoogleError,
    onRetry: (err, attempt) => {
      logger.warn({ context, attempt, err }, 'retrying Google API call');
    },
  });
}

// Every googleapis call accepts a MethodOptions second argument (a GaxiosOptions,
// including `timeout`) alongside its params — without it, a hung connection (not a
// clean error/rejection) never settles, so withRetry's catch-based retry never runs.
export const GOOGLE_API_TIMEOUT_MS = 10_000;

export async function callGoogleApi<T, R>(
  fn: () => Promise<{ data: R }>,
  context: string,
  schema: z.ZodType<T>,
  extract: (data: R) => unknown = (data) => data,
): Promise<T> {
  const response = await withGoogleRetry(fn, context);
  return schema.parse(extract(response.data));
}
