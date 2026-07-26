import { describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env', () => ({
  env: { BAR_TIMEZONE: 'Asia/Jerusalem', NODE_ENV: 'test' },
}));

import { formatMonthLabel, getBarTimezoneParts } from '../barTimezone';

describe('getBarTimezoneParts', () => {
  it('converts a UTC instant into the bar timezone Y/M/D/H/M/S parts', () => {
    const parts = getBarTimezoneParts(new Date('2026-07-15T22:00:00Z'));
    expect(parts).toEqual({ year: 2026, month: 7, day: 16, hour: 1, minute: 0, second: 0 });
  });
});

describe('formatMonthLabel', () => {
  it('formats a date as full month name + year, in the bar timezone', () => {
    expect(formatMonthLabel(new Date('2026-07-01T00:00:00Z'))).toBe('July 2026');
  });
});
