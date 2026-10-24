import type { HostedCatalog, SheetRecords, SheetReceipt } from '../shared/sheets';
import { validateSheetRecords } from '../shared/sheets';
import { canonicalJSON, handleHostedApi } from '../shared/hosted';
import { MockFailure } from '../shared/mock';
declare const PL_CATALOG:HostedCatalog;
declare const PropertiesService:any, SpreadsheetApp:any, Utilities:any, LockService:any, HtmlService:any, console:any;
const catalog=PL_CATALOG;
const MARKER='PLLingo Sheets backend v1';
const CHUNK=38000, MAX_CHARS=2_000_000;
class SheetError extends Error { constructor(public code:string,message:string){super(message);} }
const props=()=>PropertiesService.getScriptProperties();
function sha(text:string):string{return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text,Utilities.Charset.UTF_8).map((b:number)=>(b&255).toString(16).padStart(2,'0')).join('');}
function origins():string[]{return (props().getProperty('ALLOWED_ORIGINS')||'').split(/[\s,]+/).filter(Boolean);}
function checkOrigin(origin:unknown):asserts origin is string {
  if(typeof origin!=='string'||!origins().includes(origin))throw new SheetError('ORIGIN_NOT_ALLOWED','Apps Script의 ALLOWED_ORIGINS에 현재 사이트 주소를 등록하세요.');
}
function authenticate(token:unknown){
  const expected=props().getProperty('ACCESS_TOKEN');
  if(!expected||expected.length<32)throw new SheetError('CONFIGURATION_ERROR','Apps Script 편집기에서 setupPllingo_를 먼저 실행하세요.');
  const actual=typeof token==='string'&&token.length<=200?sha(token):sha('');const wanted=sha(expected);let diff=0;
  for(let i=0;i<wanted.length;i++)diff|=actual.charCodeAt(i)^wanted.charCodeAt(i);
  if(diff)throw new SheetError('AUTH_REQUIRED','Google Sheets 연결용 비밀번호가 일치하지 않습니다.');
}
function spreadsheet(){
  const id=props().getProperty('SPREADSHEET_ID');if(!id)throw new SheetError('CONFIGURATION_ERROR','새 시트를 먼저 초기화하세요.');
  const ss=SpreadsheetApp.openById(id);
  if(ss.getSheetByName('PLLingo_Metadata')?.getRange(1,1).getValue()!==MARKER)throw new SheetError('WRONG_SPREADSHEET','PLLingo 전용 시트가 아닙니다. 기존 시트를 덮어쓰지 않습니다.');
  return ss;
}
function table(ss:any,name:string,headers:string[]){
  let s=ss.getSheetByName(name);if(!s)s=ss.insertSheet(name);
  if(!s.getLastRow())s.getRange(1,1,1,headers.length).setValues([headers]);
  return s;
}
function lock<T>(work:()=>T):T {
  const l=LockService.getScriptLock();if(!l.tryLock(5000))throw new SheetError('BUSY','다른 저장 요청을 처리 중입니다. 잠시 후 다시 시도하세요.');
  try{return work();}finally{l.releaseLock();}
}
function head(ss:any):any {
  const value=ss.getSheetByName('PLLingo_Metadata').getRange(2,2).getValue();
  return value?JSON.parse(String(value).slice(5)):{revision:0,updatedAt:null,hash:'',requestId:''};
}
function receipt(ss:any,h:any):SheetReceipt{return {revision:h.revision,updatedAt:h.updatedAt,spreadsheetUrl:ss.getUrl()};}
const snapshotHeaders=['revision','part','parts','json_chunk','sha256','request_id','created_at'];
function chunks(text:string):string[]{
  const result:string[]=[];
  for(let start=0;start<text.length;){let end=Math.min(start+CHUNK,text.length);const last=text.charCodeAt(end-1);if(end<text.length&&last>=0xD800&&last<=0xDBFF)end--;result.push(text.slice(start,end));start=end;}
  return result;
}
function readState(){return lock(()=>{
  const ss=spreadsheet(),h=head(ss);if(!h.revision)return {...receipt(ss,h),records:null};
  const s=table(ss,'Snapshots',snapshotHeaders);
  const rows=s.getDataRange().getValues().slice(1).filter((r:any[])=>r[0]===h.revision&&r[5]===h.requestId).sort((a:any[],b:any[])=>a[1]-b[1]);
  if(!rows.length||rows.length!==rows[0][2]||rows.some((r:any[],i:number)=>r[1]!==i||r[2]!==rows.length||r[4]!==h.hash||r[5]!==h.requestId||!String(r[3]).startsWith('json:')))throw new SheetError('CORRUPT_STATE','시트 저장 조각이 누락되었거나 손상되었습니다. 로컬 기록은 유지됩니다.');
  const text=rows.map((r:any[])=>String(r[3]).slice(5)).join('');
  if(sha(text)!==h.hash)throw new SheetError('CORRUPT_STATE','시트 기록의 해시가 일치하지 않습니다.');
  const records=JSON.parse(text);validateSheetRecords(records);return {...receipt(ss,h),records};
});}
function readable(ss:any,name:string,headers:string[],rows:unknown[][]){
  const s=table(ss,name,headers);s.clearContents();
  if(rows.length+1>s.getMaxRows())s.insertRowsAfter(s.getMaxRows(),rows.length+1-s.getMaxRows());
  const escape=(v:unknown)=>typeof v==='string'?"'"+(v.length>CHUNK?v.slice(0,CHUNK)+'… (전체 내용: Snapshots)':v):v;
  s.getRange(1,1,rows.length+1,headers.length).setValues([headers,...rows.map(r=>r.map(escape))]);
}
function indexState(ss:any,records:SheetRecords){
  readable(ss,'Settings',['key','value'],[['daily_goal',records.settings.goal],['weeks',JSON.stringify(records.settings.weeks)],['timezone','Asia/Seoul']]);
  readable(ss,'Submissions',['id','problem_id','version','created_at','mode','status','score','answer','context_hash','local_photo_count'],records.submissions.map(s=>[s.id,s.problem.id,s.problem.version,s.createdAt,s.mode,s.feedback.status,s.feedback.score,s.draft.correction||s.draft.text,s.context.hash,s.cloudOmissions!.photoCount]));
  readable(ss,'Reviews',['problem_id','due_seoul','interval_days','successes'],records.reviews.map(r=>[r.problemId,r.due,r.interval,r.successes]));
  readable(ss,'Notes',['problem_id','note','bookmarked'],[...new Set([...Object.keys(records.notes),...records.bookmarks])].map(id=>[id,records.notes[id]||'',records.bookmarks.includes(id)]));
}
function writeState(payload:any){
  if(!payload||!Number.isInteger(payload.expectedRevision)||payload.expectedRevision<0||typeof payload.requestId!=='string'||!/^[a-zA-Z0-9-]{16,100}$/.test(payload.requestId))throw new SheetError('VALIDATION_ERROR','저장 요청 버전이 올바르지 않습니다.');
  try{validateSheetRecords(payload.records);}catch(error){throw new SheetError('VALIDATION_ERROR',(error as Error).message);}
  const text=canonicalJSON(payload.records);if(text.length>MAX_CHARS)throw new SheetError('STATE_TOO_LARGE','기록이 200만 자를 넘었습니다. 전체 백업을 보관한 뒤 데모 기록을 정리하세요.');
  const hash=sha(text);
  return lock(()=>{
    const ss=spreadsheet(),before=head(ss);
    if(before.requestId===payload.requestId){if(before.hash!==hash)throw new SheetError('REQUEST_ID_REUSED','같은 요청 ID로 다른 기록을 저장할 수 없습니다.');return receipt(ss,before);}
    if(before.revision!==payload.expectedRevision)throw new SheetError('REVISION_CONFLICT','다른 탭이나 기기에서 시트 기록을 변경했습니다. 로컬 백업 후 최신 시트 기록을 불러오세요.');
    const next={revision:before.revision+1,updatedAt:new Date().toISOString(),hash,requestId:payload.requestId};
    const pieces=chunks(text),parts=pieces.length;const rows=pieces.map((piece,i)=>[next.revision,i,parts,'json:'+piece,hash,next.requestId,next.updatedAt]);
    const s=table(ss,'Snapshots',snapshotHeaders),start=s.getLastRow()+1;
    if(start+parts-1>s.getMaxRows())s.insertRowsAfter(s.getMaxRows(),start+parts-1-s.getMaxRows());
    s.getRange(start,1,parts,snapshotHeaders.length).setValues(rows);SpreadsheetApp.flush();
    // Commit the pointer only after every chunk has been written. Orphaned chunks
    // from interrupted attempts are never selected by the reader's request ID.
    ss.getSheetByName('PLLingo_Metadata').getRange(2,1,1,2).setValues([['state_head','json:'+JSON.stringify(next)]]);SpreadsheetApp.flush();
    const result:SheetReceipt=receipt(ss,next);
    try{indexState(ss,payload.records);}catch{result.warnings=['기록 본문은 저장했지만 요약 탭 갱신에 실패했습니다. 다음 저장에서 다시 갱신합니다.'];}
    // Keep the three latest committed versions; do not touch the active version.
    try{const all=s.getDataRange().getValues();for(let i=all.length-1;i>=1;i--)if(Number(all[i][0])<next.revision-2)s.deleteRow(i+1);}catch{/* Optional cleanup cannot undo a committed write. */}
    return result;
  });
}
/** Editor-only entry point; wrapper ends in '_' so google.script.run cannot call it. */
export function setup(){return lock(()=>{
  let ss:any;const id=props().getProperty('SPREADSHEET_ID');
  if(id)ss=spreadsheet();else{
    ss=SpreadsheetApp.create('PLLingo · CS320 학습 기록');
    ss.getSheets()[0].setName('PLLingo_Metadata');ss.getSheetByName('PLLingo_Metadata').getRange(1,1).setValue(MARKER);
    props().setProperty('SPREADSHEET_ID',ss.getId());
  }
  if(!props().getProperty('ACCESS_TOKEN'))props().setProperty('ACCESS_TOKEN',Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,''));
  if(!props().getProperty('AI_PROVIDER'))props().setProperty('AI_PROVIDER','mock');
  table(ss,'Snapshots',snapshotHeaders);
  console.log('PLLingo 전용 시트: '+ss.getUrl()+'. 연결 비밀번호는 프로젝트 설정의 ACCESS_TOKEN에서 확인하세요.');
  return {spreadsheetUrl:ss.getUrl(),configuredOrigins:origins()};
});}
export function serveBridge(e:any){
  try{
    const origin=e?.parameter?.origin,channel=e?.parameter?.channel;checkOrigin(origin);
    if(typeof channel!=='string'||!/^[a-f0-9-]{36}$/.test(channel))throw new SheetError('INVALID_CHANNEL','PLLingo 설정 화면에서 연결하세요.');
    const template=HtmlService.createTemplateFromFile('Bridge');template.originJSON=JSON.stringify(origin).replace(/</g,'\\u003c');template.channelJSON=JSON.stringify(channel);
    return template.evaluate().setTitle('PLLingo Google 연결').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }catch{return HtmlService.createHtmlOutput('PLLingo 설정에서 연결하세요. ALLOWED_ORIGINS와 웹앱 배포 설정을 확인하세요.');}
}
export function rpc(request:any){
  try{
    authenticate(request?.token);checkOrigin(request?.origin);
    if(request.action==='state.get')return {ok:true,value:readState()};
    if(request.action==='state.put')return {ok:true,value:writeState(request.payload)};
    if(request.action==='api'){
      const input=request.payload;
      if(typeof input?.url!=='string'||input.url.length>150)throw new SheetError('VALIDATION_ERROR','요청 경로가 올바르지 않습니다.');
      if(input.body?.draft?.photos?.length)throw new SheetError('PRIVATE_DATA_REJECTED','풀이 사진은 시트 서버에 보내지 않습니다.');
      const value=handleHostedApi(catalog,input.url,input.body,props().getProperty('AI_PROVIDER')||'mock');
      if(input.url==='/health')return {ok:true,value:{...(value as object),...receipt(spreadsheet(),head(spreadsheet()))}};
      return {ok:true,value};
    }
    throw new SheetError('NOT_FOUND','지원하지 않는 작업입니다.');
  }catch(error){return {ok:false,error:error instanceof SheetError||error instanceof MockFailure?{code:error.code,message:error.message}:{code:'GOOGLE_SERVICE_ERROR',message:'Google Sheets 요청을 완료하지 못했습니다. 기존 로컬 기록은 유지됩니다.'}};}
}
