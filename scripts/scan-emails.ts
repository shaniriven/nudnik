// Manual smoke-test entry point for the step-3 Gmail scanner — not the
// eventual scheduled entry point (src/scheduler/runScan.ts, step 7), just a
// way to point emailScanner.ts at a real inbox and see what it logs.
import 'dotenv/config';
import { createGmailClient } from '../src/email/gmailClient';
import { scanEmails } from '../src/email/emailScanner';
import { prisma } from '../src/db/prismaClient';

async function main(): Promise<void> {
  const gmail = createGmailClient();
  await scanEmails(gmail, prisma);
}

if (require.main === module) {
  main()
    .catch((err: unknown) => {
      if (err instanceof Error && err.message.includes('GMAIL_OAUTH_')) {
        console.error(`Configuration error: ${err.message}`);
      } else {
        console.error('scan-emails failed:', err);
      }
      process.exitCode = 1;
    })
    .finally(() => {
      void prisma.$disconnect();
    });
}
