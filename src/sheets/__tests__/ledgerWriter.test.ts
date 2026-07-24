import type { sheets_v4 } from 'googleapis';
import { Prisma } from '@prisma/client';
import type { PendingTransaction } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { DROPDOWNS } from '../sheetSchema';
import { GOOGLE_API_TIMEOUT_MS } from '../sheetsClient';
import { createFakeSheetsClient } from './testHelpers';

vi.mock('../../config/env', () => ({
  env: { BAR_TIMEZONE: 'Asia/Jerusalem', NODE_ENV: 'test' },
}));

import {
  PAYMENT_METHOD_LABELS,
  PartialAppendError,
  ROLE_LABELS,
  SOURCE_LABELS,
  TRANSACTION_TYPE_LABELS,
  appendRow,
} from '../ledgerWriter';

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
    expect(getAppendedRow(sheets, 0)[9]).toBe('Approved');

    await appendRow(sheets, 'sheet-id', buildTransaction(), { edited: true });
    expect(getAppendedRow(sheets, 1)[9]).toBe('Edited');
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
    expect(row[10]).toBe('Z-Report');
    expect(row[8]).toBe('Bank Transfer');
  });

  it('parses the row number and writes the Running Balance formula to column Q', async () => {
    const sheets = fakeSheetsClient('Transactions!A23:P23');
    const result = await appendRow(sheets, 'sheet-id', buildTransaction(), { edited: false });

    expect(result.rowNumber).toBe(23);
    expect(sheets.spreadsheets.values.update).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: 'sheet-id',
        range: 'Transactions!Q23',
        requestBody: { values: [['=IF(D23="Income", H23, -H23) + Q22']] },
      }),
      { timeout: GOOGLE_API_TIMEOUT_MS },
    );
  });

  it('special-cases the first data row (row 2) to +0 in the Running Balance formula', async () => {
    const sheets = fakeSheetsClient('Transactions!A2:P2');
    await appendRow(sheets, 'sheet-id', buildTransaction(), { edited: false });

    expect(sheets.spreadsheets.values.update).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: { values: [['=IF(D2="Income", H2, -H2) + 0']] },
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

describe('enum-to-label mapping drift guard — transactionType and submitterRole', () => {
  it('every TRANSACTION_TYPE_LABELS value is a valid Transactions!D dropdown option', () => {
    for (const label of Object.values(TRANSACTION_TYPE_LABELS)) {
      expect(DROPDOWNS.type).toContain(label);
    }
  });

  it('every ROLE_LABELS value is a valid Transactions!M dropdown option', () => {
    for (const label of Object.values(ROLE_LABELS)) {
      expect(DROPDOWNS.submitterRole).toContain(label);
    }
  });
});

describe('enum-to-label mapping drift guard', () => {
  it('every SOURCE_LABELS value is a valid Transactions!K dropdown option', () => {
    for (const label of Object.values(SOURCE_LABELS)) {
      expect(DROPDOWNS.source).toContain(label);
    }
  });

  it('every PAYMENT_METHOD_LABELS value is a valid Transactions!I dropdown option', () => {
    for (const label of Object.values(PAYMENT_METHOD_LABELS)) {
      expect(DROPDOWNS.paymentMethod).toContain(label);
    }
  });
});
