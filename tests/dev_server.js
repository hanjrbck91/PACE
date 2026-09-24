/* Local stand-in for the Apps Script web app: runs the REAL apps-script/Code.gs
 * in a vm against an in-memory spreadsheet seeded from a real backup (Muhammed's
 * data shape), migrated with the real migrateToMultiUser(), and served over HTTP
 * so the REAL frontend can be exercised end-to-end (gate, sessions, cache
 * isolation, switch user, guest) without Google.
 * Usage: node tests/dev_server.js [port]   (default 8897)
 */
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), http = require('http'), path = require('path');
const PORT = Number(process.argv[2] || 8897);
const root = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(root, 'apps-script', 'Code.gs'), 'utf8');
const SC = process.env.PACE_SCRATCH || path.join(process.env.LOCALAPPDATA || '', 'Temp', 'claude', 'D--My-Tools-Notepad-Win-Pace', 'da72ffa1-0485-457c-ba4a-7530bb7beeaa', 'scratchpad');
const codes = JSON.parse(fs.readFileSync(path.join(SC, 'dev_codes.json'), 'utf8'));

const signed = b => Array.from(b, x => (x > 127 ? x - 256 : x)), unsigned = a => Buffer.from(Array.from(a, x => x & 255));
class Sheet {
  constructor(n) { this.name = n; this.rows = []; }
  getName() { return this.name; } setName(n) { this.name = n; } setFrozenRows() {}
  getLastRow() { let l = 0; this.rows.forEach((r, i) => { if (r && r.some(c => c !== '' && c != null)) l = i + 1; }); return l; }
  getRange(r, c, nr, nc) { nr = nr || 1; nc = nc || 1; const s = this; return {
    getValues() { const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (s.rows[r - 1 + i] || [])[c - 1 + j]; row.push(v === undefined ? '' : v); } o.push(row); } return o; },
    getValue() { const v = (s.rows[r - 1] || [])[c - 1]; return v === undefined ? '' : v; },
    setValues(v) { for (let i = 0; i < v.length; i++) { s.rows[r - 1 + i] = s.rows[r - 1 + i] || []; for (let j = 0; j < v[i].length; j++) s.rows[r - 1 + i][c - 1 + j] = v[i][j]; } },
    setValue(v) { s.rows[r - 1] = s.rows[r - 1] || []; s.rows[r - 1][c - 1] = v; } }; }
  appendRow(a) { this.rows[this.getLastRow()] = a.slice(); }
  deleteRow(n) { this.rows.splice(n - 1, 1); } deleteRows(n, k) { this.rows.splice(n - 1, k); }
  copyTo(ss) { const s = ss.insertSheet('Copy of ' + this.name); s.rows = JSON.parse(JSON.stringify(this.rows)); return s; }
}
const ss = { sheets: {}, getSheetByName(n) { this.sync(); return this.sheets[n] || null; }, insertSheet(n) { const s = new Sheet(n); this.sheets[n] = s; return s; }, sync() { const m = {}; Object.values(this.sheets).forEach(s => m[s.name] = s); this.sheets = m; } };

// ---- seed legacy from the real backup ----
const bk = fs.readdirSync(path.join(root, 'backups')).filter(f => f.startsWith('pre_multiuser_all_')).sort().pop();
const backup = JSON.parse(fs.readFileSync(path.join(root, 'backups', bk), 'utf8')).data;
const legacyTx = ss.insertSheet('Transactions');
legacyTx.rows = [['Date', 'Amount', 'Note', 'Type', 'ID']].concat(backup.transactions.slice().reverse().map(t => [t.date, t.amount, t.note, t.type, t.transaction_id]));
const legacySet = ss.insertSheet('Settings');
legacySet.rows = [['key', 'value']].concat(Object.keys(backup.settings).map(k => [k, backup.settings[k]]));

const cacheStore = {}, props = {};
const env = { console, Date, Math, JSON, String, Number, Object, Array, isNaN, isFinite, parseInt, RegExp, Error, Logger: { log() {} },
  Session: { getScriptTimeZone: () => 'Asia/Kolkata' }, SpreadsheetApp: { getActiveSpreadsheet: () => { ss.sync(); return ss; } },
  LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: k => (k in cacheStore ? cacheStore[k] : null), put: (k, v) => { cacheStore[k] = String(v); }, remove: k => { delete cacheStore[k]; } }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType() { return this; }, getContent: () => s }) },
  Utilities: { DigestAlgorithm: { SHA_256: 's' }, Charset: { UTF_8: 'u' }, getUuid: () => crypto.randomUUID(),
    computeDigest: (a, s) => signed(crypto.createHash('sha256').update(String(s)).digest()),
    computeHmacSha256Signature: (v, k) => signed(crypto.createHmac('sha256', k).update(v).digest()),
    base64EncodeWebSafe: x => (typeof x === 'string' ? Buffer.from(x) : unsigned(x)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64DecodeWebSafe: s => signed(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
    newBlob: b => ({ getDataAsString: () => unsigned(b).toString() }),
    formatDate: d => { const p = n => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); } } };
vm.createContext(env); vm.runInContext(CODE, env);
env.migrateToMultiUser(); ss.sync();
const users = ss.getSheetByName('USERS');
users.getRange(2, 2, 1, 1).setValues([[crypto.createHash('sha256').update(codes.codes.MUHAMMED).digest('hex')]]);
users.getRange(3, 2, 1, 1).setValues([[crypto.createHash('sha256').update(codes.codes.FRIEND).digest('hex')]]);
cacheStore['USERS_META_V1'] && delete cacheStore['USERS_META_V1'];
if (process.env.BLANK_FRIEND) { ss.getSheetByName('SET_FRIEND').rows = [['key', 'value']]; }   // simulate a brand-new profile with no Money Plan

http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.method === 'GET') { res.writeHead(200, cors); return res.end(env.doGet({ parameter: { action: 'ping' } }).getContent()); }
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    const delay = Number(process.env.DELAY_MS || 0);
    setTimeout(() => { res.writeHead(200, cors); res.end(env.doPost({ postData: { contents: body } }).getContent()); }, delay);
  });
}).listen(PORT, '127.0.0.1', () => console.log('dev backend on http://127.0.0.1:' + PORT + '  (TX_MUH rows: ' + (ss.getSheetByName('TX_MUH').getLastRow() - 1) + ')'));

// tiny inspection endpoint-free helpers for the test driver: expose via stdout on SIGUSR? (kept simple: none)
process.on('SIGINT', () => process.exit(0));
