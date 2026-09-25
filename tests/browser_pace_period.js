/* Browser E2E checks for Step 7.2 (user-facing Pace Period).
 * Runs INSIDE the app page served against the LOCAL dev backend (tests/dev_server.js) — never production.
 * Load it into the page (e.g. copy next to the served frontend and inject a <script>), then call
 *   await PaceE2E.run('<scenario>', opts)
 * Each scenario returns { name, pass, fail, log[] }. Scenarios that need a reload are split into parts.
 * Dates: the dev page may shift the clock via localStorage 'pace_test_day_offset' (test copy of index.html only).
 */
(function () {
  var API = window.PACE_API_URL;
  var w = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var $ = function (id) { return document.getElementById(id); };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var dayKey = function (d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var monthEnd = function (k) { var y = +k.slice(0, 4), m = +k.slice(5, 7); return k.slice(0, 8) + pad(new Date(y, m, 0).getDate()); };
  var addDays = function (k, n) { var d = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10) + n); return dayKey(d); };
  var T = function () { return $('app').innerText; };
  var set = function (el, v) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  var btn = function (root, text) { return Array.prototype.find.call((root || document).querySelectorAll('button'), function (b) { return b.offsetParent && b.textContent.trim() === text; }); };
  var until = async function (fn, ms) { for (var i = 0; i < (ms || 12000) / 250; i++) { try { if (fn()) return true; } catch (e) {} await w(250); } return false; };
  var session = function () { var k = Object.keys(localStorage).find(function (x) { return x.indexOf('pace_session_') === 0; }); return k ? JSON.parse(localStorage.getItem(k)) : null; };
  var api = async function (body) { var s = session(); body = Object.assign({ token: s && s.token, today: dayKey() }, body); var r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }); return r.json(); };
  var openPlanUI = async function (which) { document.querySelector('.nav__gear').click(); await w(400); btn($('sheetContent'), which || 'Edit Money Plan').click(); await until(function () { return !$('plan').hidden && $('periodField'); }); };
  var review = async function () { btn($('plan'), 'Review').click(); await until(function () { return btn($('plan'), 'Save Money Plan'); }); await w(1200); };
  var saveReview = async function () { btn($('plan'), 'Save Money Plan').click(); await until(function () { return $('plan').hidden; }); await w(2500); };
  var pickEnd = async function (iso) { $('periodChange').click(); await w(100); set($('periodDate'), iso); await w(100); };
  var structure = function (d) { return JSON.stringify([d.plan.income, d.plan.savings, d.plan.display_name, d.plan.current_balance, d.plan.current_balance_date, d.plan.commitments, d.transactions.map(function (t) { return [t.transaction_id, t.date, t.amount, t.note, t.type]; })]); };
  var overflow = function () { return document.documentElement.scrollWidth > document.documentElement.clientWidth; };
  var small = function (root) { return Array.prototype.filter.call(root.querySelectorAll('button, input'), function (b) { return b.offsetParent && b.getBoundingClientRect().height < 44 && !b.closest('.nav'); }).map(function (b) { return (b.id || b.textContent.trim()).slice(0, 20); }); };

  var S = {};
  // A. new-user onboarding: default, change, draft survives reload (part 1), failed save + success (part 2)
  S.onboard1 = async function (ok) {
    await until(function () { return $('obGo'); });
    var today = dayKey(); var go = function () { $('obGo').click(); };
    set($('obName'), 'Nadia'); go(); await w(300);
    document.querySelector('input[type=radio][value=INR]').click(); await w(100); go(); await w(300);
    set($('obIncome'), '40000'); go(); await w(300);
    set($('obSavings'), '5000'); go(); await w(300);
    ok('A1 step 5 shows the balance question + period field', !!$('obBalance') && !!$('periodField'));
    ok('A2 default = End of this month (' + monthEnd(today) + ')', /End of this month/.test($('periodField').innerText) && $('periodField').innerText.indexOf(new Date(+today.slice(0, 4), +today.slice(5, 7), 0).getDate() + ',') >= 0);
    set($('obBalance'), '9000');
    var end = addDays(monthEnd(today), 5); await pickEnd(end);
    ok('A3 changed end date shown', $('periodField').innerText.indexOf(end.slice(0, 4)) >= 0 && !/End of this month/.test($('periodField').querySelector('.plan__period-v').textContent));
    ok('A4 draft stored with periodEnd', JSON.parse(localStorage.getItem('pace_draft_' + session().user)).d.periodEnd === end);
    localStorage.setItem('pace_e2e_end', end);
  };
  S.onboard2 = async function (ok) {
    await until(function () { return $('obGo'); });
    var end = localStorage.getItem('pace_e2e_end');
    ok('A5 draft survived reload (still at step 5 with the chosen end)', !!$('periodField') && JSON.parse(localStorage.getItem('pace_draft_' + session().user)).d.periodEnd === end);
    $('obGo').click(); await w(300);                                            // to step 6
    var real = window.fetch; window.fetch = function () { return Promise.reject(new TypeError('Failed to fetch')); };
    $('obGo').click(); await w(2500); window.fetch = real;
    ok('A6 failed save keeps the draft and shows an error', !!localStorage.getItem('pace_draft_' + session().user) && /Couldn/.test($('plan').innerText));
    var before = await api({ action: 'all' });
    ok('A7 failed save wrote nothing (still needs_plan)', before.data.plan.setup_state === 'needs_plan');
    $('obGo').click(); await until(function () { return $('plan').hidden; }, 20000); await w(1500);
    var d = (await api({ action: 'all' })).data;
    ok('A8 saved: complete, pace_period_end = chosen date, draft cleared', d.plan.setup_state === 'complete' && d.plan.pace_period_end === end && !localStorage.getItem('pace_draft_' + session().user));
    ok('A9 Today shows "Pace until" and days from tomorrow match the server', /Pace until/.test($('ctx').textContent) && T().indexOf(d.state.v2.pace_days + ' days') >= 0);
  };
  // B/C/G/H. existing user: view, cross-month edit, restore month end; everything else unchanged
  S.existing = async function (ok) {
    var d0 = (await api({ action: 'all' })).data, today = dayKey();
    await openPlanUI();
    ok('B1 Money Plan shows the period field with the month-end default', /End of this month/.test($('periodField').innerText));
    var end = addDays(monthEnd(today), 5); await pickEnd(end);
    await review();
    ok('B2 review lists "Money lasts until"', /Money lasts until/.test($('plan').innerText));
    await saveReview();
    var d1 = (await api({ action: 'all' })).data;
    ok('C1 cross-month end saved; server period_end = ' + end, d1.plan.pace_period_end === end && d1.state.v2.period_end === end && d1.state.v2.period_end_source === 'configured');
    ok('C2 day count follows the period (days incl. today = period length)', d1.state.v2.days_remaining_incl_today > d0.state.v2.days_remaining_incl_today);
    ok('C3 Pace changed with the longer period', d1.state.v2.today_pace !== d0.state.v2.today_pace);
    ok('G/H plan fields, balance, balance date, commitments, transactions unchanged', structure(d1) === structure(d0));
    ok('C4 Today dateline shows "Pace until"', /Pace until/.test($('ctx').textContent));
    await openPlanUI('Edit Pace period');
    ok('B3 Settings "Edit Pace period" lands on the period field (focused)', document.activeElement && document.activeElement.id === 'periodChange');
    btn($('periodField'), 'Use end of this month').click(); await w(100);
    await review(); await saveReview();
    var d2 = (await api({ action: 'all' })).data;
    ok('B4 restore month end: pace_period_end null, source month_end, others unchanged', d2.plan.pace_period_end === null && d2.state.v2.period_end_source === 'month_end' && structure(d2) === structure(d0) && d2.state.v2.today_pace === d0.state.v2.today_pace);
  };
  // D/E part 1: set an end 2 days ahead (the caller then shifts the clock +3 days and reloads)
  S.ended1 = async function (ok) {
    var today = dayKey(), end = addDays(today, 2);
    await openPlanUI(); await pickEnd(end); await review(); await saveReview();
    var d = (await api({ action: 'all' })).data;
    ok('D0 short period saved (' + end + ')', d.plan.pace_period_end === end);
    localStorage.setItem('pace_e2e_ended', end); localStorage.setItem('pace_e2e_struct', structure(d));
  };
  S.ended2 = async function (ok) {
    await until(function () { return /PERIOD ENDED|ON PACE|BEHIND/.test(T()); }, 15000);
    var end = localStorage.getItem('pace_e2e_ended');
    ok('D1 dedicated state "PERIOD ENDED" (not POSITION NEEDED)', /PERIOD ENDED/.test(T()) && !/POSITION NEEDED/.test(T()));
    ok('D2 message names the end date and asks for a new end date', /ended on/.test($('diff').textContent) && /new end date/.test($('diff').textContent));
    ok('D3 action button visible (44px+)', !$('periodAct').hidden && $('periodAct').getBoundingClientRect().height >= 44);
    document.querySelector('[data-sheet="balance"]').click(); await w(400);
    ok('D4 Balance sheet says the balance is still saved (not "no balance")', /still saved/.test($('sheetContent').innerText)); document.querySelector('[data-close]').click(); await w(200);
    $('periodAct').click(); await until(function () { return !$('plan').hidden; });
    ok('D5 action opens Money Plan on the period field', document.activeElement && document.activeElement.id === 'periodChange' && /ended on/.test($('periodField').innerText));
    set($('pBalance'), String(+$('pBalance').value + 111));
    btn($('plan'), 'Review').click(); await w(400);
    ok('E1 balance change while the period is over -> clear explanation, no review, nothing sent', /ended on/.test(($('plan').querySelector('.plan__err') || {}).textContent || '') && !btn($('plan'), 'Save Money Plan'));
    var d = (await api({ action: 'all' })).data;
    ok('E2 no write happened; period not silently changed', structure(d) === localStorage.getItem('pace_e2e_struct') && d.plan.pace_period_end === end);
    var newEnd = addDays(dayKey(), 10); await pickEnd(newEnd);
    await review(); await saveReview();
    var d2 = (await api({ action: 'all' })).data;
    ok('E3 new balance + new end saved together -> Pace back, new anchor today', d2.plan.pace_period_end === newEnd && d2.plan.current_balance_date === dayKey() && d2.state.v2.ready && !/PERIOD ENDED/.test(T()));
  };
  // F. Guest parity
  S.guest = async function (ok, opts) {
    var d0 = (await api({ action: 'all' })).data, today = dayKey();
    ok('F1 Guest plan is editable', d0.plan.editable === true);
    await openPlanUI();
    ok('F2 Guest Money Plan opens; name field hidden (no greeting for Guest)', !!$('periodField') && $('pName').closest('.plan__field').hidden);
    var end = addDays(monthEnd(today), 5); await pickEnd(end); await review(); await saveReview();
    var d1 = (await api({ action: 'all' })).data;
    ok('F3 Guest period saved and Pace changes', d1.plan.pace_period_end === end && d1.state.v2.today_pace !== d0.state.v2.today_pace);
    await openPlanUI('Edit Pace period'); btn($('periodField'), 'Use end of this month').click(); await review(); await saveReview();
    var d2 = (await api({ action: 'all' })).data;
    ok('F4 Guest month-end restore works', d2.plan.pace_period_end === null && d2.state.v2.period_end_source === 'month_end');
    await openPlanUI(); set($('pIncome'), '44000'); await pickEnd(end); await review(); await saveReview();
    document.querySelector('.nav__gear').click(); await w(400); btn($('sheetContent'), 'Reset demo').click();
    await until(function () { return /Breakfast/.test(T()); }, 20000); await w(1500);
    if (!$('sheet').hidden) document.querySelector('[data-close]').click();
    var d3 = (await api({ action: 'all' })).data;
    ok('F5 Reset demo restores the clean demo (income 45000, no period, balance 45000)', d3.plan.income === 45000 && d3.plan.pace_period_end === null && d3.plan.current_balance === 45000);
  };
  // K/L. responsive + accessibility on the current screen
  S.layout = async function (ok, opts) {
    ok('K no horizontal overflow at ' + innerWidth + 'px', !overflow());
    var root = $('plan').hidden ? $('app') : $('plan');
    var sm = small(root);
    ok('L touch targets >= 44px (' + (sm.join(',') || 'all') + ')', sm.length === 0);
    if ($('periodDate')) ok('L date input labelled', !!$('periodDate').getAttribute('aria-label'));
  };

  window.PaceE2E = {
    run: async function (name, opts) {
      var res = { name: name, pass: 0, fail: 0, log: [] };
      var ok = function (n, c) { c ? res.pass++ : res.fail++; res.log.push((c ? 'PASS ' : 'FAIL ') + n); };
      try { await S[name](ok, opts || {}); } catch (e) { res.fail++; res.log.push('ERROR ' + (e && e.message)); }
      return res;
    }
  };
})();
