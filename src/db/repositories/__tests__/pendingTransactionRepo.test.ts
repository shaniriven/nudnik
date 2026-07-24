import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import * as pendingTransactionRepo from '../pendingTransactionRepo';
import * as processedEmailRepo from '../processedEmailRepo';
import { useTestPrismaClient, withRollback } from './testHelpers';

const testPrisma = useTestPrismaClient();

const baseData: Omit<Prisma.PendingTransactionUncheckedCreateInput, 'id'> = {
  source: 'ZReport',
  transactionType: 'Income',
  receivedDate: new Date('2026-07-17T10:00:00Z'),
  vendorSource: 'Z-Report',
  category: 'Bar Sales',
  description: 'Daily Z-report – 2026-07-17',
  amount: 1234.5,
  telegramUserId: 'chat-1',
  submitterRole: 'Worker',
};

describe('pendingTransactionRepo', () => {
  it('creates a pending transaction with default status "pending"', async () => {
    await withRollback(testPrisma, async (tx) => {
      const created = await pendingTransactionRepo.create(tx, baseData);
      expect(created.status).toBe('pending');
      expect(created.source).toBe('ZReport');
      expect(created.amount.toString()).toBe('1234.5');
    });
  });

  it('finds a pending transaction by id', async () => {
    await withRollback(testPrisma, async (tx) => {
      const created = await pendingTransactionRepo.create(tx, baseData);
      const found = await pendingTransactionRepo.findById(tx, created.id);
      expect(found?.id).toBe(created.id);
    });
  });

  it('returns null when a pending transaction id does not exist', async () => {
    await withRollback(testPrisma, async (tx) => {
      const found = await pendingTransactionRepo.findById(tx, 999999);
      expect(found).toBeNull();
    });
  });

  it('updates status on an existing pending transaction', async () => {
    await withRollback(testPrisma, async (tx) => {
      const created = await pendingTransactionRepo.create(tx, baseData);
      const updated = await pendingTransactionRepo.updateStatus(tx, created.id, 'confirmed');
      expect(updated.status).toBe('confirmed');
      expect(updated.resolvedAt).toBeNull();
    });
  });

  it('sets resolvedAt when confirming', async () => {
    await withRollback(testPrisma, async (tx) => {
      const created = await pendingTransactionRepo.create(tx, baseData);
      const resolvedAt = new Date('2026-07-18T09:00:00Z');
      const updated = await pendingTransactionRepo.updateStatus(
        tx,
        created.id,
        'confirmed',
        resolvedAt,
      );
      expect(updated.resolvedAt?.toISOString()).toBe(resolvedAt.toISOString());
    });
  });

  it('links to its source ProcessedEmail via gmailMessageId', async () => {
    await withRollback(testPrisma, async (tx) => {
      await processedEmailRepo.create(tx, {
        gmailMessageId: 'msg-fk-1',
        processedAt: new Date('2026-07-17T10:00:00Z'),
        status: 'extracted',
      });

      const created = await pendingTransactionRepo.create(tx, {
        ...baseData,
        source: 'Email',
        gmailMessageId: 'msg-fk-1',
      });

      expect(created.gmailMessageId).toBe('msg-fk-1');

      const found = await pendingTransactionRepo.findById(tx, created.id);
      expect(found?.gmailMessageId).toBe('msg-fk-1');
    });
  });

  it('sets gmailMessageId to null when the source ProcessedEmail is deleted', async () => {
    await withRollback(testPrisma, async (tx) => {
      await processedEmailRepo.create(tx, {
        gmailMessageId: 'msg-fk-2',
        processedAt: new Date('2026-07-17T10:00:00Z'),
        status: 'extracted',
      });

      const created = await pendingTransactionRepo.create(tx, {
        ...baseData,
        source: 'Email',
        gmailMessageId: 'msg-fk-2',
      });

      await tx.processedEmail.delete({ where: { gmailMessageId: 'msg-fk-2' } });

      const found = await pendingTransactionRepo.findById(tx, created.id);
      expect(found?.gmailMessageId).toBeNull();
    });
  });

  it('does not persist rows once the transaction rolls back', async () => {
    let createdId: number | undefined;
    await withRollback(testPrisma, async (tx) => {
      const created = await pendingTransactionRepo.create(tx, baseData);
      createdId = created.id;
    });

    const found = await pendingTransactionRepo.findById(testPrisma, createdId as number);
    expect(found).toBeNull();
  });
});
