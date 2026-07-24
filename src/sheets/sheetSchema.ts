// Typed transcription of the Transactions/Categories contract from
// docs/sheets-design.md (Tabs 1-2). This file is the single source of truth
// for provision-sheet.ts and for every dropdown/label the rest of the Sheets
// code validates against — keep it in sync with docs/sheets-design.md by hand
// when the column contract changes. Dashboard tab (Tab 3) layout and formula
// generation live in dashboardSchema.ts.

import type { PaymentMethod, Role, TransactionSource, TransactionType } from '@prisma/client';

export const TRANSACTIONS_HEADERS = [
  'Transaction ID',
  'Receipt Date',
  'Received Date',
  'Type',
  'Category',
  'Vendor / Source',
  'Description',
  'Amount',
  'Payment Method',
  'Status',
  'Source',
  'Submitted By',
  'Submitter Role',
  'Approval Date',
  'Attachment Link',
  'Notes',
  'Running Balance',
] as const;

// Prisma's @map only changes the DB value, not the client's runtime enum
// value, so each of these maps a Prisma enum member to its exact Sheet label.
export const TRANSACTION_TYPE_LABELS = {
  Income: 'Income',
  Expense: 'Expense',
} as const satisfies Record<TransactionType, string>;

export const PAYMENT_METHOD_LABELS = {
  CreditCard: 'Credit Card',
  BankTransfer: 'Bank Transfer',
  Cash: 'Cash',
  Bit: 'Bit',
  PayPal: 'PayPal',
  Other: 'Other',
} as const satisfies Record<PaymentMethod, string>;

export const SOURCE_LABELS = {
  Email: 'Email',
  TelegramPhoto: 'Telegram Photo',
  Manual: 'Manual',
  ZReport: 'Z-Report',
} as const satisfies Record<TransactionSource, string>;

export const ROLE_LABELS = {
  Admin: 'Admin',
  Worker: 'Worker',
} as const satisfies Record<Role, string>;

// No backing Prisma enum — Sheet Status is derived from the `edited` boolean
// at write time (see ledgerWriter.ts), not a stored column.
export enum TransactionStatus {
  Approved = 'Approved',
  Edited = 'Edited',
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

export interface CategorySeed {
  name: string;
  type: TransactionType;
}

// Seed data only — consumed exclusively by provision-sheet.ts to populate a
// freshly created Sheet's Categories tab. Categories are read live from the
// Sheet at runtime everywhere else (see CLAUDE.md working rules); this list
// is free to drift from the live tab after provisioning, that's expected.
export const CATEGORIES: readonly CategorySeed[] = [
  { name: 'Bar Sales', type: TRANSACTION_TYPE_LABELS.Income },
  { name: 'Event / Cover Charges', type: TRANSACTION_TYPE_LABELS.Income },
  { name: 'Refunds Received', type: TRANSACTION_TYPE_LABELS.Income },
  { name: 'Other Income', type: TRANSACTION_TYPE_LABELS.Income },
  { name: 'Inventory / COGS', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'Licenses & Permits', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'Equipment & Maintenance', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'Music / Entertainment', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'Marketing & Ads', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'Software & Subscriptions', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'Payment Processing Fees', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'Rent & Utilities', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'Payroll', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'Taxes', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'Professional Services', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'Bank Fees', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'Cleaning & Supplies', type: TRANSACTION_TYPE_LABELS.Expense },
  { name: 'Other Expense', type: TRANSACTION_TYPE_LABELS.Expense },
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
  return `=IF(D${row}="Income", H${row}, -H${row}) + ${previousBalance}`;
}
