import type { sheets_v4 } from 'googleapis';
import { z } from 'zod';
import { CATEGORIES_SHEET_TITLE, TRANSACTION_TYPE_LABELS } from './sheetSchema';
import { getValues } from './sheetsClient';

const CATEGORIES_RANGE = `'${CATEGORIES_SHEET_TITLE}'!A2:B`;

const categorySchema = z.object({
  name: z.string().min(1),
  type: z.enum([TRANSACTION_TYPE_LABELS.Income, TRANSACTION_TYPE_LABELS.Expense]),
});

export type Category = z.infer<typeof categorySchema>;

const CACHE_TTL_MS = 5 * 60 * 1000;

// Keyed by spreadsheetId (not a single mutable slot) so two concurrent calls for
// different spreadsheetIds can never clobber each other's cached entry.
const cache = new Map<string, { categories: Category[]; cachedAt: number }>();

export async function getCategories(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  options: { forceRefresh?: boolean } = {},
): Promise<Category[]> {
  const cached = cache.get(spreadsheetId);
  const isFresh = cached !== undefined && Date.now() - cached.cachedAt < CACHE_TTL_MS;
  if (isFresh && !options.forceRefresh) {
    return cached.categories;
  }

  const rows = await getValues(sheets, spreadsheetId, CATEGORIES_RANGE);
  const categories = (rows ?? [])
    .map((row, index) => ({ row, sheetRow: index + 2 }))
    .filter(({ row }) => row.length > 0)
    .map(({ row, sheetRow }) => {
      const [name, type] = row;
      const result = categorySchema.safeParse({ name, type });
      if (!result.success) {
        throw new Error(
          `${CATEGORIES_SHEET_TITLE}!A${sheetRow} ("${String(name ?? '')}") is invalid: expected Type to be "${TRANSACTION_TYPE_LABELS.Income}" or "${TRANSACTION_TYPE_LABELS.Expense}", got ${String(type ?? '(empty)')}`,
        );
      }
      return result.data;
    });

  cache.set(spreadsheetId, { categories, cachedAt: Date.now() });
  return categories;
}

export function resetCategoriesCache(): void {
  cache.clear();
}
