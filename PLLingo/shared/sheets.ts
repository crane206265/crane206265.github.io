import type { ContextSnapshot, Problem, StudyData, Submission } from './types';
import { freshData, validateBackup } from './domain';
export const HOSTED_CONTEXT_HEADER='PLLingo hosted mock · authored assumptions only';
export interface HostedCatalog {
  schemaVersion:1;
  problems:Problem[];
  weeks:{week:number;title:string;subtitle:string;symbol:string;topics:string[]}[];
  issued:Record<string,{problem:Problem;context:ContextSnapshot}>;
  materials:{sources:[];materialsAvailable:false;contexts:{week:number;title:string;status:string;problems:number}[];analysis:null;review:null;hosted:true};
}
export interface SheetRecords {
  kind:'pllingo-sheet-records';schemaVersion:1;
  settings:StudyData['settings'];submissions:Submission[];reviews:StudyData['reviews'];
  bookmarks:string[];notes:Record<string,string>;
}
export interface SheetReceipt {revision:number;updatedAt:string|null;spreadsheetUrl:string;warnings?:string[];}
export function toSheetRecords(data:StudyData):SheetRecords {
  return {kind:'pllingo-sheet-records',schemaVersion:1,
    settings:JSON.parse(JSON.stringify(data.settings)),reviews:JSON.parse(JSON.stringify(data.reviews)),
    bookmarks:[...data.bookmarks],notes:{...data.notes},
    submissions:data.submissions.map(s=>{
      const copy=JSON.parse(JSON.stringify(s)) as Submission;
      copy.cloudOmissions={photoCount:s.cloudOmissions?.photoCount??s.draft.photos.length,contextText:true};
      copy.draft.photos=[];
      // Keep the original hash and problem version as an archival pointer. Do NOT
      // rehash or substitute a different set of lecture rules for that snapshot.
      copy.context.text='';copy.context.excluded=[];
      return copy;
    })};
}
export function validateSheetRecords(value:unknown):asserts value is SheetRecords {
  const v=value as SheetRecords;
  if(!v||v.kind!=='pllingo-sheet-records'||v.schemaVersion!==1||Object.keys(v).some(k=>!['kind','schemaVersion','settings','submissions','reviews','bookmarks','notes'].includes(k)))throw new Error('시트 기록 형식이 올바르지 않습니다.');
  validateBackup({...freshData(),settings:v.settings,submissions:v.submissions,reviews:v.reviews,bookmarks:v.bookmarks,notes:v.notes});
  if(v.submissions.some(s=>s.draft.photos.length||s.context.text!==''||!s.cloudOmissions?.contextText||!Number.isInteger(s.cloudOmissions.photoCount)||s.cloudOmissions.photoCount<0))throw new Error('시트에는 사진과 비공개 context 본문을 저장하지 않습니다.');
}
export function mergeSheetRecords(local:StudyData,remote:SheetRecords):StudyData {
  validateSheetRecords(remote);
  const submissions=remote.submissions.map(s=>{
    const existing=local.submissions.find(x=>x.id===s.id&&x.context.hash===s.context.hash&&x.problem.version===s.problem.version);
    return existing?{...s,context:existing.context,draft:{...s.draft,photos:existing.draft.photos},cloudOmissions:existing.cloudOmissions}:s;
  });
  const drafts={...local.drafts};
  for(const [id,d] of Object.entries(drafts))if(d.submissionId&&!submissions.some(s=>s.id===d.submissionId))drafts[id]={...d,submissionId:undefined};
  return {...local,settings:remote.settings,submissions,reviews:remote.reviews,bookmarks:remote.bookmarks,notes:remote.notes,drafts};
}
