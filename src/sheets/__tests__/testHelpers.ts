import type { sheets_v4 } from 'googleapis';
import { vi } from 'vitest';

export function createFakeSheetsClient(
  overrides: {
    getValues?: (string | number)[][];
    appendUpdatedRange?: string;
    updateUpdatedRange?: string;
  } = {},
): sheets_v4.Sheets {
  return {
    spreadsheets: {
      values: {
        get: vi.fn().mockResolvedValue({ data: { values: overrides.getValues } }),
        append: vi
          .fn()
          .mockResolvedValue({ data: { updates: { updatedRange: overrides.appendUpdatedRange } } }),
        update: vi.fn().mockResolvedValue({
          data: { updatedRange: overrides.updateUpdatedRange ?? 'Transactions!Q15' },
        }),
      },
    },
  } as unknown as sheets_v4.Sheets;
}
