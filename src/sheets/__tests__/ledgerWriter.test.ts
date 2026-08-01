import type { sheets_v4 } from 'googleapis';
import { Prisma } from '@prisma/client';
import type { PendingTransaction } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  PAYMENT_METHOD_LABELS,
  SOURCE_LABELS,
  TRANSACTIONS_SHEET_TITLE,
  TransactionStatus,
  TRANSACTION_TYPE_LABELS,
} from '../sheetSchema';
import { GOOGLE_API_TIMEOUT_MS } from '../sheetsClient';
import { createFakeSheetsClient } from './testHelpers';

vi.mock('../../config/env', () => ({
  env: { BAR_TIMEZONE: 'Asia/Jerusalem', NODE_ENV: 'test' },
}));

import { PartialAppendError, appendRow } from '../ledgerWriter';

function buildTransaction(overrides: Partial<PendingTransaction> = {}): PendingTransaction {
  return {
    id: 1,
    source: 'Email',
    transactionType: 'Expense',
    gmailMessageId: null,
    receiptDate: new Date('2026-07-15'),
    receivedDate: new Date('2026-07-16'),
    category: 'Inventory / COGS',
    vendorSource: 'ACME Supplies',
    description: 'Monthly restock',
    amount: new Prisma.Decimal('123.45'),
    paymentMethod: 'CreditCard',
    cardAmount: null,
    notes: null,
    sourceLink: 'https://mail.google.com/mail/u/0/#inbox/abc',
    telegramUserId: 'chat-1',
    telegramUsername: 'shani',
    submitterRole: 'Admin',
    confidence: 0.9,
    status: 'confirmed',
    telegramChatId: 'chat-1',
    telegramMessageId: 'msg-1',
    createdAt: new Date('2026-07-16T08:00:00Z'),
    resolvedAt: new Date('2026-07-16T09:00:00Z'),
    ...overrides,
  };
}

function getAppendedRow(sheets: sheets_v4.Sheets, callIndex: number): (string | number)[] {
  const mockFn = sheets.spreadsheets.values.append as ReturnType<typeof vi.fn>;
  const call = mockFn.mock.calls[callIndex] as
    [{ requestBody: { values: (string | number)[][] } }] | undefined;
  const row = call?.[0].requestBody.values[0];
  if (!row) {
    throw new Error(`expected an append call at index ${callIndex}`);
  }
  return row;
}

function fakeSheetsClient(updatedRange: string): sheets_v4.Sheets {
  return createFakeSheetsClient({ appendUpdatedRange: updatedRange });
}

describe('appendRow', () => {
  it('generates a zero-padded TX-#### id from the transaction id', async () => {
    const sheets = fakeSheetsClient('Transactions!A15:P15');
    const result = await appendRow(sheets, 'sheet-id', buildTransaction({ id: 42 }), {
      edited: false,
    });
    expect(result.transactionId).toBe('TX-0042');
  });

  it('does not truncate 5+ digit ids', async () => {
    const sheets = fakeSheetsClient('Transactions!A15:P15');
    const result = await appendRow(sheets, 'sheet-id', buildTransaction({ id: 12345 }), {
      edited: false,
    });
    expect(result.transactionId).toBe('TX-12345');
  });

  it('writes Status Approved when not edited, Edited when edited', async () => {
    const sheets = fakeSheetsClient('Transactions!A15:P15');

    await appendRow(sheets, 'sheet-id', buildTransaction(), { edited: false });
    expect(getAppendedRow(sheets, 0)[9]).toBe(TransactionStatus.Approved);

    await appendRow(sheets, 'sheet-id', buildTransaction(), { edited: true });
    expect(getAppendedRow(sheets, 1)[9]).toBe(TransactionStatus.Edited);
  });

  it('maps source and payment method enums to their exact Sheet label', async () => {
    const sheets = fakeSheetsClient('Transactions!A15:P15');
    await appendRow(
      sheets,
      'sheet-id',
      buildTransaction({ source: 'ZReport', paymentMethod: 'BankTransfer' }),
      { edited: false },
    );
    const row = getAppendedRow(sheets, 0);
    expect(row[10]).toBe(SOURCE_LABELS.ZReport);
    expect(row[8]).toBe(PAYMENT_METHOD_LABELS.BankTransfer);
  });

  it('parses the row number and writes the Running Balance formula to column Q', async () => {
    const sheets = fakeSheetsClient('Transactions!A23:P23');
    const result = await appendRow(sheets, 'sheet-id', buildTransaction(), { edited: false });

    expect(result.rowNumber).toBe(23);
    expect(sheets.spreadsheets.values.update).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: 'sheet-id',
        range: `'${TRANSACTIONS_SHEET_TITLE}'!Q23`,
        requestBody: {
          values: [[`=IF(D23="${TRANSACTION_TYPE_LABELS.Income}", H23, -H23) + Q22`]],
        },
      }),
      { timeout: GOOGLE_API_TIMEOUT_MS },
    );
  });

  it('special-cases the first data row (row 2) to +0 in the Running Balance formula', async () => {
    const sheets = fakeSheetsClient('Transactions!A2:P2');
    await appendRow(sheets, 'sheet-id', buildTransaction(), { edited: false });

    expect(sheets.spreadsheets.values.update).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: { values: [[`=IF(D2="${TRANSACTION_TYPE_LABELS.Income}", H2, -H2) + 0`]] },
      }),
      { timeout: GOOGLE_API_TIMEOUT_MS },
    );
  });

  it('rejects a transaction missing a required field (category)', async () => {
    const sheets = fakeSheetsClient('Transactions!A15:P15');
    await expect(
      appendRow(sheets, 'sheet-id', buildTransaction({ category: null }), { edited: false }),
    ).rejects.toThrow();
    expect(sheets.spreadsheets.values.append).not.toHaveBeenCalled();
  });

  it('rejects a cardAmount greater than amount', async () => {
    const sheets = fakeSheetsClient('Transactions!A15:R15');
    await expect(
      appendRow(
        sheets,
        'sheet-id',
        buildTransaction({
          source: 'ZReport',
          amount: new Prisma.Decimal('500'),
          cardAmount: new Prisma.Decimal('9000'),
        }),
        { edited: false },
      ),
    ).rejects.toThrow();
    expect(sheets.spreadsheets.values.append).not.toHaveBeenCalled();
  });

  it('rejects a negative cardAmount', async () => {
    const sheets = fakeSheetsClient('Transactions!A15:R15');
    await expect(
      appendRow(
        sheets,
        'sheet-id',
        buildTransaction({
          source: 'ZReport',
          amount: new Prisma.Decimal('500'),
          cardAmount: new Prisma.Decimal('-1'),
        }),
        { edited: false },
      ),
    ).rejects.toThrow();
  });

  it('rejects a cardAmount set on a non-ZReport transaction', async () => {
    const sheets = fakeSheetsClient('Transactions!A15:R15');
    await expect(
      appendRow(
        sheets,
        'sheet-id',
        buildTransaction({
          source: 'Email',
          amount: new Prisma.Decimal('500'),
          cardAmount: new Prisma.Decimal('50'),
        }),
        { edited: false },
      ),
    ).rejects.toThrow();
    expect(sheets.spreadsheets.values.append).not.toHaveBeenCalled();
  });

  it('rejects a transaction missing resolvedAt', async () => {
    const sheets = fakeSheetsClient('Transactions!A15:P15');
    await expect(
      appendRow(sheets, 'sheet-id', buildTransaction({ resolvedAt: null }), { edited: false }),
    ).rejects.toThrow();
  });

  it('formats dates in the bar timezone, not UTC', async () => {
    const sheets = fakeSheetsClient('Transactions!A15:P15');
    await appendRow(
      sheets,
      'sheet-id',
      buildTransaction({
        receiptDate: new Date('2026-07-15T22:00:00Z'),
        receivedDate: new Date('2026-07-15T22:00:00Z'),
        resolvedAt: new Date('2026-07-15T22:00:00Z'),
      }),
      { edited: false },
    );

    const row = getAppendedRow(sheets, 0);
    expect(row[1]).toBe('=DATE(2026,7,16)');
    expect(row[2]).toBe('=DATE(2026,7,16)');
    expect(row[13]).toBe('=DATE(2026,7,16)+TIME(1,0,0)');
  });

  it('writes cardAmount to column R and leaves it blank when null', async () => {
    const sheets = fakeSheetsClient('Transactions!A15:R15');
    await appendRow(
      sheets,
      'sheet-id',
      buildTransaction({
        source: 'ZReport',
        amount: new Prisma.Decimal('500'),
        cardAmount: new Prisma.Decimal('300'),
      }),
      { edited: false },
    );
    const row = getAppendedRow(sheets, 0);
    expect(row[16]).toBe(''); // Q — Running Balance, filled in separately
    expect(row[17]).toBe(300);

    const sheets2 = fakeSheetsClient('Transactions!A16:R16');
    await appendRow(sheets2, 'sheet-id', buildTransaction(), { edited: false });
    expect(getAppendedRow(sheets2, 0)[17]).toBe('');
  });

  it('throws PartialAppendError (not a plain error) when the Running Balance write fails after the row is appended', async () => {
    const sheets = fakeSheetsClient('Transactions!A15:P15');
    (sheets.spreadsheets.values.update as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('network blip'),
    );

    const error = await appendRow(sheets, 'sheet-id', buildTransaction({ id: 7 }), {
      edited: false,
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(PartialAppendError);
    expect((error as PartialAppendError).transactionId).toBe('TX-0007');
    expect((error as PartialAppendError).rowNumber).toBe(15);
    expect(sheets.spreadsheets.values.append).toHaveBeenCalledTimes(1);
  });
});
