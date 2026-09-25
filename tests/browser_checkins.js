/* Step 8C browser checks (contextual check-in on Today). Runs INSIDE the app page served against the LOCAL dev backend
 * (tests/dev_server.js) — never production. Load after tests/browser_reliability.js (uses window.__realFetch).
 * Then: await PaceCheckin.run('<scenario>'). Scenarios that need a reload / clock shift are split into parts; the caller
 * reloads between parts and sets localStorage 'pace_test_day_offset' (test copy of index.html only) where noted.
 */
(function () {
  var w = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var $ = function (id) { return document.getElementById(id); };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var dayKey = function (d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var until = async function (fn, ms) { for (var i = 0; i < (ms || 15000) / 200; i++) { try { if (fn()) return true; } catch (e) {} await w(200); } return false; };
  var set = function (el, v) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  var btn = function (root, t) { return Array.prototype.find.call((root || document).querySelectorAll('button'), function (b) { return b.offsetParent && b.textContent.trim() === t; }); };
  var session = function () { var k = localStorage.getItem('pace_active_profile'); return k ? JSON.parse(localStorage.getItem('pace_session_' + k)) : null; };
  var api = async function (body) { var s = session(); body = Object.assign({ token: s && s.token, today: dayKey() }, body); var r = await (window.__realFetch || fetch)(window.PACE_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }); return (await r.json()).data; };
  var struct = function (d) { return JSON.stringify([d.settings, d.transactions]); };
  var note = function () { return $('checkin').hidden ? '' : $('checkinText').textContent; };
  var kind = function () { return $('checkin').hidden ? '' : $('checkin').getAttribute('data-kind'); };
  var ready = function () { return until(function () { return /₹|—/.test($('todayPace').textContent) && $('app').getAttribute('data-state') !== 'boot' && !$('app').hidden; }, 20000); };
  var digits = function (s) { return String(s).replace(/[^\d]/g, ''); };
  var closeSheet = async function () { if (!$('sheet').hidden) { document.querySelector('[data-close]').click(); await w(700); } };
  var openPlan = async function (which) { await closeSheet(); document.querySelector('.nav__gear').click(); await w(450); btn($('sheetContent'), which || 'Edit Money Plan').click(); await until(function () { return !$('plan').hidden && $('periodField'); }); await w(200); };
  var saveViaReview = async function () { btn($('plan'), 'Review').click(); await until(function () { return btn($('plan'), 'Save Money Plan'); }); await w(900); btn($('plan'), 'Save Money Plan').click(); await until(function () { return $('plan').hidden; }, 20000); await w(2000); };
  var togglePay = async function (wantPaid) { var b = Array.prototype.find.call($('plan').querySelectorAll('.plan__pay'), function (x) { return x.getAttribute('aria-pressed') === (wantPaid ? 'false' : 'true'); }); if (b) { b.click(); await w(150); } return b; };

  var S = {};
  // 1. nothing meaningful -> no note; the note slot sits below the Pace-first hierarchy
  S.none = async function (ok) {
    await ready();
    var v = (await api({ action: 'all' })).state.v2;
    ok('C1 ordinary day (' + v.days_remaining_after_today + ' days after today, nothing paid today) -> no note', $('checkin').hidden && v.ready && v.days_remaining_after_today > 0);
    var order = ['status', 'todayPace', 'tom', 'checkin'].map(function (id) { return $(id); }), today = document.querySelector('.today');
    ok('C2 note slot is after status, Today’s pace and the meta rows, before Today’s expenses', order.every(function (e, i) { return i === 0 || (order[i - 1].compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING); }) && ($('checkin').compareDocumentPosition(today) & Node.DOCUMENT_POSITION_FOLLOWING));
  };
  // 2. commitment marked paid today -> note; Pace figures on screen are the server's; nothing else written
  S.paid = async function (ok) {
    await ready(); var d0 = await api({ action: 'all' });
    await openPlan(); var b = await togglePay(true);
    ok('C3 Money Plan has an unpaid commitment to mark paid', !!b);
    await saveViaReview();
    var d1 = await api({ action: 'all' }), paid = d1.plan.commitments.filter(function (c) { return c.status === 'paid' && c.paid_at === dayKey(); });
    await until(function () { return !$('checkin').hidden; }, 5000);
    ok('C4 note appears: "' + note() + '"', kind() === 'commitment_paid' && paid.length >= 1 && note().indexOf(paid[0].name) >= 0 && /marked paid today/.test(note()) && /no longer set aside/.test(note()));
    ok('C5 note copy is factual (no "should", no praise, no urgency)', !/should|great|keep going|don’t forget|!|streak/i.test(note()));
    var v = d1.state.v2;
    ok('C6 Pace on screen = server Pace (today, from tomorrow, remaining flexible) — the note changes no figure', digits($('todayPace').textContent) === digits(Math.round(v.today_pace)) && digits($('tom').textContent) === digits(Math.round(v.tomorrow_pace)) && digits($('remain').textContent) === digits(Math.round(Math.abs(v.remaining_flexible))));
    ok('C7 transactions, balance and balance date untouched by paying + showing the note', JSON.stringify(d1.transactions) === JSON.stringify(d0.transactions) && d1.plan.current_balance === d0.plan.current_balance && d1.plan.current_balance_date === d0.plan.current_balance_date);
    localStorage.setItem('ck_text', note()); localStorage.setItem('ck_struct', struct(d1));
    localStorage.setItem('ck_keys', JSON.stringify(Object.keys(localStorage).filter(function (k) { return !/^ck_|^res_|^layout_fn/.test(k); }).sort()));
  };
  // 3. reload (caller reloads twice before this part)
  S.reload = async function (ok) {
    await ready(); await w(1500);
    ok('C8 after reloads the same single note is shown (no duplicate, no new note)', note() === localStorage.getItem('ck_text') && document.querySelectorAll('#checkin, .checkin').length === 1);
    var d = await api({ action: 'all' });
    ok('C9 reloads wrote nothing to the server (settings + transactions identical)', struct(d) === localStorage.getItem('ck_struct'));
    var keys = JSON.stringify(Object.keys(localStorage).filter(function (k) { return !/^ck_|^res_|^layout_fn/.test(k); }).sort());
    ok('C10 no check-in state stored in the browser (same localStorage keys as before)', keys === localStorage.getItem('ck_keys'));
  };
  // 4. next day (caller sets pace_test_day_offset=1 and reloads): the paid-today note is gone by itself
  S.nextDay = async function (ok) {
    await ready(); await w(1000);
    ok('C11 next day: no commitment note (it was news on the day it was paid)', kind() !== 'commitment_paid');
  };
  // 5. last day of a configured period (end = today) -> last-day note, takes precedence over the paid-today note
  S.lastDay1 = async function (ok) {
    await ready(); var today = dayKey();
    await openPlan(); $('periodChange').click(); await w(100); set($('periodDate'), today); await w(100);
    await saveViaReview();
    var v = (await api({ action: 'all' })).state.v2;
    await until(function () { return kind() === 'last_day'; }, 5000);
    ok('C12 end = today -> last-day note; From tomorrow shows — (engine: no tomorrow)', kind() === 'last_day' && /new end date/.test(note()) && v.days_remaining_after_today === 0 && v.tomorrow_pace === null && /—/.test($('tom').textContent));
    ok('C13 last-day note wins over the paid-today note (one note at most)', document.querySelectorAll('#checkin:not([hidden])').length === 1 && !/marked paid/.test(note()));
  };
  // 6. (caller sets offset 1 + reloads) period ended -> PERIOD ENDED state, no note underneath
  S.lastDay2 = async function (ok) {
    await until(function () { return /PERIOD ENDED/.test($('status').textContent); }, 20000);
    ok('C14 period ended: PERIOD ENDED state and NO note underneath it', /PERIOD ENDED/.test($('status').textContent) && $('checkin').hidden);
  };
  // 7. restore: month-end default + unpaid -> note gone (the note follows the state, both ways)
  S.restore = async function (ok) {
    await ready();
    await openPlan(); btn($('periodField'), 'Use end of this month') && btn($('periodField'), 'Use end of this month').click(); await w(100); await togglePay(false);
    await saveViaReview();
    var d = await api({ action: 'all' });
    ok('C15 unpaid again + month-end default -> note disappears', $('checkin').hidden && d.plan.pace_period_end === null && d.plan.commitments.every(function (c) { return c.status === 'unpaid'; }));
  };
  // 8. large expense: the existing stamp rule is unchanged and the note does not add a second "large expense" message
  S.large = async function (ok) {
    await ready(); await closeSheet();
    var v = (await api({ action: 'all' })).state.v2, amt = Math.ceil(Math.max(v.today_pace * 5, 0.25 * Math.max(v.remaining_flexible, 0))) + 10;
    $('add').click(); await w(350); set($('amountInput'), String(amt)); set($('noteInput'), 'ck large'); btn(document, 'Log expense').click(); await w(500);
    var conf = !!$('largeConfirm');
    if (conf) { Array.prototype.find.call($('largeConfirm').querySelectorAll('button'), function (b) { return /Log expense/.test(b.textContent); }).click(); }
    await until(function () { return !$('stamp').hidden; }, 15000); await w(2500);
    ok('C16 large-expense confirmation + "You spent a lot today" stamp still fire on the existing rule (' + amt + ')', conf && !$('stamp').hidden);
    ok('C17 no extra large-expense note (stamp + status line already say it)', kind() !== 'large' && !/expense/i.test(note()));
  };
  // 9. Guest: same behaviour on the demo; Reset demo clears it
  S.guestPaid = async function (ok) {
    await ready(); await openPlan(); var b = await togglePay(true); await saveViaReview();
    await until(function () { return !$('checkin').hidden; }, 5000);
    ok('C18 Guest: marking the demo commitment paid shows the same note', !!b && kind() === 'commitment_paid' && /marked paid today/.test(note()));
  };
  S.guestReset = async function (ok) {
    await closeSheet(); document.querySelector('.nav__gear').click(); await w(450); btn($('sheetContent'), 'Reset demo').click();
    await until(function () { return /Breakfast/.test($('app').innerText); }, 20000); await w(1500); await closeSheet();
    var d = await api({ action: 'all' });
    ok('C19 Guest Reset demo -> clean demo (commitments unpaid) and no note', $('checkin').hidden && d.plan.commitments.every(function (c) { return c.status === 'unpaid' && !c.paid_at; }) && d.plan.current_balance === 45000);
  };
  // 10. layout with the note visible
  S.layout = async function (ok) {
    await closeSheet();
    var n = $('checkin'), r = n.getBoundingClientRect(), st = $('status').getBoundingClientRect(), pc = $('todayPace').getBoundingClientRect();
    ok('C20 ' + innerWidth + 'px: note visible, no horizontal overflow, text wraps inside, below status + Today’s pace, height ' + Math.round(r.height) + 'px (secondary)',
      !n.hidden && document.documentElement.scrollWidth <= document.documentElement.clientWidth && $('checkinText').scrollWidth <= $('checkinText').clientWidth + 1 && r.top > st.bottom && r.top > pc.bottom && r.height < Math.max(140, innerHeight * 0.2) && r.right <= innerWidth);
  };

  window.PaceCheckin = {
    run: async function (name) {
      var res = { name: name, pass: 0, fail: 0, log: [] };
      var ok = function (n, c) { c ? res.pass++ : res.fail++; res.log.push((c ? 'PASS ' : 'FAIL ') + n); };
      try { await S[name](ok); } catch (e) { res.fail++; res.log.push('ERROR ' + (e && e.message)); }
      return res;
    }
  };
})();
