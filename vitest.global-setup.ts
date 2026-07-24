import 'dotenv/config';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const TEST_DATABASE_URL = z.string().url().parse(process.env.TEST_DATABASE_URL);

async function waitForDatabase(): Promise<void> {
  const client = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  const maxAttempts = 20;

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await client.$queryRaw`SELECT 1`;
        return;
      } catch (err) {
        if (attempt === maxAttempts) {
          throw new Error(
            `Test database not reachable after ${maxAttempts} attempts: ${String(err)}`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  } finally {
    await client.$disconnect();
  }
}

export default async function globalSetup(): Promise<void> {
  await waitForDatabase();
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
