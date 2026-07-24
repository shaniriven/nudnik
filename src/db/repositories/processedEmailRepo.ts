import type { Prisma, ProcessedEmail, ProcessedEmailStatus } from '@prisma/client';
import type { PrismaClientOrTx } from '../types';

export function findByGmailMessageId(
  db: PrismaClientOrTx,
  gmailMessageId: string,
): Promise<ProcessedEmail | null> {
  return db.processedEmail.findUnique({ where: { gmailMessageId } });
}

export function create(
  db: PrismaClientOrTx,
  data: Prisma.ProcessedEmailCreateInput,
): Promise<ProcessedEmail> {
  return db.processedEmail.create({ data });
}

export function updateStatus(
  db: PrismaClientOrTx,
  gmailMessageId: string,
  status: ProcessedEmailStatus,
): Promise<ProcessedEmail> {
  return db.processedEmail.update({ where: { gmailMessageId }, data: { status } });
}
