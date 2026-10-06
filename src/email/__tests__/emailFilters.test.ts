import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env', () => ({
  env: { GMAIL_SCAN_QUERY: undefined },
}));

import { env } from '../../config/env';
import { DEFAULT_SCAN_QUERY, resolveScanQuery } from '../emailFilters';

describe('resolveScanQuery', () => {
  afterEach(() => {
    env.GMAIL_SCAN_QUERY = undefined;
  });

  it('returns DEFAULT_SCAN_QUERY when GMAIL_SCAN_QUERY is not set', () => {
    expect(resolveScanQuery()).toBe(DEFAULT_SCAN_QUERY);
  });

  it('returns GMAIL_SCAN_QUERY when it is set', () => {
    env.GMAIL_SCAN_QUERY = 'from:supplier@example.com';
    expect(resolveScanQuery()).toBe('from:supplier@example.com');
  });
});
