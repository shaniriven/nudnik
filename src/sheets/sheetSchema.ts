// Typed transcription of the Transactions/Categories contract from
// docs/sheets-design.md (Tabs 1-2). This file is the single source of truth
// for provision-sheet.ts and for every dropdown/label the rest of the Sheets
// code validates against — keep it in sync with docs/sheets-design.md by hand
// when the column contract changes. Dashboard tab (Tab 3) layout and formula
// generation live in dashboardSchema.ts.

import type { PaymentMethod, Role, TransactionSource, TransactionType } from '@prisma/client';

// The single source of truth for these two tab titles — ledgerWriter.ts,
// categoriesReader.ts, dashboardSchema.ts, and provision-sheet.ts all build
// cross-sheet formula/range references off these constants rather than
// retyping the literal name, so renaming a tab is a one-line change instead
// of a silent breakage hunt. (Dashboard/Credit Card Payouts tab titles have
// no cross-file reference like this — nothing outside provision-sheet.ts
// ever points a formula at them by name — so they stay local to that file.)
export const TRANSACTIONS_SHEET_TITLE = 'תנועות';
export const CATEGORIES_SHEET_TITLE = 'קטגוריות';

// Sheet-facing text is Hebrew throughout (Sasson is a Hebrew-speaking bar).
// Column order/meaning matches docs/sheets-design.md's Tab 1 table — refer
// there for the English name of each column. Formulas (SUMIFS/DATE/etc.)
// stay in English function names regardless of this — that's governed by
// the spreadsheet's Locale setting, not by this file.
export const TRANSACTIONS_HEADERS = [
  'מספר עסקה',
  'תאריך קבלה',
  'תאריך קליטה',
  'סוג',
  'קטגוריה',
  'ספק/לקוח',
  'תיאור',
  'סכום',
  'אמצעי תשלום',
  'סטטוס',
  'מקור',
  'אושר על ידי',
  'תפקיד המאשר',
  'תאריך אישור',
  'קישור',
  'הערות',
  'יתרה מצטברת',
  // Z-Report rows only: card portion of column H's Amount. Blank for every
  // other source. Cash portion is never stored — it's Amount minus this,
  // derived at read time. Appended after Running Balance (not inserted
  // next to Amount/Payment Method) so no other column letter ever shifts.
  'סכום באשראי',
] as const;

// Prisma's @map only changes the DB value, not the client's runtime enum
// value, so each of these maps a Prisma enum member to its exact Sheet label.
export const TRANSACTION_TYPE_LABELS = {
  Income: 'הכנסה',
  Expense: 'הוצאה',
} as const satisfies Record<TransactionType, string>;

export const PAYMENT_METHOD_LABELS = {
  CreditCard: 'כרטיס אשראי',
  BankTransfer: 'העברה בנקאית',
  Cash: 'מזומן',
  Bit: 'ביט',
  PayPal: 'PayPal', // brand name, left in Latin script
  Other: 'אחר',
} as const satisfies Record<PaymentMethod, string>;

export const SOURCE_LABELS = {
  Email: 'אימייל',
  TelegramPhoto: 'תמונת טלגרם',
  Manual: 'ידני',
  ZReport: 'דוח Z',
} as const satisfies Record<TransactionSource, string>;

export const ROLE_LABELS = {
  Admin: 'מנהל',
  Worker: 'עובד',
} as const satisfies Record<Role, string>;

// No backing Prisma enum — Sheet Status is derived from the `edited` boolean
// at write time (see ledgerWriter.ts), not a stored column.
export enum TransactionStatus {
  Approved = 'מאושר',
  Edited = 'ערוך',
}

function labelValues<T extends Record<string, string>>(labels: T): readonly T[keyof T][] {
  return Object.values(labels) as T[keyof T][];
}

export const DROPDOWNS = {
  type: labelValues(TRANSACTION_TYPE_LABELS),
  paymentMethod: labelValues(PAYMENT_METHOD_LABELS),
  status: labelValues(TransactionStatus),
  source: labelValues(SOURCE_LABELS),
  submitterRole: labelValues(ROLE_LABELS),
} as const;

// The Sheet-facing label value (e.g. 'הכנסה'), not the Prisma TransactionType
// enum member — CategorySeed.type is written to and compared against the
// Sheet's Type column, which only ever holds label text. Coincidentally
// equal to TransactionType while labels were still the English enum member
// names; Hebrew labels made that coincidence visible as a type error.
export type CategoryTypeLabel =
  (typeof TRANSACTION_TYPE_LABELS)[keyof typeof TRANSACTION_TYPE_LABELS];

export interface CategorySeed {
  name: string;
  type: CategoryTypeLabel;
}

// Seed data only — consumed exclusively by provision-sheet.ts to populate a
// freshly created Sheet's Categories tab. Categories are read live from the
// Sheet at runtime everywhere else (see CLAUDE.md working rules); this list
// is free to drift from the live tab after provisioning, that's expected.
// Order/meaning matches docs/sheets-design.md's Tab 2 table.
export const CATEGORIES: readonly CategorySeed[] = [
  { name: 'מכירות בר', type: TRANSACTION_TYPE_LABELS.Income },
  { name: 'אירוע', type: TRANSACTION_TYPE_LABELS.Income },
  { name: 'החזרים שהתקבלו', type: TRANSACTION_TYPE_LABELS.Income },
  { name: 'הכנסה אחרת', type: TRANSACTION_TYPE_LABELS.Income },
  { name: 'מלאי', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'רישיונות והיתרים', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'ציוד ותחזוקה', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'מוזיקה חיה / תקליטן', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'שיווק ופרסום', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'תוכנה', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'עמלות סליקה', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'שכירות וחשבונות', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'שכר עבודה', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'מיסים', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'שירותים מקצועיים', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'עמלות בנק', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'ניקיון וחומרים מתכלים', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'הוצאה אחרת', type: TRANSACTION_TYPE_LABELS.Expense },
];

// Special-cased for row 2 (first data row): Q1 holds the header text, not a
// number, so the previous-balance term must be literal 0 there instead of
// +Q1. Row 1 is reserved for headers — a data row can never legitimately land
// there, so that's a caller/provisioning bug, not a case to paper over with a
// formula referencing a nonexistent Q0.
export function RUNNING_BALANCE_FORMULA(row: number): string {
  if (row < 2) {
    throw new Error(
      `RUNNING_BALANCE_FORMULA: row ${row} is invalid — row 1 is reserved for headers, data rows start at 2`,
    );
  }
  const previousBalance = row === 2 ? '0' : `Q${row - 1}`;
  return `=IF(D${row}="${TRANSACTION_TYPE_LABELS.Income}", H${row}, -H${row}) + ${previousBalance}`;
}
