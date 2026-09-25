/* Step 8B browser checks (Settings > Profile name). Runs INSIDE the app page served against the LOCAL dev backend
 * (tests/dev_server.js) — never production. Load AFTER tests/browser_reliability.js (uses its fetch fault injector
 * window.__faults). Then: await PaceProfile.run('<scenario>')
 */
(function () {
  var w = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var $ = function (id) { return document.getElementById(id); };
  var until = async function (fn, ms) { for (var i = 0; i < (ms || 15000) / 200; i++) { try { if (fn()) return true; } catch (e) {} await w(200); } return false; };
  var set = function (el, v) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  var session = function () { var k = Object.keys(localStorage).find(function (x) { return x.indexOf('pace_session_') === 0; }); return k ? JSON.parse(localStorage.getItem(k)) : null; };
  var serverPlan = async function () { var s = session(); var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; var r = await (window.__realFetch || fetch)(window.PACE_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'all', token: s.token, today: d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) }) }); return (await r.json()).data; };
  var openSettings = async function () { if ($('sheet').hidden || !/Settings/.test($('sheetTitle').textContent)) { document.querySelector('.nav__gear').click(); await w(400); } };
  var msg = function () { var m = $('profileMsg'); return m ? m.textContent : ''; };
  var editAndSave = async function (name) { await openSettings(); $('profileEdit').click(); await w(150); set($('profileName'), name); $('profileSave').click(); };

  var S = {};
  S.view = async function (ok) {
    await openSettings();
    var cur = (await serverPlan()).plan.display_name || '';
    ok('P1 Settings shows the Profile name row with the current name', !!$('profileNameRow') && $('profileNameRow').innerText.indexOf(cur || 'Not set') >= 0);
    $('profileEdit').click(); await w(150);
    ok('P2 Edit opens a labelled input prefilled with the name, focused', $('profileName') && $('profileName').value === cur && document.activeElement === $('profileName') && !!document.querySelector('label[for="profileName"]'));
    $('profileCancel').click(); await w(150);
    ok('P2b Cancel returns to the read-only row without saving', !!$('profileNameRow') && !$('profileName'));
  };
  S.save = async function (ok) {
    await editAndSave('Muhammed H');
    await until(function () { return /Saved\.|wasn|Couldn/.test(msg()); }, 20000);
    var pl = (await serverPlan()).plan;
    ok('P3 save -> "Saved.", server has the trimmed name', /Saved\./.test(msg()) && pl.display_name === 'Muhammed H');
    ok('P3b Today greeting updated at once', /Muhammed H\.$/.test($('greet').textContent) && !$('greet').hidden);
    ok('P3c Pace/Today numbers still present (no Today regression)', /₹/.test($('todayPace').textContent) && !!$('bar'));
  };
  S.afterReload = async function (ok) {
    await until(function () { return /₹/.test($('todayPace').textContent); }, 20000); await w(800);
    ok('P4 name persists after reload (greeting + Settings)', /Muhammed H\.$/.test($('greet').textContent));
    await openSettings(); ok('P4b Settings row shows it', $('profileNameRow').innerText.indexOf('Muhammed H') >= 0);
  };
  S.emptyAndUnicode = async function (ok) {
    await editAndSave('   '); await until(function () { return /Saved\.|wasn|Couldn/.test(msg()); }, 20000);
    ok('P5 empty name allowed: "Not set", greeting hidden, server empty', /Saved\./.test(msg()) && $('profileNameRow').innerText.indexOf('Not set') >= 0 && $('greet').hidden && (await serverPlan()).plan.display_name === '');
    await editAndSave('محمد'); await until(function () { return /Saved\./.test(msg()); }, 20000);
    ok('P6 Unicode name saved and greeted exactly', (await serverPlan()).plan.display_name === 'محمد' && /محمد\.$/.test($('greet').textContent));
    await editAndSave('bad\u0007'); await w(300);
    ok('P6b invalid (control character) rejected client-side, nothing sent', /plain letters/.test(msg()) && (await serverPlan()).plan.display_name === 'محمد');
    $('profileCancel').click(); await w(150);
  };
  S.unknown = async function (ok) {
    window.__faults.saveMoneyPlan = { lost: 2 };
    await editAndSave('Lost Reply');
    await until(function () { return /^Saved\.|wasn|Couldn/.test(msg()); }, 25000);
    ok('P7 reply lost but saved server-side -> "Saved." after a read-only check (no false "not saved")', /Saved\./.test(msg()) && (await serverPlan()).plan.display_name === 'Lost Reply');
    window.__faults.saveMoneyPlan = { drop: 2 };
    var posts0 = window.__posts.length;
    await editAndSave('Never Arrived');
    await until(function () { return /^Saved\.|wasn|Couldn/.test(msg()); }, 25000);
    var sent = window.__posts.slice(posts0).filter(function (p) { return p.action === 'saveMoneyPlan'; }).length;
    ok('P8 request never delivered -> "wasn’t saved", server unchanged, no extra send beyond the single retry', /wasn/.test(msg()) && (await serverPlan()).plan.display_name === 'Lost Reply' && sent === 2);
    window.__faults.saveMoneyPlan = {};
    $('profileCancel') && $('profileCancel').click(); await w(150);
    await editAndSave('Muhammed'); await until(function () { return /Saved\./.test(msg()); }, 20000);
  };
  S.guest = async function (ok) {
    await openSettings();
    ok('P9 Guest: Settings shows "Guest (demo)" and NO name editor', /Guest \(demo\)/.test($('sheetContent').innerText) && !$('profileEdit') && !$('profileNameRow'));
    ok('P9b Guest has no personal greeting', $('greet').hidden);
    document.querySelector('[data-close]').click();
  };
  S.layout = async function (ok) {
    await openSettings(); if ($('profileEdit')) { $('profileEdit').click(); await w(150); }
    var small = Array.prototype.filter.call($('sheetContent').querySelectorAll('button, input, select'), function (b) { return b.offsetParent && b.getBoundingClientRect().height < 44; }).map(function (b) { return b.id || b.className; });
    ok('P10 ' + innerWidth + 'px: no horizontal overflow, targets >= 44 px (' + (small.join(',') || 'all') + ')', document.documentElement.scrollWidth <= document.documentElement.clientWidth && small.length === 0);
    if ($('profileCancel')) $('profileCancel').click(); await w(100);
  };

  window.PaceProfile = {
    run: async function (name) {
      var res = { name: name, pass: 0, fail: 0, log: [] };
      var ok = function (n, c) { c ? res.pass++ : res.fail++; res.log.push((c ? 'PASS ' : 'FAIL ') + n); };
      try { await S[name](ok); } catch (e) { res.fail++; res.log.push('ERROR ' + (e && e.message)); }
      return res;
    }
  };
})();
