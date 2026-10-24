import type { HostedCatalog } from './sheets';
import type { GradeRequest } from './types';
import { gradeMock, MockFailure } from './mock';
export function canonicalJSON(value:unknown):string {
  const walk=(v:any):any=>Array.isArray(v)?v.map(walk):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort((a,b)=>a.localeCompare(b)).map(k=>[k,walk(v[k])])):v;
  return JSON.stringify(walk(value));
}
export function assertHostedIssue(catalog:HostedCatalog,input:any){
  const issued=catalog.issued[input?.problem?.id];
  if(!issued||canonicalJSON(input.problem)!==canonicalJSON(issued.problem)||canonicalJSON(input.context)!==canonicalJSON(issued.context))
    throw new MockFailure('SNAPSHOT_MISMATCH','호스팅용 문제 버전이 일치하지 않습니다. 현재 초안을 백업한 뒤 문제은행에서 새 문제를 여세요.',422);
  return issued;
}
/** No filesystem, external AI calls, or private lecture extracts in this adapter. */
export function handleHostedApi(catalog:HostedCatalog,url:string,body?:any,provider='mock'):unknown {
  if(url==='/health')return {ok:true,provider,geminiConnected:false,backend:'google-sheets'};
  if(url==='/problems')return {problems:catalog.problems.map(({answer,hints,rubric,...p})=>p),weeks:catalog.weeks};
  if(url==='/materials')return catalog.materials;
  if(url.startsWith('/problems/')){const issued=catalog.issued[url.slice(10)];if(!issued)throw new MockFailure('NOT_FOUND','문제가 없습니다.',404);return issued;}
  if(url.startsWith('/context/')){
    const issued=catalog.issued[url.slice(9)];if(!issued)throw new MockFailure('NOT_FOUND','문제가 없습니다.',404);
    return {context:issued.context,generation:{status:'hosted_mock',instruction:'직접 작성한 문제의 가정만 사용. 비공개 강의·기출 원문은 이 빌드에 없음.'},grading:{status:'demo',instruction:'데모 채점: 실제 답안 분석 없음',problemVersion:issued.problem.version,rubric:issued.problem.rubric}};
  }
  if(!['/hint','/grade','/generate'].includes(url))throw new MockFailure('NOT_FOUND','지원하지 않는 요청입니다.',404);
  if(provider!=='mock')throw new MockFailure('NOT_CONNECTED','Gemini는 아직 연결하지 않았습니다. 실제 요청과 mock 대체는 수행하지 않습니다.');
  if(url==='/generate'){
    if(!Array.isArray(body?.weeks)||!body.weeks.every(Number.isInteger)||!Array.isArray(body?.recentIds))throw new MockFailure('VALIDATION_ERROR','출제 조건이 올바르지 않습니다.',422);
    const candidates=catalog.problems.filter(p=>body.weeks.includes(p.week));const p=candidates.find(p=>!body.recentIds.includes(p.id))||candidates[0];
    if(!p)throw new MockFailure('NO_PROBLEM','선택한 범위에 문제가 없습니다.',422);return catalog.issued[p.id];
  }
  const {problem}=assertHostedIssue(catalog,body);
  if(url==='/hint'){
    if(!Number.isInteger(body.level)||body.level<1||body.level>3)throw new MockFailure('VALIDATION_ERROR','힌트 단계가 올바르지 않습니다.',422);
    return {hint:problem.hints[body.level-1]};
  }
  const d=body.draft;
  const count=d?.photoCount??d?.photos?.length??0;
  if(!d||d.problemId!==problem.id||typeof d.text!=='string'||d.text.length>100000||typeof d.correction!=='string'||d.correction.length>100000||!Number.isInteger(count)||count<0||count>12||!['correct','partial','incorrect','needs_clarification','rate_limit','network_error'].includes(body.scenario))throw new MockFailure('VALIDATION_ERROR','답안 형식이 올바르지 않습니다.',422);
  if(!d.text.trim()&&!d.correction.trim()&&!count)throw new MockFailure('EMPTY_SUBMISSION','답안 또는 풀이 사진을 입력하세요.',422);
  return gradeMock(body as GradeRequest);
}
