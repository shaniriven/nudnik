---
name: google-oauth-setup
description: Walks through obtaining Google OAuth2 credentials (client ID/secret + refresh token) for Nudnik's SHEETS_OAUTH_* and GMAIL_OAUTH_* env vars, needed to run scripts/provision-sheet.ts and scripts/scan-emails.ts against real Google accounts. Use when setting up local/staging credentials for the first time, when a refresh token is revoked/expired, or when onboarding Nudnik for a new bar.
---

Two separate Google accounts each need their own OAuth client + refresh token
(see `docs/architecture.md` section 4a) — don't conflate them:

- **Sheets** (`SHEETS_OAUTH_*`) — the bar's own Google account. Drive will reuse
  this same client once step 8 lands; no separate OAuth dance needed then.
- **Gmail** (`GMAIL_OAUTH_*`) — the owner's personal mailbox, a distinct grant.

Repeat the steps below once per credential set — once logged in as the bar
account for Sheets, once as the owner's personal account for Gmail.

## 1. Cloud Console (manual, per account)

1. Go to https://console.cloud.google.com, logged in as the correct account for
   this credential set.
2. Create (or reuse) a project — one project can host both credential sets;
   it's the OAuth _client_ and consent screen that differ per account, not the
   project.
3. **APIs & Services → Library** — enable "Google Sheets API" (for the Sheets
   credential) or "Gmail API" (for the Gmail credential).
4. **APIs & Services → OAuth consent screen** → External → fill in an app name
   → add this same Google account as a **Test user**. Staying in "Testing"
   status is fine — no Google review needed for this.
5. **APIs & Services → Credentials → Create Credentials → OAuth client ID** →
   Application type **Desktop app** — not "Web application". Desktop-app
   clients accept any `localhost`/`127.0.0.1` redirect port without
   pre-registering it, which is what the helper script below relies on.
6. Copy the generated Client ID and Client Secret into `.env`, as
   `SHEETS_OAUTH_CLIENT_ID`/`SHEETS_OAUTH_CLIENT_SECRET` or
   `GMAIL_OAUTH_CLIENT_ID`/`GMAIL_OAUTH_CLIENT_SECRET`.

## 2. Get the refresh token

Run `scripts/get-oauth-refresh-token.ts`, logged into the correct Google
account in whichever browser opens:

```
npx tsx scripts/get-oauth-refresh-token.ts --client-id=<id> --client-secret=<secret> --for=sheets
npx tsx scripts/get-oauth-refresh-token.ts --client-id=<id> --client-secret=<secret> --for=gmail
```

It prints a consent URL, starts a local server to catch the redirect, exchanges
the code for tokens, and prints `..._REFRESH_TOKEN=...` to paste into `.env`.

If it reports no `refresh_token` was returned, this Google account already
granted this exact client consent before (Google omits the refresh token on a
repeat grant) — revoke it at https://myaccount.google.com/permissions and rerun.

## 3. Verify

Once both credential sets are in `.env`:

- `npx tsx scripts/provision-sheet.ts` — step 2's manual smoke test (creates a
  real spreadsheet under the Sheets account).
- `npx tsx scripts/scan-emails.ts` — step 3's manual smoke test (scans the
  connected Gmail inbox and logs matches).
