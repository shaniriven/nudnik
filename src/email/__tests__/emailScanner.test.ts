import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db/repositories/processedEmailRepo', () => ({
  findByGmailMessageId: vi.fn(),
}));

vi.mock('../emailFilters', () => ({
  resolveScanQuery: vi.fn().mockReturnValue('has:attachment'),
}));

vi.mock('../../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import * as processedEmailRepo from '../../db/repositories/processedEmailRepo';
import { logger } from '../../lib/logger';
import { scanEmails } from '../emailScanner';
import { createFakeGmailClient } from './testHelpers';

const fakeDb = {} as never;

describe('scanEmails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips a message already present in processed_emails', async () => {
    vi.mocked(processedEmailRepo.findByGmailMessageId).mockResolvedValue({
      gmailMessageId: 'msg-1',
    } as never);

    const gmail = createFakeGmailClient({ listPages: [{ messages: [{ id: 'msg-1' }] }] });

    await scanEmails(gmail, fakeDb);

    expect(logger.debug).toHaveBeenCalledWith(
      { gmailMessageId: 'msg-1' },
      'skipping already-processed email',
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('logs headers and snippet for a new message', async () => {
    vi.mocked(processedEmailRepo.findByGmailMessageId).mockResolvedValue(null);

    const gmail = createFakeGmailClient({
      listPages: [{ messages: [{ id: 'msg-1' }] }],
      messages: {
        'msg-1': {
          id: 'msg-1',
          snippet: 'Your invoice is attached',
          payload: {
            headers: [
              { name: 'From', value: 'vendor@example.com' },
              { name: 'Subject', value: 'Invoice #123' },
              { name: 'Date', value: 'Mon, 1 Jan 2026 10:00:00 +0000' },
            ],
          },
        },
      },
    });

    await scanEmails(gmail, fakeDb);

    expect(logger.info).toHaveBeenCalledWith(
      {
        gmailMessageId: 'msg-1',
        from: 'vendor@example.com',
        subject: 'Invoice #123',
        date: 'Mon, 1 Jan 2026 10:00:00 +0000',
        snippet: 'Your invoice is attached',
      },
      'found new email matching scan query',
    );
  });

  it('paginates across multiple listMessageIds pages', async () => {
    vi.mocked(processedEmailRepo.findByGmailMessageId).mockResolvedValue(null);

    const gmail = createFakeGmailClient({
      listPages: [
        { messages: [{ id: 'msg-1' }], nextPageToken: 'page-2' },
        { messages: [{ id: 'msg-2' }] },
      ],
      messages: {
        'msg-1': { id: 'msg-1' },
        'msg-2': { id: 'msg-2' },
      },
    });

    await scanEmails(gmail, fakeDb);

    expect(gmail.users.messages.list).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledTimes(2);
  });
});
