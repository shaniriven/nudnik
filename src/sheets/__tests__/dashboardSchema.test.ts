import { describe, expect, it } from 'vitest';
import { FIRST_HALF_END_DAY, SECOND_HALF_START_DAY } from '../../lib/creditCardPayout';
import { CATEGORIES, TRANSACTIONS_SHEET_TITLE, TRANSACTION_TYPE_LABELS } from '../sheetSchema';
import {
  CREDIT_CARD_PAYOUTS_END_ROW,
  CREDIT_CARD_PAYOUTS_START_ROW,
  DASHBOARD_BLOCK_A_HEADER_ROW,
  DASHBOARD_BLOCK_A_START_ROW,
  DASHBOARD_MONTH_ROWS,
  NEXT_EXPECTED_PAYOUT_ROW,
  categoryBreakdownCurrentMonthFormula,
  categoryBreakdownPastMonthFormula,
  categoryBreakdownPercentFormula,
  generateCategoryBreakdownRows,
  generateCreditCardPayoutHeaders,
  generateCreditCardPayoutRows,
  generateKeyMetricsRows,
  generateMonthlySummaryRows,
  generateNextPayoutMetricRow,
  monthlySummaryRunningBalanceFormula,
  nextExpectedPayoutFormula,
} from '../dashboardSchema';

describe('generateKeyMetricsRows', () => {
  it('generates 5 metric rows starting at the block start row', () => {
    const rows = generateKeyMetricsRows();
    expect(rows).toHaveLength(5);
    expect(rows[0]?.label).toBe('יתרה נוכחית');
    expect(rows[0]?.formula).toContain(`INDEX('${TRANSACTIONS_SHEET_TITLE}'!Q2:Q`);
  });
});

describe('monthlySummaryRunningBalanceFormula', () => {
  it('seeds the first data row of the block from 0', () => {
    expect(monthlySummaryRunningBalanceFormula(DASHBOARD_BLOCK_A_START_ROW, true)).toBe(
      `=D${DASHBOARD_BLOCK_A_START_ROW}+0`,
    );
  });

  it('adds this row net to the previous row running balance otherwise', () => {
    const row = DASHBOARD_BLOCK_A_START_ROW + 1;
    expect(monthlySummaryRunningBalanceFormula(row, false)).toBe(`=E${row - 1}+D${row}`);
  });
});

describe('generateMonthlySummaryRows', () => {
  const rows = generateMonthlySummaryRows(new Date(2021, 7, 1));

  it('generates exactly DASHBOARD_MONTH_ROWS rows', () => {
    expect(rows).toHaveLength(DASHBOARD_MONTH_ROWS);
  });

  it('seeds the first row (row 9, anchor month) with a +0 running balance', () => {
    const first = rows[0];
    expect(first?.row).toBe(DASHBOARD_BLOCK_A_START_ROW);
    expect(first?.month).toEqual(new Date(2021, 7, 1));
    expect(first?.runningBalanceFormula).toBe(`=D${DASHBOARD_BLOCK_A_START_ROW}+0`);
  });

  it('advances the second row to the next month and chains the running balance', () => {
    const second = rows[1];
    expect(second?.month).toEqual(new Date(2021, 8, 1));
    expect(second?.runningBalanceFormula).toBe(
      `=E${DASHBOARD_BLOCK_A_START_ROW}+D${DASHBOARD_BLOCK_A_START_ROW + 1}`,
    );
  });

  it('ends the last row of the block 59 months after the anchor', () => {
    const last = rows[DASHBOARD_MONTH_ROWS - 1];
    expect(last?.row).toBe(DASHBOARD_BLOCK_A_START_ROW + DASHBOARD_MONTH_ROWS - 1);
    expect(last?.month).toEqual(new Date(2026, 6, 1));
  });
});

describe('generateCategoryBreakdownRows', () => {
  it('generates one row per expense-type category only', () => {
    const rows = generateCategoryBreakdownRows();
    const expenseCount = CATEGORIES.filter(
      (c) => c.type === TRANSACTION_TYPE_LABELS.Expense,
    ).length;
    expect(rows).toHaveLength(expenseCount);
    expect(
      rows.every((r) =>
        CATEGORIES.some((c) => c.name === r.name && c.type === TRANSACTION_TYPE_LABELS.Expense),
      ),
    ).toBe(true);
  });

  it('computes the percent formula range across the whole block', () => {
    const rows = generateCategoryBreakdownRows();
    const first = rows[0];
    const last = rows[rows.length - 1];
    expect(first?.percentFormula).toBe(
      categoryBreakdownPercentFormula(first!.row, first!.row, last!.row),
    );
  });
});

describe('categoryBreakdownCurrentMonthFormula', () => {
  it('escapes double quotes in category names', () => {
    expect(categoryBreakdownCurrentMonthFormula('Odd "Name"')).toContain('Odd ""Name""');
  });
});

describe('categoryBreakdownPastMonthFormula', () => {
  it('escapes double quotes in category names', () => {
    expect(categoryBreakdownPastMonthFormula('Odd "Name"')).toContain('Odd ""Name""');
  });

  it('shifts the date window back one additional month from the current-month formula', () => {
    expect(categoryBreakdownPastMonthFormula('Rent & Utilities')).toContain(
      'EOMONTH(TODAY(),-2)+1',
    );
    expect(categoryBreakdownPastMonthFormula('Rent & Utilities')).toContain(
      '<="&EOMONTH(TODAY(),-1)',
    );
  });
});

describe('generateCreditCardPayoutHeaders', () => {
  it('embeds the configured payout days in the header labels, no date columns', () => {
    expect(generateCreditCardPayoutHeaders(2, 8)).toEqual(['חודש', 'סכום - יום 2', 'סכום - יום 8']);
  });
});

describe('generateCreditCardPayoutRows', () => {
  const rows = generateCreditCardPayoutRows(new Date(2026, 2, 1));

  it('generates exactly DASHBOARD_MONTH_ROWS rows, starting at CREDIT_CARD_PAYOUTS_START_ROW', () => {
    expect(rows).toHaveLength(DASHBOARD_MONTH_ROWS);
    expect(rows[0]?.row).toBe(CREDIT_CARD_PAYOUTS_START_ROW);
    expect(rows[DASHBOARD_MONTH_ROWS - 1]?.row).toBe(CREDIT_CARD_PAYOUTS_END_ROW);
  });

  it("builds payout 1's amount from the 1st-15th of the previous month", () => {
    const first = rows[0];
    expect(first?.month).toEqual(new Date(2026, 2, 1));
    expect(first?.payout1AmountFormula).toBe(
      `=SUMIFS('${TRANSACTIONS_SHEET_TITLE}'!R:R, '${TRANSACTIONS_SHEET_TITLE}'!B:B, ">="&DATE(2026,2,1), '${TRANSACTIONS_SHEET_TITLE}'!B:B, "<="&DATE(2026,2,15))`,
    );
  });

  it("builds payout 2's amount from the 16th-end of the previous month", () => {
    const first = rows[0];
    expect(first?.payout2AmountFormula).toBe(
      `=SUMIFS('${TRANSACTIONS_SHEET_TITLE}'!R:R, '${TRANSACTIONS_SHEET_TITLE}'!B:B, ">="&DATE(2026,2,16), '${TRANSACTIONS_SHEET_TITLE}'!B:B, "<="&DATE(2026,2,28))`,
    );
  });
});

describe('generateNextPayoutMetricRow', () => {
  it('places the metric at NEXT_EXPECTED_PAYOUT_ROW and delegates to nextExpectedPayoutFormula', () => {
    const metric = generateNextPayoutMetricRow(2, 8);
    expect(metric.row).toBe(NEXT_EXPECTED_PAYOUT_ROW);
    expect(metric.label).toBe('התשלום הצפוי הבא');
    expect(metric.formula).toBe(nextExpectedPayoutFormula(2, 8));
  });

  it("sits directly above Block A's header row (no gap)", () => {
    expect(NEXT_EXPECTED_PAYOUT_ROW).toBeLessThan(DASHBOARD_BLOCK_A_HEADER_ROW);
  });
});

describe('nextExpectedPayoutFormula', () => {
  it('is self-contained: derives the next payout date from TODAY() and both configured days, no table lookup', () => {
    const formula = nextExpectedPayoutFormula(2, 8);
    expect(formula).toContain('=LET(');
    expect(formula).toContain('DATE(YEAR(TODAY()),MONTH(TODAY()),MIN(2,DAY(EOMONTH(TODAY(),0))))');
    expect(formula).toContain('DATE(YEAR(TODAY()),MONTH(TODAY()),MIN(8,DAY(EOMONTH(TODAY(),0))))');
    expect(formula).toContain('TODAY()');
    expect(formula).toContain('EDATE(');
    expect(formula).toContain('EOMONTH(');
    const sumifsPattern = new RegExp(`SUMIFS\\('${TRANSACTIONS_SHEET_TITLE}'!R:R`, 'g');
    expect(formula.match(sumifsPattern)).toHaveLength(2);
    expect(formula).not.toContain('תשלומי סליקה');
  });

  it("clamps a configured day of 29-31 to the current month's last day, so DATE() never overflows into the next month", () => {
    const formula = nextExpectedPayoutFormula(30, 31);
    expect(formula).toContain('DATE(YEAR(TODAY()),MONTH(TODAY()),MIN(30,DAY(EOMONTH(TODAY(),0))))');
    expect(formula).toContain('DATE(YEAR(TODAY()),MONTH(TODAY()),MIN(31,DAY(EOMONTH(TODAY(),0))))');
  });

  it('splits the previous month using the shared FIRST_HALF_END_DAY/SECOND_HALF_START_DAY constants, not re-hardcoded literals', () => {
    const formula = nextExpectedPayoutFormula(2, 8);
    expect(formula).toContain(`MONTH(nextPayoutDate)-1,${FIRST_HALF_END_DAY})`);
    expect(formula).toContain(`MONTH(nextPayoutDate)-1,${SECOND_HALF_START_DAY})`);
  });

  it('sums both halves instead of picking one when the two candidate payout dates land on the same day', () => {
    // Both configured days clamp to the same date in a short month (e.g. 29
    // and 30 both collide on Feb 28) — the formula must not silently drop
    // one half's sum when that happens.
    const formula = nextExpectedPayoutFormula(29, 30);
    expect(formula).toContain(
      'IF(candidate1=candidate2, firstHalfSum+secondHalfSum, IF(nextPayoutDate=candidate1, firstHalfSum, secondHalfSum))',
    );
  });
});
