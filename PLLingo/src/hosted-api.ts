import type { HostedCatalog } from '../shared/sheets';
import { handleHostedApi, assertHostedIssue } from '../shared/hosted';
import { connectionSnapshot, sheetRequest } from './sheets-client';
let catalogPromise:Promise<HostedCatalog>|undefined;
async function catalog(){
  if(!catalogPromise)catalogPromise=fetch(import.meta.env.BASE_URL+'hosted-catalog.json').then(r=>{if(!r.ok)throw new Error('호스팅 문제 목록을 읽을 수 없습니다. npm run build:pages로 빌드하세요.');return r.json();}).catch(error=>{catalogPromise=undefined;throw error;});
  return catalogPromise;
}
export async function hostedApi<T>(url:string,body?:any):Promise<T>{
  const data=await catalog();
  if(!connectionSnapshot().connected)return handleHostedApi(data,url,body) as T;
  if(url==='/grade'||url==='/hint')assertHostedIssue(data,body); // Block private local snapshots before any network transmission.
  let payload=body;
  if(url==='/grade')payload={...body,draft:{...body.draft,photoCount:body.draft.photos.length,photos:[]}};
  return sheetRequest<T>('api',{url,body:payload});
}
