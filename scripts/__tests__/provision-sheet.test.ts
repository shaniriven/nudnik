import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  TRANSACTION_TYPE_LABELS,
  TRANSACTIONS_HEADERS,
} from '../../src/sheets/sheetSchema';
import {
  buildCategoriesColumnWidthRequests,
  buildCategoriesConditionalFormatRequests,
  buildCategoriesHeaderFormatRequest,
  buildCategoryDataValidationRequest,
  buildDashboardColumnWidthRequests,
  buildDashboardHeaderFormatRequests,
  buildDataValidationRequests,
  buildTransactionsColumnWidthRequests,
  buildTransactionsConditionalFormatRequests,
  buildTransactionsHeaderFormatRequest,
  buildTransactionsRowHeightRequest,
  columnWidthForTexts,
} from '../provision-sheet';

describe('buildDataValidationRequests', () => {
  it('generates one setDataValidation request per DROPDOWNS entry', () => {
    const requests = buildDataValidationRequests();
    expect(requests).toHaveLength(5);
    for (const request of requests) {
      expect(request.setDataValidation?.rule?.condition?.type).toBe('ONE_OF_LIST');
    }
  });
});

describe('buildCategoryDataValidationRequest', () => {
  it('targets the Category column (E) with a live reference to the Categories tab, not a baked-in list', () => {
    const request = buildCategoryDataValidationRequest();
    const validation = request.setDataValidation;
    expect(validation?.range?.startColumnIndex).toBe(4);
    expect(validation?.range?.endColumnIndex).toBe(5);
    expect(validation?.rule?.condition?.type).toBe('ONE_OF_RANGE');
    expect(validation?.rule?.condition?.values?.[0]?.userEnteredValue).toMatch(
      /^=Categories!A2:A\d+$/,
    );
  });
});

describe('buildTransactionsHeaderFormatRequest', () => {
  it('bolds and shades exactly the header row across all Transactions columns', () => {
    const request = buildTransactionsHeaderFormatRequest();
    const range = request.repeatCell?.range;
    expect(range?.startRowIndex).toBe(0);
    expect(range?.endRowIndex).toBe(1);
    expect(range?.endColumnIndex).toBe(TRANSACTIONS_HEADERS.length);
    expect(request.repeatCell?.cell?.userEnteredFormat?.textFormat?.bold).toBe(true);
  });
});

describe('buildCategoriesHeaderFormatRequest', () => {
  it('bolds and shades the Categories header row on the given sheet', () => {
    const request = buildCategoriesHeaderFormatRequest(42);
    const range = request.repeatCell?.range;
    expect(range?.sheetId).toBe(42);
    expect(range?.startRowIndex).toBe(0);
    expect(range?.endRowIndex).toBe(1);
    expect(range?.endColumnIndex).toBe(3);
    expect(request.repeatCell?.cell?.userEnteredFormat?.textFormat?.bold).toBe(true);
  });
});

describe('buildDashboardHeaderFormatRequests', () => {
  it('bolds and shades both Block A and Block B header rows on the given sheet', () => {
    const requests = buildDashboardHeaderFormatRequests(7);
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.repeatCell?.range?.sheetId).toBe(7);
      expect(request.repeatCell?.cell?.userEnteredFormat?.textFormat?.bold).toBe(true);
    }
    // Block B sits in columns G-J (indices 6-9), distinct from Block A's A-E.
    const blockB = requests[1];
    expect(blockB?.repeatCell?.range?.startColumnIndex).toBe(6);
    expect(blockB?.repeatCell?.range?.endColumnIndex).toBe(10);
  });
});

describe('buildTransactionsConditionalFormatRequests', () => {
  it('generates one rule per Type value (column D), each with a distinct background color', () => {
    const requests = buildTransactionsConditionalFormatRequests();
    expect(requests).toHaveLength(2);

    const formulas = requests.map(
      (r) =>
        r.addConditionalFormatRule?.rule?.booleanRule?.condition?.values?.[0]?.userEnteredValue,
    );
    expect(formulas).toContain(`=$D2="${TRANSACTION_TYPE_LABELS.Income}"`);
    expect(formulas).toContain(`=$D2="${TRANSACTION_TYPE_LABELS.Expense}"`);

    const colors = requests.map(
      (r) => r.addConditionalFormatRule?.rule?.booleanRule?.format?.backgroundColor,
    );
    expect(colors[0]).not.toEqual(colors[1]);
  });
});

describe('buildCategoriesConditionalFormatRequests', () => {
  it('generates one rule per Type value (column B) on the given sheet, each with a distinct background color', () => {
    const requests = buildCategoriesConditionalFormatRequests(42);
    expect(requests).toHaveLength(2);

    for (const request of requests) {
      expect(request.addConditionalFormatRule?.rule?.ranges?.[0]?.sheetId).toBe(42);
    }

    const formulas = requests.map(
      (r) =>
        r.addConditionalFormatRule?.rule?.booleanRule?.condition?.values?.[0]?.userEnteredValue,
    );
    expect(formulas).toContain(`=$B2="${TRANSACTION_TYPE_LABELS.Income}"`);
    expect(formulas).toContain(`=$B2="${TRANSACTION_TYPE_LABELS.Expense}"`);

    const colors = requests.map(
      (r) => r.addConditionalFormatRule?.rule?.booleanRule?.format?.backgroundColor,
    );
    expect(colors[0]).not.toEqual(colors[1]);
  });
});

describe('columnWidthForTexts', () => {
  it('sizes to the longest string among the given texts, not just the first', () => {
    const short = columnWidthForTexts(['Type']);
    const long = columnWidthForTexts(['Category', 'Software & Subscriptions']);
    expect(long).toBeGreaterThan(short);
  });

  it('never returns less than the minimum column width', () => {
    expect(columnWidthForTexts([''])).toBeGreaterThanOrEqual(60);
  });
});

describe('buildTransactionsColumnWidthRequests', () => {
  it('generates one width request per Transactions column, on sheet 0', () => {
    const requests = buildTransactionsColumnWidthRequests();
    expect(requests).toHaveLength(TRANSACTIONS_HEADERS.length);
    expect(requests[0]?.updateDimensionProperties?.range?.sheetId).toBe(0);
    expect(requests[0]?.updateDimensionProperties?.range?.startIndex).toBe(0);
  });
});

describe('buildCategoriesColumnWidthRequests', () => {
  it('sizes column A wide enough for the longest category name, on the given sheet', () => {
    const requests = buildCategoriesColumnWidthRequests(42);
    expect(requests).toHaveLength(3);
    expect(requests[0]?.updateDimensionProperties?.range?.sheetId).toBe(42);

    const longestCategoryName = CATEGORIES.reduce(
      (longest, c) => (c.name.length > longest.length ? c.name : longest),
      '',
    );
    const columnAWidth = requests[0]?.updateDimensionProperties?.properties?.pixelSize;
    expect(columnAWidth).toBe(columnWidthForTexts(['Category', longestCategoryName]));
  });
});

describe('buildDashboardColumnWidthRequests', () => {
  it('generates width requests for both Block A and Block B columns, on the given sheet', () => {
    const requests = buildDashboardColumnWidthRequests(7);
    expect(requests).toHaveLength(9); // 5 Block A columns + 4 Block B columns
    for (const request of requests) {
      expect(request.updateDimensionProperties?.range?.sheetId).toBe(7);
    }
    // Block B's Category column (index 6, "G") sizes to the longest expense
    // category name, not just its own header.
    const blockBCategoryWidth = requests[5]?.updateDimensionProperties?.properties?.pixelSize;
    expect(requests[5]?.updateDimensionProperties?.range?.startIndex).toBe(6);
    expect(blockBCategoryWidth).toBeGreaterThan(columnWidthForTexts(['Category']));
  });

  it('sizes the Month column for its longest actual label, not just the "Month" header', () => {
    const requests = buildDashboardColumnWidthRequests(7);
    const monthWidth = requests[0]?.updateDimensionProperties?.properties?.pixelSize;
    expect(monthWidth).toBeGreaterThan(columnWidthForTexts(['Month']));
  });
});

describe('buildTransactionsRowHeightRequest', () => {
  it('sets a pixel height on all rows, including the header', () => {
    const request = buildTransactionsRowHeightRequest();
    expect(request.updateDimensionProperties?.range?.dimension).toBe('ROWS');
    expect(request.updateDimensionProperties?.range?.startIndex).toBe(0);
    expect(request.updateDimensionProperties?.properties?.pixelSize).toBeGreaterThan(21);
  });
});
