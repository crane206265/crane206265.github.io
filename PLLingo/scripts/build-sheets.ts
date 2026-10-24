import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { problems, weekInfo } from '../server/content';
import { digest } from '../server/context';
import { HOSTED_CONTEXT_HEADER, type HostedCatalog } from '../shared/sheets';
const issued:HostedCatalog['issued']={};
for(const p of problems){
  const references=p.sources.map(r=>({...r,sha256:'',available:false}));
  const text=`${HOSTED_CONTEXT_HEADER}\nProblem: ${p.id}@${p.version}\nAssumptions: ${p.assumptions}\nObjective: ${p.objective}\nNo private PDF, extracted lecture page, or official solution text is included. This is a mock exercise, not source-verified AI grading.`;
  const base={version:1,problemHash:digest(p),text,references};
  issued[p.id]={problem:p,context:{...base,hash:digest(base),status:'unavailable',missing:['비공개 원문은 로컬 자료실에서만 확인할 수 있습니다.'],excluded:[],estimatedTokens:Math.ceil(text.length/3)}};
}
const catalog:HostedCatalog={schemaVersion:1,problems,weeks:weekInfo,issued,
  materials:{sources:[],materialsAvailable:false,hosted:true,analysis:null,review:null,contexts:weekInfo.map(w=>({week:w.week,title:w.title,status:'unavailable',problems:problems.filter(p=>p.week===w.week).length}))}};
await mkdir('.generated',{recursive:true});await mkdir('apps-script-dist',{recursive:true});
await writeFile('.generated/hosted-catalog.json',JSON.stringify(catalog),'utf8');
const bundle=await build({entryPoints:['google-apps-script/backend.ts'],bundle:true,write:false,platform:'browser',format:'iife',globalName:'PLLingoSheets',target:'es2020',define:{PL_CATALOG:JSON.stringify(catalog)},minify:false});
await writeFile('apps-script-dist/Code.gs',bundle.outputFiles[0].text+`\nfunction setupPllingo_(){return PLLingoSheets.setup();}\nfunction doGet(e){return PLLingoSheets.serveBridge(e);}\nfunction rpc(request){return PLLingoSheets.rpc(request);}\n`,'utf8');
for(const name of ['Bridge.html','appsscript.json'])await writeFile('apps-script-dist/'+name,await readFile('google-apps-script/'+name,'utf8'),'utf8');
console.log('Prepared Apps Script installation files and static mock catalog. No files uploaded; no deployment or AI request.');
