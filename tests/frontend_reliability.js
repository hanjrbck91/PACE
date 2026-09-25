/* Step 8A unit checks for the frontend reliability helpers, using the REAL functions extracted from frontend/app.js.
 * Usage: node tests/frontend_reliability.js
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
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? '  PASS  ' : '  FAIL  ') + n); };

// ---- greeting boundaries (device-local hour) ----
const greetingFor = new Function(grab('greetingFor') + '; return greetingFor;')();
[[0, 'Good morning'], [11, 'Good morning'], [12, 'Good afternoon'], [17, 'Good afternoon'], [18, 'Good evening'], [23, 'Good evening']]
  .forEach(([h, g]) => ok('greeting ' + String(h).padStart(2, '0') + ':00-' + String(h).padStart(2, '0') + ':59 -> ' + g, greetingFor(h) === g));
[[11,59,'Good morning'],[12,0,'Good afternoon'],[17,59,'Good afternoon'],[18,0,'Good evening'],[23,59,'Good evening'],[0,0,'Good morning']].forEach(([h,mi,g])=>ok('local clock '+String(h).padStart(2,'0')+':'+String(mi).padStart(2,'0')+' -> '+g, greetingFor(new Date(2026,8,25,h,mi).getHours())===g));
  ok('greetingText uses the device clock (new Date().getHours()), not UTC/server time', /greetingFor\(new Date\(\)\.getHours\(\)\)/.test(grab('greetingText')) && !/getUTCHours|toISOString/.test(grab('greetingText') + grab('greetingFor')));

// ---- readJson: success / business error / odd replies ----
const mk = new Function('var session = null; function onAuthLost() {};' + grab('humanError') + grab('readJson') + grab('outcomeUnknown') + '; return { readJson: readJson, outcomeUnknown: outcomeUnknown };')();
const res = t => ({ text: () => Promise.resolve(t) });
(async () => {
  const good = await mk.readJson(res(JSON.stringify({ ok: true, action: 'addTransaction', data: { transaction: { transaction_id: 'x' } } })), 'addTransaction');
  ok('matching reply returns its data', good.transaction.transaction_id === 'x');
  const errOf = async (p) => { try { await p; return null; } catch (e) { return e; } };
  const echo = await errOf(mk.readJson(res(JSON.stringify({ ok: true, action: 'ping', data: { ok: true } })), 'addTransaction'));
  ok('a ping reply to a POST is NOT treated as success', !!echo);
  ok('... and counts as outcome-unknown (transient), never a definite failure', echo && mk.outcomeUnknown(echo) === true);
  const html = await errOf(mk.readJson(res('<!DOCTYPE html><html>error</html>'), 'all'));
  ok('an HTML error page is outcome-unknown', html && mk.outcomeUnknown(html));
  const biz = await errOf(mk.readJson(res(JSON.stringify({ ok: false, error: 'amount must be a positive number' })), 'addTransaction'));
  ok('a server business error is a definite failure (not unknown)', biz && biz.business === true && mk.outcomeUnknown(biz) === false);
  const timeout = new Error('Request timed out'); timeout.timeout = true;
  ok('a timeout is outcome-unknown', mk.outcomeUnknown(timeout) === true);

  // ---- retry / duplicate safety (static checks on the real source) ----
  ok('request timeout is 30 s (measured Apps Script latency up to ~31.6 s cold)', /var REQ_TIMEOUT_MS = 30000;/.test(src));
  const post1 = grab('apiPost1');
  ok('writes are retried at most ONCE and only when they carry a client_id (backend dedups it)', /hasId && isTransient\(err\)\) return apiPostOnce\(payload\)/.test(post1) && (post1.match(/apiPostOnce\(/g) || []).length === 2);
  ok('addTransaction always carries a client_id', /action: "addTransaction", transaction: \{[^}]*client_id: newClientId\(\)/.test(src));
  ok('an unknown-outcome add is never re-sent by the client: it only READS (reconcile) and never says "Not recorded" without a server answer',
    /Outcome unknown[\s\S]{0,1200}return reconcile\(\)/.test(src) && !/Not recorded\.\"\);\n      \}\)/.test(src));
  ok('reconcile() is read-only (apiGet "all" only)', /apiGet\("all"\)/.test(grab('reconcile')) && !/apiPost/.test(grab('reconcile')));
  ok('first load shows an explicit loading note when there is no cache', /if \(!cached\) setLoading\(true\)/.test(src) && /setLoading\(false\)/.test(grab('fatal')));
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
