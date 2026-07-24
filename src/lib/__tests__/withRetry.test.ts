import { describe, expect, it, vi } from 'vitest';
import { withRetry } from '../withRetry';

describe('withRetry', () => {
  it('returns the result on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await withRetry(fn, { retries: 3, isRetryable: () => true, baseDelayMs: 0 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on a retryable failure up to the configured count then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockRejectedValueOnce(new Error('fail-2'))
      .mockResolvedValueOnce('ok');

    const result = await withRetry(fn, { retries: 2, isRetryable: () => true, baseDelayMs: 0 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws once retries are exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      withRetry(fn, { retries: 2, isRetryable: () => true, baseDelayMs: 0 }),
    ).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry when isRetryable returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('non-retryable'));

    await expect(
      withRetry(fn, { retries: 3, isRetryable: () => false, baseDelayMs: 0 }),
    ).rejects.toThrow('non-retryable');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls onRetry with the error and attempt number for each retry', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail-1')).mockResolvedValueOnce('ok');

    await withRetry(fn, { retries: 2, isRetryable: () => true, baseDelayMs: 0, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
  });

  it('uses computeDelayMs instead of exponential backoff when provided', async () => {
    vi.useFakeTimers();
    try {
      const computeDelayMs = vi.fn().mockReturnValue(5000);
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('rate limited'))
        .mockResolvedValueOnce('ok');

      const promise = withRetry(fn, {
        retries: 2,
        isRetryable: () => true,
        baseDelayMs: 999999,
        computeDelayMs,
      });

      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;

      expect(result).toBe('ok');
      expect(computeDelayMs).toHaveBeenCalledWith(expect.any(Error), 1);
    } finally {
      vi.useRealTimers();
    }
  });
});
