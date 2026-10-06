import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockSetCredentials = vi.fn();
  const mockGmailRawClient = {
    users: {
      messages: {
        list: vi.fn(),
        get: vi.fn(),
      },
    },
  };
  const MockOAuth2 = vi.fn().mockImplementation(() => ({ setCredentials: mockSetCredentials }));
  const mockGmailFactory = vi.fn().mockReturnValue(mockGmailRawClient);

  return { mockSetCredentials, mockGmailRawClient, MockOAuth2, mockGmailFactory };
});

vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: mocks.MockOAuth2 },
    gmail: mocks.mockGmailFactory,
  },
}));

vi.mock('../../config/env', () => ({
  env: {
    GMAIL_OAUTH_CLIENT_ID: 'test-client-id',
    GMAIL_OAUTH_CLIENT_SECRET: 'test-client-secret',
    GMAIL_OAUTH_REFRESH_TOKEN: 'test-refresh-token',
    NODE_ENV: 'test',
  },
}));

vi.mock('../../lib/withRetry', () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import * as gmailClient from '../gmailClient';

const { mockSetCredentials, mockGmailRawClient, MockOAuth2, mockGmailFactory } = mocks;

describe('createGmailClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds an OAuth2 client from GMAIL_OAUTH_* env vars and returns the gmail client', () => {
    const client = gmailClient.createGmailClient();

    expect(MockOAuth2).toHaveBeenCalledWith('test-client-id', 'test-client-secret');
    expect(mockSetCredentials).toHaveBeenCalledWith({ refresh_token: 'test-refresh-token' });

    const factoryArgs = mockGmailFactory.mock.calls[0]?.[0] as
      { version: string; auth: unknown } | undefined;
    expect(factoryArgs?.version).toBe('v1');
    expect(factoryArgs?.auth).toBeDefined();
    expect(client).toBe(mockGmailRawClient);
  });
});

describe('listMessageIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists messages for the given query and returns the parsed response', async () => {
    mockGmailRawClient.users.messages.list.mockResolvedValue({
      data: { messages: [{ id: 'msg-1' }, { id: 'msg-2' }], nextPageToken: 'next' },
    });

    const result = await gmailClient.listMessageIds(mockGmailRawClient as never, 'has:attachment');

    expect(mockGmailRawClient.users.messages.list).toHaveBeenCalledWith(
      { userId: 'me', q: 'has:attachment', pageToken: undefined },
      { timeout: gmailClient.GOOGLE_API_TIMEOUT_MS },
    );
    expect(result).toEqual({
      messages: [{ id: 'msg-1' }, { id: 'msg-2' }],
      nextPageToken: 'next',
    });
  });

  it('passes a pageToken through when provided', async () => {
    mockGmailRawClient.users.messages.list.mockResolvedValue({ data: {} });

    await gmailClient.listMessageIds(mockGmailRawClient as never, 'has:attachment', 'page-2');

    expect(mockGmailRawClient.users.messages.list).toHaveBeenCalledWith(
      { userId: 'me', q: 'has:attachment', pageToken: 'page-2' },
      { timeout: gmailClient.GOOGLE_API_TIMEOUT_MS },
    );
  });

  it('rejects a malformed response', async () => {
    mockGmailRawClient.users.messages.list.mockResolvedValue({
      data: { messages: [{ threadId: 'no-id-here' }] },
    });

    await expect(
      gmailClient.listMessageIds(mockGmailRawClient as never, 'has:attachment'),
    ).rejects.toThrow();
  });
});

describe('getMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches metadata headers and returns the parsed message', async () => {
    mockGmailRawClient.users.messages.get.mockResolvedValue({
      data: {
        id: 'msg-1',
        threadId: 'thread-1',
        snippet: 'Your invoice is attached',
        payload: {
          headers: [
            { name: 'From', value: 'vendor@example.com' },
            { name: 'Subject', value: 'Invoice #123' },
          ],
        },
      },
    });

    const result = await gmailClient.getMessage(mockGmailRawClient as never, 'msg-1');

    expect(mockGmailRawClient.users.messages.get).toHaveBeenCalledWith(
      {
        userId: 'me',
        id: 'msg-1',
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      },
      { timeout: gmailClient.GOOGLE_API_TIMEOUT_MS },
    );
    expect(result.snippet).toBe('Your invoice is attached');
    expect(result.payload?.headers).toEqual([
      { name: 'From', value: 'vendor@example.com' },
      { name: 'Subject', value: 'Invoice #123' },
    ]);
  });

  it('rejects a response missing the required id', async () => {
    mockGmailRawClient.users.messages.get.mockResolvedValue({ data: { snippet: 'no id' } });

    await expect(gmailClient.getMessage(mockGmailRawClient as never, 'msg-1')).rejects.toThrow();
  });
});
