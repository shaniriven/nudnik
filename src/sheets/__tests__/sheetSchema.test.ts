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
    expect(TRANSACTION_TYPE_LABELS).toEqual({ Income: 'הכנסה', Expense: 'הוצאה' });
  });

  it('PAYMENT_METHOD_LABELS matches the Sheet-facing values exactly', () => {
    expect(PAYMENT_METHOD_LABELS).toEqual({
      CreditCard: 'כרטיס אשראי',
      BankTransfer: 'העברה בנקאית',
      Cash: 'מזומן',
      Bit: 'ביט',
      PayPal: 'PayPal',
      Other: 'אחר',
    });
  });

  it('SOURCE_LABELS matches the Sheet-facing values exactly', () => {
    expect(SOURCE_LABELS).toEqual({
      Email: 'אימייל',
      TelegramPhoto: 'תמונת טלגרם',
      Manual: 'ידני',
      ZReport: 'דוח Z',
    });
  });

  it('ROLE_LABELS matches the Sheet-facing values exactly', () => {
    expect(ROLE_LABELS).toEqual({ Admin: 'מנהל', Worker: 'עובד' });
  });

  it('TransactionStatus matches the Sheet-facing values exactly', () => {
    expect(TransactionStatus.Approved).toBe('מאושר');
    expect(TransactionStatus.Edited).toBe('ערוך');
  });
});

describe('TRANSACTIONS_HEADERS', () => {
  it('has exactly 18 headers (columns A through R) in the spec order', () => {
    expect(TRANSACTIONS_HEADERS).toHaveLength(18);
    expect(TRANSACTIONS_HEADERS[0]).toBe('מספר עסקה');
    expect(TRANSACTIONS_HEADERS[7]).toBe('סכום');
    expect(TRANSACTIONS_HEADERS[16]).toBe('יתרה מצטברת');
    expect(TRANSACTIONS_HEADERS[17]).toBe('סכום באשראי');
  });
});

describe('CATEGORIES', () => {
  it('has 18 entries split 4 Income / 14 Expense', () => {
    expect(CATEGORIES).toHaveLength(18);
    expect(CATEGORIES.filter((c) => c.type === TRANSACTION_TYPE_LABELS.Income)).toHaveLength(4);
    expect(CATEGORIES.filter((c) => c.type === TRANSACTION_TYPE_LABELS.Expense)).toHaveLength(14);
  });
});

describe('RUNNING_BALANCE_FORMULA', () => {
  it('special-cases row 2 (first data row) to +0 instead of +Q1', () => {
    expect(RUNNING_BALANCE_FORMULA(2)).toBe(
      `=IF(D2="${TRANSACTION_TYPE_LABELS.Income}", H2, -H2) + 0`,
    );
  });

  it('references the previous row for later rows', () => {
    expect(RUNNING_BALANCE_FORMULA(15)).toBe(
      `=IF(D15="${TRANSACTION_TYPE_LABELS.Income}", H15, -H15) + Q14`,
    );
  });

  it('throws for row 1 (reserved for headers) instead of emitting a Q0 reference', () => {
    expect(() => RUNNING_BALANCE_FORMULA(1)).toThrow(/row 1 is reserved for headers/);
  });
});
