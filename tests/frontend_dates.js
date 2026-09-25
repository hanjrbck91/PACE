/* Unit checks for the frontend's local-calendar date helpers used by the Pace Period UI (Step 7.2).
 * Extracts the real functions from frontend/app.js (no copy) and runs them in Node.  Usage: node tests/frontend_dates.js
 */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app.js'), 'utf8');
function grab(name) {
  const i = src.indexOf('  function ' + name + '(');
  if (i < 0) throw new Error('missing ' + name);
  let depth = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1);
  }
}
const f = new Function(grab('fmtDate') + grab('monthEndKey') + grab('shortDate') + '; return { fmtDate, monthEndKey, shortDate };')();
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? '  PASS  ' : '  FAIL  ') + n); };
[['2026-09-24', '2026-09-30'], ['2026-09-30', '2026-09-30'], ['2026-12-20', '2026-12-31'], ['2027-01-01', '2027-01-31'],
 ['2028-02-10', '2028-02-29'], ['2027-02-10', '2027-02-28'], ['2100-02-01', '2100-02-28'], ['2000-02-01', '2000-02-29'], ['2026-04-15', '2026-04-30']]
  .forEach(([a, b]) => ok('monthEndKey ' + a + ' -> ' + b, f.monthEndKey(a) === b));
ok('fmtDate leap day', f.fmtDate('2028-02-29') === 'Feb 29, 2028');
ok('fmtDate year boundary', f.fmtDate('2027-01-05') === 'Jan 5, 2027');
ok('shortDate drops the year', f.shortDate('2026-10-05') === 'Oct 5');
ok('no toISOString in the Pace Period helpers', !/toISOString/.test(grab('monthEndKey') + grab('periodField')));
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
