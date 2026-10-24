import type { StudyData, Review, Submission, Problem } from './types';
export const freshData = (): StudyData => ({ schemaVersion: 1, settings: { goal: 5, weeks: [9,10,11,12,13,14] }, submissions: [], reviews: [], drafts: {}, bookmarks: [], notes: {}, session: null, issued: {} });
export function seoulDay(date: Date | string = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date));
}
export function addDays(day: string, n: number) { const d = new Date(day + 'T00:00:00+09:00'); d.setUTCDate(d.getUTCDate()+n); return seoulDay(d); }
export function streak(submissions: Submission[], now = new Date(), mode: 'mock' | 'live' = 'mock') {
  const days = new Set(submissions.filter(s=>s.mode===mode && s.feedback.score!==null).map(s=>seoulDay(s.createdAt)));
  let day = seoulDay(now), n=0;
  if (!days.has(day)) day=addDays(day,-1);
  while (days.has(day)) { n++; day=addDays(day,-1); }
  return n;
}
export function schedule(previous: Review | undefined, status: string, now = new Date()): Review | undefined {
  if (!['correct','partial','incorrect'].includes(status)) return previous;
  const success = status==='correct';
  const interval = success ? Math.min(30, previous?.successes ? Math.max(3, previous.interval*2) : 3) : 1;
  return { problemId: previous?.problemId || '', due: addDays(seoulDay(now), interval), interval,
    successes: success ? (previous?.successes || 0)+1 : 0,
    history: [...(previous?.history || []), { at: now.toISOString(), status, interval }] };
}
export function chooseSession(problems: Problem[], data: StudyData, now = new Date()) {
  const eligible = problems.filter(p=>data.settings.weeks.includes(p.week));
  const due = eligible.filter(p=>data.reviews.some(r=>r.problemId===p.id && r.due<=seoulDay(now)))
    .sort((a,b)=>(data.reviews.find(r=>r.problemId===a.id)!.due).localeCompare(data.reviews.find(r=>r.problemId===b.id)!.due));
  const unseen=eligible.filter(p=>!due.includes(p)&&!data.submissions.some(s=>s.problem.id===p.id));
  const rest=eligible.filter(p=>!due.includes(p)&&!unseen.includes(p));
  const mixed: Problem[]=[];
  while(due.length || unseen.length) { if(due.length)mixed.push(due.shift()!); if(unseen.length)mixed.push(unseen.shift()!); }
  return [...mixed,...rest].slice(0,data.settings.goal).map(p=>p.id);
}
export function validateBackup(value: unknown): asserts value is StudyData {
  const v=value as StudyData;
  if (!v || v.schemaVersion!==1 || !v.settings || !Number.isInteger(v.settings.goal) || v.settings.goal<1 || v.settings.goal>20 || !Array.isArray(v.settings.weeks) || v.settings.weeks.some(w=>![2,3,4,5,6,7,9,10,11,12,13,14].includes(w)) || !Array.isArray(v.submissions) || !Array.isArray(v.reviews) || !v.drafts || !Array.isArray(v.bookmarks) || !v.notes || !v.issued) throw new Error('지원하지 않거나 손상된 백업입니다.');
  const strings=(a:unknown):a is string[]=>Array.isArray(a)&&a.every(x=>typeof x==='string');
  const object=(a:unknown)=>!!a&&typeof a==='object'&&!Array.isArray(a);
  const validDate=(d:unknown)=>typeof d==='string'&&Number.isFinite(Date.parse(d));
  const photoOK=(p:any)=>p&&typeof p.id==='string'&&typeof p.name==='string'&&typeof p.data==='string'&&p.data.length<=8_000_000&&/^data:image\/(png|jpeg|webp);base64,/.test(p.data)&&[0,90,180,270].includes(p.rotation);
  const draftOK=(d:any)=>d&&typeof d.problemId==='string'&&typeof d.text==='string'&&typeof d.correction==='string'&&['text','code'].includes(d.mode)&&typeof d.answerRevealed==='boolean'&&validDate(d.startedAt)&&Array.isArray(d.photos)&&d.photos.length<=12&&d.photos.every(photoOK)&&Number.isInteger(d.hintCount)&&d.hintCount>=0&&d.hintCount<=3;
  const problemOK=(p:any)=>p&&typeof p.id==='string'&&Number.isInteger(p.version)&&['semantics','expression','scala','concept','analysis'].includes(p.kind)&&['기초','중급','도전'].includes(p.difficulty)&&Number.isInteger(p.week)&&['title','body','assumptions','answer','objective','topic','language'].every(k=>typeof p[k]==='string')&&strings(p.hints)&&strings(p.commonErrors)&&Array.isArray(p.rubric)&&p.rubric.every((r:any)=>r&&typeof r.label==='string'&&typeof r.description==='string'&&Number.isFinite(r.points))&&Array.isArray(p.sources)&&p.sources.every((s:any)=>s&&typeof s.sourceId==='string'&&typeof s.path==='string'&&Array.isArray(s.pages)&&s.pages.every((n:any)=>Number.isInteger(n)&&n>0));
  const contextOK=(c:any)=>c&&c.version===1&&/^[a-f0-9]{64}$/.test(c.hash)&&/^[a-f0-9]{64}$/.test(c.problemHash)&&typeof c.text==='string'&&c.text.length<=65000&&strings(c.missing)&&Array.isArray(c.excluded)&&Array.isArray(c.references)&&['ready','needs_review','unavailable'].includes(c.status);
  const feedbackOK=(f:any)=>f&&['correct','partial','incorrect','needs_clarification'].includes(f.status)&&typeof f.recognized==='string'&&(f.score===null||Number.isFinite(f.score))&&Number.isFinite(f.maxScore)&&Array.isArray(f.items)&&f.items.every((r:any)=>r&&typeof r.label==='string'&&typeof r.detail==='string'&&Number.isFinite(r.score)&&Number.isFinite(r.max))&&strings(f.strengths)&&strings(f.errors)&&strings(f.concepts)&&typeof f.demo==='boolean';
  if(!object(v.drafts)||!object(v.issued)||!object(v.notes)||!strings(v.bookmarks)||Object.values(v.notes).some(n=>typeof n!=='string')||Object.values(v.drafts).some(d=>!draftOK(d))||Object.values(v.issued).some(i=>!i||!problemOK(i.problem)||!contextOK(i.context))||v.submissions.some(s=>!s.id||!problemOK(s.problem)||!contextOK(s.context)||!draftOK(s.draft)||!['mock','live'].includes(s.mode)||!feedbackOK(s.feedback)||typeof s.appeal!=='string'||!validDate(s.createdAt))||v.reviews.some(r=>!r.problemId||!/^\d{4}-\d{2}-\d{2}$/.test(r.due)||!Array.isArray(r.history)||!Number.isFinite(r.interval)||!Number.isInteger(r.successes))||(v.session&&(!strings(v.session.ids)||!Number.isInteger(v.session.index)||v.session.index<0||v.session.index>v.session.ids.length||typeof v.session.finished!=='boolean'||!validDate(v.session.startedAt)))) throw new Error('백업 내부 데이터 형식이 올바르지 않습니다.');
}
export function exportData(data: StudyData, full: boolean): StudyData {
  const copy=structuredClone(data);
  if(!full){ Object.values(copy.drafts).forEach(d=>d.photos=[]); copy.submissions.forEach(s=>s.draft.photos=[]); }
  return copy;
}
