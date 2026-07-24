// Creates a fresh 3-tab Nudnik spreadsheet (Transactions / Categories /
// Dashboard) from sheetSchema.ts alone — bar-agnostic, reusable for any bar
// by rerunning against a different BAR_NAME / CATEGORIES list.
//
// Not executed as part of step 2's implementation (no real OAuth
// credentials yet) — see docs/steps/02-sheets-writer.md "Manual steps".
import 'dotenv/config';
import type { sheets_v4 } from 'googleapis';
import { env } from '../src/config/env';
import {
  CATEGORIES,
  DASHBOARD_BLOCK_A_HEADER_ROW,
  DASHBOARD_BLOCK_A_HEADERS,
  DASHBOARD_BLOCK_A_START_ROW,
  DASHBOARD_BLOCK_B_HEADER_ROW,
  DASHBOARD_BLOCK_B_HEADERS,
  DASHBOARD_BLOCK_C_START_ROW,
  DASHBOARD_MONTH_ROWS,
  DROPDOWNS,
  TRANSACTIONS_HEADERS,
  generateCategoryBreakdownRows,
  generateKeyMetricsRows,
  generateMonthlySummaryRows,
} from '../src/sheets/sheetSchema';
import {
  batchUpdate,
  createSheetsClient,
  createSpreadsheet,
  updateValues,
} from '../src/sheets/sheetsClient';

const TRANSACTIONS_SHEET_TITLE = 'Transactions';
const CATEGORIES_SHEET_TITLE = 'Categories';
const DASHBOARD_SHEET_TITLE = 'Dashboard';

// A freshly created spreadsheet's first (default) sheet always has sheetId 0.
const TRANSACTIONS_SHEET_ID = 0;
const DASHBOARD_TITLE_ROW = 1;

// Generous headroom past however many transactions accumulate over the
// life of the sheet — data validation just needs to cover future rows.
const DATA_VALIDATION_LAST_ROW_INDEX = 20000;

const DROPDOWN_COLUMN_INDEX: Record<keyof typeof DROPDOWNS, number> = {
  type: 3, // D
  paymentMethod: 8, // I
  status: 9, // J
  source: 10, // K
  submitterRole: 12, // M
};

export function formatCellDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function rangeString(
  sheetName: string,
  startCol: string,
  startRow: number,
  endCol: string,
  endRow: number,
): string {
  return `${sheetName}!${startCol}${startRow}:${endCol}${endRow}`;
}

export function buildDataValidationRequests(): sheets_v4.Schema$Request[] {
  return (Object.keys(DROPDOWNS) as (keyof typeof DROPDOWNS)[]).map((key) => ({
    setDataValidation: {
      range: {
        sheetId: TRANSACTIONS_SHEET_ID,
        startRowIndex: 1,
        endRowIndex: DATA_VALIDATION_LAST_ROW_INDEX,
        startColumnIndex: DROPDOWN_COLUMN_INDEX[key],
        endColumnIndex: DROPDOWN_COLUMN_INDEX[key] + 1,
      },
      rule: {
        condition: {
          type: 'ONE_OF_LIST',
          values: DROPDOWNS[key].map((value) => ({ userEnteredValue: value })),
        },
        strict: true,
        showCustomUi: true,
      },
    },
  }));
}

async function main(): Promise<void> {
  const sheets = createSheetsClient();
  const title = `${env.BAR_NAME} — Cash Flow Ledger`;

  const created = await createSpreadsheet(sheets, title);
  const spreadsheetId = created.spreadsheetId;

  await batchUpdate(sheets, spreadsheetId, [
    {
      updateSheetProperties: {
        properties: { sheetId: TRANSACTIONS_SHEET_ID, title: TRANSACTIONS_SHEET_TITLE },
        fields: 'title',
      },
    },
    { addSheet: { properties: { title: CATEGORIES_SHEET_TITLE } } },
    { addSheet: { properties: { title: DASHBOARD_SHEET_TITLE } } },
  ]);

  const keyMetrics = generateKeyMetricsRows();
  const now = new Date();
  const anchorMonth = new Date(now.getFullYear(), now.getMonth() - (DASHBOARD_MONTH_ROWS - 1), 1);
  const monthlySummaryRows = generateMonthlySummaryRows(anchorMonth);
  const categoryBreakdownRows = generateCategoryBreakdownRows();
  const firstBreakdownRow = categoryBreakdownRows[0];
  const lastBreakdownRow = categoryBreakdownRows[categoryBreakdownRows.length - 1];
  if (!firstBreakdownRow || !lastBreakdownRow) {
    throw new Error('expected at least one expense category to generate a breakdown row');
  }

  // Every write below targets a disjoint range on a sheet the structural
  // batchUpdate above already created — safe to run concurrently rather than
  // paying one round-trip per write.
  await Promise.all([
    updateValues(sheets, spreadsheetId, rangeString('Transactions', 'A', 1, 'Q', 1), [
      [...TRANSACTIONS_HEADERS],
    ]),
    updateValues(
      sheets,
      spreadsheetId,
      rangeString('Categories', 'A', 1, 'C', CATEGORIES.length + 1),
      [
        ['Category', 'Type', 'Notes'],
        ...CATEGORIES.map((category) => [category.name, category.type, '']),
      ],
    ),
    batchUpdate(sheets, spreadsheetId, buildDataValidationRequests()),
    updateValues(
      sheets,
      spreadsheetId,
      rangeString('Dashboard', 'A', DASHBOARD_TITLE_ROW, 'A', DASHBOARD_TITLE_ROW),
      [[title]],
    ),
    updateValues(
      sheets,
      spreadsheetId,
      rangeString(
        'Dashboard',
        'A',
        DASHBOARD_BLOCK_C_START_ROW,
        'B',
        DASHBOARD_BLOCK_C_START_ROW + keyMetrics.length - 1,
      ),
      keyMetrics.map((metric) => [metric.label, metric.formula]),
    ),
    updateValues(
      sheets,
      spreadsheetId,
      rangeString(
        'Dashboard',
        'A',
        DASHBOARD_BLOCK_A_HEADER_ROW,
        'E',
        DASHBOARD_BLOCK_A_HEADER_ROW,
      ),
      [[...DASHBOARD_BLOCK_A_HEADERS]],
    ),
    updateValues(
      sheets,
      spreadsheetId,
      rangeString(
        'Dashboard',
        'A',
        DASHBOARD_BLOCK_A_START_ROW,
        'E',
        DASHBOARD_BLOCK_A_START_ROW + monthlySummaryRows.length - 1,
      ),
      monthlySummaryRows.map((row) => [
        formatCellDate(row.month),
        row.incomeFormula,
        row.expensesFormula,
        row.netFormula,
        row.runningBalanceFormula,
      ]),
    ),
    updateValues(
      sheets,
      spreadsheetId,
      rangeString(
        'Dashboard',
        'A',
        DASHBOARD_BLOCK_B_HEADER_ROW,
        'C',
        DASHBOARD_BLOCK_B_HEADER_ROW,
      ),
      [[...DASHBOARD_BLOCK_B_HEADERS]],
    ),
    updateValues(
      sheets,
      spreadsheetId,
      rangeString('Dashboard', 'A', firstBreakdownRow.row, 'C', lastBreakdownRow.row),
      categoryBreakdownRows.map((row) => [row.name, row.totalFormula, row.percentFormula]),
    ),
  ]);

  const url =
    created.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  console.log(`Created spreadsheet: ${spreadsheetId}`);
  console.log(url);
}

// Guarded so this file can be imported (e.g. by tests exercising the pure
// helpers above) without triggering a real run against the Sheets API.
if (require.main === module) {
  main().catch((err: unknown) => {
    if (err instanceof Error && err.message.includes('SHEETS_OAUTH_')) {
      console.error(`Configuration error: ${err.message}`);
    } else {
      console.error('provision-sheet failed:', err);
    }
    process.exitCode = 1;
  });
}
