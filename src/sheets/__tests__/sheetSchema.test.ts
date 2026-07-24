import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  DROPDOWNS,
  PAYMENT_METHOD_LABELS,
  ROLE_LABELS,
  RUNNING_BALANCE_FORMULA,
  SOURCE_LABELS,
  TRANSACTIONS_HEADERS,
  TransactionStatus,
  TRANSACTION_TYPE_LABELS,
} from '../sheetSchema';

describe('label maps', () => {
  const labelMaps = {
    TRANSACTION_TYPE_LABELS,
    PAYMENT_METHOD_LABELS,
    SOURCE_LABELS,
    ROLE_LABELS,
    TransactionStatus,
  };

  it.each(Object.entries(labelMaps))('%s has no duplicate label values', (_name, labels) => {
    const values = Object.values(labels);
    expect(new Set(values).size).toBe(values.length);
  });

  it('DROPDOWNS is derived from the label maps, not retyped', () => {
    expect(DROPDOWNS.type).toEqual(Object.values(TRANSACTION_TYPE_LABELS));
    expect(DROPDOWNS.paymentMethod).toEqual(Object.values(PAYMENT_METHOD_LABELS));
    expect(DROPDOWNS.source).toEqual(Object.values(SOURCE_LABELS));
    expect(DROPDOWNS.submitterRole).toEqual(Object.values(ROLE_LABELS));
    expect(DROPDOWNS.status).toEqual(Object.values(TransactionStatus));
  });

  // Independent of the DROPDOWNS-derivation check above: since DROPDOWNS is now
  // mechanically derived from these same maps, that check alone can't catch a
  // typo'd label value (it would just propagate). These pin each map against a
  // hand-typed expectation, transcribed from docs/sheets-design.md, so a typo
  // in any Sheet-facing label fails a test instead of silently reaching the
  // Sheet's dropdown validation.
  it('TRANSACTION_TYPE_LABELS matches the Sheet-facing values exactly', () => {
    expect(TRANSACTION_TYPE_LABELS).toEqual({ Income: 'Income', Expense: 'Expense' });
  });

  it('PAYMENT_METHOD_LABELS matches the Sheet-facing values exactly', () => {
    expect(PAYMENT_METHOD_LABELS).toEqual({
      CreditCard: 'Credit Card',
      BankTransfer: 'Bank Transfer',
      Cash: 'Cash',
      Bit: 'Bit',
      PayPal: 'PayPal',
      Other: 'Other',
    });
  });

  it('SOURCE_LABELS matches the Sheet-facing values exactly', () => {
    expect(SOURCE_LABELS).toEqual({
      Email: 'Email',
      TelegramPhoto: 'Telegram Photo',
      Manual: 'Manual',
      ZReport: 'Z-Report',
    });
  });

  it('ROLE_LABELS matches the Sheet-facing values exactly', () => {
    expect(ROLE_LABELS).toEqual({ Admin: 'Admin', Worker: 'Worker' });
  });

  it('TransactionStatus matches the Sheet-facing values exactly', () => {
    expect(TransactionStatus.Approved).toBe('Approved');
    expect(TransactionStatus.Edited).toBe('Edited');
  });
});

describe('TRANSACTIONS_HEADERS', () => {
  it('has exactly 17 headers (columns A through Q) in the spec order', () => {
    expect(TRANSACTIONS_HEADERS).toHaveLength(17);
    expect(TRANSACTIONS_HEADERS[0]).toBe('Transaction ID');
    expect(TRANSACTIONS_HEADERS[7]).toBe('Amount');
    expect(TRANSACTIONS_HEADERS[16]).toBe('Running Balance');
  });
});

describe('CATEGORIES', () => {
  it('has 18 entries split 4 Income / 14 Expense', () => {
    expect(CATEGORIES).toHaveLength(18);
    expect(CATEGORIES.filter((c) => c.type === 'Income')).toHaveLength(4);
    expect(CATEGORIES.filter((c) => c.type === 'Expense')).toHaveLength(14);
  });
});

describe('RUNNING_BALANCE_FORMULA', () => {
  it('special-cases row 2 (first data row) to +0 instead of +Q1', () => {
    expect(RUNNING_BALANCE_FORMULA(2)).toBe('=IF(D2="Income", H2, -H2) + 0');
  });

  it('references the previous row for later rows', () => {
    expect(RUNNING_BALANCE_FORMULA(15)).toBe('=IF(D15="Income", H15, -H15) + Q14');
  });

  it('throws for row 1 (reserved for headers) instead of emitting a Q0 reference', () => {
    expect(() => RUNNING_BALANCE_FORMULA(1)).toThrow(/row 1 is reserved for headers/);
  });
});
