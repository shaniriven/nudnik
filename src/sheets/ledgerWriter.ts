import type { sheets_v4 } from 'googleapis';
import { Role, type PendingTransaction } from '@prisma/client';
import { z } from 'zod';
import { getBarTimezoneParts } from '../lib/barTimezone';
import {
  PAYMENT_METHOD_LABELS,
  ROLE_LABELS,
  RUNNING_BALANCE_FORMULA,
  SOURCE_LABELS,
  TransactionStatus,
  TRANSACTION_TYPE_LABELS,
} from './sheetSchema';
import { appendValues, updateValues } from './sheetsClient';

const TRANSACTIONS_APPEND_RANGE = 'Transactions!A:P';

const writeInvariantsSchema = z.object({
  category: z.string().min(1),
  amount: z.number(),
  resolvedAt: z.date(),
  receivedDate: z.date(),
  submitterRole: z.nativeEnum(Role),
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

// Written as a =DATE(...) formula (via appendValues' USER_ENTERED) rather than a
// locale-formatted string, so the cell deterministically becomes a real date value
// regardless of the target spreadsheet's locale settings — a plain "YYYY-MM-DD"
// string's auto-parse into a date under USER_ENTERED is locale-dependent, a formula
// isn't.
function formatDate(date: Date | null): string {
  if (!date) {
    return '';
  }
  const { year, month, day } = getBarTimezoneParts(date);
  return `=DATE(${year},${month},${day})`;
}

function formatTimestamp(date: Date | null): string {
  if (!date) {
    return '';
  }
  const { year, month, day, hour, minute, second } = getBarTimezoneParts(date);
  return `=DATE(${year},${month},${day})+TIME(${hour},${minute},${second})`;
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
    TRANSACTION_TYPE_LABELS[transaction.transactionType],
    transaction.category ?? '',
    transaction.vendorSource ?? '',
    transaction.description ?? '',
    transaction.amount.toNumber(),
    transaction.paymentMethod ? PAYMENT_METHOD_LABELS[transaction.paymentMethod] : '',
    edited ? TransactionStatus.Edited : TransactionStatus.Approved,
    SOURCE_LABELS[transaction.source],
    transaction.telegramUsername ?? transaction.telegramUserId,
    ROLE_LABELS[transaction.submitterRole],
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

// Thrown when appendValues (columns A-P) succeeds but the follow-up Q-column
// Running Balance write fails — the row already exists in the Sheet, so the
// caller must not blindly retry appendRow (that would duplicate the row) and
// should instead retry just writeRunningBalanceFormula for this row number.
export class PartialAppendError extends Error {
  readonly transactionId: string;
  readonly rowNumber: number;

  constructor(transactionId: string, rowNumber: number, cause: unknown) {
    super(
      `appendRow: row ${rowNumber} (${transactionId}) was written to Transactions!A:P, but writing the Running Balance formula to column Q failed — retry via writeRunningBalanceFormula(sheets, spreadsheetId, ${rowNumber}), do not retry appendRow`,
      { cause },
    );
    this.name = 'PartialAppendError';
    this.transactionId = transactionId;
    this.rowNumber = rowNumber;
  }
}

export async function writeRunningBalanceFormula(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  rowNumber: number,
): Promise<void> {
  await updateValues(sheets, spreadsheetId, `Transactions!Q${rowNumber}`, [
    [RUNNING_BALANCE_FORMULA(rowNumber)],
  ]);
}

// Write sequence: (1) appendValues writes columns A-P; (2) the row number is
// only known from that response's updatedRange; (3) writeRunningBalanceFormula
// then writes the Running Balance formula into column Q for that specific row
// — it can't be included in the initial append because it needs its own row
// number first.
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

  try {
    await writeRunningBalanceFormula(sheets, spreadsheetId, rowNumber);
  } catch (err) {
    throw new PartialAppendError(transactionId, rowNumber, err);
  }

  return { transactionId, rowNumber };
}
