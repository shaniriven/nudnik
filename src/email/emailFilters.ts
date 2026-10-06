import { env } from '../config/env';

// A starting-point search query for the initial vertical slice — expects to be
// replaced once real supplier emails for the bar are known. Overridable via
// GMAIL_SCAN_QUERY without a code change.
export const DEFAULT_SCAN_QUERY = 'has:attachment newer_than:7d';

export function resolveScanQuery(): string {
  return env.GMAIL_SCAN_QUERY ?? DEFAULT_SCAN_QUERY;
}
