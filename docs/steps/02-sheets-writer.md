# Step 2 — Sheets writer + categoriesReader.ts

Build-order step 2 of `docs/architecture.md` section 9. This is a
self-contained implementation brief: an implementing agent should be able to
execute it without any other context beyond this repo (`CLAUDE.md`,
`docs/architecture.md`, `docs/sheets-design.md`, and the step-1 code already
in `src/config`/`src/db`).

## Context

Step 1 (Postgres/Prisma DB layer) is implemented — `src/config`, `src/db`,
migrations, tooling all exist. This step adds the first module that talks to
an external API (Google Sheets), following the conventions step 1 established
rather than inventing new ones:

- **No classes** — plain exported functions, dependency (client) as the
  **first positional param**, e.g. `findByChatId(db, chatId)`. Sheets code
  follows the same shape: `getValues(sheets, spreadsheetId, range)`.
- Tests import the module as a namespace (`import * as botUserRepo from
  '../botUserRepo'`), assert with plain `expect(...).toBe(...)`, no `should`
  phrasing, files live in a sibling `__tests__/` directory.
- `type`-only imports for types (`import type { ... } from '@prisma/client'`).
- Zero comments except where genuinely non-obvious business logic needs one.
- `vitest.config.ts` has `globals: false` — every test file imports what it
  uses explicitly.
- Strict TS + type-checked ESLint (`no-explicit-any: error`, `ts-ignore` only
  with a description) — matters here more than in step 1 since `googleapis`'
  types are loose in places.

**Credentials constraint (binding for this step):** real Google OAuth
credentials are not yet available — pending an account-ownership decision with
the bar owner that doesn't block the code. Everything in this step must be
written and unit-tested against **mocked** Sheets API responses (mocked at
the `googleapis` client boundary, per architecture.md section 8d).
`provision-sheet.ts` gets fully written and ready to run, but **is not
executed** as part of implementing this step. Real-Sheet integration
verification is an explicit follow-up, listed under Manual Steps below.

**`TEST_DATABASE_URL` stays out of `env.ts` on purpose:** `env.ts` parses
`process.env` eagerly at import time (`export const env = parseEnv(...)`), so
making `TEST_DATABASE_URL` a required field there would fail that parse for
every test file that imports `env.ts` — including fully-mocked suites (e.g.
`src/sheets/**`) that never touch Postgres. Instead, `vitest.global-setup.ts`
and `src/db/repositories/__tests__/testHelpers.ts` each parse
`process.env.TEST_DATABASE_URL` directly and independently, and
`global-setup.ts` treats it as non-fatal when unset (warns and skips
migration) rather than blocking the whole run. Add `TEST_GOOGLE_SHEET_ID` to
`env.ts`'s zod schema as usual — that one has no such conflict.

**OAuth account split (binding for this step):** Sheets and Drive run under
the **bar's own Google account**, separate from the owner's personal Gmail
account that email scanning (step 3) will use — two distinct OAuth grants,
two distinct refresh tokens, scoped accordingly from the start:
`SHEETS_OAUTH_CLIENT_ID`, `SHEETS_OAUTH_CLIENT_SECRET`,
`SHEETS_OAUTH_REFRESH_TOKEN`. (The OAuth *client* registration in Google
Cloud Console may still be shared across both accounts if convenient —
that's a Cloud Console setting, not an env var — but each account's refresh
token is necessarily distinct.) Step 3 will add its own separate
`GMAIL_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN` set later. `docs/architecture.md`
sections 4/4a and `.env.example` already reflect this split as of this step.

This step **renames**, not adds alongside: step 1 already declared
`GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN` as unused optional placeholders
in `env.ts`/`.env.example`. Since nothing consumes them yet, they get renamed
in place to `SHEETS_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN` — not left as dead
config alongside the new names. `GOOGLE_SHEET_ID` and
`GOOGLE_DRIVE_ZREPORTS_FOLDER_ID` are unaffected (they're target IDs, not
credentials, so they don't need account-scoped naming).

**New shared infrastructure this step must introduce** (required by
`CLAUDE.md`/architecture.md section 8, and this is the first module that
needs them — no existing precedent to follow, so this step establishes the
pattern for every future external-API module):
- `src/lib/withRetry.ts` — generic retry/backoff utility (section 8b). Kept
  Google-agnostic (`withRetry(fn, { retries, isRetryable, baseDelayMs })`) so
  Gmail/Drive/Telegram/Claude steps can reuse it later without modification.
- `src/lib/logger.ts` — a single exported `pino` instance (section 8c).
  Google-API-error classification (network vs auth vs rate-limit vs
  malformed) stays local to `src/sheets/sheetsClient.ts` for now rather than
  a shared module — Gmail/Drive will also hit `googleapis` later and may want
  to extract it then, but pulling it out now for a single caller would be
  premature.

## Scope of Step 2

1. `src/sheets/sheetSchema.ts` — typed transcription of `docs/sheets-design.md`
   (Transactions/Categories column contract only).
2. `src/sheets/dashboardSchema.ts` — Dashboard tab (Tab 3) layout constants and
   formula generators, kept separate from `sheetSchema.ts`.
3. `src/sheets/sheetsClient.ts` — OAuth2 wrapper + retry/logging/zod-validated
   boundary functions over the raw Sheets API.
4. `src/sheets/categoriesReader.ts` — live Categories tab fetch, cached per run.
5. `src/sheets/ledgerWriter.ts` — `appendRow`, TX-#### ID generation,
   Approved/Edited status mapping, Running Balance formula per new row.
6. `scripts/provision-sheet.ts` — creates a fresh 3-tab spreadsheet from
   `sheetSchema.ts` and `dashboardSchema.ts` (bar-agnostic), including a
   fully-generated, working Dashboard (full automation, not headers-only —
   confirmed).
7. `src/lib/withRetry.ts`, `src/lib/logger.ts` — new shared infra.
8. Tests for all of the above, shipped alongside each module.
9. `.env.example` + `env.ts` changes: rename `GOOGLE_OAUTH_CLIENT_ID/SECRET/
   REFRESH_TOKEN` → `SHEETS_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN` (already
   done in `.env.example` as of this doc; carry the same rename into
   `env.ts`'s zod schema, which does not yet reflect it); add
   `TEST_GOOGLE_SHEET_ID` to the zod schema (already in `.env.example`).
   `TEST_DATABASE_URL` deliberately does *not* go in `env.ts` — see note
   above.

**Not in scope:** `docs/architecture.md`, `.env.example`'s comments/structure
(already corrected outside this implementation pass), and anything from
later build-order steps (Gmail, Claude extraction, Telegram, Drive).

## Files to add

```
src/lib/withRetry.ts
src/lib/__tests__/withRetry.test.ts
src/lib/logger.ts
src/sheets/sheetSchema.ts
src/sheets/dashboardSchema.ts
src/sheets/sheetsClient.ts
src/sheets/categoriesReader.ts
src/sheets/ledgerWriter.ts
src/sheets/__tests__/sheetSchema.test.ts
src/sheets/__tests__/dashboardSchema.test.ts
src/sheets/__tests__/sheetsClient.test.ts
src/sheets/__tests__/categoriesReader.test.ts
src/sheets/__tests__/ledgerWriter.test.ts
scripts/provision-sheet.ts
```
Modified: `src/config/env.ts` (rename + additions described above),
`package.json` (add `googleapis` dependency).

## Key implementation details

### sheetSchema.ts — single source of truth

Everything `provision-sheet.ts` writes, and every dropdown/label the rest of
the Sheets code validates against, is read from this one file — replicating
Nudnik to another bar means editing this file (mainly `CATEGORIES`, since
column layout is fixed by the app's contract, not per-bar) and re-running
`provision-sheet.ts`. Top-of-file comment points back to
`docs/sheets-design.md` and states the two must be kept in sync by hand.

Exports:
- `TRANSACTIONS_HEADERS` — the 17 column headers, A–Q, in order, as a
  `readonly` tuple.
- `CATEGORIES` — `{ name: string; type: 'Income' | 'Expense' }[]`, the full
  18-entry list from the Categories tab spec. **Seed data only** — used
  exclusively by `provision-sheet.ts` to populate a freshly created Sheet's
  Categories tab. Per `CLAUDE.md` working rules ("Categories are always read
  live from the Sheet's `Categories` tab at runtime, never hardcoded as an
  enum in code") and the `category` field's comment in `schema.prisma`
  ("must match a value from the live Categories tab — read live, never
  hardcoded"), **no other code in this step imports `CATEGORIES` to validate
  anything.** `PendingTransaction.category` is a free `string` at the Prisma
  level, and stays a free string through `ledgerWriter` too — an admin can
  add/rename categories directly in the Sheet after provisioning, and
  `CATEGORIES` is free to drift from the live tab afterward; that's expected,
  not a bug. Runtime validation of "is this category valid" happens later, in
  step 4's extraction module, against `categoriesReader`'s live fetch — out
  of scope here.
- `DROPDOWNS` — `{ type, paymentMethod, status, source, submitterRole }`,
  each the exact valid-value list from the column contract.
- `RUNNING_BALANCE_FORMULA(row: number): string` — `=IF(D{row}="Income",
  H{row}, -H{row}) + Q{row-1}`, special-cased for `row === 2` (first data row)
  to `+ 0` instead of `+ Q1`, since `Q1` holds the header text, not a number.
- Dashboard layout constants and formula generators live in a separate
  `dashboardSchema.ts` (below), not in this file.

### Dashboard automation (full automation — confirmed)

All cell addresses are fixed at generation time since `provision-sheet.ts`
controls the whole layout — no `INDIRECT` needed anywhere except one
documented case. Layout constants (`DASHBOARD_BLOCK_A_START_ROW`,
`DASHBOARD_MONTH_ROWS = 60`, `DASHBOARD_BLOCK_B_START_ROW`, etc.) live in
`dashboardSchema.ts`, not hardcoded in `provision-sheet.ts` and not in
`sheetSchema.ts` (which stays scoped to the Transactions/Categories column
contract).

- **Key Metrics (Block C, single cells):**
  - *Current Balance* — `=IFERROR(INDEX(Transactions!Q2:Q,
    COUNTA(Transactions!Q2:Q)), 0)` (INDEX+COUNTA "find the last value"
    pattern, not `INDIRECT` — a standard, non-fragile idiom).
  - *This Month Net* — self-contained, `TODAY()`-relative `SUMIFS` for
    Income minus Expense within the current month.
  - *Avg Monthly Burn (6mo)* — `SUMIFS` over Expense for the trailing 6
    months, divided by 6.
  - *Top 3 Expense Categories* — a `QUERY`-based grouping formula over
    `Transactions!E2:E`/`H2:H`/`D2:D`, `TEXTJOIN`'d into one text cell.
    **Flagged as the single trickiest formula** — Sheets' `QUERY` language
    has locale quirks (comma vs semicolon argument separators); verify by
    eye in the follow-up credentialed session (see Manual Steps).
  - *MoM Change %* — This Month Net vs. a prior-month `EOMONTH`-shifted
    `SUMIFS` pair, wrapped in `IFERROR(..., "N/A")` to avoid divide-by-zero
    on a fresh Sheet with no prior-month data.
- **Monthly Summary (Block A):** a fixed horizon of `DASHBOARD_MONTH_ROWS`
  (60) rows generated at provision time from the provisioning date — each
  row's Month is a literal date value (not a live formula, so historical
  rows never shift), Income/Expenses use per-row concrete `DATE(y,m,1)`
  boundaries computed in JS and baked into the formula string, Net =
  same-row Income−Expenses, Running Balance = previous row + this row's Net
  (first row seeds from 0). Also the data source for the Block D charts
  mentioned in the design doc — **chart objects themselves are out of
  scope** for this step (the original ask was formula strings, not chart
  specs; `batchUpdate`'s `addChart` request is a separate, meaningfully
  larger API surface).
- **Category Breakdown (Block B):** one row per **expense-type** entry in
  `CATEGORIES` (interpreting "% of Total Expenses" literally — income
  categories like Bar Sales don't belong in an expense breakdown), `SUMIFS`
  against the current month, percent = row total ÷ `SUM()` over the block's
  fixed total-column range.

### sheetsClient.ts

- `createSheetsClient(): sheets_v4.Sheets` — builds a `google.auth.OAuth2`
  client from `env.SHEETS_OAUTH_CLIENT_ID`/`env.SHEETS_OAUTH_CLIENT_SECRET`,
  calls `setCredentials({ refresh_token: env.SHEETS_OAUTH_REFRESH_TOKEN })`,
  returns `google.sheets({ version: 'v4', auth })`.
- Thin wrapped functions, each taking the `sheets_v4.Sheets` instance as
  first param, each wrapped in `withRetry` with a Google-specific
  `isRetryable` predicate (retry on network error / 429 / 5xx; don't retry
  on 4xx auth/permission/malformed-request errors — classify via the thrown
  error's `code`/`response.status`; log `warn` on each retry via
  `src/lib/logger.ts`):
  `getValues(sheets, spreadsheetId, range)`,
  `appendValues(sheets, spreadsheetId, range, values)`,
  `updateValues(sheets, spreadsheetId, range, values)`,
  `batchUpdate(sheets, spreadsheetId, requests)`,
  `createSpreadsheet(sheets, title)`.
- Every raw response is parsed through a zod schema before being returned
  (section 8a: never trust the SDK's own types alone for network data) —
  e.g. `getValues`'s `response.data.values` validated as
  `z.array(z.array(z.union([z.string(), z.number()]))).optional()`.
- Tested via `vi.mock('googleapis', ...)`, mocking `google.auth.OAuth2` and
  `google.sheets` — the one file in this step allowed to mock the whole
  module rather than injecting a fake client object, since it's the module
  that *constructs* the client.

### categoriesReader.ts

- `getCategories(sheets, spreadsheetId, options?: { forceRefresh?: boolean }):
  Promise<{ name: string; type: 'Income' | 'Expense' }[]>` — calls
  `sheetsClient.getValues` against the Categories tab, zod-validates each
  row, caches in a module-level closure variable (matches "no classes" —
  functions + closures, not a class instance).
- `resetCategoriesCache()` exported for test isolation between cases.
- Tests inject a **fake client object** (`{ spreadsheets: { values: { get:
  vi.fn() } } } as unknown as sheets_v4.Sheets`) rather than mocking
  `googleapis` — matches the repo's injectable-dependency pattern used
  everywhere else (tests pass `tx` the same way for Prisma).

### ledgerWriter.ts

- `appendRow(sheets, spreadsheetId, transaction: PendingTransaction, options:
  { edited: boolean }): Promise<{ transactionId: string; rowNumber: number }>`.
- A local zod schema validates the invariants that must hold at write time
  (category, amount, resolvedAt, receivedDate, submitterRole all non-null) —
  `appendRow` is only ever called post-confirm, but the Prisma model has
  these fields nullable at the type level, so this is a real boundary check,
  not decoration. `category` is checked only for non-empty-string, never for
  membership in `sheetSchema.ts`'s `CATEGORIES` (see above).
- `TX-####`: `` `TX-${String(transaction.id).padStart(4, '0')}` `` — not
  persisted separately, generated at write time per architecture.md
  section 5.
- Status: `edited ? 'Edited' : 'Approved'` — passed explicitly by the caller
  rather than inferred from `PendingTransaction.status`, since the schema's
  `editing` status is a transient in-flow state, not a persisted "was this
  ever edited" flag (that flag doesn't exist yet — it's the edit-conversation
  caller's job in step 6, not this module's).
- **Enum-to-label mapping is explicit, not assumed identity:** Prisma's
  `@map` on enum values (`TransactionSource.ZReport` /
  `PaymentMethod.CreditCard` etc.) changes the *database* value, not
  necessarily the value the generated TS client exposes at runtime — don't
  assume `transaction.source` already equals the Sheet's `"Z-Report"`
  string. A `SOURCE_LABELS`/`PAYMENT_METHOD_LABELS` record maps each enum
  member to its exact Sheet string, and a unit test asserts every value in
  those records is a member of `DROPDOWNS.source`/`DROPDOWNS.paymentMethod`
  — so drift between the Prisma schema and `sheetSchema.ts` fails a test
  instead of silently writing the wrong label.
- Write sequence: (1) `sheetsClient.appendValues` writes columns A–P; (2)
  parse the row number out of the response's `updates.updatedRange` (e.g.
  `"Transactions!A15:P15"` → `15`); (3) `sheetsClient.updateValues` writes
  `RUNNING_BALANCE_FORMULA(rowNumber)` into `Transactions!Q{rowNumber}` with
  `valueInputOption: 'USER_ENTERED'` so it's interpreted as a formula, not
  literal text. This two-step sequence is the concrete reason Running
  Balance can't just be a value in the initial append — it needs to know
  its own row number first, which only `appendValues`'s response reveals.

### provision-sheet.ts

- No required CLI args — title from `${env.BAR_NAME} — Cash Flow Ledger`,
  reads everything else from `sheetSchema.ts`.
- `createSpreadsheet` → `batchUpdate` to rename/add the three named tabs →
  write `TRANSACTIONS_HEADERS` to `Transactions!A1` → write `CATEGORIES` to
  the Categories tab → `batchUpdate` data-validation requests for each
  `DROPDOWNS` entry on its Transactions column → write Dashboard structure +
  formulas per the design above.
- Logs the resulting `spreadsheetId` and Sheet URL to stdout. Does **not**
  write it into `.env` automatically — copying `GOOGLE_SHEET_ID` in is a
  manual step, to avoid a script silently mutating a config file.
- Reusable for any bar: rerunning against a different `BAR_NAME` /
  `sheetSchema.ts` (mainly a different `CATEGORIES` list) produces an
  equivalent fresh Sheet.

## Ordered execution sequence

1. In `env.ts`: rename `GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN` →
   `SHEETS_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN`; add
   `TEST_GOOGLE_SHEET_ID`. (`.env.example` already has the renamed/added
   vars.) `TEST_DATABASE_URL` is deliberately left out of `env.ts` — see the
   note under Context. Add `googleapis` to `package.json`.
2. `src/lib/withRetry.ts` + tests — generic, no Google dependency, needed by
   everything after it.
3. `src/lib/logger.ts` — pino singleton.
4. `src/sheets/sheetSchema.ts` + tests — pure data/generators, no API
   dependency, everything downstream reads from it.
5. `src/sheets/sheetsClient.ts` + tests.
6. `src/sheets/categoriesReader.ts` + tests.
7. `src/sheets/ledgerWriter.ts` + tests.
8. `scripts/provision-sheet.ts` — written fully, **not executed**.

## Manual steps (human-run, once credentials exist — explicit follow-up)

1. Bar-owner OAuth decision resolved for the **bar's own account** →
   `SHEETS_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN` obtained and set locally
   (not committed). (Separate from the owner's personal Gmail OAuth grant
   that step 3 will need — don't conflate the two consent flows.)
2. Create a prod Sheet target and a separate test Sheet target; set
   `GOOGLE_SHEET_ID` and `TEST_GOOGLE_SHEET_ID`.
3. Run `provision-sheet.ts` against the **test** Sheet ID first. Open it and
   visually confirm: all three tabs exist with correct headers/dropdowns,
   the Category Breakdown percentages sum sensibly, and specifically the
   Top-3 Expense Categories `QUERY` formula and the 60-row Monthly Summary
   table render without `#ERROR!`/`#N/A` on an empty ledger.
4. Manually append one test row (bypassing `ledgerWriter` — e.g. by hand in
   the Sheet UI) and confirm Running Balance and Current Balance both
   update correctly, to sanity-check the formula math independent of the
   bot code.
5. Run `categoriesReader.getCategories` and `ledgerWriter.appendRow` against
   the test Sheet directly (a small throwaway script or REPL is fine) to
   confirm the mocked-response tests actually reflect real API shapes.
6. Only then run `provision-sheet.ts` against the real prod
   `GOOGLE_SHEET_ID`.

## Verification (no real credentials needed)

1. `npm run typecheck` — passes, including the `SHEETS_OAUTH_*` rename (no
   leftover references to the old `GOOGLE_OAUTH_*` names anywhere in `src/`).
2. `npm run lint` — zero errors, no unjustified `any`/`ts-ignore`.
3. `npm test` — all new unit tests pass:
   - `sheetSchema.test.ts` asserts header count/order matches the 17-column
     spec, `CATEGORIES` has 18 entries with the right type split, and the
     enum-label records (in `ledgerWriter.test.ts`) are each a subset of
     `DROPDOWNS`.
   - `withRetry.test.ts` asserts it retries on a retryable failure up to the
     configured count then succeeds/throws correctly, and does *not* retry
     when `isRetryable` returns false.
   - `sheetsClient.test.ts` (mocked `googleapis` module) asserts OAuth2
     setup args reference `SHEETS_OAUTH_*` env vars specifically, and that
     each wrapped function calls `withRetry` and validates/rejects malformed
     mock responses.
   - `categoriesReader.test.ts` (fake client object) asserts caching
     behavior — second call doesn't re-invoke `values.get` unless
     `forceRefresh`.
   - `ledgerWriter.test.ts` (fake client object) asserts: correct `TX-####`
     generation including 5+-digit ids, Approved vs Edited mapping, the
     enum-label mapping, the two-step append-then-update-Q sequence with the
     right formula string for a given parsed row number, and that the
     pre-write zod validation rejects a transaction missing a required
     field.
4. `provision-sheet.ts` is **not run** as part of implementing this step (no
   credentials) — confirm only that it typechecks/lints and that its
   formula-generation helpers have unit coverage in `sheetSchema.test.ts`
   for a few representative rows (row 2 / row 3 / last row of the 60-row
   block, to catch the seed-row and off-by-one cases specifically).

## Review process

The user runs the implementation with a separate agent/session (not the one
that authored this doc). Once implemented, bring the resulting diff back to
the planning session for review against this doc and against `CLAUDE.md`
section 8 standards — in particular: no `any` around `googleapis`' loose
types, the enum-mapping test actually exists and passes, no leftover
`GOOGLE_OAUTH_*` references, and nothing attempts to execute
`provision-sheet.ts` or reach a real Google API. After review/acceptance,
next up is step 3 (`docs/architecture.md` section 9, item 3: Gmail scanner
with a hardcoded test query) — likely blocked on the owner's
personal-mailbox OAuth decision, worth flagging before starting it.
