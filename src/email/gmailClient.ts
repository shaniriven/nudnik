import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';
import { z } from 'zod';
import { env } from '../config/env';
import { callGoogleApi, GOOGLE_API_TIMEOUT_MS } from '../lib/googleApiErrors';

export { GOOGLE_API_TIMEOUT_MS };

export function createGmailClient(): gmail_v1.Gmail {
  const clientId = env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = env.GMAIL_OAUTH_CLIENT_SECRET;
  const refreshToken = env.GMAIL_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, and GMAIL_OAUTH_REFRESH_TOKEN must all be set to create a Gmail client',
    );
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: 'v1', auth });
}

const listMessagesResponseSchema = z.object({
  messages: z.array(z.object({ id: z.string(), threadId: z.string().optional() })).optional(),
  nextPageToken: z.string().optional(),
  resultSizeEstimate: z.number().optional(),
});

export type ListMessagesResponse = z.infer<typeof listMessagesResponseSchema>;

export async function listMessageIds(
  gmail: gmail_v1.Gmail,
  query: string,
  pageToken?: string,
): Promise<ListMessagesResponse> {
  return callGoogleApi(
    () =>
      gmail.users.messages.list(
        { userId: 'me', q: query, pageToken },
        { timeout: GOOGLE_API_TIMEOUT_MS },
      ),
    'gmail.messages.list',
    listMessagesResponseSchema,
  );
}

const messageHeaderSchema = z.object({ name: z.string(), value: z.string() });

const getMessageResponseSchema = z.object({
  id: z.string(),
  threadId: z.string().optional(),
  snippet: z.string().optional(),
  payload: z
    .object({
      headers: z.array(messageHeaderSchema).optional(),
    })
    .optional(),
});

export type GmailMessage = z.infer<typeof getMessageResponseSchema>;

// format: 'metadata' + metadataHeaders keeps the fetched payload to just the
// headers this step needs (From/Subject/Date) — the full body/attachments are
// step 4's (Claude extraction) concern, not this scanner's.
export async function getMessage(gmail: gmail_v1.Gmail, messageId: string): Promise<GmailMessage> {
  return callGoogleApi(
    () =>
      gmail.users.messages.get(
        {
          userId: 'me',
          id: messageId,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        },
        { timeout: GOOGLE_API_TIMEOUT_MS },
      ),
    'gmail.messages.get',
    getMessageResponseSchema,
  );
}
