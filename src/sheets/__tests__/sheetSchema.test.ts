import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  DASHBOARD_BLOCK_A_START_ROW,
  DASHBOARD_MONTH_ROWS,
  RUNNING_BALANCE_FORMULA,
  TRANSACTIONS_HEADERS,
  categoryBreakdownPercentFormula,
  categoryBreakdownTotalFormula,
  generateCategoryBreakdownRows,
  generateKeyMetricsRows,
  generateMonthlySummaryRows,
  monthlySummaryRunningBalanceFormula,
} from '../sheetSchema';

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
});

describe('generateKeyMetricsRows', () => {
  it('generates 5 metric rows starting at the block start row', () => {
    const rows = generateKeyMetricsRows();
    expect(rows).toHaveLength(5);
    expect(rows[0]?.label).toBe('Current Balance');
    expect(rows[0]?.formula).toContain('INDEX(Transactions!Q2:Q');
  });
});

describe('monthlySummaryRunningBalanceFormula', () => {
  it('seeds the first data row of the block from 0', () => {
    expect(monthlySummaryRunningBalanceFormula(DASHBOARD_BLOCK_A_START_ROW, true)).toBe(
      `=D${DASHBOARD_BLOCK_A_START_ROW}+0`,
    );
  });

  it('adds this row net to the previous row running balance otherwise', () => {
    const row = DASHBOARD_BLOCK_A_START_ROW + 1;
    expect(monthlySummaryRunningBalanceFormula(row, false)).toBe(`=E${row - 1}+D${row}`);
  });
});

describe('generateMonthlySummaryRows', () => {
  const rows = generateMonthlySummaryRows(new Date(2021, 7, 1));

  it('generates exactly DASHBOARD_MONTH_ROWS rows', () => {
    expect(rows).toHaveLength(DASHBOARD_MONTH_ROWS);
  });

  it('seeds the first row (row 9, anchor month) with a +0 running balance', () => {
    const first = rows[0];
    expect(first?.row).toBe(DASHBOARD_BLOCK_A_START_ROW);
    expect(first?.month).toEqual(new Date(2021, 7, 1));
    expect(first?.runningBalanceFormula).toBe(`=D${DASHBOARD_BLOCK_A_START_ROW}+0`);
  });

  it('advances the second row to the next month and chains the running balance', () => {
    const second = rows[1];
    expect(second?.month).toEqual(new Date(2021, 8, 1));
    expect(second?.runningBalanceFormula).toBe(
      `=E${DASHBOARD_BLOCK_A_START_ROW}+D${DASHBOARD_BLOCK_A_START_ROW + 1}`,
    );
  });

  it('ends the last row of the block 59 months after the anchor', () => {
    const last = rows[DASHBOARD_MONTH_ROWS - 1];
    expect(last?.row).toBe(DASHBOARD_BLOCK_A_START_ROW + DASHBOARD_MONTH_ROWS - 1);
    expect(last?.month).toEqual(new Date(2026, 6, 1));
  });
});

describe('generateCategoryBreakdownRows', () => {
  it('generates one row per expense-type category only', () => {
    const rows = generateCategoryBreakdownRows();
    const expenseCount = CATEGORIES.filter((c) => c.type === 'Expense').length;
    expect(rows).toHaveLength(expenseCount);
    expect(
      rows.every((r) => CATEGORIES.some((c) => c.name === r.name && c.type === 'Expense')),
    ).toBe(true);
  });

  it('computes the percent formula range across the whole block', () => {
    const rows = generateCategoryBreakdownRows();
    const first = rows[0];
    const last = rows[rows.length - 1];
    expect(first?.percentFormula).toBe(
      categoryBreakdownPercentFormula(first!.row, first!.row, last!.row),
    );
  });
});

describe('categoryBreakdownTotalFormula', () => {
  it('escapes double quotes in category names', () => {
    expect(categoryBreakdownTotalFormula('Odd "Name"')).toContain('Odd ""Name""');
  });
});
