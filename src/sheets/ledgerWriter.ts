import type { sheets_v4 } from 'googleapis';
import type { PaymentMethod, PendingTransaction, TransactionSource } from '@prisma/client';
import { z } from 'zod';
import { env } from '../config/env';
import { RUNNING_BALANCE_FORMULA } from './sheetSchema';
import { appendValues, updateValues } from './sheetsClient';

const TRANSACTIONS_APPEND_RANGE = 'Transactions!A:P';

// Prisma's @map on an enum changes the *database* value, not necessarily
// what the generated TS client exposes at runtime — these maps are the
// explicit, tested source of truth for each enum member's exact Sheet
// string, rather than assuming e.g. transaction.source already equals
// "Z-Report".
export const SOURCE_LABELS: Record<TransactionSource, string> = {
  Email: 'Email',
  TelegramPhoto: 'Telegram Photo',
  Manual: 'Manual',
  ZReport: 'Z-Report',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CreditCard: 'Credit Card',
  BankTransfer: 'Bank Transfer',
  Cash: 'Cash',
  Bit: 'Bit',
  PayPal: 'PayPal',
  Other: 'Other',
};

const writeInvariantsSchema = z.object({
  category: z.string().min(1),
  amount: z.number(),
  resolvedAt: z.date(),
  receivedDate: z.date(),
  submitterRole: z.enum(['Admin', 'Worker']),
});

// appendRow is only ever called post-confirm, but the Prisma model has
// category/resolvedAt nullable at the type level — this is a real boundary
// check, not decoration.
function assertWritable(transaction: PendingTransaction): void {
  writeInvariantsSchema.parse({
    category: transaction.category ?? undefined,
    amount: transaction.amount.toNumber(),
    resolvedAt: transaction.resolvedAt ?? undefined,
    receivedDate: transaction.receivedDate,
    submitterRole: transaction.submitterRole,
  });
}

function formatInBarTimezone(date: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: env.BAR_TIMEZONE, ...options }).format(date);
}

function formatDate(date: Date | null): string {
  if (!date) {
    return '';
  }
  return formatInBarTimezone(date, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// Deliberately space-separated local time ("YYYY-MM-DD HH:mm:ss"), not ISO —
// ISO's "Z"/offset suffix would misrepresent a bar-timezone value as UTC.
function formatTimestamp(date: Date | null): string {
  if (!date) {
    return '';
  }
  const datePart = formatDate(date);
  const timePart = formatInBarTimezone(date, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  return `${datePart} ${timePart}`;
}

function buildRowValues(
  transaction: PendingTransaction,
  transactionId: string,
  edited: boolean,
): (string | number)[] {
  return [
    transactionId,
    formatDate(transaction.receiptDate),
    formatDate(transaction.receivedDate),
    transaction.transactionType,
    transaction.category ?? '',
    transaction.vendorSource ?? '',
    transaction.description ?? '',
    transaction.amount.toNumber(),
    transaction.paymentMethod ? PAYMENT_METHOD_LABELS[transaction.paymentMethod] : '',
    edited ? 'Edited' : 'Approved',
    SOURCE_LABELS[transaction.source],
    transaction.telegramUsername ?? transaction.telegramUserId,
    transaction.submitterRole,
    formatTimestamp(transaction.resolvedAt),
    transaction.sourceLink ?? '',
    transaction.notes ?? '',
  ];
}

// Parses the row number out of an updatedRange like "Transactions!A15:P15".
function parseRowNumber(updatedRange: string | undefined): number {
  const match = updatedRange ? /![A-Z]+(\d+):[A-Z]+\d+$/.exec(updatedRange) : null;
  const rowGroup = match?.[1];
  if (!rowGroup) {
    throw new Error(`could not parse a row number from updatedRange "${String(updatedRange)}"`);
  }
  return Number(rowGroup);
}

export interface AppendRowResult {
  transactionId: string;
  rowNumber: number;
}

// Write sequence: (1) appendValues writes columns A-P; (2) the row number is
// only known from that response's updatedRange; (3) updateValues then writes
// the Running Balance formula into column Q for that specific row — it can't
// be included in the initial append because it needs its own row number
// first.
export async function appendRow(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  transaction: PendingTransaction,
  options: { edited: boolean },
): Promise<AppendRowResult> {
  assertWritable(transaction);

  const transactionId = `TX-${String(transaction.id).padStart(4, '0')}`;
  const row = buildRowValues(transaction, transactionId, options.edited);

  const appendResult = await appendValues(sheets, spreadsheetId, TRANSACTIONS_APPEND_RANGE, [row]);
  const rowNumber = parseRowNumber(appendResult.updates?.updatedRange);

  await updateValues(sheets, spreadsheetId, `Transactions!Q${rowNumber}`, [
    [RUNNING_BALANCE_FORMULA(rowNumber)],
  ]);

  return { transactionId, rowNumber };
}
