import { openDB } from 'idb';
import { freshData, validateBackup } from '../shared/domain';
import type { StudyData } from '../shared/types';
import { isHosted } from './sheets-client';
import { hostedApi } from './hosted-api';
const db=openDB('pllingo-local',1,{upgrade(db){db.createObjectStore('state');}});
const photoJournalKey='pllingo-pending-photo-layout';
function recoverPhotoLayout(data:StudyData){
  // IndexedDB commits asynchronously and navigation can cancel the last write.
  // A tiny synchronous journal preserves order/rotation for existing images.
  // Image bytes and answers remain in IndexedDB; this journal is tab-local.
  try{
    const layouts:unknown=JSON.parse(sessionStorage.getItem(photoJournalKey)||'null');
    if(!layouts||typeof layouts!=='object'||Array.isArray(layouts))return;
    for(const [id,layout] of Object.entries(layouts)){
      const draft=data.drafts[id];
      if(!draft||!Array.isArray(layout)||layout.length>12)continue;
      const existing=new Map(draft.photos.map(photo=>[photo.id,photo]));
      if(layout.some(p=>!p||typeof p.id!=='string'||!existing.has(p.id)||![0,90,180,270].includes(p.rotation)))continue;
      if(new Set(layout.map(p=>p.id)).size!==layout.length)continue;
      draft.photos=layout.map(p=>({...existing.get(p.id)!,rotation:p.rotation}));
    }
  }catch{/* IndexedDB remains available if tab storage is disabled. */}
}
export async function loadData(){const value=await (await db).get('state','study');if(!value)return freshData();validateBackup(value);recoverPhotoLayout(value);return value;}
export function saveData(data:StudyData){
  const journal=JSON.stringify(Object.fromEntries(Object.entries(data.drafts).map(([id,draft])=>[id,draft.photos.map(({id,rotation})=>({id,rotation}))])));
  try{sessionStorage.setItem(photoJournalKey,journal);}catch{/* Full image data is saved in IndexedDB below. */}
  return db.then(async database=>{
    const tx=database.transaction('state','readwrite',{durability:'strict'});void tx.store.put(data,'study');await tx.done;
    try{if(sessionStorage.getItem(photoJournalKey)===journal)sessionStorage.removeItem(photoJournalKey);}catch{/* Optional tab storage. */}
  });
}
export async function api<T>(url:string,body?:unknown):Promise<T>{
  if(isHosted)return hostedApi<T>(url,body);
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),20000);
  try{const r=await fetch('/api'+url,{signal:ctrl.signal,...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const value=await r.json();if(!r.ok)throw new Error(value.message||'요청을 처리하지 못했습니다.');return value;}finally{clearTimeout(timer);}
}
