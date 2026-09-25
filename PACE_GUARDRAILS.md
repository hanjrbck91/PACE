# Pace — Guardrails & Development Operating System

> The engineering contract for every Pace session. Read with `PACE_CONTEXT.md` before any work.

## 1. Hard guardrails
1. Do not change accepted V2 Pace calculation semantics (`calculatePaceV2_`, what counts, what is protected, day counting) without explicit owner approval.
2. Never create a second Pace calculation engine. The frontend presents `state.v2`; the only frontend arithmetic allowed is the server-replaced optimistic mirror (`computeOptimistic`) and presentation mappings (slider fill, left/over label).
3. Do not modify production data during development. Private profiles (MUHAMMED, FRIEND) are read-only unless the owner explicitly authorizes a specific change. Guest demo activity is allowed only when followed by Reset demo.
4. Never expose access codes, code hashes, session tokens or `SESSION_SECRET` — not in source, docs, logs, reports or commits. Codes live only with the owner (and outside the repo).
5. Do not deploy unless explicitly instructed in the current task. Deployment is a separate human approval gate (§6).
6. Do not redesign accepted UI (Today hierarchy, notebook aesthetic, Money Plan layout) without explicit approval.
7. Run the relevant tests after every implementation; run the full suite (`node tests/backend_sim.js`) whenever calculation, data, API or auth code changes.
8. Preserve user-data isolation: authorization comes only from the verified token → `USERS` row → that profile's tabs. Never trust client-supplied user keys or sheet names.
9. Preserve Guest/user separation (Guest cannot save a Money Plan, reset only touches `TX_GUEST`/`SET_GUEST`).
10. Do not silently change financial terminology or data semantics (current balance, protected, remaining flexible, commitments paid/unpaid, today's pace).
11. The conversation is not the source of truth when canonical files exist; code and tests win over docs — fix docs that disagree.
12. Read only the documentation relevant to the task (see Doc map in CONTEXT). Do not read the whole CHANGELOG by default.
13. No destructive migrations without explicit approval; migrations must be additive/idempotent and backed up first.
14. If a task conflicts with a documented decision (`PACE_DECISIONS.md`), STOP and report the conflict — do not pick a new behavior silently.
15. Production deployment is a separate human approval gate, even when local tests pass.
16. Never invent test results, deployment IDs, versions, hashes or production state. Unverified = say "unverified".

## 2. Codebase-specific guardrails
- **Never run `setupSheet()`** in Apps Script — it wipes Settings. The editor's function dropdown defaults to it; always select the intended function explicitly. Do not run `migrateToMultiUser` or any migration without approval.
- "Today" is always the device-local `YYYY-MM-DD` (`localDayKey()`), sent as `today` with every request. Never use `toISOString()` or server time for business dates (balance date, `paid_at`, transaction date, pace day).
- All data access is POST with `text/plain` JSON; GET serves only `?action=ping`. Never put a token in a URL.
- Writes go through the existing endpoints (`saveMoneyPlan`, `addTransaction`, `updateTransaction`, `deleteTransaction`, `resetGuest`) under `LockService`. Do not add parallel endpoints for the same data.
- Transaction identity = `transaction_id` (UUID, column E). Never derive identity from row/date/amount; never mutate transactions as a side effect of plan/balance changes.
- Commitment ids (`cm_…`) are backend-generated, stable, never reused; unknown/foreign ids are rejected.
- Test only against the local simulation / local dev server / DEV copy. `tests/dev_runtime.js` refuses the production URL — keep it that way.
- `curl -X POST` to Apps Script returns HTTP 411 but **still executes the write** — never "probe" production with curl POSTs.
- Apps Script paste can silently fail: verify the editor content by SHA-256 against local `Code.gs` before creating a version, and verify the live version by a field only the new code returns.
- Frontend deploy = zip of exactly `frontend/{index.html,styles.css,app.js,config.js}` uploaded on the pace-ledger **Deploys** page (never Netlify `/drop` — that creates a new site). Do not edit `config.js`.
- Back up files before non-trivial edits (`backups/<file>.<tag>.bak`); back up production (API snapshot) before any backend deploy.

## 3. Context loading protocol
Before implementation read: `PACE_CONTEXT.md` + this file. Then only as needed: DECISIONS (product behavior/decisions), ARCHITECTURE (architecture/data flow), VALIDATION (tested behavior/regressions), ROADMAP (roadmap features). CHANGELOG: specific entries only. Re-read the chat only if the task needs an unresolved fact that no project file records.

Task examples: UI-only → CONTEXT, GUARDRAILS, ARCHITECTURE §Frontend, VALIDATION. Calculation → CONTEXT, GUARDRAILS, DECISIONS, ARCHITECTURE, VALIDATION. Docs-only → the relevant docs.

## 4. Implementation loop
UNDERSTAND → INSPECT CURRENT CODE → PLAN MINIMAL CHANGE → IMPLEMENT → RUN RELEVANT TESTS → INSPECT FAILURES → FIX ROOT CAUSE → RUN TESTS AGAIN → RUN REGRESSION (`node tests/backend_sim.js`, browser checks via `tests/dev_server.js` for UI) → VERIFY ACCEPTANCE CRITERIA → INSPECT FOR UNINTENDED CHANGES (diff vs backup) → UPDATE DOCUMENTATION → FINAL VALIDATION → REPORT.

Do not stop at the first implementation if tests fail.

**Autonomously fix:** bugs/regressions/failing tests introduced by the current task, obvious implementation mistakes, documentation inconsistencies caused by the change, validation failures fixable without changing requirements.

**STOP and report when:** requirements are ambiguous; decisions conflict; accepted behavior must change; a financial semantic must change; auth/security architecture must change; production data must change; a destructive migration is needed; the feature needs substantial architectural expansion; scope would materially grow. Do not guess.

Updating existing test expectations is allowed only when the approved task intentionally changes that behavior; say which tests changed and why. Never delete or weaken tests to make a run pass.

## 5. Definition of done
1. Requested behavior implemented. 2. Relevant tests pass. 3. No regressions (full suite green). 4. Acceptance criteria verified (incl. browser widths 375/390/412/430/1000, no horizontal overflow, targets ≥44px for UI work). 5. No unintended application changes. 6. Docs updated. 7. `PACE_VALIDATION.md` records the new state. 8. `PACE_CHANGELOG.md` entry added. 9. `PACE_CONTEXT.md` updated if current state changed. 10. Final result reported explicitly, including anything unverified.

If tests fail, the task is not complete.

## 6. Production deployment gate
LOCAL IMPLEMENTATION → LOCAL TESTS → REGRESSION → ACCEPTANCE AUDIT → **STOP** → HUMAN APPROVAL → pre-deploy read-only snapshot → BACKEND deploy (new Apps Script version) → backend smoke → FRONTEND deploy → frontend smoke → private-profile integrity check vs snapshot → record real versions/IDs → FINAL REPORT.
Never deploy frontend before backend smoke passes. Roll back only on a real deployment problem (report first unless it is obvious corruption). Record the real rollback targets before deploying.

## 7. Milestone compaction
When a major milestone completes: verify code, tests and (if relevant) production; rewrite `PACE_CONTEXT.md` to the new current truth (remove obsolete history); update ARCHITECTURE if it changed; add durable decisions to DECISIONS (never drop an existing durable decision during compaction); update VALIDATION; add one concise CHANGELOG entry; update ROADMAP. CONTEXT answers "what must a new session know to work safely today?", never "what happened in every conversation?".
