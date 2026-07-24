import type { sheets_v4 } from 'googleapis';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as categoriesReader from '../categoriesReader';

function fakeSheetsClient(values: (string | number)[][]): sheets_v4.Sheets {
  return {
    spreadsheets: {
      values: {
        get: vi.fn().mockResolvedValue({ data: { values } }),
      },
    },
  } as unknown as sheets_v4.Sheets;
}

describe('getCategories', () => {
  beforeEach(() => {
    categoriesReader.resetCategoriesCache();
  });

  it('fetches and parses categories from the Categories tab', async () => {
    const sheets = fakeSheetsClient([
      ['Bar Sales', 'Income'],
      ['Inventory / COGS', 'Expense'],
    ]);

    const categories = await categoriesReader.getCategories(sheets, 'sheet-id');

    expect(categories).toEqual([
      { name: 'Bar Sales', type: 'Income' },
      { name: 'Inventory / COGS', type: 'Expense' },
    ]);
    expect(sheets.spreadsheets.values.get).toHaveBeenCalledWith({
      spreadsheetId: 'sheet-id',
      range: 'Categories!A2:B',
    });
  });

  it('caches the result — a second call does not re-invoke values.get', async () => {
    const sheets = fakeSheetsClient([['Bar Sales', 'Income']]);

    await categoriesReader.getCategories(sheets, 'sheet-id');
    await categoriesReader.getCategories(sheets, 'sheet-id');

    expect(sheets.spreadsheets.values.get).toHaveBeenCalledTimes(1);
  });

  it('re-fetches when forceRefresh is set', async () => {
    const sheets = fakeSheetsClient([['Bar Sales', 'Income']]);

    await categoriesReader.getCategories(sheets, 'sheet-id');
    await categoriesReader.getCategories(sheets, 'sheet-id', { forceRefresh: true });

    expect(sheets.spreadsheets.values.get).toHaveBeenCalledTimes(2);
  });

  it('re-fetches without forceRefresh when the spreadsheetId differs from the cached one', async () => {
    const sheetA = fakeSheetsClient([['Bar Sales', 'Income']]);
    const sheetB = fakeSheetsClient([['Inventory / COGS', 'Expense']]);

    const categoriesA = await categoriesReader.getCategories(sheetA, 'sheet-a');
    const categoriesB = await categoriesReader.getCategories(sheetB, 'sheet-b');

    expect(categoriesA).toEqual([{ name: 'Bar Sales', type: 'Income' }]);
    expect(categoriesB).toEqual([{ name: 'Inventory / COGS', type: 'Expense' }]);
    expect(sheetB.spreadsheets.values.get).toHaveBeenCalledTimes(1);
  });

  it('rejects a row with an invalid type value', async () => {
    const sheets = fakeSheetsClient([['Bar Sales', 'NotAType']]);

    await expect(categoriesReader.getCategories(sheets, 'sheet-id')).rejects.toThrow();
  });

  it('returns an empty array when the tab has no data rows', async () => {
    const sheets = fakeSheetsClient([]);

    const categories = await categoriesReader.getCategories(sheets, 'sheet-id');
    expect(categories).toEqual([]);
  });
});
