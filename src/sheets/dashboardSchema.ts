// Dashboard tab layout and formula generation, per docs/sheets-design.md
// Tab 3. Consumed exclusively by scripts/provision-sheet.ts — the Dashboard
// tab is formulas-only and the bot never writes to it after provisioning.
import type { TransactionType } from '@prisma/client';
import {
  type CalendarDate,
  FIRST_HALF_END_DAY,
  PayoutHalf,
  payoutPeriod,
  SECOND_HALF_START_DAY,
} from '../lib/creditCardPayout';
import { CATEGORIES, TRANSACTIONS_SHEET_TITLE, TRANSACTION_TYPE_LABELS } from './sheetSchema';

// Every cross-sheet formula reference below is built off this, quoted, so
// the Transactions tab title has exactly one source of truth (sheetSchema.ts)
// rather than being retyped per formula.
const TX = `'${TRANSACTIONS_SHEET_TITLE}'`;

// All cell addresses are fixed at generation time since provision-sheet.ts
// controls the whole layout, so every block's rows are plain constants here
// rather than derived at runtime.

// Block C — Key Metrics (single cells, top of dashboard). Column A = label,
// column B = formula/value.
export const DASHBOARD_BLOCK_C_START_ROW = 2;
export const DASHBOARD_BLOCK_C_COLS = {
  label: 'A',
  value: 'B',
} as const;

// Header text is Hebrew (Sasson is a Hebrew-speaking bar) — see
// docs/sheets-design.md's Tab 3 Block A/B tables for the English meaning
// of each column.
export const DASHBOARD_BLOCK_A_HEADERS = [
  'חודש',
  'סה"כ הכנסות',
  'סה"כ הוצאות',
  'תזרים מזומנים נטו',
  'יתרה מצטברת',
] as const;
export const DASHBOARD_BLOCK_A_HEADER_ROW = 8;
export const DASHBOARD_BLOCK_A_START_ROW = 9;
export const DASHBOARD_MONTH_ROWS = 60;

export const DASHBOARD_BLOCK_B_HEADERS = [
  'קטגוריה',
  'החודש הנוכחי (ILS)',
  'החודש הקודם (ILS)',
  '% מסך ההוצאות',
] as const;
// Sits beside Block A (same starting row) rather than below it, so the two
// tables read as a side-by-side dashboard instead of a long vertical stack.
export const DASHBOARD_BLOCK_B_HEADER_ROW = DASHBOARD_BLOCK_A_HEADER_ROW;
export const DASHBOARD_BLOCK_B_START_ROW = DASHBOARD_BLOCK_A_START_ROW;
export const DASHBOARD_BLOCK_B_COLS = {
  category: 'G',
  currentMonth: 'H',
  pastMonth: 'I',
  percent: 'J',
} as const;

export const CURRENT_BALANCE_FORMULA = `=IFERROR(INDEX(${TX}!Q2:Q, COUNTA(${TX}!Q2:Q)), 0)`;

function sumifsByType(type: TransactionType, startExpr: string, endExpr: string): string {
  return `SUMIFS(${TX}!H:H, ${TX}!D:D, "${TRANSACTION_TYPE_LABELS[type]}", ${TX}!B:B, ">="&${startExpr}, ${TX}!B:B, "<="&${endExpr})`;
}

function monthNetExpr(startExpr: string, endExpr: string): string {
  return `${sumifsByType('Income', startExpr, endExpr)} - ${sumifsByType('Expense', startExpr, endExpr)}`;
}

const THIS_MONTH_NET_EXPR = monthNetExpr('EOMONTH(TODAY(),-1)+1', 'EOMONTH(TODAY(),0)');
const PRIOR_MONTH_NET_EXPR = monthNetExpr('EOMONTH(TODAY(),-2)+1', 'EOMONTH(TODAY(),-1)');

export const THIS_MONTH_NET_FORMULA = `=${THIS_MONTH_NET_EXPR}`;

export const AVG_MONTHLY_BURN_FORMULA = `=${sumifsByType('Expense', 'EOMONTH(TODAY(),-6)+1', 'EOMONTH(TODAY(),0)')} / 6`;

// Flagged as the single trickiest formula (QUERY has locale-specific
// argument-separator quirks) — verify by eye against a real Sheet before
// trusting it (see step doc's Manual Steps). QUERY rejects GROUP BY unless
// an aggregation is also SELECTed (CANNOT_GROUP_WITHOUT_AGG), so sum(H)
// stays in the select list to drive the ordering — INDEX(...,0,1) then
// pulls only the category-name column out of the result before TEXTJOIN,
// so the metric shows names only, not the amounts.
export const TOP_3_EXPENSE_CATEGORIES_FORMULA = `=TEXTJOIN(", ", TRUE, INDEX(QUERY(${TX}!A2:Q, "select E, sum(H) where D = '${TRANSACTION_TYPE_LABELS.Expense}' group by E order by sum(H) desc limit 3 label sum(H) ''"), 0, 1))`;

export const MOM_CHANGE_FORMULA = `=IFERROR(((${THIS_MONTH_NET_EXPR})-(${PRIOR_MONTH_NET_EXPR}))/ABS(${PRIOR_MONTH_NET_EXPR}), "N/A")`;

export interface KeyMetricRow {
  row: number;
  label: string;
  formula: string;
}

export function generateKeyMetricsRows(): KeyMetricRow[] {
  return [
    {
      row: DASHBOARD_BLOCK_C_START_ROW,
      label: 'יתרה נוכחית',
      formula: CURRENT_BALANCE_FORMULA,
    },
    {
      row: DASHBOARD_BLOCK_C_START_ROW + 1,
      label: 'נטו החודש',
      formula: THIS_MONTH_NET_FORMULA,
    },
    {
      row: DASHBOARD_BLOCK_C_START_ROW + 2,
      label: 'שריפת מזומנים ממוצעת (6 חודשים)',
      formula: AVG_MONTHLY_BURN_FORMULA,
    },
    {
      row: DASHBOARD_BLOCK_C_START_ROW + 3,
      label: '3 קטגוריות ההוצאה המובילות',
      formula: TOP_3_EXPENSE_CATEGORIES_FORMULA,
    },
    {
      row: DASHBOARD_BLOCK_C_START_ROW + 4,
      label: 'שינוי מול החודש הקודם (%)',
      formula: MOM_CHANGE_FORMULA,
    },
  ];
}

// 6th Key Metric row — fills the row directly above Block A's header rather
// than starting a new gap. Only meaningful once CREDIT_CARD_PAYOUT_DAY_1/2
// are configured, so provision-sheet.ts adds this row itself rather than
// generateKeyMetricsRows() always including it.
export const NEXT_EXPECTED_PAYOUT_ROW = DASHBOARD_BLOCK_C_START_ROW + 5;

export function generateNextPayoutMetricRow(payoutDay1: number, payoutDay2: number): KeyMetricRow {
  return {
    row: NEXT_EXPECTED_PAYOUT_ROW,
    label: 'התשלום הצפוי הבא',
    formula: nextExpectedPayoutFormula(payoutDay1, payoutDay2),
  };
}

function monthBounds(year: number, month: number): { start: string; end: string } {
  const start = `DATE(${year},${month},1)`;
  return { start, end: `EOMONTH(${start},0)` };
}

export function monthlySummaryIncomeFormula(year: number, month: number): string {
  const { start, end } = monthBounds(year, month);
  return `=${sumifsByType('Income', start, end)}`;
}

export function monthlySummaryExpensesFormula(year: number, month: number): string {
  const { start, end } = monthBounds(year, month);
  return `=${sumifsByType('Expense', start, end)}`;
}

export function monthlySummaryNetFormula(row: number): string {
  return `=B${row}-C${row}`;
}

export function monthlySummaryRunningBalanceFormula(row: number, isFirstDataRow: boolean): string {
  return isFirstDataRow ? `=D${row}+0` : `=E${row - 1}+D${row}`;
}

export interface MonthlySummaryRow {
  row: number;
  month: Date;
  incomeFormula: string;
  expensesFormula: string;
  netFormula: string;
  runningBalanceFormula: string;
}

export interface MonthAnchor {
  row: number;
  month: Date;
  year: number;
  monthNumber: number; // 1-12
}

// Shared by generateMonthlySummaryRows and generateCreditCardPayoutRows —
// both lay out the same 60-row, oldest-to-newest month sequence, differing
// only in their row-number base and per-row formulas. anchorMonth is the
// OLDEST month in the block. provision-sheet.ts passes the provisioning
// month itself, so the block runs forward from "now" through 59 months into
// the future rather than trailing history — rows run oldest-to-newest so the
// most recent (last-generated) month lands on the last row, matching the
// Transactions tab's bottom-row-is-latest convention. Each row's Month is a
// literal date value, not a live formula, so rows never shift on
// recalculation.
function generateMonthAnchors(anchorMonth: Date, startRow: number): MonthAnchor[] {
  const anchorYear = anchorMonth.getFullYear();
  const anchorMonthIndex = anchorMonth.getMonth();

  return Array.from({ length: DASHBOARD_MONTH_ROWS }, (_, i) => {
    const month = new Date(anchorYear, anchorMonthIndex + i, 1);
    return {
      row: startRow + i,
      month,
      year: month.getFullYear(),
      monthNumber: month.getMonth() + 1,
    };
  });
}

export function generateMonthlySummaryRows(anchorMonth: Date): MonthlySummaryRow[] {
  return generateMonthAnchors(anchorMonth, DASHBOARD_BLOCK_A_START_ROW).map(
    ({ row, month, year, monthNumber }, i) => ({
      row,
      month,
      incomeFormula: monthlySummaryIncomeFormula(year, monthNumber),
      expensesFormula: monthlySummaryExpensesFormula(year, monthNumber),
      netFormula: monthlySummaryNetFormula(row),
      runningBalanceFormula: monthlySummaryRunningBalanceFormula(row, i === 0),
    }),
  );
}

function categoryBreakdownSumifs(categoryName: string, startExpr: string, endExpr: string): string {
  const escaped = categoryName.replace(/"/g, '""');
  return `=SUMIFS(${TX}!H:H, ${TX}!E:E, "${escaped}", ${TX}!D:D, "${TRANSACTION_TYPE_LABELS.Expense}", ${TX}!B:B, ">="&${startExpr}, ${TX}!B:B, "<="&${endExpr})`;
}

export function categoryBreakdownCurrentMonthFormula(categoryName: string): string {
  return categoryBreakdownSumifs(categoryName, 'EOMONTH(TODAY(),-1)+1', 'EOMONTH(TODAY(),0)');
}

export function categoryBreakdownPastMonthFormula(categoryName: string): string {
  return categoryBreakdownSumifs(categoryName, 'EOMONTH(TODAY(),-2)+1', 'EOMONTH(TODAY(),-1)');
}

export function categoryBreakdownPercentFormula(
  row: number,
  blockStartRow: number,
  blockEndRow: number,
): string {
  const col = DASHBOARD_BLOCK_B_COLS.currentMonth;
  return `=IFERROR(${col}${row}/SUM(${col}${blockStartRow}:${col}${blockEndRow}), 0)`;
}

export interface CategoryBreakdownRow {
  row: number;
  name: string;
  currentMonthFormula: string;
  pastMonthFormula: string;
  percentFormula: string;
}

// One row per expense-type CATEGORIES entry — "% of Total Expenses" read
// literally means income categories like Bar Sales don't belong here.
export function generateCategoryBreakdownRows(): CategoryBreakdownRow[] {
  const expenseCategories = CATEGORIES.filter(
    (category) => category.type === TRANSACTION_TYPE_LABELS.Expense,
  );
  const blockStartRow = DASHBOARD_BLOCK_B_START_ROW;
  const blockEndRow = blockStartRow + expenseCategories.length - 1;

  return expenseCategories.map((category, index) => {
    const row = blockStartRow + index;
    return {
      row,
      name: category.name,
      currentMonthFormula: categoryBreakdownCurrentMonthFormula(category.name),
      pastMonthFormula: categoryBreakdownPastMonthFormula(category.name),
      percentFormula: categoryBreakdownPercentFormula(row, blockStartRow, blockEndRow),
    };
  });
}

// Credit Card Payouts — its own tab, not a Dashboard block. The payout day
// is fixed every month (that's the whole point of a fixed schedule), so a
// per-month date column would just repeat the same two dates 60 times —
// dropped in favor of naming the day directly in the header. Row 1 is the
// header, data starts at row 2, same 60-row anchorMonth horizon as
// generateMonthlySummaryRows.
//
// Confirmed with the bar owner: CREDIT_CARD_PAYOUT_DAY_1 pays out the 1st-15th
// of the PREVIOUS month, CREDIT_CARD_PAYOUT_DAY_2 pays out the 16th-end of
// the PREVIOUS month — see payoutPeriod in lib/creditCardPayout.ts.
export const CREDIT_CARD_PAYOUTS_HEADER_ROW = 1;
export const CREDIT_CARD_PAYOUTS_START_ROW = 2;
export const CREDIT_CARD_PAYOUTS_END_ROW = CREDIT_CARD_PAYOUTS_START_ROW + DASHBOARD_MONTH_ROWS - 1;
export const CREDIT_CARD_PAYOUTS_COLS = {
  month: 'A',
  payout1Amount: 'B',
  payout2Amount: 'C',
} as const;

// Headers embed the actual configured payout days, so they aren't static —
// generated from env at provisioning time rather than a fixed const array
// like DASHBOARD_BLOCK_A_HEADERS.
export function generateCreditCardPayoutHeaders(
  payoutDay1: number,
  payoutDay2: number,
): readonly [string, string, string] {
  return ['חודש', `סכום - יום ${payoutDay1}`, `סכום - יום ${payoutDay2}`];
}

function cardAmountSumifsFormula(start: CalendarDate, end: CalendarDate): string {
  const startExpr = `DATE(${start.year},${start.month},${start.day})`;
  const endExpr = `DATE(${end.year},${end.month},${end.day})`;
  return `=SUMIFS(${TX}!R:R, ${TX}!B:B, ">="&${startExpr}, ${TX}!B:B, "<="&${endExpr})`;
}

export interface CreditCardPayoutRow {
  row: number;
  month: Date;
  payout1AmountFormula: string;
  payout2AmountFormula: string;
}

// No payout-day params here — unlike the headers, each row's amount depends
// only on which HALF of the previous month a payout settles (see
// payoutPeriod), not on the day-of-month it lands on.
export function generateCreditCardPayoutRows(anchorMonth: Date): CreditCardPayoutRow[] {
  return generateMonthAnchors(anchorMonth, CREDIT_CARD_PAYOUTS_START_ROW).map(
    ({ row, month, year, monthNumber }) => {
      const period1 = payoutPeriod(year, monthNumber, PayoutHalf.First);
      const period2 = payoutPeriod(year, monthNumber, PayoutHalf.Second);

      return {
        row,
        month,
        payout1AmountFormula: cardAmountSumifsFormula(period1.start, period1.end),
        payout2AmountFormula: cardAmountSumifsFormula(period2.start, period2.end),
      };
    },
  );
}

// Flagged as the trickiest formula in this file (alongside
// TOP_3_EXPENSE_CATEGORIES_FORMULA above) — verify by eye against a real
// Sheet before trusting it. Self-contained: doesn't read the Credit Card
// Payouts tab at all — re-derives "which payout is next" directly from
// TODAY() and the two configured day-of-month values (the next occurrence of
// each, whichever is sooner), then sums Transactions!R:R over that payout's
// half-month period. A single LET so the repeated sub-expressions (this
// month's two candidate payout dates) are each computed once.
// candidate1/candidate2 can land on the exact same date — both configured
// days get clamped to the current month's last real day (see the MIN(...)
// below), so e.g. days 29 and 30 collide in February. When that happens both
// payouts are due that date, so the metric sums both halves rather than
// picking one and silently dropping the other.
// LET variable names must not double as valid A1 cell references (e.g. "d1"
// and "c1" silently got treated as cells D1/C1 instead of LET bindings,
// breaking the formula with #NAME?) — every name here is either pure
// letters with no trailing digit, or has a letter run longer than the
// 3-letter max column width, so none of them can be misparsed as a cell.
export function nextExpectedPayoutFormula(payoutDay1: number, payoutDay2: number): string {
  const clauses = [
    `payoutDay1Date, DATE(YEAR(TODAY()),MONTH(TODAY()),MIN(${payoutDay1},DAY(EOMONTH(TODAY(),0))))`,
    `payoutDay2Date, DATE(YEAR(TODAY()),MONTH(TODAY()),MIN(${payoutDay2},DAY(EOMONTH(TODAY(),0))))`,
    `candidate1, IF(TODAY()<=payoutDay1Date, payoutDay1Date, EDATE(payoutDay1Date,1))`,
    `candidate2, IF(TODAY()<=payoutDay2Date, payoutDay2Date, EDATE(payoutDay2Date,1))`,
    `nextPayoutDate, MIN(candidate1,candidate2)`,
    `prevMonthStart, DATE(YEAR(nextPayoutDate),MONTH(nextPayoutDate)-1,1)`,
    `firstHalfEnd, DATE(YEAR(nextPayoutDate),MONTH(nextPayoutDate)-1,${FIRST_HALF_END_DAY})`,
    `secondHalfStart, DATE(YEAR(nextPayoutDate),MONTH(nextPayoutDate)-1,${SECOND_HALF_START_DAY})`,
    `secondHalfEnd, EOMONTH(prevMonthStart,0)`,
    `firstHalfSum, SUMIFS(${TX}!R:R, ${TX}!B:B, ">="&prevMonthStart, ${TX}!B:B, "<="&firstHalfEnd)`,
    `secondHalfSum, SUMIFS(${TX}!R:R, ${TX}!B:B, ">="&secondHalfStart, ${TX}!B:B, "<="&secondHalfEnd)`,
    `IF(candidate1=candidate2, firstHalfSum+secondHalfSum, IF(nextPayoutDate=candidate1, firstHalfSum, secondHalfSum))`,
  ];

  return `=LET(${clauses.join(', ')})`;
}
