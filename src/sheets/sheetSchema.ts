// Typed transcription of docs/sheets-design.md. This file is the single
// source of truth for provision-sheet.ts and for every dropdown/label the
// rest of the Sheets code validates against — keep it in sync with
// docs/sheets-design.md by hand when the column contract changes.

export const TRANSACTIONS_HEADERS = [
  'Transaction ID',
  'Receipt Date',
  'Received Date',
  'Type',
  'Category',
  'Vendor / Source',
  'Description',
  'Amount',
  'Payment Method',
  'Status',
  'Source',
  'Submitted By',
  'Submitter Role',
  'Approval Date',
  'Attachment Link',
  'Notes',
  'Running Balance',
] as const;

export interface CategorySeed {
  name: string;
  type: 'Income' | 'Expense';
}

// Seed data only — consumed exclusively by provision-sheet.ts to populate a
// freshly created Sheet's Categories tab. Categories are read live from the
// Sheet at runtime everywhere else (see CLAUDE.md working rules); this list
// is free to drift from the live tab after provisioning, that's expected.
export const CATEGORIES: readonly CategorySeed[] = [
  { name: 'Bar Sales', type: 'Income' },
  { name: 'Event / Cover Charges', type: 'Income' },
  { name: 'Refunds Received', type: 'Income' },
  { name: 'Other Income', type: 'Income' },
  { name: 'Inventory / COGS', type: 'Expense' },
  { name: 'Licenses & Permits', type: 'Expense' },
  { name: 'Equipment & Maintenance', type: 'Expense' },
  { name: 'Music / Entertainment', type: 'Expense' },
  { name: 'Marketing & Ads', type: 'Expense' },
  { name: 'Software & Subscriptions', type: 'Expense' },
  { name: 'Payment Processing Fees', type: 'Expense' },
  { name: 'Rent & Utilities', type: 'Expense' },
  { name: 'Payroll', type: 'Expense' },
  { name: 'Taxes', type: 'Expense' },
  { name: 'Professional Services', type: 'Expense' },
  { name: 'Bank Fees', type: 'Expense' },
  { name: 'Cleaning & Supplies', type: 'Expense' },
  { name: 'Other Expense', type: 'Expense' },
];

export const DROPDOWNS = {
  type: ['Income', 'Expense'],
  paymentMethod: ['Credit Card', 'Bank Transfer', 'Cash', 'Bit', 'PayPal', 'Other'],
  status: ['Approved', 'Edited'],
  source: ['Email', 'Telegram Photo', 'Manual', 'Z-Report'],
  submitterRole: ['Admin', 'Worker'],
} as const;

// Special-cased for row 2 (first data row): Q1 holds the header text, not a
// number, so the previous-balance term must be literal 0 there instead of
// +Q1.
export function RUNNING_BALANCE_FORMULA(row: number): string {
  const previousBalance = row === 2 ? '0' : `Q${row - 1}`;
  return `=IF(D${row}="Income", H${row}, -H${row}) + ${previousBalance}`;
}

// --- Dashboard layout ---
// All cell addresses are fixed at generation time since provision-sheet.ts
// controls the whole layout, so every block's rows are plain constants here
// rather than derived at runtime.

export const DASHBOARD_TITLE_ROW = 1;

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

function monthNetExpr(startExpr: string, endExpr: string): string {
  const income = `SUMIFS(Transactions!H:H, Transactions!D:D, "Income", Transactions!B:B, ">="&${startExpr}, Transactions!B:B, "<="&${endExpr})`;
  const expenses = `SUMIFS(Transactions!H:H, Transactions!D:D, "Expense", Transactions!B:B, ">="&${startExpr}, Transactions!B:B, "<="&${endExpr})`;
  return `${income} - ${expenses}`;
}

const THIS_MONTH_NET_EXPR = monthNetExpr('EOMONTH(TODAY(),-1)+1', 'EOMONTH(TODAY(),0)');
const PRIOR_MONTH_NET_EXPR = monthNetExpr('EOMONTH(TODAY(),-2)+1', 'EOMONTH(TODAY(),-1)');

export const THIS_MONTH_NET_FORMULA = `=${THIS_MONTH_NET_EXPR}`;

export const AVG_MONTHLY_BURN_FORMULA =
  '=SUMIFS(Transactions!H:H, Transactions!D:D, "Expense", Transactions!B:B, ">="&EOMONTH(TODAY(),-6)+1, Transactions!B:B, "<="&EOMONTH(TODAY(),0)) / 6';

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

export function monthlySummaryIncomeFormula(year: number, month: number): string {
  return `=SUMIFS(Transactions!H:H, Transactions!D:D, "Income", Transactions!B:B, ">="&DATE(${year},${month},1), Transactions!B:B, "<="&EOMONTH(DATE(${year},${month},1),0))`;
}

export function monthlySummaryExpensesFormula(year: number, month: number): string {
  return `=SUMIFS(Transactions!H:H, Transactions!D:D, "Expense", Transactions!B:B, ">="&DATE(${year},${month},1), Transactions!B:B, "<="&EOMONTH(DATE(${year},${month},1),0))`;
}

export function monthlySummaryNetFormula(row: number): string {
  return `=B${row}-C${row}`;
}

// First data row seeds Running Balance from 0 (no previous row to add).
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
  return `=SUMIFS(Transactions!H:H, Transactions!E:E, "${escaped}", Transactions!D:D, "Expense", Transactions!B:B, ">="&EOMONTH(TODAY(),-1)+1, Transactions!B:B, "<="&EOMONTH(TODAY(),0))`;
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
  const expenseCategories = CATEGORIES.filter((category) => category.type === 'Expense');
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
