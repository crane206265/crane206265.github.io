import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { problems, weekInfo } from './content';
import { buildContext, readManifest, verifySnapshot } from './context';
import { getProvider, ProviderError, generationPrompt, gradingPrompt } from './providers';
import type { GradeRequest } from '../shared/types';
const app=express();
app.disable('x-powered-by');
app.use((req,res,next)=>{
  const origin=req.headers.origin;
  if(origin&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))return res.status(403).json({error:'LOCAL_ONLY',message:'로컬 브라우저에서만 접근할 수 있습니다.'});
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.path.startsWith('/api'))res.setHeader('Cache-Control','no-store');
  next();
});
app.use(express.json({limit:'40mb'}));
const route=(fn:(req:express.Request,res:express.Response)=>Promise<unknown>)=>(req:express.Request,res:express.Response,next:express.NextFunction)=>Promise.resolve(fn(req,res)).catch(next);
app.get('/api/health',(_req,res)=>res.json({ok:true,provider:process.env.AI_PROVIDER||'mock',geminiConnected:false}));
app.get('/api/problems',(_req,res)=>res.json({problems:problems.map(({answer,hints,rubric,...p})=>p),weeks:weekInfo}));
app.get('/api/problems/:id',route(async(req,res)=>{
  const p=problems.find(p=>p.id===req.params.id);if(!p)return res.status(404).json({message:'문제가 없습니다.'});
  const context=await buildContext(p);
  // The full version is a local archival snapshot. The UI hides the solution before submission.
  res.json({problem:p,context});
}));
app.get('/api/materials',route(async(_req,res)=>{
  const manifest=await readManifest();
  const contexts=await Promise.all(weekInfo.map(async w=>{
    const selected=problems.filter(p=>p.week===w.week);const cs=await Promise.all(selected.map(p=>buildContext(p)));
    return {week:w.week,title:w.title,status:!cs.length||cs.every(c=>c.status==='unavailable')?'unavailable':'needs_review',problems:selected.length};
  }));
  let analysis:unknown=null;try{analysis=JSON.parse(await readFile('private-data/exam-patterns/22-2-final.json','utf8'));}catch{}
  let review:unknown=null;try{review=JSON.parse(await readFile('private-data/manifests/review.json','utf8'));}catch{}
  res.json({...manifest,contexts,analysis,review});
}));
app.get('/api/sources/:id',route(async(req,res)=>{
  const manifest=await readManifest();const s=manifest.sources.find(s=>s.id===req.params.id);if(!s)return res.status(404).end();
  const base=path.resolve(process.env.MATERIALS_DIR||'materials');const file=path.resolve(base,s.materialsPath);
  if(!file.startsWith(base+path.sep))return res.status(403).end();
  res.sendFile(file,err=>{if(err&&!res.headersSent)res.status(404).json({message:'원본 자료가 없습니다. materials 경로와 manifest를 확인하세요.'});});
}));
const photo=z.object({id:z.string(),name:z.string(),data:z.string().regex(/^data:image\/(png|jpeg|webp);base64,/).max(8_000_000),rotation:z.union([z.literal(0),z.literal(90),z.literal(180),z.literal(270)])});
const draftSchema=z.object({problemId:z.string(),text:z.string().max(100000),mode:z.enum(['text','code']),photos:z.array(photo).max(12),hintCount:z.number().int().min(0).max(3),answerRevealed:z.boolean(),startedAt:z.string().datetime(),correction:z.string().max(100000)});
const problemSchema=z.object({
  id:z.string().min(1).max(100),version:z.number().int().positive(),week:z.number().int().min(2).max(14),
  topic:z.string().min(1),language:z.string().min(1),kind:z.enum(['semantics','expression','scala','concept','analysis']),
  difficulty:z.enum(['기초','중급','도전']),title:z.string().min(1),body:z.string().min(1).max(100000),
  assumptions:z.string().max(50000),objective:z.string(),hints:z.array(z.string()).length(3),answer:z.string().max(100000),
  rubric:z.array(z.object({label:z.string(),points:z.number().nonnegative(),description:z.string()})).min(1),
  commonErrors:z.array(z.string()),sources:z.array(z.object({sourceId:z.string(),path:z.string(),pages:z.array(z.number().int().positive()).min(1),role:z.enum(['lecture','pattern','solution'])})).min(1),
  reviewStatus:z.enum(['needs_review','ready']),origin:z.enum(['직접 작성','기출 변형','기출 원문','AI 생성'])
});
const contextSchema=z.object({version:z.literal(1),hash:z.string(),problemHash:z.string(),text:z.string().max(65000),status:z.enum(['ready','needs_review','unavailable']),references:z.array(z.object({sourceId:z.string(),path:z.string(),pages:z.array(z.number().int().positive()),role:z.enum(['lecture','pattern','solution']),sha256:z.string(),available:z.boolean()})),missing:z.array(z.string()),excluded:z.array(z.object({sourceId:z.string(),reason:z.string()})),estimatedTokens:z.number()});
const gradeSchema=z.object({problem:problemSchema,context:contextSchema,draft:draftSchema,scenario:z.enum(['correct','partial','incorrect','needs_clarification','rate_limit','network_error'])});
const feedbackSchema=z.object({status:z.enum(['correct','partial','incorrect','needs_clarification']),recognized:z.string(),score:z.number().nullable(),maxScore:z.number(),items:z.array(z.object({label:z.string(),score:z.number(),max:z.number(),detail:z.string()})),strengths:z.array(z.string()),errors:z.array(z.string()),concepts:z.array(z.string()),demo:z.boolean()});
app.post('/api/grade',route(async(req,res)=>{
  const parsed=gradeSchema.parse(req.body);const input=parsed as unknown as GradeRequest;
  if(!verifySnapshot(input.problem,input.context))throw new ProviderError('SNAPSHOT_MISMATCH','문제 또는 context snapshot이 일치하지 않습니다. 저장한 문제 버전으로 다시 제출하세요.',422);
  if(input.draft.problemId!==input.problem.id)throw new ProviderError('PROBLEM_MISMATCH','답안의 문제 ID가 일치하지 않습니다.',422);
  if(!input.draft.text.trim()&&!input.draft.photos.length&&!input.draft.correction.trim())throw new ProviderError('EMPTY_SUBMISSION','답안 또는 풀이 사진을 입력하세요.',422);
  const result=await getProvider().gradeSubmission(input);
  res.json(feedbackSchema.parse(result));
}));
app.post('/api/hint',route(async(req,res)=>{
  const input=z.object({problem:problemSchema,context:contextSchema,level:z.number().int().min(1).max(3)}).parse(req.body);
  const p=input.problem as unknown as import('../shared/types').Problem;
  if(!verifySnapshot(p,input.context))throw new ProviderError('SNAPSHOT_MISMATCH','저장된 문제와 context가 일치하지 않습니다.',422);
  res.json({hint:z.string().parse(await getProvider().requestHint(p,input.level,input.context))});
}));
app.post('/api/generate',route(async(req,res)=>{
  const {weeks,recentIds}=z.object({weeks:z.array(z.number().int()).min(1),recentIds:z.array(z.string()).default([])}).parse(req.body);
  const p=await getProvider().generateProblem({problems:problems.filter(p=>weeks.includes(p.week)),recentIds});
  res.json({problem:problemSchema.parse(p),context:await buildContext(p)});
}));
app.get('/api/context/:id',route(async(req,res)=>{
  const p=problems.find(p=>p.id===req.params.id);if(!p)return res.status(404).end();
  res.json({context:await buildContext(p),generation:{instructions:generationPrompt,selection:{week:p.week,topic:p.topic,kind:p.kind,difficulty:p.difficulty},recentProblems:'요청의 recentIds로 매번 명시',output:'Problem JSON'},grading:{instructions:gradingPrompt,problemVersion:`${p.id}@${p.version}`,rubric:p.rubric,modelAnswer:p.answer,input:'텍스트 + 순서·회전을 반영한 사진 + 사용자 인식 수정 사항'}});
}));
if(process.argv.includes('--production')){
  const base=process.env.VITE_BASE_PATH||'/';
  app.use(base,express.static(path.resolve('dist'),{dotfiles:'deny'}));
  app.get('*',(_req,res)=>res.sendFile(path.resolve('dist/index.html')));
}
app.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  if(err instanceof z.ZodError)return res.status(422).json({error:'VALIDATION_ERROR',message:'요청 또는 응답 형식이 올바르지 않습니다.',fields:err.issues.map(i=>i.path.join('.'))});
  if(err instanceof ProviderError)return res.status(err.status).json({error:err.code,message:err.message});
  res.status(500).json({error:'LOCAL_ERROR',message:err instanceof Error&&err.message.startsWith('CONTEXT_TOO_LARGE')?err.message:'로컬 자료를 읽거나 요청을 처리하지 못했습니다.'});
});
app.listen(Number(process.env.PORT)||3001,'127.0.0.1',()=>console.log(`PLLingo API: http://127.0.0.1:${process.env.PORT||3001} · ${process.env.AI_PROVIDER||'mock'}`));
