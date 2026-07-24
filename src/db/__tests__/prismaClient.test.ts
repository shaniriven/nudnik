import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../prismaClient';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('prismaClient', () => {
  it('exports a connected PrismaClient that can run a query', async () => {
    const result = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 as ok`;
    expect(result[0]?.ok).toBe(1);
  });
});
