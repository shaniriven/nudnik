import { google } from 'googleapis';
import type { sheets_v4 } from 'googleapis';
import { z } from 'zod';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { withRetry } from '../lib/withRetry';

// This block (RETRYABLE_NETWORK_CODES / isGoogleApiErrorLike / isRetryableGoogleError)
// is generic gaxios-error classification, not Sheets-specific — Gmail (step 3) and
// Drive (step 8) clients go through the same gaxios stack and will need byte-identical
// logic. Extract to a shared src/lib/googleApiErrors.ts the moment the second caller
// (gmailClient.ts) exists, rather than copy-pasting this block again.
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ECONNREFUSED',
  'EAI_AGAIN',
]);

interface GoogleApiErrorLike {
  code?: string | number;
  response?: { status?: number };
}

function isGoogleApiErrorLike(err: unknown): err is GoogleApiErrorLike {
  return typeof err === 'object' && err !== null;
}

// Retry on network failure / 429 / 5xx (transient); never on 4xx auth,
// permission, or malformed-request errors — those won't succeed on retry.
function isRetryableGoogleError(err: unknown): boolean {
  if (!isGoogleApiErrorLike(err)) {
    return false;
  }
  const status = err.response?.status;
  if (typeof status === 'number' && (status === 429 || status >= 500)) {
    return true;
  }
  return typeof err.code === 'string' && RETRYABLE_NETWORK_CODES.has(err.code);
}

function withGoogleRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
  return withRetry(fn, {
    retries: 3,
    baseDelayMs: 200,
    isRetryable: isRetryableGoogleError,
    onRetry: (err, attempt) => {
      logger.warn({ context, attempt, err }, 'retrying Google Sheets API call');
    },
  });
}

// Every googleapis call accepts a MethodOptions second argument (a GaxiosOptions,
// including `timeout`) alongside its params — without it, a hung connection (not a
// clean error/rejection) never settles, so withRetry's catch-based retry never runs.
export const GOOGLE_API_TIMEOUT_MS = 10_000;

async function callGoogleApi<T, R>(
  fn: () => Promise<{ data: R }>,
  context: string,
  schema: z.ZodType<T>,
  extract: (data: R) => unknown = (data) => data,
): Promise<T> {
  const response = await withGoogleRetry(fn, context);
  return schema.parse(extract(response.data));
}

export function createSheetsClient(): sheets_v4.Sheets {
  const clientId = env.SHEETS_OAUTH_CLIENT_ID;
  const clientSecret = env.SHEETS_OAUTH_CLIENT_SECRET;
  const refreshToken = env.SHEETS_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'SHEETS_OAUTH_CLIENT_ID, SHEETS_OAUTH_CLIENT_SECRET, and SHEETS_OAUTH_REFRESH_TOKEN must all be set to create a Sheets client',
    );
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.sheets({ version: 'v4', auth });
}

const valuesSchema = z.array(z.array(z.union([z.string(), z.number()]))).optional();

export async function getValues(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  range: string,
): Promise<(string | number)[][] | undefined> {
  return callGoogleApi(
    () =>
      sheets.spreadsheets.values.get({ spreadsheetId, range }, { timeout: GOOGLE_API_TIMEOUT_MS }),
    'sheets.values.get',
    valuesSchema,
    (data) => data.values,
  );
}

const appendValuesResponseSchema = z.object({
  spreadsheetId: z.string().optional(),
  tableRange: z.string().optional(),
  updates: z
    .object({
      updatedRange: z.string().optional(),
      updatedRows: z.number().optional(),
      updatedColumns: z.number().optional(),
      updatedCells: z.number().optional(),
    })
    .optional(),
});

export type AppendValuesResponse = z.infer<typeof appendValuesResponseSchema>;

export async function appendValues(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  range: string,
  values: (string | number)[][],
): Promise<AppendValuesResponse> {
  return callGoogleApi(
    () =>
      sheets.spreadsheets.values.append(
        { spreadsheetId, range, valueInputOption: 'USER_ENTERED', requestBody: { values } },
        { timeout: GOOGLE_API_TIMEOUT_MS },
      ),
    'sheets.values.append',
    appendValuesResponseSchema,
  );
}

const updateValuesResponseSchema = z.object({
  spreadsheetId: z.string().optional(),
  updatedRange: z.string().optional(),
  updatedRows: z.number().optional(),
  updatedColumns: z.number().optional(),
  updatedCells: z.number().optional(),
});

export type UpdateValuesResponse = z.infer<typeof updateValuesResponseSchema>;

export async function updateValues(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  range: string,
  values: (string | number)[][],
): Promise<UpdateValuesResponse> {
  return callGoogleApi(
    () =>
      sheets.spreadsheets.values.update(
        { spreadsheetId, range, valueInputOption: 'USER_ENTERED', requestBody: { values } },
        { timeout: GOOGLE_API_TIMEOUT_MS },
      ),
    'sheets.values.update',
    updateValuesResponseSchema,
  );
}

const batchUpdateResponseSchema = z.object({
  spreadsheetId: z.string().optional(),
  replies: z.array(z.unknown()).optional(),
});

export type BatchUpdateResponse = z.infer<typeof batchUpdateResponseSchema>;

export async function batchUpdate(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  requests: sheets_v4.Schema$Request[],
): Promise<BatchUpdateResponse> {
  return callGoogleApi(
    () =>
      sheets.spreadsheets.batchUpdate(
        { spreadsheetId, requestBody: { requests } },
        { timeout: GOOGLE_API_TIMEOUT_MS },
      ),
    'sheets.batchUpdate',
    batchUpdateResponseSchema,
  );
}

const createSpreadsheetResponseSchema = z.object({
  spreadsheetId: z.string(),
  spreadsheetUrl: z.string().optional(),
});

export type CreateSpreadsheetResponse = z.infer<typeof createSpreadsheetResponseSchema>;

export async function createSpreadsheet(
  sheets: sheets_v4.Sheets,
  title: string,
): Promise<CreateSpreadsheetResponse> {
  return callGoogleApi(
    () =>
      sheets.spreadsheets.create(
        { requestBody: { properties: { title } } },
        { timeout: GOOGLE_API_TIMEOUT_MS },
      ),
    'sheets.create',
    createSpreadsheetResponseSchema,
  );
}
