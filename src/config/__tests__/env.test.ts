import { describe, expect, it } from 'vitest';
import { parseEnv } from '../env';

const validEnv: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgresql://nudnik:nudnik@localhost:5432/nudnik_dev',
  TELEGRAM_BOT_TOKEN: 'telegram-token',
  CLAUDE_API_KEY: 'claude-key',
  SHEETS_OAUTH_CLIENT_ID: 'client-id',
  SHEETS_OAUTH_CLIENT_SECRET: 'client-secret',
  SHEETS_OAUTH_REFRESH_TOKEN: 'refresh-token',
  GOOGLE_SHEET_ID: 'sheet-id',
  TEST_GOOGLE_SHEET_ID: 'test-sheet-id',
  GOOGLE_DRIVE_ZREPORTS_FOLDER_ID: 'folder-id',
  ADMIN_INVITE_CODE: 'admin-code',
  WORKER_INVITE_CODE: 'worker-code',
  BAR_NAME: 'Sasson',
  DEFAULT_CURRENCY: 'ILS',
  BAR_TIMEZONE: 'Asia/Jerusalem',
  GMAIL_SCAN_QUERY: 'has:attachment',
  NODE_ENV: 'test',
};

describe('parseEnv', () => {
  it('returns parsed env when every required key is present and valid', () => {
    const result = parseEnv(validEnv);
    expect(result.BAR_NAME).toBe('Sasson');
    expect(result.NODE_ENV).toBe('test');
  });

  it('defaults NODE_ENV to development when omitted', () => {
    const { NODE_ENV: _NODE_ENV, ...rest } = validEnv;
    const result = parseEnv(rest);
    expect(result.NODE_ENV).toBe('development');
  });

  it('throws an aggregated error naming every missing/invalid key, not just the first', () => {
    const { BAR_NAME: _BAR_NAME, BAR_TIMEZONE: _BAR_TIMEZONE, ...rest } = validEnv;
    const broken: NodeJS.ProcessEnv = { ...rest, DATABASE_URL: 'not-a-url' };

    expect(() => parseEnv(broken)).toThrow();

    try {
      parseEnv(broken);
      throw new Error('expected parseEnv to throw');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain('BAR_NAME');
      expect(message).toContain('BAR_TIMEZONE');
      expect(message).toContain('DATABASE_URL');
    }
  });

  it('rejects an invalid IANA timezone name', () => {
    const broken: NodeJS.ProcessEnv = { ...validEnv, BAR_TIMEZONE: 'Asia/Jerusalm' };
    expect(() => parseEnv(broken)).toThrow(/valid IANA timezone/);
  });

  it('allows Telegram/Claude/Google/invite-code vars to be omitted (not built yet)', () => {
    const {
      TELEGRAM_BOT_TOKEN: _TELEGRAM_BOT_TOKEN,
      CLAUDE_API_KEY: _CLAUDE_API_KEY,
      SHEETS_OAUTH_CLIENT_ID: _SHEETS_OAUTH_CLIENT_ID,
      SHEETS_OAUTH_CLIENT_SECRET: _SHEETS_OAUTH_CLIENT_SECRET,
      SHEETS_OAUTH_REFRESH_TOKEN: _SHEETS_OAUTH_REFRESH_TOKEN,
      GOOGLE_SHEET_ID: _GOOGLE_SHEET_ID,
      TEST_GOOGLE_SHEET_ID: _TEST_GOOGLE_SHEET_ID,
      GOOGLE_DRIVE_ZREPORTS_FOLDER_ID: _GOOGLE_DRIVE_ZREPORTS_FOLDER_ID,
      ADMIN_INVITE_CODE: _ADMIN_INVITE_CODE,
      WORKER_INVITE_CODE: _WORKER_INVITE_CODE,
      GMAIL_SCAN_QUERY: _GMAIL_SCAN_QUERY,
      ...rest
    } = validEnv;

    const result = parseEnv(rest);
    expect(result.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(result.TELEGRAM_BOT_TOKEN).toBeUndefined();
  });
});
