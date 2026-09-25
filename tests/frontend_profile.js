/* Step 8B unit checks: greeting text with names + profile-save client rules, using the REAL functions from frontend/app.js.
 * Usage: node tests/frontend_profile.js
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
// greetingText with a controllable device clock, store and session
const G = (name, mode, hour) => new Function('store', 'session', 'Date',
  grab('greetingFor') + grab('greetingText') + '; return greetingText();')(
  { plan: { display_name: name } }, { mode: mode || 'user' }, function () { return { getHours: () => hour }; });
ok('named user, morning (09h): "Good morning, Muhammed."', G('Muhammed', 'user', 9) === 'Good morning, Muhammed.');
ok('named user, afternoon (12h / 17h)', G('Muhammed', 'user', 12) === 'Good afternoon, Muhammed.' && G('Muhammed', 'user', 17) === 'Good afternoon, Muhammed.');
ok('named user, evening (18h / 23h) and midnight (00h) -> morning', G('Muhammed', 'user', 18) === 'Good evening, Muhammed.' && G('Muhammed', 'user', 23) === 'Good evening, Muhammed.' && G('Muhammed', 'user', 0) === 'Good morning, Muhammed.');
ok('empty / missing name -> no greeting (never an invented name)', G('', 'user', 10) === '' && G(null, 'user', 10) === '' && G(undefined, 'user', 20) === '');
ok('Unicode names are shown exactly', G('محمد', 'user', 19) === 'Good evening, محمد.' && G('Zoë 🌙', 'user', 8) === 'Good morning, Zoë 🌙.' && G('李小龙', 'user', 13) === 'Good afternoon, 李小龙.');
ok('Guest never gets a personal greeting (even though its demo name is "Guest")', G('Guest', 'guest', 10) === '');

const helpers = new Function(grab('cleanName') + grab('nameProblem') + '; return { cleanName: cleanName, nameProblem: nameProblem };')();
ok('client trims surrounding whitespace', helpers.cleanName('  Asha K  ') === 'Asha K' && helpers.cleanName(null) === '');
ok('client rejects > 40 characters and control characters, accepts Unicode and empty', helpers.nameProblem('x'.repeat(41)) !== '' && helpers.nameProblem('a\u0007b') !== '' && helpers.nameProblem('محمد') === '' && helpers.nameProblem('') === '');
const save = grab('saveName');
ok('the name is saved with profile_only (only display_name is sent — no plan, no credentials)', /plan: \{ profile_only: true, display_name: n \}/.test(save) && !/income|savings|commitments|code|token/.test(save.replace(/localDayKey|newClientId/g, '')));
ok('unchanged name sends no request', /if \(n === \(\(store\.plan && store\.plan\.display_name\) \|\| ""\)\)/.test(save));
ok('unknown outcome -> read-only reconcile, never a blind "not saved" and no re-send', /outcomeUnknown\(e\)/.test(save) && /reconcile\(\)/.test(save) && (save.match(/apiPost\(/g) || []).length === 1);
ok('Settings shows the name editor only for private profiles (Guest keeps "Guest (demo)")', /if \(!\(session && session\.mode === "guest"\)\) c\.appendChild\(profileNameBlock\(\)\)/.test(src));
ok('Step 8A greeting implementation unchanged (device-local hour)', /return greetingFor\(new Date\(\)\.getHours\(\)\)/.test(grab('greetingText')));
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
