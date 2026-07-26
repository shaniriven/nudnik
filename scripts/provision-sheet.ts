// Creates a fresh 3-tab Nudnik spreadsheet (Transactions / Categories /
// Dashboard) from sheetSchema.ts and dashboardSchema.ts — bar-agnostic,
// reusable for any bar by rerunning against a different BAR_NAME /
// CATEGORIES list.
//
// Not executed as part of step 2's implementation (no real OAuth
// credentials yet) — see docs/steps/02-sheets-writer.md "Manual steps".
import 'dotenv/config';
import type { sheets_v4 } from 'googleapis';
import { z } from 'zod';
import { env } from '../src/config/env';
import { formatMonthLabel } from '../src/lib/barTimezone';
import {
  DASHBOARD_BLOCK_A_HEADER_ROW,
  DASHBOARD_BLOCK_A_HEADERS,
  DASHBOARD_BLOCK_A_START_ROW,
  DASHBOARD_BLOCK_B_COLS,
  DASHBOARD_BLOCK_B_HEADER_ROW,
  DASHBOARD_BLOCK_B_HEADERS,
  DASHBOARD_BLOCK_C_START_ROW,
  generateCategoryBreakdownRows,
  generateKeyMetricsRows,
  generateMonthlySummaryRows,
} from '../src/sheets/dashboardSchema';
import {
  CATEGORIES,
  DROPDOWNS,
  TRANSACTION_TYPE_LABELS,
  TRANSACTIONS_HEADERS,
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

const CATEGORY_COLUMN_INDEX = 4; // E
// Headroom for an admin adding categories directly on the Categories tab
// later — the dropdown re-reads this range live, so it never needs
// provision-sheet.ts rerun just because a category was added.
const CATEGORIES_DROPDOWN_LAST_ROW = 500;

// Soft, low-saturation tints — legible without competing with the data, per
// the "minimal and basic, easy on the eyes" ask.
const HEADER_BACKGROUND_COLOR: sheets_v4.Schema$Color = { red: 0.95, green: 0.95, blue: 0.95 };
const INCOME_ROW_COLOR: sheets_v4.Schema$Color = { red: 0.851, green: 0.918, blue: 0.827 };
const EXPENSE_ROW_COLOR: sheets_v4.Schema$Color = { red: 0.957, green: 0.8, blue: 0.8 };

// Sheets' default row height (21px) reads cramped — a bit of breathing room
// per row, applied uniformly rather than just the header.
const TRANSACTIONS_ROW_HEIGHT_PX = 28;

// autoResizeDimensions proved unreliable in practice — it measured columns
// before undersizing them relative to their actual longest content (e.g.
// Categories!A came out at 158px despite "Software & Subscriptions" needing
// ~220px). Computing widths directly from known text is deterministic and
// errs wide rather than narrow. 8px/char is generous for 10pt Arial
// (including bold headers); 20px padding covers cell margins.
const CHAR_WIDTH_PX = 8;
const COLUMN_PADDING_PX = 20;
const MIN_COLUMN_WIDTH_PX = 60;

export function columnWidthForTexts(texts: readonly string[]): number {
  const longest = texts.reduce((max, text) => Math.max(max, text.length), 0);
  return Math.max(MIN_COLUMN_WIDTH_PX, longest * CHAR_WIDTH_PX + COLUMN_PADDING_PX);
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

function columnIndex(letter: string): number {
  return letter.charCodeAt(0) - 'A'.charCodeAt(0);
}

// The structural batchUpdate's addSheet requests don't get to choose their
// own sheetId (Sheets assigns one), so the response has to be parsed to
// learn Categories'/Dashboard's ids before any later request can target them.
const addSheetReplySchema = z.object({
  addSheet: z.object({ properties: z.object({ sheetId: z.number() }) }),
});

function extractAddedSheetId(reply: unknown): number {
  return addSheetReplySchema.parse(reply).addSheet.properties.sheetId;
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

// Category is deliberately NOT one of DROPDOWNS (sheetSchema.ts) — per
// CLAUDE.md, categories are read live from the Categories tab, never
// hardcoded as an enum. This validation rule reflects that: it references
// the live Categories!A range (ONE_OF_RANGE) rather than a snapshot list
// baked in at provisioning time, so editing the Categories tab later updates
// the dropdown without rerunning this script.
export function buildCategoryDataValidationRequest(): sheets_v4.Schema$Request {
  return {
    setDataValidation: {
      range: {
        sheetId: TRANSACTIONS_SHEET_ID,
        startRowIndex: 1,
        endRowIndex: DATA_VALIDATION_LAST_ROW_INDEX,
        startColumnIndex: CATEGORY_COLUMN_INDEX,
        endColumnIndex: CATEGORY_COLUMN_INDEX + 1,
      },
      rule: {
        condition: {
          type: 'ONE_OF_RANGE',
          values: [{ userEnteredValue: `=Categories!A2:A${CATEGORIES_DROPDOWN_LAST_ROW}` }],
        },
        strict: true,
        showCustomUi: true,
      },
    },
  };
}

// Shared by every tab's header row(s) so "what a header looks like" has one
// definition — bold + light gray fill, per the "same style in all headers" ask.
function buildHeaderFormatRequest(range: sheets_v4.Schema$GridRange): sheets_v4.Schema$Request {
  return {
    repeatCell: {
      range,
      cell: {
        userEnteredFormat: { textFormat: { bold: true }, backgroundColor: HEADER_BACKGROUND_COLOR },
      },
      fields: 'userEnteredFormat(textFormat,backgroundColor)',
    },
  };
}

export function buildTransactionsHeaderFormatRequest(): sheets_v4.Schema$Request {
  return buildHeaderFormatRequest({
    sheetId: TRANSACTIONS_SHEET_ID,
    startRowIndex: 0,
    endRowIndex: 1,
    startColumnIndex: 0,
    endColumnIndex: TRANSACTIONS_HEADERS.length,
  });
}

export function buildCategoriesHeaderFormatRequest(sheetId: number): sheets_v4.Schema$Request {
  return buildHeaderFormatRequest({
    sheetId,
    startRowIndex: 0,
    endRowIndex: 1,
    startColumnIndex: 0,
    endColumnIndex: 3, // Category, Type, Notes
  });
}

export function buildDashboardHeaderFormatRequests(sheetId: number): sheets_v4.Schema$Request[] {
  return [
    buildHeaderFormatRequest({
      sheetId,
      startRowIndex: DASHBOARD_BLOCK_A_HEADER_ROW - 1,
      endRowIndex: DASHBOARD_BLOCK_A_HEADER_ROW,
      startColumnIndex: 0,
      endColumnIndex: DASHBOARD_BLOCK_A_HEADERS.length,
    }),
    buildHeaderFormatRequest({
      sheetId,
      startRowIndex: DASHBOARD_BLOCK_B_HEADER_ROW - 1,
      endRowIndex: DASHBOARD_BLOCK_B_HEADER_ROW,
      startColumnIndex: columnIndex(DASHBOARD_BLOCK_B_COLS.category),
      endColumnIndex: columnIndex(DASHBOARD_BLOCK_B_COLS.percent) + 1,
    }),
  ];
}

// One custom-formula conditional format rule per Type value, tinting the
// whole row so Income/Expense reads at a glance without needing to scan the
// Type column itself. Shared shape for both Transactions (Type in column D)
// and Categories (Type in column B).
function buildIncomeExpenseConditionalFormatRequests(
  range: sheets_v4.Schema$GridRange,
  typeColumnLetter: string,
  firstDataRow: number,
): sheets_v4.Schema$Request[] {
  return [
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [range],
          booleanRule: {
            condition: {
              type: 'CUSTOM_FORMULA',
              values: [
                {
                  userEnteredValue: `=$${typeColumnLetter}${firstDataRow}="${TRANSACTION_TYPE_LABELS.Income}"`,
                },
              ],
            },
            format: { backgroundColor: INCOME_ROW_COLOR },
          },
        },
        index: 0,
      },
    },
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [range],
          booleanRule: {
            condition: {
              type: 'CUSTOM_FORMULA',
              values: [
                {
                  userEnteredValue: `=$${typeColumnLetter}${firstDataRow}="${TRANSACTION_TYPE_LABELS.Expense}"`,
                },
              ],
            },
            format: { backgroundColor: EXPENSE_ROW_COLOR },
          },
        },
        index: 1,
      },
    },
  ];
}

export function buildTransactionsConditionalFormatRequests(): sheets_v4.Schema$Request[] {
  return buildIncomeExpenseConditionalFormatRequests(
    {
      sheetId: TRANSACTIONS_SHEET_ID,
      startRowIndex: 1,
      endRowIndex: DATA_VALIDATION_LAST_ROW_INDEX,
      startColumnIndex: 0,
      endColumnIndex: TRANSACTIONS_HEADERS.length,
    },
    'D',
    2,
  );
}

export function buildCategoriesConditionalFormatRequests(
  sheetId: number,
): sheets_v4.Schema$Request[] {
  return buildIncomeExpenseConditionalFormatRequests(
    {
      sheetId,
      startRowIndex: 1,
      endRowIndex: CATEGORIES.length + 1,
      startColumnIndex: 0,
      endColumnIndex: 3,
    },
    'B',
    2,
  );
}

// Shared by every tab's column-width requests — one column per request since
// each can need a different pixelSize.
function buildColumnWidthRequest(
  sheetId: number,
  index: number,
  pixelSize: number,
): sheets_v4.Schema$Request {
  return {
    updateDimensionProperties: {
      range: { sheetId, dimension: 'COLUMNS', startIndex: index, endIndex: index + 1 },
      properties: { pixelSize },
      fields: 'pixelSize',
    },
  };
}

// Transactions starts empty (no seed data), so header text is the only known
// content — width is sized to fit the header only.
export function buildTransactionsColumnWidthRequests(): sheets_v4.Schema$Request[] {
  return TRANSACTIONS_HEADERS.map((header, index) =>
    buildColumnWidthRequest(TRANSACTIONS_SHEET_ID, index, columnWidthForTexts([header])),
  );
}

export function buildCategoriesColumnWidthRequests(sheetId: number): sheets_v4.Schema$Request[] {
  const widths = [
    columnWidthForTexts(['Category', ...CATEGORIES.map((category) => category.name)]),
    columnWidthForTexts(['Type', ...CATEGORIES.map((category) => category.type)]),
    columnWidthForTexts(['Notes']),
  ];
  return widths.map((pixelSize, index) => buildColumnWidthRequest(sheetId, index, pixelSize));
}

// "Month" the header is short, but its actual values ("September 2026") run
// longer — sample every month name (year-agnostic) so the widest one governs.
const MONTH_LABEL_SAMPLES = Array.from({ length: 12 }, (_, month) =>
  formatMonthLabel(new Date(2000, month, 1)),
);

export function buildDashboardColumnWidthRequests(sheetId: number): sheets_v4.Schema$Request[] {
  const blockA = DASHBOARD_BLOCK_A_HEADERS.map((header, index) =>
    buildColumnWidthRequest(
      sheetId,
      index,
      columnWidthForTexts(index === 0 ? [header, ...MONTH_LABEL_SAMPLES] : [header]),
    ),
  );

  const expenseCategoryNames = CATEGORIES.filter(
    (category) => category.type === TRANSACTION_TYPE_LABELS.Expense,
  ).map((category) => category.name);
  const blockBColumnTexts = [
    [DASHBOARD_BLOCK_B_HEADERS[0], ...expenseCategoryNames],
    [DASHBOARD_BLOCK_B_HEADERS[1]],
    [DASHBOARD_BLOCK_B_HEADERS[2]],
    [DASHBOARD_BLOCK_B_HEADERS[3]],
  ];
  const blockBStart = columnIndex(DASHBOARD_BLOCK_B_COLS.category);
  const blockB = blockBColumnTexts.map((texts, offset) =>
    buildColumnWidthRequest(sheetId, blockBStart + offset, columnWidthForTexts(texts)),
  );

  return [...blockA, ...blockB];
}

export function buildTransactionsRowHeightRequest(): sheets_v4.Schema$Request {
  return {
    updateDimensionProperties: {
      range: {
        sheetId: TRANSACTIONS_SHEET_ID,
        dimension: 'ROWS',
        startIndex: 0,
        endIndex: DATA_VALIDATION_LAST_ROW_INDEX,
      },
      properties: { pixelSize: TRANSACTIONS_ROW_HEIGHT_PX },
      fields: 'pixelSize',
    },
  };
}

async function main(): Promise<void> {
  const sheets = createSheetsClient();
  const title = `${env.BAR_NAME} — Cash Flow Ledger`;

  const created = await createSpreadsheet(sheets, title);
  const spreadsheetId = created.spreadsheetId;

  const structuralUpdate = await batchUpdate(sheets, spreadsheetId, [
    {
      updateSheetProperties: {
        properties: {
          sheetId: TRANSACTIONS_SHEET_ID,
          title: TRANSACTIONS_SHEET_TITLE,
          gridProperties: { frozenRowCount: 1 },
          rightToLeft: false,
        },
        fields: 'title,gridProperties.frozenRowCount,rightToLeft',
      },
    },
    { addSheet: { properties: { title: CATEGORIES_SHEET_TITLE, rightToLeft: false } } },
    { addSheet: { properties: { title: DASHBOARD_SHEET_TITLE, rightToLeft: false } } },
  ]);
  const [, categoriesReply, dashboardReply] = structuralUpdate.replies ?? [];
  const categoriesSheetId = extractAddedSheetId(categoriesReply);
  const dashboardSheetId = extractAddedSheetId(dashboardReply);

  const keyMetrics = generateKeyMetricsRows();
  const now = new Date();
  const anchorMonth = new Date(now.getFullYear(), now.getMonth(), 1);
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
    batchUpdate(sheets, spreadsheetId, [
      ...buildDataValidationRequests(),
      buildCategoryDataValidationRequest(),
    ]),
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
        formatMonthLabel(row.month),
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
        DASHBOARD_BLOCK_B_COLS.category,
        DASHBOARD_BLOCK_B_HEADER_ROW,
        DASHBOARD_BLOCK_B_COLS.percent,
        DASHBOARD_BLOCK_B_HEADER_ROW,
      ),
      [[...DASHBOARD_BLOCK_B_HEADERS]],
    ),
    updateValues(
      sheets,
      spreadsheetId,
      rangeString(
        'Dashboard',
        DASHBOARD_BLOCK_B_COLS.category,
        firstBreakdownRow.row,
        DASHBOARD_BLOCK_B_COLS.percent,
        lastBreakdownRow.row,
      ),
      categoryBreakdownRows.map((row) => [
        row.name,
        row.currentMonthFormula,
        row.pastMonthFormula,
        row.percentFormula,
      ]),
    ),
  ]);

  await batchUpdate(sheets, spreadsheetId, [
    buildTransactionsHeaderFormatRequest(),
    buildCategoriesHeaderFormatRequest(categoriesSheetId),
    ...buildDashboardHeaderFormatRequests(dashboardSheetId),
    ...buildTransactionsConditionalFormatRequests(),
    ...buildCategoriesConditionalFormatRequests(categoriesSheetId),
    ...buildTransactionsColumnWidthRequests(),
    ...buildCategoriesColumnWidthRequests(categoriesSheetId),
    ...buildDashboardColumnWidthRequests(dashboardSheetId),
    buildTransactionsRowHeightRequest(),
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
