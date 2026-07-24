import { describe, expect, it } from 'vitest';
import * as processedEmailRepo from '../processedEmailRepo';
import { useTestPrismaClient, withRollback } from './testHelpers';

const testPrisma = useTestPrismaClient();

describe('processedEmailRepo', () => {
  it('creates a processed email and finds it by gmail message id', async () => {
    await withRollback(testPrisma, async (tx) => {
      const created = await processedEmailRepo.create(tx, {
        gmailMessageId: 'msg-1',
        processedAt: new Date('2026-07-17T10:00:00Z'),
        status: 'extracted',
      });
      expect(created.gmailMessageId).toBe('msg-1');
      expect(created.status).toBe('extracted');

      const found = await processedEmailRepo.findByGmailMessageId(tx, 'msg-1');
      expect(found?.status).toBe('extracted');
    });
  });

  it('returns null when a gmail message id has not been processed', async () => {
    await withRollback(testPrisma, async (tx) => {
      const found = await processedEmailRepo.findByGmailMessageId(tx, 'does-not-exist');
      expect(found).toBeNull();
    });
  });

  it('updates status on an existing processed email', async () => {
    await withRollback(testPrisma, async (tx) => {
      await processedEmailRepo.create(tx, {
        gmailMessageId: 'msg-2',
        processedAt: new Date('2026-07-17T10:00:00Z'),
        status: 'extracted',
      });

      const updated = await processedEmailRepo.updateStatus(tx, 'msg-2', 'extraction_failed');
      expect(updated.status).toBe('extraction_failed');
    });
  });

  it('does not persist rows once the transaction rolls back', async () => {
    await withRollback(testPrisma, async (tx) => {
      await processedEmailRepo.create(tx, {
        gmailMessageId: 'msg-3',
        processedAt: new Date('2026-07-17T10:00:00Z'),
        status: 'extracted',
      });
    });

    const found = await processedEmailRepo.findByGmailMessageId(testPrisma, 'msg-3');
    expect(found).toBeNull();
  });
});
