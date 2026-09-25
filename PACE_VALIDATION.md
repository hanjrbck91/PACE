# Pace — Validation State

> Behavioral truth. Update after every verified change; replace obsolete numbers instead of keeping them.

## Current build
- Backend `apps-script/Code.gs` — LF-normalized SHA-256 prefix `a4bba9a032051663` = production Apps Script **v14** (deployed 2026-09-24; editor content verified by SHA before the version was created). Production Apps Script **v13** = prefix `1e11c25d0bb738ff` (`backups/Code.gs.pre71.bak`).
- Frontend `frontend/*` = production Netlify **`6ab4fa3acba9766b6679413b`** (served `app.js`, `styles.css`, `config.js` byte-identical; `index.html` differs only by Netlify's injected comment; `config.js` unchanged).

## Automated tests
| Suite | Result | Date |
|---|---|---|
| `node tests/backend_sim.js` | **446 passed / 0 failed** (437 + 9 Step 7.2) | 2026-09-24 |
| `node tests/frontend_dates.js` | **13 passed / 0 failed** | 2026-09-25 |
| `node tests/frontend_reliability.js` (Step 8A: greeting boundaries, reply classification, retry/duplicate safety) | **25 passed / 0 failed** | 2026-09-25 |
| `tests/browser_reliability.js` (Step 8A, local dev backend with fetch fault injection) | **17/17** | 2026-09-25 |
| `tests/browser_pace_period.js` (local dev backend, browser pane) | **34/34 scenario checks** + layout 18/18 (6 widths) + 2 private-isolation checks | 2026-09-24 |
| `tests/dev_runtime.js` (DEV web app) | 35/35 historically — DEV runs old v9 code, **does not cover V2** | 2026-09-20 |

`backend_sim.js` blocks: migration/auth/isolation, code-only sign-in, Money Plan, V2 Step 1 data model, Step 1.5 commitments, Step 2 engine, Step 3 onboarding/position, Step 4 state exposure, Step 5 (S5-1…21 balance edits), Step 5.5 (R1…R21 balance snapshot + paid/unpaid), Step 7.1 (P-A…P-S engine period tests + P-API1…13 storage/validation), Step 7.2 (Q-1…Q-9: period states, balance-after-end, onboarding with an end date, Guest edit + reset), legacy-tabs-untouched. 11 older Guest tests were rewritten for the approved Guest-parity change (Guest may edit its demo; private tabs untouched; Reset restores). Mutation check: removing the new Reset clean-up makes 6 tests fail. A mutation check (forcing the month-end horizon back) makes 17 Step 7.1 tests fail, so they bite.

## Key acceptance examples (locked in tests)
- Balance 12,588 with 448 already logged, savings 10,000, commitments paid ⇒ flexible 2,588 ⇒ ₹258.80/day over 10 days; a later ₹200 expense ⇒ ₹238.80.
- Same with unpaid 16,500 ⇒ −13,912 ⇒ BEHIND.
- 20,000 − 10,000 − 5,000 unpaid ⇒ ₹500/day; marking it paid ⇒ ₹1,000/day.
- Income/savings/commitment/name edits never change the balance or its date; balance edit writes only position cells; transactions/ids never mutated.
- Guest cannot save a plan; cross-profile writes impossible; no secrets in responses; GET cannot read or write.

## Step 7.1 Pace Period examples (locked in tests)
- No `pace_period_end` ⇒ month end, results byte-identical to a configured month end (all 400 pre-existing tests unchanged).
- Anchor Sep 10, end Sep 30, flexible 6000 ⇒ 21 days incl. today, anchor-day pace 6000/20 = 300. End Oct 5 ⇒ 26 days, pace 240; on Sep 28 ⇒ 8 days (month end would say 3).
- End tomorrow ⇒ today 3000 / tomorrow 6000; end today ⇒ D = 1, tomorrow null; end == anchor == today ⇒ one-day period.
- Leap: 2028-02-28 → 03-01 = 3 days; year boundary Dec 31 → Jan 2 = 3 days.
- Invalid (before anchor / corrupt) ⇒ `invalid_period`; passed ⇒ `period_ended`; saves with a past end, bad date, or a balance dated after the end are rejected with nothing written.

## Step 8A stabilization (LOCAL only, 2026-09-25)
- Measured production latency (read-only, Guest, Node, 6 rounds): sign-in (`guest`) 1.96–4.68 s warm and 31.6 s on a cold start (that round also returned an HTML error page); first `all` read 2.6–11.0 s. Earlier the same week: spikes ~18 s and occasional POST→ping answers.
- Before 8A: nothing but the empty shell until sign-in + first read finished (≈ 5–16 s warm, ≈ 40 s+ cold). After 8A (local harness, 3 s / 11 s injected delay): "Loading your Pace…" is visible at 0 ms; after 8 s it says the server can take up to half a minute; it clears when data arrives; a real failure shows the error. Data arrival time is unchanged (same two sequential calls — parallelising is impossible: the read needs the sign-in token; combining them would change the API contract).
- Unknown-outcome writes (fault-injected: reply lost after the server saved, request never delivered, ping reply): add → "was saved" with exactly one server row (retry reuses the client_id; backend dedups) / "wasn't saved" with no row and no extra POST; edit → "Edit saved."; delete → "Deleted."; Money Plan save with every reply lost → "Money Plan saved."; a slow preview no longer blocks saving.
- Regression: backend 446/0, dates 13/0, pace-period browser 34/34 (one guest-scenario run failed once after the reliability runs and passed on 2 immediate reruns; cause not confirmed), layout 18/18 incl. the new loading note; login, wrong code, logout, Guest, Reset, Month, Balance checked.

## Production (Step 7) — **COMPLETE (2026-09-24)**
- Pre-deploy (local): backend 446/0, frontend dates 13/0, browser 34/34, layout 18/18 — all re-run green.
- Pre-deploy read-only snapshot of MUHAMMED / FRIEND / GUEST.
- **Backend v14 smoke: 27/28** — auth (Guest + code-only, wrong code), authenticated `all`, GET data denied by real `doGet`, bad/no token rejected, V2 + `pace_period_end` fields, legacy profiles on the month-end default, configured cross-month period (Guest), `period_ended` surfaced, past end rejected, balance-after-end rejected, no secrets, MUHAMMED/FRIEND byte-identical. The 1 miss was an over-strict raw comparison: after Reset demo the Guest `current_balance_date` cell comes back as a Sheets date instead of text; plan values and Pace are identical (see Known limitations).
- **Frontend smoke (production, Guest): PASS** — Welcome/About/Sign-in; Guest Today; add, Undo, edit, delete; Money Plan edit of income/savings/balance/commitment + Pace period (default *End of this month · Sep 30*, same-month Sep 28 → "Pace until Sep 28", ₹4,750/day; cross-month Oct 5 → 11 days from tomorrow, ₹1,727/day); *Edit Pace period* focuses the field; restore month end; Settings row; Month ("Period ends") and Balance sheets; **period ended** (end = today, clock moved to tomorrow in the page): PERIOD ENDED + message + 65 px *Set Pace period* → period field; Balance sheet "Your balance is still saved…"; new balance alone blocked with the explanation and the server still held the old end and balance (no silent reset); new balance + end-of-month saved together → ON PACE ₹3,900/day; Reset demo → clean demo (10 demo entries, 45,000, no period, no extra keys); Log out. Widths 375/390/412/430/1000: no overflow, targets ≥44 px, no PROTECTED / remaining spendable / UNDER PACE, slider present.
- **Private integrity (read-only):** FRIEND byte-identical before/after. MUHAMMED differed only by owner activity during the window: one new expense dated today (normal note, UUID id) and `display_name` set via Money Plan; balance, balance date, commitments (ids/status), income, savings, starting balance unchanged and no `pace_period_end` row — nothing from the deployment or the smoke tests.
- Observed during smoke (pre-existing, environmental): Apps Script latency up to ~18 s and occasional POST→ping answers made one Guest add show "Couldn't save … Not recorded." although it was saved, and one Reset demo not refresh in place (reload showed the correct state).

## Step 7.2 browser results (local)
- Onboarding: default "End of this month · Sep 30, 2026", Change to a next-month date, draft survives reload, failed save keeps draft + writes nothing, save stores the end, Today shows "Pace until" and the server's day count.
- Existing user: period view/edit (cross-month Oct 5), review row, Pace changes, name/income/savings/balance/date/commitments/transactions unchanged, *Edit Pace period* focuses the field, restore month end.
- Period ended (clock shifted +3/+6 days): PERIOD ENDED (not POSITION NEEDED), message with the end date, 44 px action → period field; Balance sheet says the balance is still saved; balance change alone is blocked client-side with an explanation and nothing is written; new balance + new end saved together → Pace back.
- Guest: plan editable, name hidden, period set/restore changes Pace, Reset demo → clean demo; dev MUHAMMED/FRIEND byte-identical before/after.
- Layout: 375×640/375/390/412/430/1000 — no overflow; targets ≥44 px after fixing the pre-existing 40 px commitment inputs; date input labelled; ⓘ has `aria-expanded`.
- Year/leap boundaries of the frontend helpers covered by `tests/frontend_dates.js` (browser clock shifts beyond ~a day invalidate Guest sessions).

## Local acceptance audit (Step 5.8, 2026-09-21, local dev backend + browser)
PASS: new-user onboarding (validation, draft survives reload/failed save), existing-user position setup, Money Plan edits, commitments paid/unpaid, Today slider/labels/stamp/greeting, add/edit/delete/undo, balance re-anchor, currencies, Guest incl. Reset demo, auth/security, local day, widths 375×640/375/390/412/430/1000 (no overflow, targets ≥44px), accessibility basics.
Not verified in browser: afternoon/evening greeting boundaries, screen-reader pass.

## Production (Step 6) — **COMPLETE (closed 2026-09-24)**
- **Backend smoke v13 (2026-09-21): 20/20 PASS** — Guest + code-only login, wrong code rejected, GET data denied by real `doGet`, unauthenticated/tampered token rejected, no hashes/codes/secrets, V2 fields present, new engine fields live, Guest demo intact, MUHAMMED + FRIEND byte-identical to the pre-deploy snapshot.
- **Frontend smoke 2026-09-21: PASS** — served files match, Welcome, About, code-only sign-in form (no token in URL), Guest Today (V2 status, pace, slider, spent/left today, From tomorrow, Remaining flexible, Days left; no PROTECTED / "remaining spendable"; no greeting), Guest add + Undo.
- **Closing verification 2026-09-24: PASS**
  - Guest (production): Reset demo → clean demo (Coffee ₹50, Breakfast ₹90); Edit Coffee 50→65 updated row, spent, left-today and From tomorrow; Delete Breakfast removed it and updated the values; add + Undo restored; final Reset demo → Guest settings identical to the 09-21 baseline, 10 demo transactions (same notes/amounts), balance 45,000, one unpaid commitment. No JS errors; no legacy wording; no horizontal overflow at 390 px.
  - Balance, Month, Today's entries and Settings sheets (Guest, production) render V2 values; Settings has Reset demo / Switch user / Log out and no Money Plan editor (Guest by design, D23).
  - Money Plan page: verified with the **byte-identical production bundle** (downloaded from Netlify; only `config.js` pointed at the local dev backend) on a DEV profile — Your name, Monthly income, Savings target, Current balance (+ "As of"), commitments with the 58 px Paid/Not-yet-paid toggle, Review with backend preview; cancelled without saving. Not exercised on a private production profile (would need a private sign-in / risk to owner data).
  - MUHAMMED and FRIEND: read-only snapshot before verification vs re-read after → transactions, settings and plan **byte-identical**. (Both profiles did change between 09-21 and 09-24 through the owner's normal use — new/removed transactions, a balance re-set with `current_balance_covered` written by v13, commitment updates — none caused by verification.)
  - Served `app.js`/`styles.css`/`config.js` still match local; ping ok; GET data refused; suite 400/0.
- Observation: production Guest sign-in twice hit the app's 15 s timeout ("Server timed out") before succeeding on retry — Apps Script latency spikes (known, see Architecture/limitations), not a code defect.

## Known untested / weak areas
- Step 8A behaviour is verified only locally with injected faults, not against real production latency (not deployed).
- Pace Period not exercised on a private production profile (Guest only). Native date-picker appearance differs per browser (functional behaviour checked in Chromium only).
- Money Plan editor on a private production profile (verified only with the identical bundle on DEV).
- Real DEV web-app runtime for V2 (only simulated).
- Same-day expense whose date is edited after a balance snapshot; device clock skew.
- Tab left open across local midnight (resolves on next sync).
- Multi-device concurrent edits beyond LockService serialization.
