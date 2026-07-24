import 'dotenv/config';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

async function waitForDatabase(url: string): Promise<void> {
  const client = new PrismaClient({ datasourceUrl: url });
  const maxAttempts = 20;

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await client.$queryRaw`SELECT 1`;
        return;
      } catch (err) {
        if (attempt === maxAttempts) {
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  } finally {
    await client.$disconnect();
  }
}

// Non-fatal by design: this repo also has fully-mocked test suites (e.g.
// src/sheets/**) that never touch Postgres. If TEST_DATABASE_URL is unset or
// the database is unreachable, warn and skip migration rather than blocking
// the entire test run before any file is even collected — any test that
// actually needs Postgres will then fail on its own with a clear connection
// error instead.
export default async function globalSetup(): Promise<void> {
  const parsed = z.string().url().safeParse(process.env.TEST_DATABASE_URL);
  if (!parsed.success) {
    console.warn(
      '[vitest.global-setup] TEST_DATABASE_URL is not set or invalid — skipping DB migration.',
    );
    return;
  }

  try {
    await waitForDatabase(parsed.data);
  } catch (err) {
    console.warn(
      `[vitest.global-setup] Test database unreachable, skipping migration: ${String(err)}`,
    );
    return;
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: parsed.data },
  });
}
