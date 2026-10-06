import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('../logger', () => ({
  logger: { warn: vi.fn() },
}));

vi.mock('../withRetry', () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { withRetry } from '../withRetry';
import {
  callGoogleApi,
  GOOGLE_API_TIMEOUT_MS,
  isRetryableGoogleError,
  withGoogleRetry,
} from '../googleApiErrors';

describe('isRetryableGoogleError', () => {
  it('retries on 429', () => {
    expect(isRetryableGoogleError({ response: { status: 429 } })).toBe(true);
  });

  it('retries on 5xx', () => {
    expect(isRetryableGoogleError({ response: { status: 503 } })).toBe(true);
  });

  it('does not retry on other 4xx', () => {
    expect(isRetryableGoogleError({ response: { status: 403 } })).toBe(false);
    expect(isRetryableGoogleError({ response: { status: 404 } })).toBe(false);
  });

  it('retries on known transient network error codes', () => {
    expect(isRetryableGoogleError({ code: 'ECONNRESET' })).toBe(true);
    expect(isRetryableGoogleError({ code: 'ETIMEDOUT' })).toBe(true);
  });

  it('does not retry on unknown error codes', () => {
    expect(isRetryableGoogleError({ code: 'SOME_OTHER_CODE' })).toBe(false);
  });

  it('does not retry on non-object errors', () => {
    expect(isRetryableGoogleError('boom')).toBe(false);
    expect(isRetryableGoogleError(null)).toBe(false);
    expect(isRetryableGoogleError(undefined)).toBe(false);
  });
});

describe('withGoogleRetry', () => {
  it('delegates to withRetry with the shared retry policy', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await withGoogleRetry(fn, 'test.context');

    expect(result).toBe('ok');
    expect(withRetry).toHaveBeenCalledWith(
      fn,
      expect.objectContaining({
        retries: 3,
        baseDelayMs: 200,
        isRetryable: isRetryableGoogleError,
      }),
    );
  });
});

describe('callGoogleApi', () => {
  it('parses the response data through the provided schema', async () => {
    const schema = z.object({ value: z.string() });
    const fn = vi.fn().mockResolvedValue({ data: { value: 'hello' } });

    const result = await callGoogleApi(fn, 'test.context', schema);

    expect(result).toEqual({ value: 'hello' });
  });

  it('applies the extract function before parsing', async () => {
    const schema = z.array(z.string());
    const fn = vi.fn().mockResolvedValue({ data: { values: ['a', 'b'] } });

    const result = await callGoogleApi(
      fn,
      'test.context',
      schema,
      (data: { values: string[] }) => data.values,
    );

    expect(result).toEqual(['a', 'b']);
  });

  it('rejects when the response does not match the schema', async () => {
    const schema = z.object({ value: z.string() });
    const fn = vi.fn().mockResolvedValue({ data: { value: 42 } });

    await expect(callGoogleApi(fn, 'test.context', schema)).rejects.toThrow();
  });
});

describe('GOOGLE_API_TIMEOUT_MS', () => {
  it('is a positive number of milliseconds', () => {
    expect(GOOGLE_API_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
