import type { sheets_v4 } from 'googleapis';
import { z } from 'zod';
import { getValues } from './sheetsClient';

const CATEGORIES_RANGE = 'Categories!A2:B';

const categorySchema = z.object({
  name: z.string().min(1),
  type: z.enum(['Income', 'Expense']),
});

export type Category = z.infer<typeof categorySchema>;

let cache: { spreadsheetId: string; categories: Category[] } | null = null;

export async function getCategories(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  options: { forceRefresh?: boolean } = {},
): Promise<Category[]> {
  if (cache && cache.spreadsheetId === spreadsheetId && !options.forceRefresh) {
    return cache.categories;
  }

  const rows = await getValues(sheets, spreadsheetId, CATEGORIES_RANGE);
  const categories = (rows ?? []).map((row) => {
    const [name, type] = row;
    return categorySchema.parse({ name, type });
  });

  cache = { spreadsheetId, categories };
  return categories;
}

export function resetCategoriesCache(): void {
  cache = null;
}
