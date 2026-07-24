import type { Prisma, BotUser } from '@prisma/client';
import type { PrismaClientOrTx } from '../types';

export function findByChatId(
  db: PrismaClientOrTx,
  telegramChatId: string,
): Promise<BotUser | null> {
  return db.botUser.findUnique({ where: { telegramChatId } });
}

export function create(db: PrismaClientOrTx, data: Prisma.BotUserCreateInput): Promise<BotUser> {
  return db.botUser.create({ data });
}

export function deleteByChatId(db: PrismaClientOrTx, telegramChatId: string): Promise<BotUser> {
  return db.botUser.delete({ where: { telegramChatId } });
}
