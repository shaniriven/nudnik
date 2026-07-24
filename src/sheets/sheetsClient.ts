import { google } from 'googleapis';
import type { sheets_v4 } from 'googleapis';
import { z } from 'zod';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { withRetry } from '../lib/withRetry';

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
  const response = await withGoogleRetry(
    () => sheets.spreadsheets.values.get({ spreadsheetId, range }),
    'sheets.values.get',
  );
  return valuesSchema.parse(response.data.values);
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
  const response = await withGoogleRetry(
    () =>
      sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      }),
    'sheets.values.append',
  );
  return appendValuesResponseSchema.parse(response.data);
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
  const response = await withGoogleRetry(
    () =>
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      }),
    'sheets.values.update',
  );
  return updateValuesResponseSchema.parse(response.data);
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
  const response = await withGoogleRetry(
    () => sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } }),
    'sheets.batchUpdate',
  );
  return batchUpdateResponseSchema.parse(response.data);
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
  const response = await withGoogleRetry(
    () => sheets.spreadsheets.create({ requestBody: { properties: { title } } }),
    'sheets.create',
  );
  return createSpreadsheetResponseSchema.parse({
    spreadsheetId: response.data.spreadsheetId,
    spreadsheetUrl: response.data.spreadsheetUrl,
  });
}
