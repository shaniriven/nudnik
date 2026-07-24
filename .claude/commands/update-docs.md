---
description: Cross-check docs against the current code state after a feature lands, report drift, and only edit docs after approval
---

Check whether this repo's documentation still matches what the code actually does. This
is a docs-sync task — you may only ever edit documentation files (`CLAUDE.md`,
`docs/*.md`, `README.md` if present). Never modify anything under `src/`, `prisma/`, or
`scripts/` as part of this command.

## 1. Scan the code

Read the current state of the implementation — not a diff, the actual code as it stands
now:

- `src/` (all modules relevant to the feature just implemented, per section 6's module
  structure in `docs/architecture.md`)
- `prisma/schema.prisma` (data model — enums, fields, `@map` values)
- `scripts/` if it exposes any behavior docs describe

For each area touched, note the _actual_ behavior: what fields/enums/columns exist,
what gets validated, what triggers a write, what's read live vs. hardcoded, error
handling and retry behavior, etc.

## 2. Scan the related documentation

Read the docs that describe that same behavior:

- `CLAUDE.md` (working rules, tech stack, code review standards)
- `docs/architecture.md` (data model in section 5, module structure in section 6, design
  decisions in section 7, engineering standards in section 8, build order in section 9)
- `docs/sheets-design.md` (column contract, dropdowns, category list)

Only scan the sections plausibly related to what changed in the code — no need to
re-verify unrelated sections on every run.

## 3. Cross-reference and report

For each doc claim, compare it against what you found in the code. Report every
discrepancy found, in this format:

- **Doc location** (file + section/line) — what it currently says
- **Code location** (file + line) — what the code actually does
- **The mismatch** — one sentence on how they diverge

Group findings as:

1. **Docs describe something no longer true** (code moved on, doc is stale)
2. **Docs describe something not yet implemented** (aspirational/future — likely fine to
   leave as-is, flag but don't necessarily treat as drift)
3. **Ambiguous / needs a judgment call** (e.g. wording could be read either way)

If there are zero discrepancies, say so plainly and stop — don't invent busywork.

## 4. Wait for approval

Do not edit any file yet. Present the findings and propose the specific doc edit for
each one. Wait for the user to approve before writing anything. If the user approves
only some findings, only apply those.
