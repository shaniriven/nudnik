import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';
import { afterAll } from 'vitest';

const TEST_DATABASE_URL = z.string().url().parse(process.env.TEST_DATABASE_URL);

export class RollbackSignal extends Error {}

export function useTestPrismaClient(): PrismaClient {
  const client = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  afterAll(async () => {
    await client.$disconnect();
  });
  return client;
}

export async function withRollback(
  prisma: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await fn(tx);
      throw new RollbackSignal();
    });
  } catch (err) {
    if (!(err instanceof RollbackSignal)) {
      throw err;
    }
  }
}
