# Pace — Current Context

> CURRENT STATE ONLY. Read with `PACE_GUARDRAILS.md` before any work. Load the other canonical files only when the task needs them (see "Doc map"). Source code = implementation truth; `tests/` = behavioral truth; this file = what a new session must know to work safely. History lives in `PACE_CHANGELOG.md`, not here.
>
> Last verified: 2026-09-25 (source; backend sim 469/0; frontend dates 13/0, reliability 25/0, profile 13/0, check-ins 24/0; local browser: Pace Period 34/34, reliability 17/17, layout 18/18, profile 21/21, check-ins C1–C21).

## Doc map
| File | Read when |
|---|---|
| `PACE_CONTEXT.md` | always |
| `PACE_GUARDRAILS.md` | always (rules + development loop) |
| `PACE_DECISIONS.md` | task touches product behavior, money semantics, UI, auth |
| `PACE_ARCHITECTURE.md` | task touches data flow, API, storage, deployment |
| `PACE_VALIDATION.md` | task touches tested behavior / regression risk / deploy |
| `PACE_ROADMAP.md` | task is a roadmap feature or scope question |
| `PACE_CHANGELOG.md` | only the relevant entry, when history matters |

## Product (one line)
Pace answers "How much can I spend today and still protect my savings?" — a **dynamic spending trajectory from the money I actually have now**, not a fixed daily budget. Working MVP in real-world use: owner (MUHAMMED), one friend (FRIEND), and a public Guest demo.

## Current milestone
**Steps 8A–8C (reliability, Profile & Identity, Contextual Check-ins) are LIVE in production (deployed + verified 2026-09-25, commit `31b7b2a`).**
- Backend: Apps Script **Version 15** (`apps-script/Code.gs` LF SHA-256 prefix `76283fe6bd9a6ce2`). Frontend: Netlify **`6ab61b2db12e7c1610937be9`** (served `app.js`/`styles.css`/`config.js` byte-identical to `frontend/`; `index.html` differs only by Netlify's injected hosting comment + hud script). Local == production.
- Rollback targets: Apps Script **v14** + Netlify **`6ab4fa3acba9766b6679413b`** (both together).

**Immediate next target:** wait for human direction; observe real use. Next roadmap candidates are in `PACE_ROADMAP.md` (none approved).

**Step 8A reliability findings (2026-09-25):** first screen after sign-in was blank because sign-in and the first data read are two sequential Apps Script calls (measured warm: sign-in 2–4.7 s + read 2.6–11 s; one cold start 31.6 s) and nothing was drawn meanwhile; the old 15 s timeout aborted requests that were still succeeding, and a Google ping reply to a POST was accepted as success. Local fix: an explicit "Loading your Pace…" note ("Still loading…" after 8 s), 30 s timeout, odd replies treated as outcome-unknown, and after an unknown-outcome write the app READS the server (never re-sends) and reports what actually happened.

## Current system (summary — details in ARCHITECTURE)
- **Stack:** vanilla HTML/CSS/JS on Netlify (`https://pace-ledger.netlify.app`) → Google Apps Script web app (all data over authenticated POST) → one Google Sheet with per-profile tabs.
- **Auth:** code-only sign-in (backend matches SHA-256 of the code), HMAC-signed stateless session tokens (30 d private / 24 h guest), per-profile browser sessions. Guest = shared disposable demo.
- **Data per profile:** Settings tab (key/value) + Transactions tab (`Date | Amount | Note | Type | ID`). V2 keys: `display_name`, `currency`, `monthly_income`, `monthly_savings_target`, `commitments` (JSON `{id,name,amount,status,paid_at}`), `current_balance`, `current_balance_date`, `current_balance_covered`, `minimum_daily_spend`, `pace_period_end`. Legacy keys (`fixed_monthly_expenses` = sum of commitments, `starting_balance*`, metro/auto) remain but are not the Pace model.
- **Pace engine:** one pure backend function `calculatePaceV2_` (Code.gs). Frontend only presents `state.v2` (+ a server-replaced optimistic mirror).
- **Pace Period (live, Step 7):** period = `current_balance_date` (start) … `pace_period_end` (inclusive end; absent = end of this calendar month). Users see it as "When should your money last until?" in onboarding step 5 (default *End of this month*, optional date) and in Money Plan (Change / Use end of this month / ⓘ); Settings shows "Pace period Sep 10 → Oct 5" + *Edit Pace period* (same editor). Today shows "Pace until Oct 5" in the dateline when a custom end is set. Ended period ⇒ Today state **PERIOD ENDED** + *Set Pace period* (balance kept); a new balance while the period is over must be saved together with a new end date (Money Plan explains; nothing is written otherwise).
- **Profile & Identity (live, Step 8B):** Settings shows a Profile block for private profiles — Name (display_name) + *Edit name* → input / Save / Cancel. Saved via `saveMoneyPlan {profile_only:true, display_name}`, which writes ONLY the display_name cell (trimmed, ≤40, no control characters, Unicode kept; empty = no greeting). Greeting updates immediately; unknown-outcome saves use the 8A read-only check. Guest keeps its fixed "Guest (demo)" identity (no editor; backend refuses). The Money Plan "Your name" field still works as before.
- **Contextual check-ins (live, Step 8C):** Today may show one "A note from Pace" (between the meta rows and Today's expenses), computed by `checkinFor(state.v2, plan, localDayKey())` from server state only — no calculation, no thresholds of its own, nothing stored or written. Kinds: *last day of the Pace period* (`days_remaining_after_today = 0`) and *commitment marked paid today* (`paid_at` = today). Last day wins; nothing while Pace isn't ready. Same state ⇒ same note on reload; it goes away when the state does (next day, unpaid, new period). Guest behaves the same; Reset demo clears it.
- **Guest (live, Step 7):** full product on disposable shared demo data — Money Plan (income, savings, balance, commitments, Pace period) is editable; Reset demo restores the clean demo exactly; private tabs are never touched. Guest has no name field/greeting.
- **Setup state machine:** `plan.setup_state` = `needs_plan` → onboarding; `needs_position` → "How much money do you have available right now?"; `complete` → Today. Guest is always complete.
- **Today screen (accepted):** Pace-first — status → Today's Pace → Pace slider (today's spending vs today's pace) → spent/left-or-over today → From tomorrow / Remaining flexible / Days left → Today's expenses (integrated ledger) → + Log an expense. Money Plan edits name, income, savings, current balance, Pace period, commitments (paid/unpaid).
- **Production profiles (2026-09-24):** MUHAMMED and FRIEND both `complete` and in active use by their owners; Guest `complete` (demo balance 45,000). Private data is owner data — never modify it.

## Known limitations (current)
- Transactions have no timestamp; the balance snapshot excludes already-logged expenses by transaction id (`current_balance_covered`).
- Currency selector in Settings is device-local per profile; only onboarding writes `currency` to the backend. No FX.
- `minimum_daily_spend` is supported by the engine/API but has no UI.
- Picking exactly the last day of the current month in the period editor stores the default ("End of this month"), which rolls to the next month end next month.
- A tab open across local midnight keeps yesterday's day until the next reload/sync.
- Displayed amounts round to whole units.
- Apps Script latency: 2–11 s warm, ~18 s spikes, ~31.6 s cold start (measured 2026-09-24/25); Google occasionally answers a POST with the GET/ping reply. Since Step 8A (live) an unknown-outcome write is checked with the server (read-only) instead of being reported as failed. The data itself still arrives only as fast as Apps Script answers — 8A makes waiting explicit, it does not make the server faster.
- After Reset demo, Guest `current_balance_date` is stored as a Sheets date cell (not text); it reads back as the same local day (script timezone Asia/Kolkata), so behavior is unchanged. Candidate small fix: write it as text in `resetGuest_`.
- Not OAuth: whoever holds an access code has the profile; tokens sit in `localStorage`; lockout is per profile.
- Guest data (incl. Guest Money Plan edits since 7.2) is shared by all guests; Reset demo restores it.
- DEV Apps Script copy still runs old (v9) code; `saveMoneyPlan`/V2 are covered by the simulation, not `dev_runtime.js`.
- `README.md`/`docs/` are pointers only; these PACE_* files are canonical.
