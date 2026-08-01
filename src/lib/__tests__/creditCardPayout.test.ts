import { describe, expect, it } from 'vitest';
import {
  FIRST_HALF_END_DAY,
  PayoutHalf,
  payoutPeriod,
  SECOND_HALF_START_DAY,
} from '../creditCardPayout';

describe('payoutPeriod', () => {
  it('covers the 1st-15th of the previous month for the "first" half', () => {
    // A payout landing in March settles the 1st-15th of February.
    expect(payoutPeriod(2026, 3, PayoutHalf.First)).toEqual({
      start: { year: 2026, month: 2, day: 1 },
      end: { year: 2026, month: 2, day: 15 },
    });
  });

  it('covers the 16th-end of the previous month for the "second" half', () => {
    // A payout landing in March settles the 16th-28th of February (non-leap year).
    expect(payoutPeriod(2026, 3, PayoutHalf.Second)).toEqual({
      start: { year: 2026, month: 2, day: 16 },
      end: { year: 2026, month: 2, day: 28 },
    });
  });

  it('rolls the previous month back across a year boundary', () => {
    expect(payoutPeriod(2026, 1, PayoutHalf.First)).toEqual({
      start: { year: 2025, month: 12, day: 1 },
      end: { year: 2025, month: 12, day: 15 },
    });
    expect(payoutPeriod(2026, 1, PayoutHalf.Second)).toEqual({
      start: { year: 2025, month: 12, day: 16 },
      end: { year: 2025, month: 12, day: 31 },
    });
  });

  it('ends the "second" half on the correct last day of a leap February', () => {
    // A payout landing in March 2028 (leap year) settles Feb 16-29.
    expect(payoutPeriod(2028, 3, PayoutHalf.Second)).toEqual({
      start: { year: 2028, month: 2, day: 16 },
      end: { year: 2028, month: 2, day: 29 },
    });
  });

  it('splits on the exported FIRST_HALF_END_DAY/SECOND_HALF_START_DAY constants, not a re-hardcoded literal', () => {
    expect(FIRST_HALF_END_DAY).toBe(15);
    expect(SECOND_HALF_START_DAY).toBe(16);
    expect(payoutPeriod(2026, 3, PayoutHalf.First).end.day).toBe(FIRST_HALF_END_DAY);
    expect(payoutPeriod(2026, 3, PayoutHalf.Second).start.day).toBe(SECOND_HALF_START_DAY);
  });
});
