export interface WithRetryOptions {
  retries: number;
  isRetryable: (err: unknown) => boolean;
  baseDelayMs: number;
  onRetry?: (err: unknown, attempt: number) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, options: WithRetryOptions): Promise<T> {
  const { retries, isRetryable, baseDelayMs, onRetry } = options;

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
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
