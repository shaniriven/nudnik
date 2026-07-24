import { describe, expect, it } from 'vitest';
import * as botUserRepo from '../botUserRepo';
import { useTestPrismaClient, withRollback } from './testHelpers';

const testPrisma = useTestPrismaClient();

describe('botUserRepo', () => {
  it('creates a bot user and finds it by chat id', async () => {
    await withRollback(testPrisma, async (tx) => {
      const created = await botUserRepo.create(tx, {
        telegramChatId: 'chat-1',
        telegramUsername: 'shani',
        role: 'Admin',
      });
      expect(created.telegramChatId).toBe('chat-1');
      expect(created.role).toBe('Admin');

      const found = await botUserRepo.findByChatId(tx, 'chat-1');
      expect(found?.telegramChatId).toBe('chat-1');
      expect(found?.telegramUsername).toBe('shani');
    });
  });

  it('returns null when a chat id is not registered', async () => {
    await withRollback(testPrisma, async (tx) => {
      const found = await botUserRepo.findByChatId(tx, 'does-not-exist');
      expect(found).toBeNull();
    });
  });

  it('deletes a bot user by chat id', async () => {
    await withRollback(testPrisma, async (tx) => {
      await botUserRepo.create(tx, { telegramChatId: 'chat-2', role: 'Worker' });
      await botUserRepo.deleteByChatId(tx, 'chat-2');

      const found = await botUserRepo.findByChatId(tx, 'chat-2');
      expect(found).toBeNull();
    });
  });

  it('does not persist rows once the transaction rolls back', async () => {
    await withRollback(testPrisma, async (tx) => {
      await botUserRepo.create(tx, { telegramChatId: 'chat-3', role: 'Admin' });
    });

    const found = await botUserRepo.findByChatId(testPrisma, 'chat-3');
    expect(found).toBeNull();
  });
});
