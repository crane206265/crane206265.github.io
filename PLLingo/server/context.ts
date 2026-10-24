import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { ContextSnapshot, Problem, Source } from '../shared/types';
export const dataRoot=path.resolve('private-data');
function canonical(value:unknown):unknown {if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));return value;}
export const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export async function readManifest():Promise<{sources:Source[];materialsAvailable:boolean}> {
  try { return JSON.parse(await readFile(path.join(dataRoot,'manifests/sources.json'),'utf8')); }
  catch { return {sources:[],materialsAvailable:false}; }
}
export async function buildContext(problem:Problem,maxCharacters=65000):Promise<ContextSnapshot> {
  const {sources}=await readManifest();
  const missing:string[]=[];
  const references=problem.sources.map(r=>{
    const source=sources.find(s=>s.id===r.sourceId);
    return {...r,sha256:source?.sha256 || '',available:!!source&&r.pages.every(p=>p>=1&&p<=source.pageCount)&&source.extractionStatus!=='failed'};
  });
  const chunks=[`COURSE: CS320. VERSION: ${problem.id}@${problem.version}.\nPriority: current lecture rules, then textbook explanation. Exam-specific rules apply only to that exam. Never silently merge conflicts.\nProblem assumptions: ${problem.assumptions}\nLearning objective: ${problem.objective}\nMaterial review: needs_review; selected original pages checked where review log exists, not a complete course verification.`];
  for(const r of references){
    if(!r.available){missing.push(r.path);continue;}
    try{
      const pages=JSON.parse(await readFile(path.join(dataRoot,'extracted',r.sourceId+'.json'),'utf8')) as {pdfPage:number;text:string;needsOCR:boolean}[];
      for(const n of r.pages){const p=pages.find(p=>p.pdfPage===n);if(!p||p.needsOCR){missing.push(`${r.sourceId} PDF p.${n}: OCR/추출 확인 필요`);continue;}chunks.push(`[SOURCE ${r.sourceId}; ${r.path}; PDF PAGE ${n} (1-based); ROLE ${r.role}; HASH ${r.sha256}]\n${p.text}`);}
    }catch{missing.push(r.path+': 추출 파일 없음');}
  }
  const text=chunks.join('\n\n');
  if(text.length>maxCharacters) throw new Error(`CONTEXT_TOO_LARGE: 필수 자료 ${text.length}자가 한도 ${maxCharacters}자를 초과했습니다. 규칙은 자르지 않았습니다.`);
  const base={version:1,problemHash:digest(problem),text,references};
  return {...base,hash:digest(base),status:missing.length?'unavailable':'needs_review',missing,
    excluded:sources.filter(s=>!references.some(r=>r.sourceId===s.id)).map(s=>({sourceId:s.id,reason:'선택 주제·규칙·출제 패턴에 직접 필요하지 않음'})),
    estimatedTokens:Math.ceil(text.length/3)};
}
export function verifySnapshot(problem:Problem,context:ContextSnapshot){
  return context.problemHash===digest(problem)&&context.hash===digest({version:context.version,problemHash:context.problemHash,text:context.text,references:context.references});
}
