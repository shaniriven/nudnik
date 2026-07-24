import type { Prisma, PendingTransaction, PendingTransactionStatus } from '@prisma/client';
import type { PrismaClientOrTx } from '../types';

export function create(
  db: PrismaClientOrTx,
  data: Omit<Prisma.PendingTransactionUncheckedCreateInput, 'id'>,
): Promise<PendingTransaction> {
  return db.pendingTransaction.create({ data });
}

export function findById(db: PrismaClientOrTx, id: number): Promise<PendingTransaction | null> {
  return db.pendingTransaction.findUnique({ where: { id } });
}

export function updateStatus(
  db: PrismaClientOrTx,
  id: number,
  status: PendingTransactionStatus,
  resolvedAt?: Date,
): Promise<PendingTransaction> {
  return db.pendingTransaction.update({ where: { id }, data: { status, resolvedAt } });
}
