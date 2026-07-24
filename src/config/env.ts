import 'dotenv/config';
import { z } from 'zod';

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const envSchema = z.object({
  DATABASE_URL: z.string().url(),

  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),

  CLAUDE_API_KEY: z.string().min(1).optional(),

  SHEETS_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  SHEETS_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  SHEETS_OAUTH_REFRESH_TOKEN: z.string().min(1).optional(),

  GOOGLE_SHEET_ID: z.string().min(1).optional(),
  TEST_GOOGLE_SHEET_ID: z.string().min(1).optional(),
  GOOGLE_DRIVE_ZREPORTS_FOLDER_ID: z.string().min(1).optional(),

  ADMIN_INVITE_CODE: z.string().min(1).optional(),
  WORKER_INVITE_CODE: z.string().min(1).optional(),

  BAR_NAME: z.string().min(1),
  DEFAULT_CURRENCY: z.string().min(1),
  BAR_TIMEZONE: z.string().min(1).refine(isValidTimeZone, 'must be a valid IANA timezone name'),
  GMAIL_SCAN_QUERY: z.string().min(1).optional(),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);
