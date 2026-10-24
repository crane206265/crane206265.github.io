import type { SheetReceipt, SheetRecords } from '../shared/sheets';
export const isHosted=import.meta.env.VITE_BACKEND_MODE==='sheets';
export interface ConnectionState {connected:boolean;connecting:boolean;revision:number;spreadsheetUrl:string;error:string;}
let state:ConnectionState={connected:false,connecting:false,revision:0,spreadsheetUrl:'',error:''};
const subscribers=new Set<()=>void>();
const publish=(patch:Partial<ConnectionState>)=>{state={...state,...patch};subscribers.forEach(fn=>fn());};
export const connectionSnapshot=()=>state;
export const subscribeConnection=(fn:()=>void)=>{subscribers.add(fn);return()=>{subscribers.delete(fn);};};
interface Pending {resolve:(value:any)=>void;reject:(err:Error)=>void;timer:ReturnType<typeof setTimeout>;}
interface Connection {frame:HTMLIFrameElement;token:string;channel:string;origin:string;source:Window|null;listener:(e:MessageEvent)=>void;pending:Map<string,Pending>;rejectReady:(error:Error)=>void;}
let active:Connection|null=null;
export const validBridgeOrigin=(origin:string)=>/^https:\/\/(?:[a-z0-9-]+-script\.googleusercontent\.com|script\.googleusercontent\.com)$/.test(origin);
function descendant(source:Window,root:Window){try{for(let i=0;i<8;i++){if(source===root)return true;const parent=source.parent;if(parent===source)return false;source=parent;}}catch{}return false;}
export function disconnectSheets(){
  if(active){window.removeEventListener('message',active.listener);active.frame.remove();active.token='';active.rejectReady(new Error('연결을 종료했습니다.'));for(const p of active.pending.values()){clearTimeout(p.timer);p.reject(new Error('Google Sheets 연결을 종료했습니다.'));}active.pending.clear();active=null;}
  publish({connected:false,connecting:false,revision:0,spreadsheetUrl:'',error:''});
}
export async function connectSheets(endpoint:string,token:string):Promise<SheetReceipt>{
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(endpoint))throw new Error('Apps Script의 /exec로 끝나는 웹앱 배포 URL을 입력하세요.');
  if(token.length<32||token.length>200)throw new Error('Apps Script 프로젝트 설정의 ACCESS_TOKEN을 입력하세요.');
  disconnectSheets();publish({connecting:true,error:''});
  const frame=document.createElement('iframe');frame.hidden=true;frame.title='Google Sheets 연결';frame.referrerPolicy='no-referrer';
  const channel=crypto.randomUUID(),url=new URL(endpoint);url.searchParams.set('origin',location.origin);url.searchParams.set('channel',channel);
  let resolveReady!:()=>void,rejectReady!:(error:Error)=>void;
  const ready=new Promise<void>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  const readyTimer=setTimeout(()=>rejectReady(new Error('Google 연결 창이 응답하지 않습니다. 배포 공개 범위와 ALLOWED_ORIGINS를 확인하세요.')),25000);
  const c:Connection={frame,token,channel,origin:'',source:null,pending:new Map(),rejectReady,listener:(event:MessageEvent)=>{
    const m=event.data;
    if(!m||m.type!=='pllingo-sheets'||m.channel!==channel||!validBridgeOrigin(event.origin)||!event.source||!frame.contentWindow||!descendant(event.source as Window,frame.contentWindow))return;
    if(m.ready&&!c.source){c.source=event.source as Window;c.origin=event.origin;clearTimeout(readyTimer);resolveReady();return;}
    if(event.source!==c.source||event.origin!==c.origin||typeof m.id!=='string')return;
    const pending=c.pending.get(m.id);if(!pending)return;clearTimeout(pending.timer);c.pending.delete(m.id);
    if(m.reply?.ok===true)pending.resolve(m.reply.value);else pending.reject(new Error(m.reply?.error?.message||'Google Sheets 요청이 실패했습니다.'));
  }};
  active=c;window.addEventListener('message',c.listener);frame.src=url.href;document.body.append(frame);
  try{await ready;const health=await sheetRequest<any>('api',{url:'/health'});publish({connected:true,connecting:false,revision:health.revision,spreadsheetUrl:health.spreadsheetUrl});return health;}
  catch(error){clearTimeout(readyTimer);if(active===c)disconnectSheets();publish({error:(error as Error).message});throw error;}
}
export function sheetRequest<T>(action:string,payload?:unknown):Promise<T>{
  const c=active;if(!c?.source)return Promise.reject(new Error('설정에서 Google Sheets에 먼저 연결하세요.'));
  return new Promise((resolve,reject)=>{const id=crypto.randomUUID();const timer=setTimeout(()=>{c.pending.delete(id);reject(new Error('Google Sheets 응답 시간이 초과되었습니다. 저장 결과가 불확실하므로 동일한 내용으로 재시도하거나 최신 기록을 불러오세요.'));},45000);c.pending.set(id,{resolve,reject,timer});c.source!.postMessage({type:'pllingo-sheets',channel:c.channel,id,token:c.token,action,payload},c.origin);});
}
export async function pullSheetRecords(){const value=await sheetRequest<SheetReceipt&{records:SheetRecords|null}>('state.get');publish({revision:value.revision,spreadsheetUrl:value.spreadsheetUrl});return value;}
export async function pushSheetRecords(records:SheetRecords,revision:number,requestId:string){const value=await sheetRequest<SheetReceipt>('state.put',{records,expectedRevision:revision,requestId});publish({revision:value.revision,spreadsheetUrl:value.spreadsheetUrl});return value;}
export function sourceURL(sourceId:string,page?:number){return isHosted?undefined:`/api/sources/${sourceId}${page?'#page='+page:''}`;}
