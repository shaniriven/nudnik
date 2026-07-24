import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockSetCredentials = vi.fn();
  const mockSheetsRawClient = {
    spreadsheets: {
      values: {
        get: vi.fn(),
        append: vi.fn(),
        update: vi.fn(),
      },
      batchUpdate: vi.fn(),
      create: vi.fn(),
    },
  };
  const MockOAuth2 = vi.fn().mockImplementation(() => ({ setCredentials: mockSetCredentials }));
  const mockSheetsFactory = vi.fn().mockReturnValue(mockSheetsRawClient);

  return { mockSetCredentials, mockSheetsRawClient, MockOAuth2, mockSheetsFactory };
});

vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: mocks.MockOAuth2 },
    sheets: mocks.mockSheetsFactory,
  },
}));

vi.mock('../../config/env', () => ({
  env: {
    SHEETS_OAUTH_CLIENT_ID: 'test-client-id',
    SHEETS_OAUTH_CLIENT_SECRET: 'test-client-secret',
    SHEETS_OAUTH_REFRESH_TOKEN: 'test-refresh-token',
  },
}));

vi.mock('../../lib/withRetry', () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import { withRetry } from '../../lib/withRetry';
import * as sheetsClient from '../sheetsClient';

const { mockSetCredentials, mockSheetsRawClient, MockOAuth2, mockSheetsFactory } = mocks;

describe('createSheetsClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds an OAuth2 client from SHEETS_OAUTH_* env vars and returns the sheets client', () => {
    const client = sheetsClient.createSheetsClient();

    expect(MockOAuth2).toHaveBeenCalledWith('test-client-id', 'test-client-secret');
    expect(mockSetCredentials).toHaveBeenCalledWith({ refresh_token: 'test-refresh-token' });

    const factoryArgs = mockSheetsFactory.mock.calls[0]?.[0] as
      { version: string; auth: unknown } | undefined;
    expect(factoryArgs?.version).toBe('v4');
    expect(factoryArgs?.auth).toBeDefined();
    expect(client).toBe(mockSheetsRawClient);
  });
});

describe('getValues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the parsed values array and goes through withRetry', async () => {
    mockSheetsRawClient.spreadsheets.values.get.mockResolvedValue({
      data: {
        values: [
          ['a', 1],
          ['b', 2],
        ],
      },
    });

    const result = await sheetsClient.getValues(
      mockSheetsRawClient as never,
      'sheet-id',
      'Categories!A:B',
    );

    expect(result).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
    expect(mockSheetsRawClient.spreadsheets.values.get).toHaveBeenCalledWith({
      spreadsheetId: 'sheet-id',
      range: 'Categories!A:B',
    });
    expect(withRetry).toHaveBeenCalled();
  });

  it('returns undefined when the response has no values', async () => {
    mockSheetsRawClient.spreadsheets.values.get.mockResolvedValue({ data: {} });

    const result = await sheetsClient.getValues(mockSheetsRawClient as never, 'sheet-id', 'A:B');
    expect(result).toBeUndefined();
  });

  it('rejects a malformed response (non string/number cell)', async () => {
    mockSheetsRawClient.spreadsheets.values.get.mockResolvedValue({
      data: { values: [[{ nested: true }]] },
    });

    await expect(
      sheetsClient.getValues(mockSheetsRawClient as never, 'sheet-id', 'A:B'),
    ).rejects.toThrow();
  });
});

describe('appendValues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('appends with USER_ENTERED and returns the parsed response', async () => {
    mockSheetsRawClient.spreadsheets.values.append.mockResolvedValue({
      data: { updates: { updatedRange: 'Transactions!A15:P15' } },
    });

    const result = await sheetsClient.appendValues(
      mockSheetsRawClient as never,
      'sheet-id',
      'Transactions!A:P',
      [['TX-0001']],
    );

    expect(mockSheetsRawClient.spreadsheets.values.append).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: 'sheet-id',
        range: 'Transactions!A:P',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['TX-0001']] },
      }),
    );
    expect(result.updates?.updatedRange).toBe('Transactions!A15:P15');
  });

  it('rejects a malformed response', async () => {
    mockSheetsRawClient.spreadsheets.values.append.mockResolvedValue({
      data: { updates: { updatedRange: 42 } },
    });

    await expect(
      sheetsClient.appendValues(mockSheetsRawClient as never, 'sheet-id', 'A:B', [['x']]),
    ).rejects.toThrow();
  });
});

describe('updateValues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates with USER_ENTERED so formulas are interpreted, not literal text', async () => {
    mockSheetsRawClient.spreadsheets.values.update.mockResolvedValue({
      data: { updatedRange: 'Transactions!Q15' },
    });

    const result = await sheetsClient.updateValues(
      mockSheetsRawClient as never,
      'sheet-id',
      'Transactions!Q15',
      [['=1+1']],
    );

    expect(mockSheetsRawClient.spreadsheets.values.update).toHaveBeenCalledWith(
      expect.objectContaining({ valueInputOption: 'USER_ENTERED' }),
    );
    expect(result.updatedRange).toBe('Transactions!Q15');
  });
});

describe('batchUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends requests and returns the parsed response', async () => {
    mockSheetsRawClient.spreadsheets.batchUpdate.mockResolvedValue({
      data: { spreadsheetId: 'sheet-id', replies: [{}] },
    });

    const result = await sheetsClient.batchUpdate(mockSheetsRawClient as never, 'sheet-id', [
      { addSheet: { properties: { title: 'Transactions' } } },
    ]);

    expect(mockSheetsRawClient.spreadsheets.batchUpdate).toHaveBeenCalledWith({
      spreadsheetId: 'sheet-id',
      requestBody: { requests: [{ addSheet: { properties: { title: 'Transactions' } } }] },
    });
    expect(result.spreadsheetId).toBe('sheet-id');
  });
});

describe('createSpreadsheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a spreadsheet with the given title and returns its id/url', async () => {
    mockSheetsRawClient.spreadsheets.create.mockResolvedValue({
      data: { spreadsheetId: 'new-id', spreadsheetUrl: 'https://sheets.example/new-id' },
    });

    const result = await sheetsClient.createSpreadsheet(mockSheetsRawClient as never, 'My Sheet');

    expect(mockSheetsRawClient.spreadsheets.create).toHaveBeenCalledWith({
      requestBody: { properties: { title: 'My Sheet' } },
    });
    expect(result).toEqual({
      spreadsheetId: 'new-id',
      spreadsheetUrl: 'https://sheets.example/new-id',
    });
  });

  it('rejects a response missing spreadsheetId', async () => {
    mockSheetsRawClient.spreadsheets.create.mockResolvedValue({ data: {} });

    await expect(
      sheetsClient.createSpreadsheet(mockSheetsRawClient as never, 'My Sheet'),
    ).rejects.toThrow();
  });
});
