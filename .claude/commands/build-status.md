---
description: Check repo state against docs/architecture.md section 9's build order and report status
---

Check this repo against the build order in `docs/architecture.md` section 9. This is a
status check only — do not implement, fix, or modify anything.

For each step in section 9, in order, determine whether it is: done, in progress, or
not started. Use concrete evidence, not assumptions:

- Which files/directories exist under `src/`, `prisma/` for that step's deliverables
  (cross-reference section 6's module structure).
- `git log --oneline` and `git status --short` — is the work committed, or sitting
  uncommitted in the working tree?
- Run `npm test` (and `npm run typecheck` if relevant) to check whether the step's
  tests actually pass, not just whether the files exist.

Stop at the first step that is not fully done (committed + tests green) — later steps
depend on it, so don't evaluate them in depth beyond confirming they haven't been
started.

Report, in this order:

1. **Last fully completed step** — its number/name, and the evidence (commit, files,
   passing tests).
2. **Current step's state** — done / in progress / not started, with evidence (e.g.
   specific failing tests, uncommitted files).
3. **Next step required** — what it is per section 9, and what it concretely needs
   (files to create, per section 6's module structure and section 8's engineering
   standards).

Keep the report concise — this mirrors a status check, not a full audit.
