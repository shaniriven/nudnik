import { google } from 'googleapis';
import type { sheets_v4 } from 'googleapis';
import { z } from 'zod';
import { env } from '../config/env';
import { callGoogleApi, GOOGLE_API_TIMEOUT_MS } from '../lib/googleApiErrors';

export { GOOGLE_API_TIMEOUT_MS };

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
