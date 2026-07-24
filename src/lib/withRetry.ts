export interface WithRetryOptions {
  retries: number;
  isRetryable: (err: unknown) => boolean;
  baseDelayMs: number;
  onRetry?: (err: unknown, attempt: number) => void;
  // Escape hatch for callers whose failures carry a server-specified delay
  // (e.g. a 429's Retry-After header) — overrides the default exponential
  // backoff for this attempt when provided.
  computeDelayMs?: (err: unknown, attempt: number) => number;
}

export async function withRetry<T>(fn: () => Promise<T>, options: WithRetryOptions): Promise<T> {
  const { retries, isRetryable, baseDelayMs, onRetry, computeDelayMs } = options;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isRetryable(err)) {
        throw err;
      }
      attempt += 1;
      onRetry?.(err, attempt);
      const delayMs = computeDelayMs
        ? computeDelayMs(err, attempt)
        : baseDelayMs * 2 ** (attempt - 1);
      await sleep(delayMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
