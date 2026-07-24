import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as categoriesReader from '../categoriesReader';
import { GOOGLE_API_TIMEOUT_MS } from '../sheetsClient';
import { createFakeSheetsClient } from './testHelpers';

describe('getCategories', () => {
  beforeEach(() => {
    categoriesReader.resetCategoriesCache();
  });

  it('fetches and parses categories from the Categories tab', async () => {
    const sheets = createFakeSheetsClient({
      getValues: [
        ['Bar Sales', 'Income'],
        ['Inventory / COGS', 'Expense'],
      ],
    });

    const categories = await categoriesReader.getCategories(sheets, 'sheet-id');

    expect(categories).toEqual([
      { name: 'Bar Sales', type: 'Income' },
      { name: 'Inventory / COGS', type: 'Expense' },
    ]);
    expect(sheets.spreadsheets.values.get).toHaveBeenCalledWith(
      { spreadsheetId: 'sheet-id', range: 'Categories!A2:B' },
      { timeout: GOOGLE_API_TIMEOUT_MS },
    );
  });

  it('caches the result — a second call does not re-invoke values.get', async () => {
    const sheets = createFakeSheetsClient({ getValues: [['Bar Sales', 'Income']] });

    await categoriesReader.getCategories(sheets, 'sheet-id');
    await categoriesReader.getCategories(sheets, 'sheet-id');

    expect(sheets.spreadsheets.values.get).toHaveBeenCalledTimes(1);
  });

  it('re-fetches when forceRefresh is set', async () => {
    const sheets = createFakeSheetsClient({ getValues: [['Bar Sales', 'Income']] });

    await categoriesReader.getCategories(sheets, 'sheet-id');
    await categoriesReader.getCategories(sheets, 'sheet-id', { forceRefresh: true });

    expect(sheets.spreadsheets.values.get).toHaveBeenCalledTimes(2);
  });

  it('re-fetches without forceRefresh when the spreadsheetId differs from the cached one', async () => {
    const sheetA = createFakeSheetsClient({ getValues: [['Bar Sales', 'Income']] });
    const sheetB = createFakeSheetsClient({ getValues: [['Inventory / COGS', 'Expense']] });

    const categoriesA = await categoriesReader.getCategories(sheetA, 'sheet-a');
    const categoriesB = await categoriesReader.getCategories(sheetB, 'sheet-b');

    expect(categoriesA).toEqual([{ name: 'Bar Sales', type: 'Income' }]);
    expect(categoriesB).toEqual([{ name: 'Inventory / COGS', type: 'Expense' }]);
    expect(sheetB.spreadsheets.values.get).toHaveBeenCalledTimes(1);
  });

  it('rejects a row with an invalid type value, naming the row and value', async () => {
    const sheets = createFakeSheetsClient({ getValues: [['Bar Sales', 'NotAType']] });

    await expect(categoriesReader.getCategories(sheets, 'sheet-id')).rejects.toThrow(
      /Categories!A2 \("Bar Sales"\)/,
    );
  });

  it('rejects a row with a name but no type (blank Type cell)', async () => {
    // Sheets omits trailing blank cells, so an in-progress row comes back with 1 element.
    const sheets = createFakeSheetsClient({ getValues: [['Bar Sales']] });

    await expect(categoriesReader.getCategories(sheets, 'sheet-id')).rejects.toThrow(
      /Categories!A2/,
    );
  });

  it('skips a fully blank spacer row instead of erroring', async () => {
    const sheets = createFakeSheetsClient({
      getValues: [['Bar Sales', 'Income'], [], ['Inventory / COGS', 'Expense']],
    });

    const categories = await categoriesReader.getCategories(sheets, 'sheet-id');
    expect(categories).toEqual([
      { name: 'Bar Sales', type: 'Income' },
      { name: 'Inventory / COGS', type: 'Expense' },
    ]);
  });

  it('returns an empty array when the tab has no data rows', async () => {
    const sheets = createFakeSheetsClient({ getValues: [] });

    const categories = await categoriesReader.getCategories(sheets, 'sheet-id');
    expect(categories).toEqual([]);
  });

  it('re-fetches once the cache TTL has elapsed, even without forceRefresh', async () => {
    const sheets = createFakeSheetsClient({ getValues: [['Bar Sales', 'Income']] });

    vi.useFakeTimers();
    try {
      await categoriesReader.getCategories(sheets, 'sheet-id');
      vi.advanceTimersByTime(6 * 60 * 1000);
      await categoriesReader.getCategories(sheets, 'sheet-id');
    } finally {
      vi.useRealTimers();
    }

    expect(sheets.spreadsheets.values.get).toHaveBeenCalledTimes(2);
  });
});
