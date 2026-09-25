/* Step 8A browser checks: loading state + unknown-outcome writes. Runs INSIDE the app page served against the LOCAL
 * dev backend (tests/dev_server.js) — never production. Inject next to the served frontend, then:
 *   await PaceRel.run('<scenario>')
 * A fetch fault-injector (window.__faults) simulates what Apps Script does in real life:
 *   lost:   forward the request to the server, then drop the reply (the write lands, the client sees a network error)
 *   echo:   forward the request, then answer with the GET/ping reply (seen in production on 2026-09-24)
 *   drop:   never forward (the write does NOT land), fail with a network error
 *   delay:  add latency (ms) before the reply
 * Each fault is keyed by action and counts down per request.
 */
(function () {
  var realFetch = window.fetch.bind(window);
  window.__faults = {}; window.__posts = [];
  try { window.__faults = JSON.parse(localStorage.getItem('pace_test_faults') || '{}'); localStorage.removeItem('pace_test_faults'); } catch (e) {}   // faults for the first load (set before a reload)
  window.fetch = function (url, opts) {
    var body = {}; try { body = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
    var a = body.action || '', f = window.__faults[a] || {};
    window.__posts.push({ action: a, client_id: body.client_id || (body.transaction && body.transaction.client_id) || null, t: Date.now() });
    var take = function (k) { if (f[k] > 0) { f[k]--; return true; } return false; };
    var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    if (take('drop')) return wait(50).then(function () { throw new TypeError('Failed to fetch'); });
    var lost = take('lost'), echo = take('echo'), delay = f.delay || 0;
    return realFetch(url, opts).then(function (res) {
      return wait(delay).then(function () {
        if (lost) throw new TypeError('Failed to fetch');
        if (echo) return new Response(JSON.stringify({ ok: true, action: 'ping', data: { ok: true } }), { status: 200 });
        return res;
      });
    });
  };
  var w = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var $ = function (id) { return document.getElementById(id); };
  var T = function () { return $('app').innerText; };
  var until = async function (fn, ms) { for (var i = 0; i < (ms || 15000) / 200; i++) { try { if (fn()) return true; } catch (e) {} await w(200); } return false; };
  var set = function (el, v) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  var btn = function (root, t) { return Array.prototype.find.call(root.querySelectorAll('button'), function (b) { return b.offsetParent && b.textContent.trim() === t; }); };
  var note = function () { var n = $('logNote'); return n ? n.textContent : ''; };
  var session = function () { var k = Object.keys(localStorage).find(function (x) { return x.indexOf('pace_session_') === 0; }); return k ? JSON.parse(localStorage.getItem(k)) : null; };
  var serverAll = async function () { var s = session(); var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; var r = await realFetch(window.PACE_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'all', token: s.token, today: d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) }) }); return (await r.json()).data; };
  var addExpense = async function (amt, note_) { $('add').click(); await w(300); set($('amountInput'), String(amt)); set($('noteInput'), note_); btn(document, 'Log expense').click(); };

  var clearNote = function () { var n = $('logNote'); if (n) n.textContent = ''; };
  var S = {};
  // First load (fresh session, no cache): the loading note is visible at once and replaced by real data.
  S.loading = async function (ok) {
    await until(function () { return !$('app').hidden; }, 5000);
    var t0 = performance.now(); var seen = !$('loadNote').hidden && /Loading your Pace/.test($('loadNote').textContent);
    ok('R1 "Loading your Pace…" visible immediately while the first read is in flight (' + Math.round(performance.now() - t0) + ' ms)', seen);
    ok('R1b no numbers are invented while loading (pace shows —)', /—/.test($('todayPace').textContent));
    var got = await until(function () { return /₹/.test($('todayPace').textContent); }, 20000);
    ok('R2 note disappears when the data arrives; real Pace shown', got && $('loadNote').hidden);
  };
  S.loadingSlow = async function (ok) {
    var got = await until(function () { return /Still loading/.test($('loadNote').textContent); }, 12000);
    ok('R3 after ~8 s the note says the server is slow (no fake progress)', got && !$('loadNote').hidden);
    await until(function () { return /₹/.test($('todayPace').textContent); }, 30000);
    ok('R3b slow load still completes and clears the note', $('loadNote').hidden);
  };
  S.loadingFail = async function (ok) {
    var got = await until(function () { return !$('err').hidden; }, 20000);
    ok('R4 first load that genuinely fails: note cleared, error shown', got && $('loadNote').hidden && /reach|timed out|Unexpected/i.test($('err').textContent));
  };
  // Add expense whose replies are lost although the server saved it (both the request and its one retry).
  S.addLost = async function (ok) {
    clearNote(); var before = (await serverAll()).transactions.length; window.__posts = [];
    window.__faults.addTransaction = { lost: 2 };
    await addExpense(111, 'rel lost');
    await until(function () { return /was saved|wasn’t saved|Couldn’t confirm/.test(note()); }, 20000);
    var after = (await serverAll()).transactions;
    var adds = window.__posts.filter(function (p) { return p.action === 'addTransaction'; });
    ok('R5 reply lost but saved server-side: UI says it WAS saved (not "Not recorded")', /was saved/.test(note()) && !/Not recorded/.test(note()));
    ok('R6 exactly one row on the server (retry used the same client_id; backend dedup)', after.length === before + 1 && adds.length === 2 && adds[0].client_id === adds[1].client_id);
    ok('R7 the row is shown in the ledger after reconciling', /rel lost/.test($('entries').innerText));
  };
  // Add whose request never reaches the server: UI must say it was NOT saved (after checking), no silent resend.
  S.addDropped = async function (ok) {
    clearNote(); var before = (await serverAll()).transactions.length; window.__posts = [];
    window.__faults.addTransaction = { drop: 2 };
    await addExpense(222, 'rel dropped');
    await until(function () { return /was saved|wasn’t saved|Couldn’t confirm/.test(note()); }, 20000);
    var after = (await serverAll()).transactions.length;
    ok('R8 not saved: UI says it wasn’t saved (after checking the server), nothing on the server', /wasn’t saved/.test(note()) && after === before && !/rel dropped/.test($('entries').innerText));
    ok('R9 no extra POST beyond the single deduplicated retry', window.__posts.filter(function (p) { return p.action === 'addTransaction'; }).length === 2);
  };
  // Google answers the POST with the ping reply (the write landed): must not be taken as success nor as "not recorded".
  S.addEcho = async function (ok) {
    clearNote(); var before = (await serverAll()).transactions.length;
    window.__faults.addTransaction = { echo: 1 };
    await addExpense(33, 'rel echo');
    await until(function () { return /rel echo/.test(T()) && !document.querySelector('#entries li[data-pending]'); }, 20000); await w(1500);
    var after = (await serverAll()).transactions.length;
    ok('R10 ping-echo reply is retried with the same client_id: one row on the server, row visible, no false error', after === before + 1 && /rel echo/.test(T()) && !/Not recorded|wasn’t saved/.test(note()));
  };
  S.editDeleteLost = async function (ok) {
    var tag = 'rel edit ' + Date.now() % 100000; await addExpense(55, tag); await until(function () { return (window.__posts.filter(function (p) { return p.action === 'addTransaction'; }).length) && !/tmp_/.test(JSON.stringify(localStorage.getItem('x'))); }, 2000); await w(2500);
    var d = await serverAll(); var tx = d.transactions.find(function (t) { return t.note === tag; });
    clearNote(); window.__faults.updateTransaction = { lost: 2 };
    document.querySelector('.seeall').click(); await w(500);
    var row = Array.prototype.find.call($('sheetContent').querySelectorAll('li'), function (l) { return l.innerText.indexOf(tag) >= 0; });
    btn(row, 'Edit').click(); await w(200);
    var ins = $('sheetContent').querySelectorAll('input'); set(ins[0], '44');
    Array.prototype.find.call($('sheetContent').querySelectorAll('button'), function (b) { return /save/i.test(b.textContent); }).click();
    await until(function () { return /Edit saved|wasn’t saved|Couldn’t confirm/.test(note()); }, 20000);
    var t2 = (await serverAll()).transactions.find(function (t) { return t.transaction_id === tx.transaction_id; });
    ok('R11 edit with lost replies: server has 44, UI says "Edit saved."', t2 && t2.amount === 44 && /Edit saved/.test(note()));
    clearNote(); window.__faults.deleteTransaction = { lost: 2 };
    row = Array.prototype.find.call($('sheetContent').querySelectorAll('li'), function (l) { return l.innerText.indexOf(tag) >= 0; });
    btn(row, 'Delete').click(); await w(200);
    Array.prototype.find.call($('sheetContent').querySelectorAll('.txconfirm button'), function (b) { return b.textContent.trim() === 'Delete'; }).click();
    await until(function () { return /Deleted\.|still there|Couldn’t confirm the delete/.test(note()); }, 20000);
    var gone = !(await serverAll()).transactions.some(function (t) { return t.transaction_id === tx.transaction_id; });
    ok('R12 delete with lost replies: gone on the server, UI says "Deleted."', gone && /Deleted\./.test(note()));
    document.querySelector('[data-close]').click();
  };
  S.planLost = async function (ok) {
    clearNote(); window.__faults.saveMoneyPlan = { lost: 99 };      // previews AND the save lose their replies (the save still lands)
    document.querySelector('.nav__gear').click(); await w(400); btn($('sheetContent'), 'Edit Money Plan').click(); await until(function () { return $('pIncome'); }, 5000);
    var inc = +$('pIncome').value + 1; set($('pIncome'), String(inc));
    btn($('plan'), 'Review').click();
    await until(function () { return /server is slow/.test(($('planPace') || {}).textContent || ''); }, 20000);
    ok('R13 preview failed (slow server) -> honest message and Save is still possible', /You can still save/.test($('planPace').textContent) && !$('planGo').disabled);
    $('planGo').click();
    await until(function () { return /Money Plan saved|wasn’t saved|Couldn’t confirm/.test(note()); }, 25000);
    window.__faults.saveMoneyPlan = {};
    ok('R14 save with lost replies: server has the new income, UI says "Money Plan saved."', (await serverAll()).plan.income === inc && /Money Plan saved/.test(note()) && $('plan').hidden);
  };
  S.planBusinessError = async function (ok) {
    document.querySelector('.nav__gear').click(); await w(400); btn($('sheetContent'), 'Edit Money Plan').click(); await until(function () { return $('pIncome'); }, 5000);
    set($('pSavings'), String(+$('pIncome').value * 10));
    btn($('plan'), 'Review').click(); await w(300);
    ok('R15 a definite validation problem is still reported as not saved (no false "checking")', !!($('plan').querySelector('.plan__err') || {}).textContent);
    btn($('plan'), 'Cancel').click(); await w(300);
  };

  window.PaceRel = {
    faults: window.__faults,
    run: async function (name) {
      var res = { name: name, pass: 0, fail: 0, log: [] };
      var ok = function (n, c) { c ? res.pass++ : res.fail++; res.log.push((c ? 'PASS ' : 'FAIL ') + n); };
      try { await S[name](ok); } catch (e) { res.fail++; res.log.push('ERROR ' + (e && e.message)); }
      return res;
    }
  };
})();
