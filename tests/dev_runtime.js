/* REAL Apps Script runtime tests for the multi-user backend (DEV deployment only).
 * Usage:  DEV_URL=https://script.google.com/macros/s/.../exec node tests/dev_runtime.js
 * Refuses to run against the production /exec URL. All test writes are cleaned up.
 * Requires the DEV access codes (scratchpad dev_codes.json) to be set in DEV USERS!B2:B3 (hashes).
 */
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const URL_ = process.env.DEV_URL || '';
const PROD_ID = 'AKfycbyqiCAj5RkKx40UZ29F_yOHuNdG8asOiol7KSQ8szG2ztxoE4xLXFz792_NH_UitK6Zbg';
if (!URL_ || URL_.includes(PROD_ID)) { console.error('Set DEV_URL to the DEV deployment (NOT production).'); process.exit(2); }
const SC = process.env.PACE_SCRATCH || path.join(process.env.LOCALAPPDATA || '', 'Temp', 'claude', 'D--My-Tools-Notepad-Win-Pace', 'da72ffa1-0485-457c-ba4a-7530bb7beeaa', 'scratchpad');
const CODES = JSON.parse(fs.readFileSync(path.join(SC, 'dev_codes.json'), 'utf8')).codes;
const root = path.join(__dirname, '..');
const bkf = fs.readdirSync(path.join(root, 'backups')).filter(f => f.startsWith('pre_multiuser_all_')).sort().pop();
const BACKUP = JSON.parse(fs.readFileSync(path.join(root, 'backups', bkf), 'utf8')).data;
const pad = n => (n < 10 ? '0' : '') + n; const d0 = new Date();
const TODAY = d0.getFullYear() + '-' + pad(d0.getMonth() + 1) + '-' + pad(d0.getDate());

async function post(body) {
  const r = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { return { ok: false, error: 'NON-JSON: ' + t.slice(0, 120) }; }
}
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (x ? '  -> ' + JSON.stringify(x).slice(0, 900) : '')); } };
const canon = tx => tx.map(t => [t.date, String(Number(t.amount)), t.note, t.type, t.transaction_id].join('|')).sort();
const all = async tok => { const r = await post({ action: 'all', token: tok, today: TODAY }); return r; };

(async () => {
  console.log('DEV runtime tests against ' + URL_.slice(0, 60) + '...\n');
  const ping = await (await fetch(URL_ + '?action=ping')).json();
  ok('web app reachable (GET ping)', ping.ok === true);
  ok('GET all denied (no data over GET)', (await (await fetch(URL_ + '?action=all')).json()).error === 'unauthorized');

  console.log('\n== A/B/C  logins + isolated reads ==');
  const lm = await post({ action: 'login', profile: 'MUHAMMED', code: CODES.MUHAMMED });
  const lf = await post({ action: 'login', profile: 'FRIEND', code: CODES.FRIEND });
  const lg = await post({ action: 'guest' });
  ok('A. Muhammed login -> signed session token', lm.ok && /^[\w=-]+\.[\w=-]+$/.test(lm.data.token) && lm.data.user === 'MUHAMMED', lm);
  ok('B. Friend login -> session', lf.ok && lf.data.user === 'FRIEND', lf);
  ok('C. Guest session (no code)', lg.ok && lg.data.user === 'GUEST' && lg.data.mode === 'guest', lg);
  if (!lm.ok || !lf.ok || !lg.ok) { console.log('\nLogin setup failed - aborting (are the DEV hashes in USERS!B2:B3?)'); process.exit(1); }
  const TM = lm.data.token, TF = lf.data.token, TG = lg.data.token;
  const aM = await all(TM), aF = await all(TF), aG = await all(TG);
  ok('A. Muhammed sees TX_MUH data: ' + (aM.ok && aM.data.transactions.length) + ' rows', aM.ok && aM.data.transactions.length === BACKUP.transactions.length && aM.data.user.key === 'MUHAMMED');
  ok('A. Muhammed rows identical to backup (ids, dates, amounts, notes, types)', aM.ok && JSON.stringify(canon(aM.data.transactions)) === JSON.stringify(canon(BACKUP.transactions)));
  ok('A. Muhammed settings identical to backup', aM.ok && Object.keys(BACKUP.settings).every(k => k === 'starting_balance_date' || aM.data.settings[k] === BACKUP.settings[k]), aM.ok && aM.data.settings);
  ok('B. Friend sees only friend data (0 rows, own default settings)', aF.ok && aF.data.transactions.length === 0 && aF.data.settings.monthly_income === 30000);
  ok('C. Guest sees only demo data', aG.ok && aG.data.transactions.length > 0 && aG.data.user.key === 'GUEST' && !JSON.stringify(aG).includes(BACKUP.transactions[0].transaction_id));
  ok('   guest demo has none of Muhammed\'s ids or notes', aG.ok && !aG.data.transactions.some(t => BACKUP.transactions.some(b => b.transaction_id === t.transaction_id)));

  console.log('\n== D/E/F  bad credentials ==');
  ok('D. invalid access code rejected', (await post({ action: 'login', profile: 'FRIEND', code: 'not-the-code' })).error === 'invalid access code');
  ok('D. Muhammed\'s code does not open Friend', !(await post({ action: 'login', profile: 'FRIEND', code: CODES.MUHAMMED })).ok);
  const [pay, sig] = TF.split('.');
  const forged = Buffer.from(JSON.stringify({ u: 'MUHAMMED', e: 9999999999 })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  ok('E. forged token (Friend sig on Muhammed payload) rejected', (await all(forged + '.' + sig)).error === 'unauthorized');
  ok('E. token with tampered signature rejected', (await all(pay + '.' + sig.slice(0, -3) + 'AAA')).error === 'unauthorized');
  ok('E. unsigned / garbage / missing token rejected', (await all(forged + '.')).error === 'unauthorized' && (await all('abc.def')).error === 'unauthorized' && (await post({ action: 'all', today: TODAY })).error === 'unauthorized');
  const expiredPayload = Buffer.from(JSON.stringify({ u: 'FRIEND', e: 1 })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  ok('F. token claiming an expired time (past `e`) rejected [note: cannot mint a *validly signed* expired token without the secret - expiry logic itself covered by the simulation]', (await all(expiredPayload + '.' + sig)).error === 'unauthorized');

  console.log('\n== G/H  cross-user transaction ids ==');
  const mId = aM.data.transactions[0].transaction_id;
  const snapM = JSON.stringify(canon((await all(TM)).data.transactions));
  const fdel = await post({ action: 'deleteTransaction', token: TF, today: TODAY, transaction: { transaction_id: mId } });
  const fupd = await post({ action: 'updateTransaction', token: TF, today: TODAY, transaction: { transaction_id: mId, amount: 1, note: 'HACK' } });
  ok('G. Friend delete of Muhammed id -> not found / no effect', fdel.ok && fdel.data.already_absent === true, fdel);
  ok('G. Friend edit of Muhammed id -> rejected', !fupd.ok && /not found/.test(fupd.error), fupd);
  ok('G. Muhammed data unchanged after Friend attempts', JSON.stringify(canon((await all(TM)).data.transactions)) === snapM);
  ok('G. Guest cannot touch Muhammed id', (await post({ action: 'deleteTransaction', token: TG, transaction: { transaction_id: mId } })).data.already_absent === true && !(await post({ action: 'updateTransaction', token: TG, transaction: { transaction_id: mId, amount: 1 } })).ok);

  console.log('\n== I/J/K  writes land only in the caller\'s tab ==');
  const cnt = async () => ({ m: (await all(TM)).data.transactions.length, f: (await all(TF)).data.transactions.length, g: (await all(TG)).data.transactions.length });
  const base = await cnt();
  const fAdd = await post({ action: 'addTransaction', token: TF, today: TODAY, transaction: { amount: 11, note: 'RT_FRIEND', type: 'expense', client_id: 'rt_f_' + Date.now(), date: TODAY } });
  let c1 = await cnt();
  ok('I. Friend add -> only TX_FRIEND (+1), Muhammed & Guest unchanged', fAdd.ok && c1.f === base.f + 1 && c1.m === base.m && c1.g === base.g, { base, c1 });
  ok('   friend tx has transaction_id and stamped date', !!fAdd.data.transaction.transaction_id && fAdd.data.transaction.date === TODAY);
  const mAdd = await post({ action: 'addTransaction', token: TM, today: TODAY, transaction: { amount: 22, note: 'RT_MUH', type: 'expense', client_id: 'rt_m_' + Date.now(), date: TODAY } });
  let c2 = await cnt();
  ok('J. Muhammed add -> only TX_MUH (+1), Friend & Guest unchanged', mAdd.ok && c2.m === c1.m + 1 && c2.f === c1.f && c2.g === c1.g, { c1, c2 });
  const gAdd = await post({ action: 'addTransaction', token: TG, today: TODAY, transaction: { amount: 33, note: 'RT_GUEST', type: 'expense', client_id: 'rt_g_' + Date.now(), date: TODAY } });
  let c3 = await cnt();
  ok('K. Guest add -> only TX_GUEST (+1), Muhammed & Friend unchanged', gAdd.ok && c3.g === c2.g + 1 && c3.m === c2.m && c3.f === c2.f, { c2, c3 });
  const cid = 'idem_' + Date.now();
  const i1 = await post({ action: 'addTransaction', token: TF, today: TODAY, transaction: { amount: 5, note: 'RT_IDEM', type: 'expense', client_id: cid } });
  const i2 = await post({ action: 'addTransaction', token: TF, today: TODAY, transaction: { amount: 5, note: 'RT_IDEM', type: 'expense', client_id: cid } });
  ok('   idempotent add: same client_id twice -> same id, duplicate flag, one row', i1.ok && i2.ok && i2.data.transaction.duplicate === true && i2.data.transaction.transaction_id === i1.data.transaction.transaction_id);

  console.log('\n== L  edit / delete / undo isolation ==');
  const fId = fAdd.data.transaction.transaction_id, mNew = mAdd.data.transaction.transaction_id, gId = gAdd.data.transaction.transaction_id;
  ok('L. Muhammed cannot edit/delete Friend tx', !(await post({ action: 'updateTransaction', token: TM, transaction: { transaction_id: fId, amount: 1 } })).ok && (await post({ action: 'deleteTransaction', token: TM, transaction: { transaction_id: fId } })).data.already_absent === true);
  ok('L. Friend cannot edit/delete Guest tx', !(await post({ action: 'updateTransaction', token: TF, transaction: { transaction_id: gId, amount: 1 } })).ok && (await post({ action: 'deleteTransaction', token: TF, transaction: { transaction_id: gId } })).data.already_absent === true);
  ok('L. Guest cannot edit/delete Friend tx', !(await post({ action: 'updateTransaction', token: TG, transaction: { transaction_id: fId, amount: 1 } })).ok && (await post({ action: 'deleteTransaction', token: TG, transaction: { transaction_id: fId } })).data.already_absent === true);
  const stillF = (await all(TF)).data.transactions.find(t => t.transaction_id === fId);
  ok('L. Friend tx untouched by the cross-user attempts', stillF && stillF.amount === 11 && stillF.note === 'RT_FRIEND');
  const ed = await post({ action: 'updateTransaction', token: TM, today: TODAY, transaction: { transaction_id: mNew, amount: 44, note: 'RT_MUH_EDIT' } });
  ok('L. own edit works (same id, new amount+note)', ed.ok && ed.data.transaction.transaction_id === mNew && ed.data.transaction.amount === 44 && ed.data.transaction.note === 'RT_MUH_EDIT');

  console.log('\n== M  calculateState identical to v8 logic on the same data ==');
  // clean Muhammed's test row first so the data == migrated data
  const clean = await post({ action: 'deleteTransaction', token: TM, today: TODAY, transaction: { transaction_id: mNew } });
  const stateReal = (await all(TM)).data.state;
  const ctxSim = { console, Date, Math, JSON, String, Number, Object, Array, isNaN, isFinite, parseInt, RegExp, Error, Session: { getScriptTimeZone: () => 'Asia/Kolkata' }, Utilities: { formatDate: d => { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); } } };
  vm.createContext(ctxSim);
  vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', 'Code.gs.v8.bak'), 'utf8'), ctxSim);
  ctxSim.readSettings = () => Object.assign({}, BACKUP.settings, { starting_balance_date: '2026-09-07' }); // sheet cell value; backup JSON has it as 2026-09-06T18:30Z (= Sep 7 IST)
  ctxSim.readTransactions = () => BACKUP.transactions.map(t => ({ date: t.date, amount: Number(t.amount), note: t.note, type: t.type }));
  const stateV8 = ctxSim.calculateState(TODAY);
  const keys = Object.keys(stateV8).filter(k => k !== 'transaction_count');
  const diffs = keys.filter(k => JSON.stringify(stateV8[k]) !== JSON.stringify(stateReal[k]));
  ok('M. real-runtime state == v8 logic on the same rows (' + keys.length + ' fields)', diffs.length === 0, { diffs: diffs.map(k => k + ': v8=' + JSON.stringify(stateV8[k]) + ' real=' + JSON.stringify(stateReal[k])) });

  console.log('\n== Cleanup (restore DEV to its pre-test state) ==');
  for (const [tok, id] of [[TF, fId], [TG, gId]]) await post({ action: 'deleteTransaction', token: tok, transaction: { transaction_id: id } });
  for (const r of [i1]) if (r.ok) await post({ action: 'deleteTransaction', token: TF, transaction: { transaction_id: r.data.transaction.transaction_id } });
  const guestReset = await post({ action: 'resetGuest', token: TG, today: TODAY });
  ok('resetGuest works for guest, denied for others', guestReset.ok && (await post({ action: 'resetGuest', token: TM })).error === 'unauthorized' && (await post({ action: 'resetGuest', token: TF })).error === 'unauthorized');
  const fin = await cnt();
  ok('final counts: Muhammed=' + BACKUP.transactions.length + ', Friend=0', fin.m === BACKUP.transactions.length && fin.f === 0, fin);
  ok('Muhammed data identical to backup after all tests', JSON.stringify(canon((await all(TM)).data.transactions)) === JSON.stringify(canon(BACKUP.transactions)));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('runner error', e); process.exit(3); });
