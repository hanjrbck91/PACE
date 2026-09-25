# Pace - Apps Script API

The backend is one Apps Script web app bound to the **Pace** spreadsheet. The
frontend (built later) talks to it with `fetch()` against the deployment URL:

```
https://script.google.com/macros/s/DEPLOY_ID/exec
```

All responses are JSON: `{ ok: true, action, data }` on success, or
`{ ok: false, error }` on failure.

## GET

`GET <url>?action=<action>`

| action         | returns                                                        |
| -------------- | ------------------------------------------------------------- |
| `settings`     | Settings object (keys from the `Settings` tab)                |
| `transactions` | array of `{ row, date, amount, note, type }`, newest first    |
| `state`        | `calculateState()` snapshot (see below)                       |
| `ping`         | `{ ok: true }`                                                |
| _(none)_ / `all` | `{ settings, transactions, state }`                         |

### `state` snapshot fields

Pace is **dynamic**: every state recomputes "how much can I spend per remaining
day and still hit my savings target?" as money is spent. Flat model (no
weekday weighting yet).

| field                          | meaning                                                  |
| ------------------------------ | ------------------------------------------------------- |
| `as_of`                        | date the snapshot was computed (`YYYY-MM-DD`)           |
| `discretionary_monthly`        | income - savings_target - fixed_expenses (full month)   |
| `total_spendable`              | discretionary_monthly * period_days / days_in_month — money for the whole period, savings protected |
| `initial_daily_pace`           | total_spendable / period_days (the day-1 pace)          |
| `daily_allowance`              | == `today_pace` (kept name for the frontend)            |
| `today_pace`                   | (total_spendable − expenses **before** today) / days_remaining_incl_today. The line today is judged against; today's own spend does NOT move it |
| `spent_today`                  | sum of today's `expense` transactions                   |
| `expected_today`               | == `today_pace`                                         |
| `today_variance`               | spent_today − today_pace (positive = over today)        |
| `remaining_spendable`          | total_spendable − expenses **through** today (may be negative) |
| `remaining_pace`               | max(remaining_spendable, 0) / days_remaining_after_today — pace from tomorrow. 0 on the last day / when the budget is gone |
| `remaining_discretionary`      | alias of `remaining_spendable` (back-compat)            |
| `safe_daily_for_rest_of_month` | alias of `remaining_pace` (back-compat)                 |
| `expected_spend_to_date`       | initial_daily_pace * days_elapsed (straight-line month view) |
| `actual_spend_to_date`         | sum of the period's `expense` transactions              |
| `income_this_month`            | sum of this month's `income` transactions               |
| `pace`                         | actual_spend_to_date − expected_spend_to_date (month view; + = ahead) |
| `status`                       | `over` \| `under` \| `on_track` — `spent_today` vs `today_pace` at FULL precision, with tolerance `eps = max(0.5, today_pace*0.005)`; `over` if the period budget is exhausted |
| `current_balance`              | starting_balance + income_since_start - expense_since_start |
| `month`                        | `{ key, day_of_month, days_in_month, days_in_period, days_elapsed, days_remaining, days_remaining_incl_today, days_left }` |
| `transaction_count`            | total rows in `Transactions`                            |

`month`: `days_in_period` = period length; `days_remaining` = days **after**
today; `days_remaining_incl_today` = includes today; `days_left` = alias of
`days_remaining`. `inputs` also carries `fixed_expenses` (alias of
`fixed_monthly_expenses`).

Invariant: `today_pace(day N) == remaining_pace(day N-1)` — the line you're
judged against today is exactly yesterday's forward pace. Overspend is counted
once; paces never go negative; no NaN/Infinity. Values round to 2 dp for output;
comparisons use full precision.

The "period" is `starting_balance_date` (or the 1st of the month, whichever is
later) through the month end; pace elapses from the start date, not the 1st.

This snapshot is the whole answer to "Am I spending too much?": check `status`
and `today_variance`, show `today_pace`, `remaining_pace`,
`remaining_spendable`, `current_balance`.

## POST

`POST <url>` with a JSON body. Send as `text/plain` to avoid a CORS preflight
(Apps Script still reads `e.postData.contents`).

```json
{
  "action": "addTransaction",
  "transaction": { "amount": 220, "note": "Lunch", "type": "expense", "date": "2026-09-08" }
}
```

- `amount` - required, positive number
- `type` - `expense` (default) or `income`
- `note` - optional
- `date` - optional `YYYY-MM-DD`, defaults to today

Response `data`: `{ transaction: <created>, state: <fresh calculateState()> }`,
so the frontend can log and refresh in one call.

## Frontend call pattern (next step)

```js
const API = 'https://script.google.com/macros/s/DEPLOY_ID/exec';

async function getState() {
  const r = await fetch(`${API}?action=state`);
  return (await r.json()).data;
}

async function addExpense(amount, note) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'addTransaction', transaction: { amount, note, type: 'expense' } }),
  });
  return (await r.json()).data;
}
```
