import { describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env', () => ({
  env: { BAR_TIMEZONE: 'Asia/Jerusalem', NODE_ENV: 'test' },
}));

import { getBarTimezoneParts } from '../barTimezone';

describe('getBarTimezoneParts', () => {
  it('converts a UTC instant into the bar timezone Y/M/D/H/M/S parts', () => {
    const parts = getBarTimezoneParts(new Date('2026-07-15T22:00:00Z'));
    expect(parts).toEqual({ year: 2026, month: 7, day: 16, hour: 1, minute: 0, second: 0 });
  });
});
