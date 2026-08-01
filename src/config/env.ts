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

const optionalPayoutDay = z.preprocess(
  (val) => (val === '' ? undefined : val),
  z.coerce.number().int().min(1).max(31).optional(),
);

const envSchema = z
  .object({
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

    // The two calendar days each month the credit-card processor transfers
    // funds. DAY_1 pays out the 1st-15th of the PREVIOUS month, DAY_2 pays
    // out the 16th-end of the PREVIOUS month (see lib/creditCardPayout.ts) —
    // baked into Dashboard payout formulas at provision-sheet.ts run time,
    // not read live by the Sheet itself.
    CREDIT_CARD_PAYOUT_DAY_1: optionalPayoutDay,
    CREDIT_CARD_PAYOUT_DAY_2: optionalPayoutDay,

    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  })
  .superRefine((val, ctx) => {
    const { CREDIT_CARD_PAYOUT_DAY_1: day1, CREDIT_CARD_PAYOUT_DAY_2: day2 } = val;
    if ((day1 === undefined) !== (day2 === undefined)) {
      const path = day1 === undefined ? ['CREDIT_CARD_PAYOUT_DAY_1'] : ['CREDIT_CARD_PAYOUT_DAY_2'];
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message:
          'CREDIT_CARD_PAYOUT_DAY_1 and CREDIT_CARD_PAYOUT_DAY_2 must both be set or both be omitted',
      });
    } else if (day1 !== undefined && day2 !== undefined && day1 === day2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CREDIT_CARD_PAYOUT_DAY_2'],
        message: 'CREDIT_CARD_PAYOUT_DAY_1 and CREDIT_CARD_PAYOUT_DAY_2 must not be the same day',
      });
    }
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
