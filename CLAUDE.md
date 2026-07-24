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

## Commands

(To be filled in once package.json exists — run `/init` after step 1 of the
build order to have Claude Code populate real build/lint/test commands here.)
