# Nudnik — Cash Flow Tracking Agent

Automated cash-flow ledger bot for Sasson, a sports bar in Beer Sheva.
Email scanning (expenses) + Telegram Z-report photos (income) →
human confirm/edit/reject via Telegram → Google Sheets ledger.

See @docs/architecture.md for full system design, data model, module structure,
and engineering standards (section 8 is binding for all code in this repo).

See @docs/sheets-design.md for the Google Sheet's exact column contract —
field names in code must map to these columns precisely.

## Tech stack

Node.js + TypeScript (strict mode), grammY (Telegram), Prisma + Railway Postgres,
Gmail/Sheets/Drive APIs via OAuth2, Claude API for extraction (forced tool-use JSON),
pino for structured logging, zod for runtime validation at every external boundary,
deployed on Railway as two services (`bot` long-running + `scan-cron` scheduled).

## Working rules

- IMPORTANT: never write to the Sheet's `Transactions` tab except on explicit
  Telegram confirm — no "pending" rows ever touch it.
- Categories are always read live from the Sheet's `Categories` tab at runtime,
  never hardcoded as an enum in code.
- Every external API call (Gmail, Claude, Sheets, Drive, Telegram) is validated
  through a zod schema at the boundary and wrapped with retry/backoff — see
  docs/architecture.md section 8b.
- Follow the build order in docs/architecture.md section 9 — implement one step
  at a time, with its tests, before moving to the next. Do not attempt to build
  multiple steps in a single pass.
- Every module ships with its unit/integration tests in the same change, not
  added in a later pass.
- This repo is a deployment template — one Nudnik instance per bar. Bar-specific
  values belong in env vars (see docs/architecture.md section 4a), never
  hardcoded strings in source.

## Code review standards

`/code-review` (and any manual review) of this repo's code must flag, in addition
to correctness bugs:

- **Duplication** — repeated logic, validation, or config that should be a shared
  function/constant instead of copy-pasted per module.
- **Magic strings/numbers** — literal values with meaning (statuses, Sheet column
  letters, category names, thresholds, error codes) belong in a named constant or
  enum, not inlined. Any string that must match a Sheet-facing value should trace
  back to a single source (e.g. `sheetSchema.ts`'s `DROPDOWNS`, or the
  `SOURCE_LABELS`/`PAYMENT_METHOD_LABELS` maps in `sheetSchema.ts`), not be
  retyped at each call site.
- **Bypasses** — skipped validation, disabled lint/type rules (`@ts-ignore`/`any`
  without a justifying comment), `--no-verify`, catch-and-ignore error handling,
  or anything that routes around the zod-boundary + retry/backoff standard in
  docs/architecture.md section 8b.
- **Enums over strings** — any fixed, closed set of values should be a TypeScript
  enum, not a bare string/string union — except `category`, which is deliberately
  a plain `String` because it's read live from the Sheet at runtime (see
  docs/architecture.md section 5).
- **Redundant comments** — flag comments that restate what the code already says.
  Only comments explaining a non-obvious WHY (a workaround, a hidden constraint, a
  subtle invariant) should survive review.

## Commands

- `npm run build` — compile via `tsc`
- `npm run typecheck` / `npm run typecheck:scripts` — type-check `src/` / `scripts/`
- `npm run lint` / `npm run lint:fix` — ESLint
- `npm run format` / `npm run format:check` — Prettier
- `npm test` / `npm run test:watch` — Vitest
- `npm run prisma:generate` / `npm run prisma:migrate` / `npm run prisma:studio` — Prisma
- `npm run docker:up` / `npm run docker:down` — local dev/test Postgres containers
