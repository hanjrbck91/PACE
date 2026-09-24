# Pace

A tiny personal finance experiment. One question: **"Am I spending too much?"**

This is a one-hour personal MVP. Boring, understandable code over clever architecture.

## Stack

- **Database:** Google Sheets (two tabs)
- **Backend/API:** Google Apps Script (bound to the sheet), exposed as a web app via `doGet` / `doPost`
- **Frontend:** HTML + CSS + vanilla JS (`frontend/`)

No React, no Node, no external DB, no auth, no bank integrations, no charts.

## Project layout

```
Pace/
  README.md
  apps-script/
    Code.gs            backend: settings, transactions, financial state, HTTP API
    appsscript.json    Apps Script manifest (timezone, web app config)
  frontend/
    index.html         the single instrument screen
    styles.css         the "strip-gauge" visual language
    app.js             fetch state, draw the meter, log expenses, bottom sheets
    config.js          <-- paste your /exec URL here
  docs/
    sheet-schema.md    the Google Sheet structure
    api.md             endpoint reference + how the frontend calls it
```

## Google Sheet structure

Two tabs. See [docs/sheet-schema.md](docs/sheet-schema.md) for details.

### `Settings` (key / value)

| key                     | value        |
| ----------------------- | ------------ |
| monthly_income          | 45000        |
| monthly_savings_target  | 10000        |
| fixed_monthly_expenses  | 16500        |
| starting_balance        | 25000        |
| starting_balance_date   | 2026-09-07   |
| metro_weekday_cost      | 135          |
| weekly_auto_cost        | 60           |

### `Transactions`

| Date       | Amount | Note        | Type    |
| ---------- | ------ | ----------- | ------- |
| 2026-09-07 | 135    | Metro       | expense |
| 2026-09-07 | 45000  | Salary      | income  |

`Type` is `expense` or `income`. Food and everything variable is just an `expense` row.

## Manual setup (do this once)

1. Create a new Google Sheet. Name it **Pace**.
2. **Extensions -> Apps Script**. Delete the default `Code.gs` contents.
3. Paste the contents of [apps-script/Code.gs](apps-script/Code.gs).
4. (Optional) In project settings, show `appsscript.json` and paste [apps-script/appsscript.json](apps-script/appsscript.json). Adjust `timeZone` if you are not in `Asia/Kolkata`.
5. In the editor, select the function `setupSheet` and click **Run**. Approve the permission prompt. This creates both tabs, headers, and seeds the Settings values above.
6. Check the Sheet: `Settings` and `Transactions` tabs should now exist and be populated.
7. **Deploy -> New deployment -> Web app.**
   - Execute as: **Me**
   - Who has access: **Anyone** (there is no auth in this MVP; keep the URL private)
   - Copy the **Web app URL** (`https://script.google.com/macros/s/DEPLOY_ID/exec`).
8. Save that URL. The frontend will use it in the next step.

To change financial inputs later, edit the `Settings` tab directly. Re-running `setupSheet` resets Settings to the seeds.

## API quick check

After deploying, open in a browser:

```
https://script.google.com/macros/s/DEPLOY_ID/exec?action=state
```

You should get a JSON snapshot. Full endpoint list: [docs/api.md](docs/api.md).

## Frontend

One screen: `frontend/index.html`. Concept: a **printed pocket ledger / paper
tide-gauge**. Warm ruled ledger stock, ink, one rust accent. The screen answers
"am I on pace?" first — a printed verdict word (UNDER / ON / OVER PACE) set in
a serif display face, over a **depleting budget tube**: an ink column fills
toward a printed "today's line" redline (the daily allowance) and spills red
past it once today's spend crosses the line — empty tube means a fresh day.
Status first, the ₹/day pace second, today's accounting third. Over-pace prints
in red ink; no dark cards, no pills, no gradients, no shadows.

Everything secondary lives behind three text controls + one icon in the
masthead (month · balance · today · settings), plus a full-width "Log an
expense" button. Each opens a bottom sheet on the same surface — no navigation.

1. `frontend/config.js` holds `PACE_API_URL` — the deployed Web app `/exec` URL.
   Already filled in for the live deployment.
2. Open `frontend/index.html` in a browser. Any static host works too
   (GitHub Pages, Netlify drop, `python -m http.server` in `frontend/`).
3. On open it makes ONE `GET ?action=all`. Logging an expense makes ONE
   `POST` — the response already carries `{ transaction, state }`, which are
   applied directly (no follow-up transactions GET). Body is sent as
   `text/plain` to avoid a CORS preflight; Apps Script 302-redirects `/exec`
   to a `googleusercontent.com` URL that returns JSON with
   `Access-Control-Allow-Origin: *`. Every financial number comes from backend
   state; the frontend only sums today's expense rows for "spent today".

No build step. No dependencies. System fonts only (Georgia display + monospace).

## Deployment (done 2026-09-07)

- Bound Apps Script project lives in the **Pace** sheet: Extensions > Apps Script.
- Web app deployment: execute as owner, access "Anyone". Redeploy after any
  `Code.gs` change via Deploy > Manage deployments > edit > Version: New version.
- Verified end to end: `?action=ping|state|transactions`, plus a real expense
  logged from the frontend form appeared in the `Transactions` tab and the UI
  updated with the returned state (no page reload).
