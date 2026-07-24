import { describe, expect, it } from 'vitest';
import { buildDataValidationRequests, formatCellDate } from '../provision-sheet';

describe('formatCellDate', () => {
  it('formats a Date as YYYY-MM-DD', () => {
    expect(formatCellDate(new Date('2026-07-16T22:00:00Z'))).toBe('2026-07-16');
  });
});

describe('buildDataValidationRequests', () => {
  it('generates one setDataValidation request per DROPDOWNS entry', () => {
    const requests = buildDataValidationRequests();
    expect(requests).toHaveLength(5);
    for (const request of requests) {
      expect(request.setDataValidation?.rule?.condition?.type).toBe('ONE_OF_LIST');
    }
  });
});
