# Nudnik — Cash Flow Tracking Agent — System Design

## 1. Project overview

**What this is:** **Nudnik**, an automated cash-flow ledger bot for **Sasson**, a sports bar in Beer Sheva. It centralizes both expense tracking (via email scanning) and daily income tracking (via Z-report photo submission) into a single Google Sheets ledger, with a Telegram bot as the human-in-the-loop review layer before anything is written.

**Who uses it:**
- **Admins** — have Sheet access, review and confirm both expense and income transactions via Telegram
- **Workers** — no Sheet access, submit Z-report photos via Telegram at end of shift; submissions still go through the same confirm flow

**Scope for this build:**
- Ingest expenses from email (2x/day scan)
- Ingest daily income from Z-report photos sent via Telegram
- Human confirmation/edit/reject step for every transaction before it's written
- Append-only `Transactions` ledger in Google Sheets, with a `Categories` reference tab and a formula-driven `Dashboard` tab (Sheet structure defined separately, referenced throughout this doc)
- Traceability from every Sheet row back to its source document (Gmail or Drive)

**Explicitly out of scope for this build** (worth naming so nothing is assumed silently): live currency conversion, a second admin-approval layer on top of worker Z-report submissions, and any income source other than Z-reports.

**Replicability:** the codebase is built as a **template, not a multi-tenant service** — deploying Nudnik for a second bar means a fresh Railway project (own Postgres, own bot token, own Sheet/Drive) configured entirely through env vars, not a code change. See section 4a for exactly what's parameterized. This is deliberately simpler than true multi-tenancy (no shared instance, no `bar_id` columns) — appropriate since each bar operates independently and doesn't need to share data or a bot process with another.

## 2. The core design problem

This isn't really an "email → sheet" pipeline. It's a **stateful human-in-the-loop workflow**:

```
Email arrives → gets extracted → sits in "pending approval" state
→ waits (hours/days) for a Telegram reply → transitions to confirmed/rejected/edited
→ only THEN gets written to Sheets
```

The tricky part is the gap between step 3 and step 4. Your bot process might restart, the cron job runs independently of when you reply on Telegram, and you might not answer immediately. That means **you need a persistence layer that isn't just Google Sheets** — Sheets is your ledger (source of truth for confirmed data), but you need a separate lightweight database to track transactions that are "in flight."

Skipping this is the #1 mistake in these builds — people try to keep pending state in memory or encode it into Telegram message IDs, and it breaks the first time the process restarts mid-review.

## 3. High-level architecture

Two independent ingestion sources feed the same review queue and the same Sheets writer:

```
SOURCE A: Email (expenses)          SOURCE B: Telegram photo (income, Z-reports)
┌─────────────────┐                 ┌──────────────────────┐
│   Cron (2x/day)  │                 │  User sends photo     │
└────────┬─────────┘                 │  to Telegram bot      │
         ▼                           └────────┬──────────────┘
┌─────────────────────┐  ┌────────┐           ▼
│  Gmail Scanner       │─▶│processed│  ┌──────────────────────┐
│  (query + filter)    │  │_emails  │  │  Upload to Drive       │
└────────┬─────────────┘  │(Postgres)│  │  (Z-reports folder)    │
         ▼                └────────┘  └────────┬──────────────┘
┌─────────────────────┐                        ▼
│  Claude Extractor    │◀───────────────────────┘
│  (forced JSON output,│  → vendor/amount/... (expense)
│   schema varies by    │    OR total/cash/card/... (income)
│   source)             │
└────────┬─────────────┘
         ▼
┌─────────────────────┐      ┌──────────────────────┐
│ pending_transactions │◀────▶│  Telegram Bot         │
│  (Postgres, shared    │      │  (grammY, inline kbd) │
│   by bot + cron svc)  │      │                       │
└────────┬─────────────┘      └──────────────────────┘
         │ on CONFIRM
         ▼
┌─────────────────────┐
│  Sheets Writer        │ → appends row to ledger, incl. source_link
└──────────────────────┘
```

## 4. Tech stack (recommendations + reasoning)

| Layer | Choice | Why |
|---|---|---|
| Language | **Node.js + TypeScript** | Strong ecosystem support for Gmail/Telegram/Sheets APIs; TS catches schema drift between Claude's output and your Sheets columns — worth it here. |
| Telegram | **grammY** (not `node-telegram-bot-api`) | Modern, typed, has a built-in **conversations plugin** — exactly what you need for the "edit" flow, which is a multi-step dialogue, not a single callback. |
| Email | **Gmail API** (googleapis) with OAuth2, not IMAP | Lets you use Gmail search queries (`has:attachment newer_than:1d`) and, importantly, lets you **apply a label** to processed emails as a second layer of idempotency. **Runs under the owner's personal Gmail account** — a separate OAuth identity from Sheets/Drive, which run under the bar's own Google account (see 4a). Two distinct refresh tokens; the OAuth client registration in Google Cloud Console can still be shared across both if convenient. |
| Extraction | **Claude API**, forced JSON via tool-use schema | Don't parse free text — define a tool schema so Claude *must* return valid structured JSON. Cheaper and more reliable than prompting "please return JSON." |
| Pending-state DB | **Railway Postgres** (managed plugin), via **Prisma** | Two separate Railway services (bot + cron) both need to read/write the same data. Railway volumes attach to one service only, so a file-based DB can't be shared between them — Postgres is reachable over the network from both. Prisma is Postgres's best-supported ORM combination, and gives real migration tooling for managing schema changes across dev/staging/prod. |
| Ledger | **Google Sheets API** | Four tabs, per the Sheet design spec: `Transactions` (append-only ledger — the only tab the bot writes to), `Categories` (reference list, read by the bot to build the extraction schema dynamically), `Dashboard` (formulas only, bot never touches it), `Credit Card Payouts` (formulas only, twice-monthly settlement projection). |
| Photo storage | **Google Drive API** (bar account, same OAuth client as Sheets) | Z-report photos need durable storage — Telegram's `file_id` isn't reliable long-term and isn't browsable. Uploaded to a dedicated Drive folder; the resulting link becomes the Sheet's Attachment Link column. |
| Roles | **`bot_users` table in Postgres**, populated via invite-code self-registration | `/start` prompts for `ADMIN_INVITE_CODE` or `WORKER_INVITE_CODE`, matches it to a role, and persists the mapping — enables self-service onboarding rather than manually managing a chat-ID list. An admin `/revoke` command removes a row when someone leaves. |
| Scheduler | **Railway Cron Job service** calling the standalone scan script (not in-process `node-cron`) | Decouples the scan job from the always-running bot process — a crash in one can't take down the other. Railway's native **Cron Job** service type (a separate deploy running a command on schedule) gives this isolation without needing OS-level crontab. |
| Hosting | **Railway** (matches where SassonBot already runs), two services: `bot` and `scan-cron` | Keeps deployment consistent with your existing bot. Both services share the same Postgres plugin via a project-level connection string — no per-service volume needed now that state lives in Postgres, not a file. |

### 4a. What's parameterized for replication to a new bar

For "deploy this for Bar #2" to be a config exercise rather than a code change, everything bar-specific has to live in env vars, not hardcoded. Auditing the design against that bar:

| Value | Where it currently lives | Needs to become |
|---|---|---|
| Bot identity/token | Implicit (whichever bot you register with BotFather) | `TELEGRAM_BOT_TOKEN` — already planned, no change needed |
| Sheet + Drive targets | Implicit | `GOOGLE_SHEET_ID`, `GOOGLE_DRIVE_ZREPORTS_FOLDER_ID` — already planned |
| Database | Implicit | `DATABASE_URL` — already planned, one Postgres per deployment |
| Admin/worker invite codes | Implicit | `ADMIN_INVITE_CODE`, `WORKER_INVITE_CODE` — already planned |
| **OAuth identity split** | Originally assumed one Google account for Gmail+Sheets+Drive | **Corrected: two separate accounts.** `GMAIL_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN` (owner's personal mailbox, email scanning only) and `SHEETS_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN` (bar's own account, used for both Sheets and Drive). Per-bar replication needs to ask whether that bar also wants a personal-mailbox split, or one account for everything — Sasson's setup shouldn't be assumed as the default. |
| **Currency** | Assumed ILS throughout (per Sasson's Sheet spec) | New: `DEFAULT_CURRENCY` (e.g. `ILS`), used anywhere currency symbols appear in Telegram message formatting. The ledger's `amount` field itself stays a plain number either way — only display text needs this. |
| **Bar name, for bot copy** | Would otherwise get hardcoded into Telegram message templates ("Sasson's daily Z-report...") | New: `BAR_NAME` env var, interpolated into `formatters.ts` templates instead of a literal string |
| **Timezone** | Implicit (server default) | New: `BAR_TIMEZONE` (e.g. `Asia/Jerusalem`) — matters for "Receipt Date" vs "Received Date" correctness and for when the 2x/day cron actually fires locally |
| **Gmail search query** | Hardcoded filter logic in `emailFilters.ts` | Keep as a small set of env-configurable patterns (e.g. `GMAIL_SCAN_QUERY`) rather than buried in code, since a different bar's supplier emails will look nothing like Sasson's |
| **Credit-card payout schedule** | Would otherwise be hardcoded into Dashboard formulas | New: `CREDIT_CARD_PAYOUT_DAY_1`/`CREDIT_CARD_PAYOUT_DAY_2` — the two calendar days each month the processor transfers funds, baked into the dedicated Credit Card Payouts tab by `provision-sheet.ts` at provisioning time (see `docs/sheets-design.md` Tab 4). Confirmed with Sasson's owner: DAY_1 pays out the 1st-15th of the *previous* month, DAY_2 pays out the 16th-end of the *previous* month — a fixed split, not a rolling window. A different bar's processor may use different days or a different split entirely, so this exact half-month rule (`src/lib/creditCardPayout.ts`) would need revisiting per-bar, not just the two day numbers. |
| **Sheet language/direction** | Not parameterized — Hebrew + RTL is hardcoded into `sheetSchema.ts`/`dashboardSchema.ts`'s literal strings and `provision-sheet.ts`'s `rightToLeft: true` | A bar wanting English/LTR (or a third language) needs those literal strings and the RTL flags changed directly — there's no `SHEET_LOCALE` env var. Worth adding one if/when a second bar needs a different language, rather than assuming Hebrew is universal. |
| Categories | Already externalized to the Sheet's `Categories` tab | No change needed — this was already designed to be per-deployment via the Sheet itself, not code |
| Claude extraction prompt wording | Lives in `claudeExtractor.ts` | Fine to keep in code as long as it references `BAR_NAME`/category list dynamically rather than hardcoding "Sasson" or bar-specific category examples in the prompt text |

**Practically:** turn this repo into a GitHub **template repository**. Standing up bar #2 becomes: use-template → fill in a new `.env` → provision a new Railway project + Postgres + Sheet copy → done, with zero code edits. Worth confirming this is genuinely the deployment model you want (one instance per bar) rather than one instance serving several bars at once — the latter is a meaningfully bigger build (shared bot, `bar_id` on every table, per-bar Sheet routing) and isn't what the design above assumes.

## 5. Data model (Postgres, via Prisma)

```prisma
// prisma/schema.prisma

// Matches Sheet column K exactly. TelegramPhoto and ZReport are distinct on
// purpose: ZReport is the automated daily Z-report submission; TelegramPhoto
// is reserved for other photo submissions sent directly via Telegram.
enum TransactionSource {
  Email
  TelegramPhoto @map("Telegram Photo")
  Manual
  ZReport       @map("Z-Report")
}

enum TransactionType {
  Income
  Expense
}

enum PaymentMethod {
  CreditCard   @map("Credit Card")
  BankTransfer @map("Bank Transfer")
  Cash
  Bit
  PayPal
  Other
}

enum ProcessedEmailStatus {
  extracted
  skipped_no_transaction
  extraction_failed
}

enum PendingTransactionStatus {
  pending
  confirmed
  rejected
  editing
}

enum Role {
  Admin
  Worker
}

// Idempotency: never process the same email twice
model ProcessedEmail {
  gmailMessageId String               @id @map("gmail_message_id")
  processedAt    DateTime             @map("processed_at")
  status         ProcessedEmailStatus
  transactions   PendingTransaction[]

  @@map("processed_emails")
}

// The in-flight review queue — mirrors the Transactions tab columns 1:1,
// so confirming a row is a straight field-mapping into an appendRow call
model PendingTransaction {
  id                 Int                      @id @default(autoincrement())
  source             TransactionSource                                    // matches Sheet column K
  transactionType    TransactionType          @map("transaction_type")    // matches column D
  gmailMessageId     String?                  @map("gmail_message_id")    // NULL for Z-report rows
  processedEmail     ProcessedEmail?          @relation(fields: [gmailMessageId], references: [gmailMessageId])
  receiptDate        DateTime?                @map("receipt_date")        // date on the document itself (col B)
  receivedDate       DateTime                 @map("received_date")       // date the email/photo arrived (col C)
  category           String?                                              // must match a value from the live Categories tab (col E) — read live, never hardcoded
  vendorSource       String?                  @map("vendor_source")       // who was paid / who paid (col F)
  description        String?                                              // col G
  amount             Decimal                                              // single ILS figure (col H) — non-ILS handled via notes
  paymentMethod      PaymentMethod?           @map("payment_method")      // Credit Card|Bank Transfer|Cash|Bit|PayPal|Other (col I)
  cardAmount         Decimal?                 @map("card_amount")         // Z-Report only: card portion of `amount` (col R); cash portion is amount - cardAmount, never stored
  notes              String?                                              // original currency/amount if non-ILS, corrections (col P)
  sourceLink         String?                  @map("source_link")         // Gmail permalink or Drive file link (col O)
  telegramUserId     String                   @map("telegram_user_id")    // who is confirming (→ col L, Submitted By)
  telegramUsername   String?                  @map("telegram_username")
  submitterRole      Role                     @map("submitter_role")      // (→ col M), resolved from BotUser
  confidence         Float?                                               // 0-1, from Claude — internal, not written to Sheet
  status             PendingTransactionStatus @default(pending)           // internal state
  telegramChatId     String?                  @map("telegram_chat_id")
  telegramMessageId  String?                  @map("telegram_message_id")
  createdAt          DateTime                 @default(now()) @map("created_at")
  resolvedAt         DateTime?                @map("resolved_at")         // → col N, Approval Date, once confirmed

  @@map("pending_transactions")
}

// Role registration — populated via invite-code self-registration on /start
model BotUser {
  telegramChatId   String   @id @map("telegram_chat_id")
  telegramUsername String?  @map("telegram_username")
  role             Role
  registeredAt     DateTime @default(now()) @map("registered_at")

  @@map("bot_users")
}
```

**Enums, not plain strings, for fixed-value fields.** `TransactionSource`, `TransactionType`, `PaymentMethod`, `ProcessedEmailStatus`, `PendingTransactionStatus`, and `Role` are Prisma enums rather than bare `String` columns, consistent with section 8a's strict-TypeScript standard (compile-time safety over magic strings caught at extraction/write time, not at runtime). `category` is the one field that looks fixed-value but deliberately stays a plain `String` — it's read live from the Sheet's `Categories` tab at runtime (see below), so it can't be a compile-time enum. Some enum members use `@map` to record a Sheet-facing string that differs from the Prisma member name (`TransactionSource.TelegramPhoto` → `"Telegram Photo"`, `TransactionSource.ZReport` → `"Z-Report"`, `PaymentMethod.CreditCard` → `"Credit Card"`, `PaymentMethod.BankTransfer` → `"Bank Transfer"`). That `@map` only changes the *database* value, not what the generated Prisma client exposes at runtime — `ledgerWriter.ts` keeps its own explicit `SOURCE_LABELS`/`PAYMENT_METHOD_LABELS` records mapping each enum member to its exact Sheet string, tested against `sheetSchema.ts`'s `DROPDOWNS` so drift between the two fails a test instead of silently writing the wrong label.

The table mirrors the Sheet's actual columns rather than a generic `amount`/`currency` shape — because the Sheet, not an abstract internal model, is the real contract. A Z-report row simply leaves `vendorSource` as `"Z-Report"`, `category` as `"Bar Sales"`, and doesn't populate `paymentMethod`.

**What each pending row becomes on confirm:**
- `Transaction ID` (Sheet col A) — generated at write time as `TX-` + zero-padded `PendingTransaction.id`, not stored separately
- `Status` (Sheet col J) — `Approved` if confirmed as-is, `Edited` if the edit flow touched any field before confirm
- `Running Balance` (Sheet col Q) — a formula in the Sheet itself, never computed or written by the bot

**Categories are fetched from the Sheet, not hardcoded.** Before building the Claude extraction tool schema, the bot reads the live `Categories` tab and uses that list as the enum. This means you can add or rename a category in the Sheet itself without touching code — the bot always classifies against whatever categories currently exist there. (Caches the list for the run rather than re-fetching per email.)

**Roles: `bot_users` and invite-code registration.** On first contact (`/start`), the bot prompts for an access code. Matching `ADMIN_INVITE_CODE` or `WORKER_INVITE_CODE` (env-configured, one shared code per role) creates a `BotUser` row and the role sticks from then on — no re-entry needed on future messages. An admin-only `/revoke <chatId>` command deletes the row, cutting off access immediately (important for staff turnover, since these are shared codes rather than per-person credentials). Every `PendingTransaction.submitterRole` is resolved from this table at submission time, not re-derived later — so it stays accurate even if someone's role changes afterward.

**Why Prisma:** Postgres is Prisma's best-supported target, and proper migration tooling (`prisma migrate deploy` as a Railway release step) matters for managing schema changes safely across dev/staging/production.

## 6. Module structure

```
/prisma
  schema.prisma            # ProcessedEmail, PendingTransaction, BotUser models
  migrations/               # generated by `prisma migrate dev`, deployed via `prisma migrate deploy`
/src
  /config
    env.ts                 # loads & validates env vars (zod schema)
  /lib
    withRetry.ts            # shared retry/backoff utility (section 8b)
    logger.ts                # pino singleton (section 8c)
    barTimezone.ts            # BAR_TIMEZONE-aware date/time part extraction, used wherever a Sheet-facing date/timestamp is formatted
  /email
    gmailClient.ts          # OAuth2 client, thin wrapper over googleapis
    emailScanner.ts         # runs the query, iterates unprocessed messages
    emailFilters.ts         # Gmail search query definitions
  /extraction
    claudeExtractor.ts      # calls Claude API with forced tool schema (variant per source)
    schema.ts               # zod schemas: expense shape + Z-report shape (category enum built at runtime)
  /drive
    driveClient.ts           # OAuth2 client (shared with Sheets/Gmail), thin wrapper
    photoUploader.ts         # uploads Z-report photo, returns Drive file link
  /telegram
    bot.ts                  # grammY bot init, session/conversations setup
    formatters.ts           # transaction → Telegram message text
    handlers/
      startHandler.ts        # /start → prompts for invite code, creates BotUser on match
      revokeHandler.ts       # /revoke <chatId>, admin-only, deletes a BotUser row
      review.ts              # sends the confirm/edit/reject message
      confirmHandler.ts
      editConversation.ts    # multi-step edit flow (grammY conversation)
      rejectHandler.ts
      zreportHandler.ts      # receives Z-report photo (worker or admin) → upload to Drive → extract → queue
      pendingHandler.ts      # /pending command → digest of all currently-open pending_transactions rows
  /sheets
    sheetSchema.ts            # Transactions/Categories column contract, label maps, dropdowns — single source of truth transcribed from docs/sheets-design.md
    dashboardSchema.ts         # Dashboard tab layout constants + formula generators (Tab 3), consumed only by scripts/provision-sheet.ts
    sheetsClient.ts
    categoriesReader.ts      # fetches live Categories tab, cached per run
    ledgerWriter.ts          # appendRow(transaction) — generates TX-#### id, sets Status Approved/Edited
  /db
    prismaClient.ts           # singleton PrismaClient instance
    repositories/
      processedEmailRepo.ts
      pendingTransactionRepo.ts
      botUserRepo.ts           # findByChatId, create (on invite match), delete (on /revoke)
  /scheduler
    runScan.ts               # the job the cron service triggers (email source only)
  index.ts                   # starts the bot (long-running process)
```

## 7. Key design decisions worth calling out

**a. Forced JSON extraction, not prompt-and-hope**
Define a Claude tool like `record_transaction(vendor_source, amount, receipt_date, category, description, payment_method, confidence, is_transaction)`. Force `tool_choice`. This eliminates the JSON-parsing fragility that trips up most "LLM extracts data" builds. `is_transaction: false` lets Claude bail cleanly on newsletters/receipts-that-aren't-really-expenses instead of hallucinating a row.

**b. Confidence-gated formatting**
If `confidence < 0.6`, prefix the Telegram message with "⚠️ Low confidence — please check" rather than silently treating it the same as a clean extraction. Cheap to add, saves you from rubber-stamping bad data.

**c. Edit flow as a conversation, not free-text parsing**
Use grammY's `conversations` plugin: tapping "✏️ Edit" starts a conversation that asks one field at a time ("What's the correct amount?"), rather than expecting you to retype the whole transaction in one message. Much less error-prone than parsing a free-text correction. Any field touched here flips the eventual Sheet `Status` from `Approved` to `Edited`.

**d. Idempotency at two layers**
1. `processed_emails` table — never re-extract the same email.
2. Gmail label (e.g. `cashflow-processed`) applied after processing — so even if your DB were wiped, a re-scan wouldn't resurrect old emails. Belt and suspenders; cheap to implement, expensive to regret skipping.

**e. Sheets writes only happen on confirm**
This keeps the `Transactions` tab pure ground truth — no "pending" rows ever touch the sheet. Matches the Sheet spec exactly: nothing "Pending" or "Rejected" ever reaches it.

**e2. A confirmed row's Running Balance write can fail independently of its append**
`ledgerWriter.appendRow` writes columns A–P first, then writes the Running Balance formula into column Q as a second call (it needs the row number the first call returns). If that second call fails, the row already exists in the Sheet — blindly retrying `appendRow` would duplicate it. `ledgerWriter.ts` throws a dedicated `PartialAppendError` (carrying the transaction ID and row number) in that case, so the caller knows to retry only `writeRunningBalanceFormula` for that row, never `appendRow` itself.

**f. Categories are read from the Sheet's `Categories` tab at runtime, not hardcoded**
The `categoriesReader.ts` module fetches the live category list before building the Claude tool schema, so the enum always matches whatever's actually in the Sheet. You can add or rename a category there without a code change — matches the Sheet spec's explicit design intent.

**g. Two ingestion sources, one review queue**
Email (expenses) and Z-report photos (income) are structurally different — different fields, no email to dedupe against for photos — but both land in the same `pending_transactions` table and go through the identical confirm/edit/reject flow before hitting Sheets. Z-Report is the *sole* income source (email scanning realistically only surfaces expense-side emails for a bar), so there's no double-counting risk to guard against between the two paths.

**h. `source_link` traceability**
Every confirmed row carries a link back to its origin, written into the Sheet's Attachment Link column — a Gmail permalink for email-sourced expenses (built for free from the message ID), or a Drive link for Z-report photos (uploaded at ingestion time, before extraction). This is how you or your accountant get back to the original document from any row.

**i. Roles are self-service via invite code, backed by the DB**
`/start` prompts for an access code; matching `ADMIN_INVITE_CODE` or `WORKER_INVITE_CODE` creates a `BotUser` row and the role sticks for all future messages — no re-entry needed. Workers can submit Z-reports through the bot; only admins get Sheet access (granted manually in Google Sheets sharing, outside the app). The bot doesn't gate *submission* by role — a worker's Z-report still goes through the same confirm flow — it just records `submitterRole` on the row so you can trace who submitted what. An admin-only `/revoke <chatId>` command handles staff turnover by deleting a `BotUser` row, cutting off access immediately. Since these are shared codes per role rather than per-person credentials, rotate the codes whenever someone with access leaves, not just when you revoke their row.

**j. `/pending` — a digest command, not a re-scan trigger**
Since email (cron) and Z-report (Telegram photo) both write into the same `pending_transactions` table, "seeing everything together" doesn't need a special merge step — it's already one table. `/pending` just queries `pending_transactions WHERE status = 'pending'` and sends back a digest of everything currently awaiting review, reusing `formatters.ts` for each item. This is a read-only query against existing data, not a trigger that re-runs the Gmail scan — so it doesn't introduce any of the overlapping-scan concerns that a true "manual sync" button would have (see build order note below).

## 8. Engineering standards for the build (handoff notes for Claude Code)

This section exists because "production-ready" needs to be concrete instructions, not a vibe — otherwise quality drifts module to module. Treat this as binding for the build, not optional polish to add later.

**a. TypeScript strictness**
`strict: true` in `tsconfig.json`, no `any` without an explicit inline comment justifying it, no `@ts-ignore` without the same. Every external API response (Gmail, Claude, Sheets, Drive, Telegram) gets parsed through a `zod` schema at the boundary — never trust an SDK's own types alone for data crossing a network call.

**b. Error handling — every external call, no exceptions**
Every Gmail/Claude/Sheets/Drive/Telegram API call is wrapped with:
- Typed error handling (distinguish network failure vs. auth failure vs. rate limit vs. malformed response — don't catch-all into a generic error)
- Retry with exponential backoff for transient failures (network, 429, 5xx) — a small shared `withRetry()` utility, not copy-pasted per module
- A clear failure path that doesn't silently swallow errors: a failed extraction logs and marks the email `extraction_failed` in `processed_emails` rather than crashing the whole scan run or retrying it forever

**c. Structured logging, not `console.log`**
Use `pino` (fast, structured JSON logs — pairs well with Node). Every log line for a transaction includes its `pending_transactions.id` so you can grep one transaction's full lifecycle across scan → extraction → Telegram → Sheets write. Log levels used deliberately: `debug` for API payloads, `info` for state transitions, `warn` for retries, `error` for anything requiring attention.

**d. Testing**
- Unit tests for pure logic: extraction schema validation, category matching, ID generation, status-mapping (`confirmed`→`Approved` etc.)
- Integration tests for the DB repositories against a real Postgres instance (a disposable test database, e.g. via a local Postgres container or a dedicated Railway test DB) — not mocked, with each test run wrapped in a transaction that's rolled back after
- Gmail/Claude/Sheets/Drive/Telegram clients get mocked at the module boundary for anything testing business logic around them
- A minimal end-to-end test: fake email in → expect a `pending_transactions` row → simulate a Telegram confirm → expect the correct payload shape for `ledgerWriter.appendRow`

**e. Secrets & config**
- `.env` for all credentials and bar-specific config: Gmail OAuth client, Claude API key, Telegram bot token, Sheet ID, Drive folder ID, `DATABASE_URL`, admin/worker invite codes, plus the replication-facing values from section 4a (`BAR_NAME`, `DEFAULT_CURRENCY`, `BAR_TIMEZONE`, `GMAIL_SCAN_QUERY`, `CREDIT_CARD_PAYOUT_DAY_1`, `CREDIT_CARD_PAYOUT_DAY_2`) — never committed
- `.env.example` committed with every key name and a placeholder, so setup is copy-paste-fill-in — this file doubles as the checklist for standing up a new bar
- `env.ts` validates all of this at startup via `zod` and fails fast with a clear message if anything's missing, rather than failing confusingly mid-run
- `DATABASE_URL` is set once at the Railway project level and shared by both the `bot` and `scan-cron` services, rather than duplicated per service

**f. Graceful shutdown**
The long-running bot process handles `SIGTERM`/`SIGINT`: stop accepting new Telegram updates, let any in-flight DB write finish, disconnect the Prisma client cleanly (`prisma.$disconnect()`). Matters because Railway restarts the process on deploys — an ungraceful kill mid-write is exactly the kind of state corruption this design otherwise works hard to avoid.

**g. Database durability, migrations, and environments**
- Railway Postgres has its own automated backups — no manual backup step needed (this replaces what would otherwise have been a manual SQLite backup routine)
- Schema changes go through `prisma migrate dev` locally, committed to `prisma/migrations/`, and applied in deploys via `prisma migrate deploy` as a Railway release/pre-deploy command — never hand-edited against production
- A separate Railway **staging environment** (its own Postgres instance, its own Telegram bot token pointing at a test bot) mirrors production, so schema and extraction changes get tested before touching the real Sheet or real Telegram users

**h. Health check**
The `bot` service exposes a minimal `/health` HTTP endpoint returning 200 when the process is alive and the Prisma connection is healthy. Lets Railway detect a hung process and restart it, rather than relying solely on the Telegram connection appearing to work.

**i. Code style & repo hygiene**
ESLint + Prettier, enforced via a pre-commit hook (`husky` + `lint-staged`) so style issues never land in a commit. A `README.md` covering setup (env vars, OAuth flow for Gmail/Sheets/Drive, Postgres connection, how to run locally, how to deploy) — this is what makes the project maintainable by someone other than the person who built it.

**j. What "done" looks like per module**
Each module in section 6 should ship with: the implementation, its unit/integration tests, and inline doc comments on any non-obvious business logic (e.g. why `is_transaction: false` exists, why categories are fetched live). Claude Code should treat a module as incomplete without its tests, not add them in a separate pass at the end.

## 9. Suggested build order

1. Railway Postgres provisioned, Prisma schema + first migration, DB repositories — the foundation now includes `bot_users` alongside the two original tables
2. Sheets writer + `categoriesReader.ts` reading the real `Categories` tab
3. Gmail scanner with a hardcoded test query, logging extracted raw emails
4. Claude extractor as a standalone function, tested against 5–10 real sample emails, using the live category enum
5. Telegram bot: `/start` + invite-code registration → confirm/reject only (no edit yet) — get the end-to-end loop working, email source only
6. Add the edit conversation
7. Split into two Railway services (`bot` + `scan-cron`) + Gmail labeling + Gmail-permalink `source_link`
8. Add the Z-report path: Telegram photo handler (worker or admin) → Drive upload → income extraction → same review queue
9. Add `/pending` digest command and admin-only `/revoke`
10. Add confidence gating + validate category-enum behavior against real Sheet edits

I'd recommend building steps 1–5 first as a working vertical slice, all within a single Railway service to start — that's the part with the real architectural risk (state handling, roles), and everything after it is comparatively mechanical. The service split (step 7) and Z-report path (step 8) slot in cleanly afterward since they reuse the same queue and Sheets writer rather than needing their own pipeline. Section 8's standards apply from step 1 onward, not retrofitted at the end.

---

**Next step:** want me to scaffold the actual project (package.json, DB migrations, core modules from section 5, ESLint/Prettier/husky config, and a starter test suite) so you can hand it to Claude Code with everything already in place?
