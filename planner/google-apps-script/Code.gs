/* Public functions below are the only client-callable API. Helpers end in _.
 * No diary content, plaintext passwords, proofs, or tokens are logged.
 */
const PLANNER_HEADERS_ = ['Date', 'Version', 'UpdatedAt', 'MarkdownBase64'];
const SESSION_MS_ = 8 * 60 * 60 * 1000;

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('플래너')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getPlannerLoginChallenge() {
  return locked_(function () {
    const auth = authConfig_(), props = PropertiesService.getScriptProperties(), now = Date.now();
    checkThrottle_(props, now);
    let rate = JSON.parse(props.getProperty('CHALLENGE_RATE') || '{}');
    if (!rate.until || rate.until < now) rate = { count: 0, until: now + 60000 };
    if (rate.count >= 30) throw new Error('잠시 후 다시 시도해 주세요.');
    rate.count++; props.setProperty('CHALLENGE_RATE', JSON.stringify(rate));
    const id = random_(), nonce = random_();
    CacheService.getScriptCache().put('challenge:' + id, JSON.stringify({ nonce: nonce, fingerprint: fingerprint_(auth) }), 300);
    return { id: id, nonce: nonce, salt: auth.salt, iterations: auth.iterations };
  });
}

function loginPlanner(request) {
  return locked_(function () {
    const props = PropertiesService.getScriptProperties(), now = Date.now(), auth = authConfig_();
    checkThrottle_(props, now);
    const id = request && String(request.id || ''), proof = request && String(request.proof || '');
    if (!/^[a-f0-9]{64}$/.test(id) || !/^[A-Za-z0-9+/]{43}=$/.test(proof)) {
      failedLogin_(props, now); throw new Error('로그인 정보를 확인해 주세요.');
    }
    const cache = CacheService.getScriptCache(), value = cache.get('challenge:' + id);
    cache.remove('challenge:' + id); // A proof is valid once, including on concurrent calls.
    if (!value) { failedLogin_(props, now); throw new Error('로그인 요청이 만료되었습니다. 다시 시도해 주세요.'); }
    const challenge = JSON.parse(value);
    const bytes = Utilities.newBlob(id + ':' + challenge.nonce).getBytes();
    const expected = Utilities.base64Encode(Utilities.computeHmacSha256Signature(bytes, Utilities.base64Decode(auth.key)));
    if (challenge.fingerprint !== fingerprint_(auth) || !constantEqual_(expected, proof)) {
      failedLogin_(props, now); throw new Error('비밀번호를 확인해 주세요.');
    }
    props.deleteProperty('LOGIN_FAILURES');
    const sessions = Object.entries(props.getProperties()).filter(function (pair) { return pair[0].indexOf('SESSION_') === 0; });
    sessions.forEach(function (pair) {
      const s = JSON.parse(pair[1]); if (s.expiresAt <= now || s.fingerprint !== fingerprint_(auth)) props.deleteProperty(pair[0]);
    });
    const remaining = Object.entries(props.getProperties()).filter(function (pair) { return pair[0].indexOf('SESSION_') === 0; });
    remaining.sort(function (a, b) { return JSON.parse(a[1]).expiresAt - JSON.parse(b[1]).expiresAt; });
    while (remaining.length >= 12) props.deleteProperty(remaining.shift()[0]);
    const token = random_() + random_(), expiresAt = now + SESSION_MS_;
    props.setProperty('SESSION_' + hash_(token), JSON.stringify({ expiresAt: expiresAt, fingerprint: fingerprint_(auth) }));
    return { token: token, expiresAt: expiresAt };
  });
}

function logoutPlanner(token) {
  requireSession_(token);
  PropertiesService.getScriptProperties().deleteProperty('SESSION_' + hash_(token));
  return { ok: true };
}

function loadPlannerDay(token, date) {
  requireSession_(token); validateDate_(date);
  const row = rows_().find(function (r) { return r[0] === date; });
  return row ? note_(row) : { date: date, markdown: '', version: 0, updatedAt: null };
}

function loadPlannerMonth(token, month) {
  requireSession_(token);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('월을 확인해 주세요.');
  return rows_().filter(function (r) { return r[0].slice(0, 7) === month; }).map(function (r) {
    return { date: r[0], version: Number(r[1]), updatedAt: String(r[2]) };
  });
}

function savePlannerDay(token, request) {
  return locked_(function () {
    requireSession_(token);
    if (!request || typeof request.markdown !== 'string') throw new Error('기록을 확인해 주세요.');
    validateDate_(request.date);
    if (!Number.isInteger(request.expectedVersion) || request.expectedVersion < 0) throw new Error('저장 버전을 확인해 주세요.');
    if (Utilities.newBlob(request.markdown).getBytes().length > 24000) throw new Error('하루 기록은 UTF-8 기준 24KB까지 저장할 수 있습니다.');
    const sheet = sheet_(), rows = rows_(), index = rows.findIndex(function (r) { return r[0] === request.date; });
    const version = index < 0 ? 0 : Number(rows[index][1]);
    if (version !== request.expectedVersion) return { conflict: true, latest: index < 0 ? { date: request.date, markdown: '', version: 0, updatedAt: null } : note_(rows[index]) };
    const updatedAt = new Date().toISOString();
    const encoded = Utilities.base64Encode(Utilities.newBlob(request.markdown).getBytes());
    const record = [request.date, version + 1, updatedAt, encoded];
    // Store Markdown as base64 text, so spreadsheet formulas cannot execute user input.
    const range = sheet.getRange(index < 0 ? sheet.getLastRow() + 1 : index + 2, 1, 1, 4);
    range.setNumberFormat('@'); range.setValues([record]);
    SpreadsheetApp.flush();
    return { conflict: false, note: { date: request.date, markdown: request.markdown, version: version + 1, updatedAt: updatedAt } };
  });
}

function exportPlannerNotes(token) {
  requireSession_(token);
  return rows_().map(note_).sort(function (a, b) { return a.date.localeCompare(b.date); });
}

// Run from the script editor only (trailing underscore prevents browser access).
// Set PLANNER_AUTH in Script Properties with the local password setup tool first.
function initializePlanner_() {
  return locked_(function () {
    authConfig_();
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('PLANNER_SHEET_ID')) return { spreadsheetUrl: sheet_().getParent().getUrl() };
    const book = SpreadsheetApp.create('Private Planner');
    const sheet = book.getSheets()[0]; sheet.setName('Days');
    sheet.getRange(1, 1, 1, 4).setValues([PLANNER_HEADERS_]); sheet.setFrozenRows(1);
    props.setProperty('PLANNER_SHEET_ID', book.getId());
    return { spreadsheetUrl: book.getUrl() };
  });
}

function authConfig_() {
  const raw = PropertiesService.getScriptProperties().getProperty('PLANNER_AUTH');
  if (!raw) throw new Error('플래너 비밀번호 설정을 먼저 완료해 주세요.');
  const a = JSON.parse(raw);
  if (a.iterations !== 600000 || !/^[A-Za-z0-9+/]{43}=$/.test(a.key || '') || !/^[A-Za-z0-9+/]{43}=$/.test(a.salt || '')) throw new Error('비밀번호 설정 형식이 올바르지 않습니다.');
  return a;
}
function requireSession_(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{128}$/.test(token)) throw new Error('AUTH_REQUIRED');
  const raw = PropertiesService.getScriptProperties().getProperty('SESSION_' + hash_(token));
  if (!raw) throw new Error('AUTH_REQUIRED');
  const session = JSON.parse(raw);
  if (session.expiresAt <= Date.now() || session.fingerprint !== fingerprint_(authConfig_())) throw new Error('AUTH_REQUIRED');
}
function checkThrottle_(props, now) {
  const f = JSON.parse(props.getProperty('LOGIN_FAILURES') || '{}');
  if (f.blockedUntil && f.blockedUntil > now) throw new Error('로그인 시도가 많습니다. 5분 후 다시 시도해 주세요.');
}
function failedLogin_(props, now) {
  let f = JSON.parse(props.getProperty('LOGIN_FAILURES') || '{}');
  if (!f.until || f.until < now) f = { count: 0, until: now + 15 * 60000 };
  f.count++;
  if (f.count >= 10) { f.blockedUntil = now + 5 * 60000; f.count = 0; }
  props.setProperty('LOGIN_FAILURES', JSON.stringify(f));
}
function sheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('PLANNER_SHEET_ID');
  if (!id) throw new Error('플래너 저장소 초기화가 필요합니다.');
  const sheet = SpreadsheetApp.openById(id).getSheetByName('Days');
  if (!sheet || sheet.getRange(1, 1, 1, 4).getValues()[0].join('|') !== PLANNER_HEADERS_.join('|')) throw new Error('저장소 구조를 확인해 주세요.');
  return sheet;
}
function rows_() {
  const sheet = sheet_(), count = sheet.getLastRow() - 1;
  return count > 0 ? sheet.getRange(2, 1, count, 4).getValues().filter(function (r) { return r[0]; }).map(function (r) { r[0] = String(r[0]); return r; }) : [];
}
function note_(row) {
  return { date: String(row[0]), version: Number(row[1]), updatedAt: String(row[2]), markdown: Utilities.newBlob(Utilities.base64Decode(String(row[3]))).getDataAsString('UTF-8') };
}
function validateDate_(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('날짜를 확인해 주세요.');
  const d = new Date(date + 'T12:00:00Z');
  if (isNaN(d) || d.toISOString().slice(0, 10) !== date || +date.slice(0, 4) < 1900 || +date.slice(0, 4) > 2100) throw new Error('날짜를 확인해 주세요.');
}
function locked_(fn) {
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function random_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }
function hash_(text) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)); }
function fingerprint_(auth) { return hash_(JSON.stringify(auth)); }
function constantEqual_(a, b) {
  let result = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
  return result === 0;
}
