// Pure calendar-day math for the credit-card processor's twice-monthly
// payout schedule (CREDIT_CARD_PAYOUT_DAY_1/2). Kept Sheets-formula-agnostic
// so period boundaries have exactly one source of truth — dashboardSchema.ts
// builds both the monthly payout table and the "next expected payout"
// lookup on top of this, rather than re-deriving the logic twice.
//
// Confirmed with the bar owner: each payout settles a fixed half of the
// *previous* calendar month — CREDIT_CARD_PAYOUT_DAY_1 pays out the 1st-15th,
// CREDIT_CARD_PAYOUT_DAY_2 pays out the 16th-end. Not a rolling "since the
// last payout" window — both halves are anchored to fixed day-of-month cuts.

export interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number;
}

export interface PayoutPeriod {
  start: CalendarDate;
  end: CalendarDate;
}

export enum PayoutHalf {
  First = 'first',
  Second = 'second',
}

// The fixed day-of-month split between the two halves — the one number
// dashboardSchema.ts's nextExpectedPayoutFormula must also use, so the
// Sheets formula and this function never drift on the boundary.
export const FIRST_HALF_END_DAY = 15;
export const SECOND_HALF_START_DAY = 16;

// Routes through Date.UTC purely as calendar-day arithmetic (no real
// timezone involved) so day=0 / day=32 etc. normalize into the adjacent
// month exactly like a Sheets DATE() formula would.
function toCalendarDate(year: number, month: number, day: number): CalendarDate {
  const date = new Date(Date.UTC(year, month - 1, day));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

// A payout occurring in (year, month) always settles sales from the
// PREVIOUS calendar month, split at the 15th/16th.
export function payoutPeriod(year: number, month: number, half: PayoutHalf): PayoutPeriod {
  const lastDayOfPreviousMonth = toCalendarDate(year, month, 0);
  const previousYear = lastDayOfPreviousMonth.year;
  const previousMonth = lastDayOfPreviousMonth.month;

  if (half === PayoutHalf.First) {
    return {
      start: toCalendarDate(previousYear, previousMonth, 1),
      end: toCalendarDate(previousYear, previousMonth, FIRST_HALF_END_DAY),
    };
  }

  return {
    start: toCalendarDate(previousYear, previousMonth, SECOND_HALF_START_DAY),
    end: lastDayOfPreviousMonth,
  };
}
