// One-time helper: exchanges a Google OAuth2 "Desktop app" client's user consent
// for a refresh token, to paste into .env as SHEETS_OAUTH_REFRESH_TOKEN or
// GMAIL_OAUTH_REFRESH_TOKEN. Not part of any runtime path — see
// .claude/skills/google-oauth-setup/SKILL.md for the full setup walkthrough.
import 'dotenv/config';
import http from 'http';
import type { AddressInfo } from 'net';
import { google } from 'googleapis';

// gmail.modify (not gmail.readonly) so this same grant also covers step 7's
// Gmail labeling later, without redoing this consent flow then.
const OAUTH_TARGETS = {
  sheets: { scopes: ['https://www.googleapis.com/auth/spreadsheets'], envPrefix: 'SHEETS_OAUTH' },
  gmail: { scopes: ['https://www.googleapis.com/auth/gmail.modify'], envPrefix: 'GMAIL_OAUTH' },
} as const;

type OAuthTarget = keyof typeof OAUTH_TARGETS;

export function parseArgs(argv: string[]): {
  clientId: string;
  clientSecret: string;
  target: OAuthTarget;
} {
  const get = (flag: string): string | undefined =>
    argv.find((arg) => arg.startsWith(`--${flag}=`))?.slice(flag.length + 3);

  const clientId = get('client-id');
  const clientSecret = get('client-secret');
  const target = get('for');

  if (!clientId || !clientSecret || !target || !(target in OAUTH_TARGETS)) {
    throw new Error(
      'Usage: npx tsx scripts/get-oauth-refresh-token.ts --client-id=<id> --client-secret=<secret> --for=sheets|gmail',
    );
  }
  return { clientId, clientSecret, target: target as OAuthTarget };
}

// Desktop-app OAuth clients accept any localhost/127.0.0.1 redirect port without
// pre-registering it, so an OS-assigned ephemeral port avoids port conflicts.
function waitForAuthCode(server: http.Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.end(
        error
          ? `Error: ${error} — check the terminal.`
          : 'Success — you can close this tab and return to the terminal.',
      );
      if (error) {
        reject(new Error(error));
      } else if (code) {
        resolve(code);
      } else {
        reject(new Error('redirect had neither a code nor an error'));
      }
    });
  });
}

async function main(): Promise<void> {
  const { clientId, clientSecret, target } = parseArgs(process.argv.slice(2));
  const { scopes, envPrefix } = OAUTH_TARGETS[target];

  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  const redirectUri = `http://localhost:${port}`;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    // Forces Google to issue a fresh refresh_token even if this exact client
    // was already authorized by this account before (otherwise it's omitted).
    prompt: 'consent',
    scope: [...scopes],
  });

  console.log(
    `\nOpen this URL and approve access with the correct Google account:\n\n${authUrl}\n`,
  );
  console.log('Waiting for the consent redirect...');

  const code = await waitForAuthCode(server);
  server.close();

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      'Google did not return a refresh_token — this account likely already granted this exact ' +
        'client consent before. Revoke it at https://myaccount.google.com/permissions and rerun.',
    );
  }

  console.log('\nSuccess. Paste this into .env:\n');
  console.log(`${envPrefix}_REFRESH_TOKEN=${tokens.refresh_token}`);
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error('get-oauth-refresh-token failed:', err);
    process.exitCode = 1;
  });
}
