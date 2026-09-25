/* Step 8C unit checks: contextual check-in evaluator (checkinFor) using the REAL function from frontend/app.js.
 * Usage: node tests/frontend_checkins.js
 */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'frontend', 'app.js'), 'utf8');
const pre = fs.readFileSync(path.join(root, 'backups', 'app.js.pre8c.bak'), 'utf8');
function grabFrom(s, name) {
  const i = s.indexOf('  function ' + name + '(');
  if (i < 0) throw new Error('missing ' + name);
  let depth = 0;
  for (let k = s.indexOf('{', i); k < s.length; k++) {
    if (s[k] === '{') depth++;
    else if (s[k] === '}' && --depth === 0) return s.slice(i, k + 1);
  }
}
const grab = n => grabFrom(src, n);
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? '  PASS  ' : '  FAIL  ') + n); };

const money = n => '₹' + Math.round(Number(n)).toLocaleString('en-IN');
const checkinFor = new Function('money', grab('checkinFor') + '; return checkinFor;')(money);
const T = '2026-09-25';
const V = o => Object.assign({ ready: true, pace_status: 'on_pace', days_remaining_after_today: 5, days_remaining_incl_today: 6, period_end_source: 'month_end', tomorrow_pace: 300, today_pace: 300, remaining_flexible: 1800 }, o || {});
const P = cs => ({ commitments: cs || [] });
const C = (name, amount, status, paid_at) => ({ id: 'cm_' + name, name, amount, status, paid_at: paid_at === undefined ? null : paid_at });

// 1. nothing meaningful -> no note
ok('K-1 ordinary on-pace day, nothing paid today -> no note', checkinFor(V(), P([C('Rent', 16500, 'unpaid')]), T) === null);
ok('K-2 behind / over / below minimum alone -> no note (the status line already says it)', ['behind', 'below_minimum'].every(ps => checkinFor(V({ pace_status: ps, remaining_flexible: -500, today_pace: 0 }), P(), T) === null));
ok('K-3 no state / no plan -> no note', checkinFor(undefined, undefined, T) === null && checkinFor(null, null, T) === null && checkinFor(V(), null, T) === null);
// 2. precedence: not-ready states show no note at all
ok('K-4 PERIOD ENDED / CHECK YOUR DATE / POSITION NEEDED -> no note, even with a commitment paid today', ['period_ended', 'invalid_period', 'needs_position'].every(r => checkinFor({ ready: false, reason: r, pace_status: r, days_remaining_after_today: 0 }, P([C('Rent', 16500, 'paid', T)]), T) === null));
// 3. last day of the Pace period (engine boundary: no "from tomorrow")
const lastCfg = checkinFor(V({ days_remaining_after_today: 0, days_remaining_incl_today: 1, tomorrow_pace: null, period_end_source: 'configured' }), P(), T);
ok('K-5 last day, configured end -> last_day note (tomorrow needs a new end date)', lastCfg && lastCfg.kind === 'last_day' && /last day of this Pace period/.test(lastCfg.text) && /new end date/.test(lastCfg.text));
const lastMon = checkinFor(V({ days_remaining_after_today: 0, days_remaining_incl_today: 1, tomorrow_pace: null, period_end_source: 'month_end' }), P(), T);
ok('K-6 last day, month-end default -> last_day note (continues to the end of next month)', lastMon && lastMon.kind === 'last_day' && /month’s Pace period/.test(lastMon.text) && /end of next month/.test(lastMon.text));
ok('K-7 last day while BEHIND still gets the note (Pace is ready; the status line keeps the deficit)', (checkinFor(V({ pace_status: 'behind', days_remaining_after_today: 0, tomorrow_pace: null }), P(), T) || {}).kind === 'last_day');
ok('K-8 one day before the end -> no note (no invented "N days left" threshold)', checkinFor(V({ days_remaining_after_today: 1, days_remaining_incl_today: 2 }), P(), T) === null);
ok('K-9 missing days field (older cached state) -> no last-day note', checkinFor(V({ days_remaining_after_today: undefined }), P(), T) === null);
// 4. commitment marked paid today
const one = checkinFor(V(), P([C('Rent', 16500, 'paid', T), C('Phone', 500, 'unpaid')]), T);
ok('K-10 one commitment marked paid today -> names it with its amount; factual copy', one && one.kind === 'commitment_paid' && one.text === 'Rent (₹16,500) was marked paid today, so it is no longer set aside in your Pace.');
const two = checkinFor(V(), P([C('Rent', 16500, 'paid', T), C('Phone', 500, 'paid', T)]), T);
ok('K-11 two paid today -> both named', two && two.text === 'Rent (₹16,500) and Phone (₹500) were marked paid today, so they are no longer set aside in your Pace.');
const three = checkinFor(V(), P([C('A', 1, 'paid', T), C('B', 2, 'paid', T), C('C', 3, 'paid', T)]), T);
ok('K-12 three or more -> counted, not listed (no arithmetic on amounts)', three && three.text === '3 commitments were marked paid today, so they are no longer set aside in your Pace.');
ok('K-13 paid on an earlier day -> no note (it was news that day, not every day)', checkinFor(V(), P([C('Rent', 16500, 'paid', '2026-09-24')]), T) === null);
ok('K-14 unpaid (even with a stray paid_at) -> no note', checkinFor(V(), P([C('Rent', 16500, 'unpaid', T)]), T) === null);
ok('K-15 "today" is the device-local day passed in (same data, next day -> no note)', checkinFor(V(), P([C('Rent', 16500, 'paid', T)]), '2026-09-26') === null);
ok('K-16 last day takes precedence over a paid-today commitment (one note at most)', (checkinFor(V({ days_remaining_after_today: 0, tomorrow_pace: null }), P([C('Rent', 16500, 'paid', T)]), T) || {}).kind === 'last_day');
// 5. deterministic, pure, no side effects
const vIn = V(), pIn = P([C('Rent', 16500, 'paid', T)]), snap = JSON.stringify([vIn, pIn]);
const r1 = checkinFor(vIn, pIn, T), r2 = checkinFor(vIn, pIn, T);
ok('K-17 same state -> identical note (reload-stable) and inputs are not mutated', JSON.stringify(r1) === JSON.stringify(r2) && JSON.stringify([vIn, pIn]) === snap);
const body = grab('checkinFor');
ok('K-18 evaluator stores nothing and calls nothing (no storage, no requests, no Date)', !/localStorage|sessionStorage|saveCache|apiPost|apiGet|fetch\(|new Date|Date\.now/.test(body));
ok('K-19 no second Pace engine: evaluator does no arithmetic on Pace figures', !/today_pace|remaining_flexible|tomorrow_pace|effective_balance|protected_money|expenses_/.test(body) && !/[^\w](\+|-|\*|\/)=?\s*(v|c)\.(amount|remaining|today)/.test(body));
// 6. wiring + unchanged rules
const render = grab('render');
ok('K-20 render shows the note with textContent (names are never HTML) and hides it when there is none', /\$\("checkinText"\)\.textContent = ci \? ci\.text : ""/.test(render) && /ciEl\.hidden = !ci/.test(render) && !/checkinText"\)\.innerHTML/.test(src));
ok('K-21 render passes the device-local day (localDayKey), not server/UTC time', /checkinFor\(v, store\.plan, localDayKey\(\)\)/.test(render));
ok('K-22 large-expense rule unchanged (5x today’s pace / 25% of positive flexible; same functions as before 8C)', /LARGE_EXPENSE_PACE_MULTIPLIER = 5;/.test(src) && /LARGE_EXPENSE_REMAINING_RATIO = 0\.25;/.test(src) && grab('isLargeAmount') === grabFrom(pre, 'isLargeAmount') && grab('isLargeExpense') === grabFrom(pre, 'isLargeExpense'));
ok('K-23 optimistic mirror + Today presentation helpers byte-identical to pre-8C', ['computeOptimistic', 'spentVsPace', 'sliderFill', 'greetingText', 'greetingFor', 'saveName', 'reconcile'].every(n => grab(n) === grabFrom(pre, n)));
ok('K-24 render changed only by the check-in lines', render.split('\n').filter(l => !/checkin|ciEl|\bci\b/.test(l)).join('\n') === grabFrom(pre, 'render'));
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
