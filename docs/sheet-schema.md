# Pace - Google Sheet schema

Spreadsheet name: **Pace**. Two tabs.

## Tab: `Settings`

Row 1 is a header: `key | value`. Each following row is one config entry.

| key                    | type   | meaning                                          | seed value  |
| ---------------------- | ------ | ----------------------------------------------- | ----------- |
| monthly_income         | number | take-home income per month (INR)                | 45000       |
| monthly_savings_target | number | amount to keep aside each month (INR)           | 10000       |
| fixed_monthly_expenses | number | rent, bills, subscriptions - known recurring    | 16500       |
| starting_balance       | number | money on hand at `starting_balance_date` (INR)  | 25000       |
| starting_balance_date  | string | ISO date `YYYY-MM-DD` the balance was true      | 2026-09-07  |
| metro_weekday_cost     | number | typical weekday metro spend (reference only)    | 135         |
| weekly_auto_cost       | number | typical weekly auto spend (reference only)      | 60          |

Notes:
- `metro_weekday_cost` and `weekly_auto_cost` are reference figures for now. The
  spending calculation uses actual logged transactions, not these estimates.
- Backend reads values by key, so row order does not matter. Extra keys are ignored.
- Numeric strings are coerced to numbers on read.
- Google Sheets auto-converts the `starting_balance_date` cell to a real date
  value. `calculateState()` normalises it back to `YYYY-MM-DD` with `toIsoDate()`
  before comparing it against transaction dates.

## Tab: `Transactions`

Row 1 is a header: `Date | Amount | Note | Type`. Append-only log.

| column | type   | rule                                                        |
| ------ | ------ | ---------------------------------------------------------- |
| Date   | string | ISO date `YYYY-MM-DD`. Defaults to today if omitted.       |
| Amount | number | positive number, INR. Always positive - `Type` gives sign. |
| Note   | string | free text, e.g. "Metro", "Lunch", "Salary". Optional.      |
| Type   | enum   | `expense` or `income`. Defaults to `expense`.              |

Examples:

| Date       | Amount | Note   | Type    |
| ---------- | ------ | ------ | ------- |
| 2026-09-07 | 45000  | Salary | income  |
| 2026-09-08 | 135    | Metro  | expense |
| 2026-09-08 | 220    | Lunch  | expense |
| 2026-09-09 | 60     | Auto   | expense |

## Derived (not stored)

The backend computes these on the fly in `calculateState()`; nothing is written back:

- `discretionary_monthly` = income - savings_target - fixed_expenses (seed: 45000 - 10000 - 16500 = **18500**)
- `period` = `starting_balance_date` (or 1st of month, whichever is later) through month end; pace elapses from the start date
- `discretionary_period` = discretionary_monthly x period_days / days_in_month
- `daily_allowance` = discretionary_period / period_days
- planned spending folds in `metro_weekday_cost` (per weekday) and `weekly_auto_cost` (per week, pro-rata); the rest is the even variable daily budget
- `expected_spend_to_date` = metro so far + auto so far + variable so far, over `days_elapsed`
- `actual_spend_to_date` = sum of this month's `expense` transactions
- `pace` = actual - expected (positive => spending too fast)
- `remaining_discretionary` = discretionary_period - actual_spend_to_date
- `current_balance` = starting_balance + income_since_start - expense_since_start
