import type { gmail_v1 } from 'googleapis';
import * as processedEmailRepo from '../db/repositories/processedEmailRepo';
import type { PrismaClientOrTx } from '../db/types';
import { logger } from '../lib/logger';
import { resolveScanQuery } from './emailFilters';
import { getMessage, listMessageIds, type GmailMessage } from './gmailClient';

function getHeader(message: GmailMessage, name: string): string | undefined {
  return message.payload?.headers?.find((header) => header.name === name)?.value;
}

// Idempotency check only — no processed_emails row is written here.
// ProcessedEmailStatus is non-nullable and only meaningful once step 4's
// extraction produces an outcome (extracted/skipped_no_transaction/extraction_failed),
// so create()/updateStatus() are left for that step.
export async function scanEmails(gmail: gmail_v1.Gmail, db: PrismaClientOrTx): Promise<void> {
  const query = resolveScanQuery();
  let pageToken: string | undefined;

  do {
    const page = await listMessageIds(gmail, query, pageToken);

    for (const { id } of page.messages ?? []) {
      const alreadyProcessed = await processedEmailRepo.findByGmailMessageId(db, id);
      if (alreadyProcessed) {
        logger.debug({ gmailMessageId: id }, 'skipping already-processed email');
        continue;
      }

      const message = await getMessage(gmail, id);
      logger.info(
        {
          gmailMessageId: id,
          from: getHeader(message, 'From'),
          subject: getHeader(message, 'Subject'),
          date: getHeader(message, 'Date'),
          snippet: message.snippet,
        },
        'found new email matching scan query',
      );
    }

    pageToken = page.nextPageToken;
  } while (pageToken);
}
