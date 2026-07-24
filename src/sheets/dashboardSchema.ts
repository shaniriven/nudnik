// Dashboard tab layout and formula generation, per docs/sheets-design.md
// Tab 3. Consumed exclusively by scripts/provision-sheet.ts — the Dashboard
// tab is formulas-only and the bot never writes to it after provisioning.
import type { TransactionType } from '@prisma/client';
import { CATEGORIES, TRANSACTION_TYPE_LABELS } from './sheetSchema';

// All cell addresses are fixed at generation time since provision-sheet.ts
// controls the whole layout, so every block's rows are plain constants here
// rather than derived at runtime.

// Block C — Key Metrics (single cells, top of dashboard). Column A = label,
// column B = formula/value.
export const DASHBOARD_BLOCK_C_START_ROW = 2;

export const DASHBOARD_BLOCK_A_HEADERS = [
  'Month',
  'Total Income',
  'Total Expenses',
  'Net Cash Flow',
  'Running Balance',
] as const;
export const DASHBOARD_BLOCK_A_HEADER_ROW = 8;
export const DASHBOARD_BLOCK_A_START_ROW = 9;
export const DASHBOARD_MONTH_ROWS = 60;

export const DASHBOARD_BLOCK_B_HEADERS = [
  'Category',
  'Total (ILS)',
  '% of Total Expenses',
] as const;
export const DASHBOARD_BLOCK_B_HEADER_ROW = 70;
export const DASHBOARD_BLOCK_B_START_ROW = 71;

export const CURRENT_BALANCE_FORMULA =
  '=IFERROR(INDEX(Transactions!Q2:Q, COUNTA(Transactions!Q2:Q)), 0)';

function sumifsByType(type: TransactionType, startExpr: string, endExpr: string): string {
  return `SUMIFS(Transactions!H:H, Transactions!D:D, "${TRANSACTION_TYPE_LABELS[type]}", Transactions!B:B, ">="&${startExpr}, Transactions!B:B, "<="&${endExpr})`;
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
// trusting it (see step doc's Manual Steps).
export const TOP_3_EXPENSE_CATEGORIES_FORMULA =
  '=TEXTJOIN(", ", TRUE, QUERY(Transactions!A2:Q, "select E, sum(H) where D = \'Expense\' group by E order by sum(H) desc limit 3 label sum(H) \'\'"))';

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
      label: 'Current Balance',
      formula: CURRENT_BALANCE_FORMULA,
    },
    {
      row: DASHBOARD_BLOCK_C_START_ROW + 1,
      label: 'This Month Net',
      formula: THIS_MONTH_NET_FORMULA,
    },
    {
      row: DASHBOARD_BLOCK_C_START_ROW + 2,
      label: 'Avg Monthly Burn (6mo)',
      formula: AVG_MONTHLY_BURN_FORMULA,
    },
    {
      row: DASHBOARD_BLOCK_C_START_ROW + 3,
      label: 'Top 3 Expense Categories',
      formula: TOP_3_EXPENSE_CATEGORIES_FORMULA,
    },
    { row: DASHBOARD_BLOCK_C_START_ROW + 4, label: 'MoM Change %', formula: MOM_CHANGE_FORMULA },
  ];
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

// anchorMonth is the OLDEST month in the 60-row block (e.g. 59 months before
// the provisioning date) — rows run oldest-to-newest so the most recent
// month lands on the last row, matching the Transactions tab's
// bottom-row-is-latest convention. Each row's Month is a literal date value,
// not a live formula, so historical rows never shift on recalculation.
export function generateMonthlySummaryRows(anchorMonth: Date): MonthlySummaryRow[] {
  const rows: MonthlySummaryRow[] = [];
  const anchorYear = anchorMonth.getFullYear();
  const anchorMonthIndex = anchorMonth.getMonth();

  for (let i = 0; i < DASHBOARD_MONTH_ROWS; i++) {
    const rowDate = new Date(anchorYear, anchorMonthIndex + i, 1);
    const row = DASHBOARD_BLOCK_A_START_ROW + i;
    const year = rowDate.getFullYear();
    const month = rowDate.getMonth() + 1;

    rows.push({
      row,
      month: rowDate,
      incomeFormula: monthlySummaryIncomeFormula(year, month),
      expensesFormula: monthlySummaryExpensesFormula(year, month),
      netFormula: monthlySummaryNetFormula(row),
      runningBalanceFormula: monthlySummaryRunningBalanceFormula(row, i === 0),
    });
  }

  return rows;
}

export function categoryBreakdownTotalFormula(categoryName: string): string {
  const escaped = categoryName.replace(/"/g, '""');
  return `=SUMIFS(Transactions!H:H, Transactions!E:E, "${escaped}", Transactions!D:D, "${TRANSACTION_TYPE_LABELS.Expense}", Transactions!B:B, ">="&EOMONTH(TODAY(),-1)+1, Transactions!B:B, "<="&EOMONTH(TODAY(),0))`;
}

export function categoryBreakdownPercentFormula(
  row: number,
  blockStartRow: number,
  blockEndRow: number,
): string {
  return `=IFERROR(B${row}/SUM(B${blockStartRow}:B${blockEndRow}), 0)`;
}

export interface CategoryBreakdownRow {
  row: number;
  name: string;
  totalFormula: string;
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
      totalFormula: categoryBreakdownTotalFormula(category.name),
      percentFormula: categoryBreakdownPercentFormula(row, blockStartRow, blockEndRow),
    };
  });
}
