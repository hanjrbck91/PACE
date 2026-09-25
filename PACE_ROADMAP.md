# Pace — Roadmap

> Direction, not commitments. Nothing here is approved for implementation until the owner says so for a specific task. Check `PACE_DECISIONS.md` for conflicts first.

## NOW
- **Observe real-user behavior and collect feedback** (V2, Pace Period and Steps 8A–8C live since 2026-09-25).

## NEXT (candidates, need an explicit product decision)
- **Profile / multi-user improvements** (adding users beyond MUHAMMED/FRIEND; today provisioned by hand in `USERS`).
- **Greeting** refinements.
- **Review** (looking back at a period).
- **Help / explainability** ("What is Pace?", contextual help).
- Small fix noted in Step 7: Guest reset writing `current_balance_date` as text (backend). (The false "Not recorded" issue is addressed by Step 8A, local.)

## LATER
- Additional users (beyond MUHAMMED/FRIEND; today users are provisioned by hand in `USERS`).
- Profile management beyond the Settings → Profile name editor (Step 8B).
- Further check-in kinds only with a product rule behind them (e.g. what counts as "significantly ahead"); never engagement messages (D2a).
- Pace Review (looking back at a period).
- Historical Pace visualization (must respect D3 — no dashboard drift).
- UI to set `minimum_daily_spend` (engine already supports it).
- Backend-synced currency choice.

## IDEAS / UNDECIDED (parked)
- Savings recovery over later months (never auto-raise the target).
- Emergency fund.
- PWA (manifest, service worker).
- Per-transaction timestamps (would refine the balance snapshot).
- Transaction/commitment matching (UPI/bank) — only through a separate matching layer that flips commitment status.
- Manual timezone, Undo stack, date editing, real OAuth/DB backend — only if the user base outgrows the MVP.

## Done (for orientation)
Contextual check-ins — last day of the Pace period + commitment paid today (Step 8C, live since 2026-09-25).
Name editing in Settings (Step 8B, live since 2026-09-25).
Pace Period (7.1 foundation + 7.2 user-facing) and Guest parity — live in production since 2026-09-24 (Step 7).
Time-based greeting and editable `display_name` shipped in Step 5.8 (now in production).
