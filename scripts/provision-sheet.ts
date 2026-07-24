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

function formatCellDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildDataValidationRequests(): sheets_v4.Schema$Request[] {
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

  await updateValues(sheets, spreadsheetId, 'Transactions!A1:Q1', [[...TRANSACTIONS_HEADERS]]);

  await updateValues(sheets, spreadsheetId, 'Categories!A1:C1', [['Category', 'Type', 'Notes']]);
  await updateValues(
    sheets,
    spreadsheetId,
    `Categories!A2:C${CATEGORIES.length + 1}`,
    CATEGORIES.map((category) => [category.name, category.type, '']),
  );

  await batchUpdate(sheets, spreadsheetId, buildDataValidationRequests());

  const keyMetrics = generateKeyMetricsRows();
  await updateValues(
    sheets,
    spreadsheetId,
    `Dashboard!A${DASHBOARD_BLOCK_C_START_ROW}:B${DASHBOARD_BLOCK_C_START_ROW + keyMetrics.length - 1}`,
    keyMetrics.map((metric) => [metric.label, metric.formula]),
  );

  await updateValues(
    sheets,
    spreadsheetId,
    `Dashboard!A${DASHBOARD_BLOCK_A_HEADER_ROW}:E${DASHBOARD_BLOCK_A_HEADER_ROW}`,
    [[...DASHBOARD_BLOCK_A_HEADERS]],
  );

  const now = new Date();
  const anchorMonth = new Date(now.getFullYear(), now.getMonth() - (DASHBOARD_MONTH_ROWS - 1), 1);
  const monthlySummaryRows = generateMonthlySummaryRows(anchorMonth);
  await updateValues(
    sheets,
    spreadsheetId,
    `Dashboard!A${DASHBOARD_BLOCK_A_START_ROW}:E${DASHBOARD_BLOCK_A_START_ROW + monthlySummaryRows.length - 1}`,
    monthlySummaryRows.map((row) => [
      formatCellDate(row.month),
      row.incomeFormula,
      row.expensesFormula,
      row.netFormula,
      row.runningBalanceFormula,
    ]),
  );

  await updateValues(
    sheets,
    spreadsheetId,
    `Dashboard!A${DASHBOARD_BLOCK_B_HEADER_ROW}:C${DASHBOARD_BLOCK_B_HEADER_ROW}`,
    [[...DASHBOARD_BLOCK_B_HEADERS]],
  );

  const categoryBreakdownRows = generateCategoryBreakdownRows();
  const firstBreakdownRow = categoryBreakdownRows[0];
  const lastBreakdownRow = categoryBreakdownRows[categoryBreakdownRows.length - 1];
  if (!firstBreakdownRow || !lastBreakdownRow) {
    throw new Error('expected at least one expense category to generate a breakdown row');
  }
  await updateValues(
    sheets,
    spreadsheetId,
    `Dashboard!A${firstBreakdownRow.row}:C${lastBreakdownRow.row}`,
    categoryBreakdownRows.map((row) => [row.name, row.totalFormula, row.percentFormula]),
  );

  const url =
    created.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  console.log(`Created spreadsheet: ${spreadsheetId}`);
  console.log(url);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
