const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

function backend() {
  const properties = new Map(), cache = new Map(); let cells = [['Date','Version','UpdatedAt','MarkdownBase64']], locked = false;
  const props = { getProperty: k => properties.get(k) || null, setProperty: (k,v) => properties.set(k,v), deleteProperty: k => properties.delete(k), getProperties: () => Object.fromEntries(properties) };
  const sheet = { getLastRow: () => cells.length, setName() {}, setFrozenRows() {}, getParent: () => book,
    getRange(row,col,n,m) { return { getValues: () => cells.slice(row-1,row-1+n).map(r => r.slice(col-1,col-1+m)), setNumberFormat() {}, setValues(values) { for(let i=0;i<n;i++) { cells[row-1+i] ||= []; for(let j=0;j<m;j++) cells[row-1+i][col-1+j]=values[i][j]; } } }; } };
  const book = { getId: () => 'test-sheet', getUrl: () => 'https://example.invalid/private', getSheets: () => [sheet], getSheetByName: () => sheet };
  const context = vm.createContext({
    PropertiesService:{getScriptProperties:()=>props},CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
    LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){locked=false;}})},
    SpreadsheetApp:{create:()=>book,openById:()=>book,flush(){}},
    Utilities:{getUuid:()=>crypto.randomUUID(),Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},
      base64Encode:b=>Buffer.from(b).toString('base64'),base64Decode:s=>[...Buffer.from(s,'base64')],
      computeDigest:(alg,s)=>[...crypto.createHash(alg).update(s).digest()],computeHmacSha256Signature:(data,key)=>[...crypto.createHmac('sha256',Buffer.from(key)).update(Buffer.from(data)).digest()],
      newBlob:x=>({getBytes:()=>[...Buffer.from(x)],getDataAsString:()=>Buffer.from(x).toString('utf8')})}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../google-apps-script/Code.gs'),'utf8'), context);
  const salt=crypto.randomBytes(32), key=crypto.pbkdf2Sync('synthetic-test-password',salt,600000,32,'sha256');
  properties.set('PLANNER_AUTH',JSON.stringify({salt:salt.toString('base64'),key:key.toString('base64'),iterations:600000}));
  properties.set('PLANNER_SHEET_ID','test-sheet');
  const proof = challenge => crypto.createHmac('sha256',key).update(challenge.id+':'+challenge.nonce).digest('base64');
  const login = () => { const c=context.getPlannerLoginChallenge();return context.loginPlanner({id:c.id,proof:proof(c)}); };
  return {context,properties,proof,login,get cells(){return cells;}};
}
test('All diary endpoints reject missing or forged sessions before touching records', () => {
  const {context:c}=backend();
  for(const call of [()=>c.loadPlannerDay('','2026-10-26'),()=>c.loadPlannerMonth('fake','2026-10'),()=>c.savePlannerDay('',{}),()=>c.exportPlannerNotes('')]) assert.throws(call,/AUTH_REQUIRED/);
});
test('Challenge proof is one-time, wrong password fails, and logout revokes access', () => {
  const b=backend(), c=b.context, challenge=c.getPlannerLoginChallenge(), proof=b.proof(challenge);
  assert.equal(Object.keys(challenge).sort().join(','),'id,iterations,nonce,salt');
  const session=c.loginPlanner({id:challenge.id,proof});
  assert.throws(()=>c.loginPlanner({id:challenge.id,proof}),/만료/);
  const other=c.getPlannerLoginChallenge();assert.throws(()=>c.loginPlanner({id:other.id,proof:Buffer.alloc(32).toString('base64')}),/비밀번호/);
  assert.equal(c.loadPlannerDay(session.token,'2026-10-26').version,0);
  c.logoutPlanner(session.token);assert.throws(()=>c.exportPlannerNotes(session.token),/AUTH_REQUIRED/);
});
test('Unicode Markdown round-trips, formula text is encoded, stale writes do not overwrite', () => {
  const b=backend(), c=b.context, {token}=b.login();
  const markdown='=IMPORTXML("https://example.invalid","x")\n- [ ] 09:00 - 10:00 [[한글 노트]]\n';
  const saved=c.savePlannerDay(token,{date:'2026-10-26',markdown,expectedVersion:0});
  assert.equal(saved.note.version,1);assert.equal(c.loadPlannerDay(token,'2026-10-26').markdown,markdown);
  assert.ok(!String(b.cells[1][3]).startsWith('='));
  const conflict=c.savePlannerDay(token,{date:'2026-10-26',markdown:'stale',expectedVersion:0});
  assert.equal(conflict.conflict,true);assert.equal(conflict.latest.markdown,markdown);
  assert.equal(c.exportPlannerNotes(token)[0].markdown,markdown);
  assert.throws(()=>c.savePlannerDay(token,{date:'2026-02-30',markdown:'',expectedVersion:0}),/날짜/);
  assert.throws(()=>c.savePlannerDay(token,{date:'2026-10-26',markdown:'가'.repeat(9000),expectedVersion:1}),/24KB/);
});
test('Password changes and expiration invalidate sessions; repeated failures are throttled', () => {
  const b=backend(), c=b.context, {token}=b.login();
  const key=Object.keys(Object.fromEntries(b.properties)).find(k=>k.startsWith('SESSION_'));
  const session=JSON.parse(b.properties.get(key));session.expiresAt=0;b.properties.set(key,JSON.stringify(session));
  assert.throws(()=>c.exportPlannerNotes(token),/AUTH_REQUIRED/);
  const fresh=b.login();const auth=JSON.parse(b.properties.get('PLANNER_AUTH'));auth.key=crypto.randomBytes(32).toString('base64');b.properties.set('PLANNER_AUTH',JSON.stringify(auth));
  assert.throws(()=>c.loadPlannerDay(fresh.token,'2026-10-26'),/AUTH_REQUIRED/);
  for(let i=0;i<10;i++){const x=c.getPlannerLoginChallenge();assert.throws(()=>c.loginPlanner({id:x.id,proof:Buffer.alloc(32).toString('base64')}));}
  assert.throws(()=>c.getPlannerLoginChallenge(),/5분/);
});
