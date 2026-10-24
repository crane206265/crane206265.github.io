import { useEffect, useState, useSyncExternalStore, useRef } from 'react';
import { House, BookOpen, Library, RotateCcw, FolderOpen, Settings2, ArrowUpRight, ChevronRight, Menu, X, Leaf, CircleHelp } from 'lucide-react';
import { api, loadData, saveData } from './storage';
import { freshData, chooseSession } from '../shared/domain';
import type { Problem, StudyData } from '../shared/types';
import { Home, Bank } from './Dashboard';
import { Study } from './Study';
import { Reviews, Materials, Settings } from './Management';
import { isHosted, subscribeConnection, connectionSnapshot } from './sheets-client';
export type WeekInfo={week:number;title:string;subtitle:string;symbol:string;topics:string[]};
export interface PageProps { data:StudyData;update:(fn:(data:StudyData)=>StudyData)=>void;problems:Problem[];weeks:WeekInfo[];navigate:(route:string)=>void;start:(id?:string)=>void; }
const nav=[['home','오늘의 학습',House],['learn','학습하기',BookOpen],['bank','문제은행',Library],['review','복습 노트',RotateCcw],['materials','자료실',FolderOpen],['settings','설정',Settings2]] as const;
export default function App(){
  const cloud=useSyncExternalStore(subscribeConnection,connectionSnapshot);
  const latestData=useRef<StudyData|null>(null);
  const [data,setData]=useState<StudyData|null>(null);const [problems,setProblems]=useState<Problem[]>([]);const [weeks,setWeeks]=useState<WeekInfo[]>([]);
  const [route,setRoute]=useState(location.hash.slice(1)||'home');const [menu,setMenu]=useState(false);const [error,setError]=useState('');const [health,setHealth]=useState('mock');
  const navigate=(to:string)=>{location.hash=to;setMenu(false);window.scrollTo({top:0});};
  useEffect(()=>{const listener=()=>setRoute(location.hash.slice(1)||'home');window.addEventListener('hashchange',listener);return()=>window.removeEventListener('hashchange',listener);},[]);
  useEffect(()=>{loadData().then(async value=>{await saveData(value);latestData.current=value;setData(value);}).catch(()=>setError('브라우저 저장소를 읽을 수 없습니다. 저장소 설정을 확인한 뒤 새로고침하세요.'));api<{problems:Problem[];weeks:WeekInfo[]}>('/problems').then(v=>{setProblems(v.problems);setWeeks(v.weeks);}).catch(()=>setError(isHosted?'호스팅용 문제 목록을 읽을 수 없습니다. build:pages 결과물을 확인하세요.':'로컬 API에 연결할 수 없습니다. npm run dev로 프런트엔드와 서버를 함께 실행하세요.'));api<{provider:string}>('/health').then(v=>setHealth(v.provider)).catch(()=>{});},[]);
  const update=(fn:(d:StudyData)=>StudyData)=>{
    if(!latestData.current)return;
    const next=fn(latestData.current);latestData.current=next;
    // Start the durable write in the input event, before rendering the updated UI.
    // An effect scheduled after painting can otherwise miss an immediate refresh.
    void saveData(next).catch(()=>setError('저장 공간이 부족하거나 저장소를 사용할 수 없습니다. 사진 포함 백업을 내려받고 공간을 확보하세요.'));
    setData(next);
  };
  const start=(id?:string)=>{if(!data)return;if(id){if(data.drafts[id]?.submissionId)update(d=>{const drafts={...d.drafts};delete drafts[id];return {...d,drafts};});navigate('learn/'+id);return;}if(data.session&&!data.session.finished){navigate('learn/'+data.session.ids[data.session.index]);return;}const ids=chooseSession(problems,data);if(!ids.length){setError('선택한 주차에는 준비된 문제가 없습니다. 설정에서 기말 주차를 선택하세요.');return;}update(d=>{const drafts={...d.drafts};ids.forEach(id=>{if(drafts[id]?.submissionId)delete drafts[id];});return {...d,drafts,session:{ids,index:0,startedAt:new Date().toISOString(),finished:false}};});navigate('learn/'+ids[0]);};
  const section=route.split('/')[0];const props:PageProps={data:data||freshData(),update,problems,weeks,navigate,start};
  return <div className="app-shell"><aside className={'sidebar '+(menu?'open':'')}><a className="brand" href="#home"><span className="brand-icon">pl<span>·</span></span><span>PLLingo<small>생각을 쌓는 언어 학습</small></span></a><button className="mobile-close" aria-label="메뉴 닫기" onClick={()=>setMenu(false)}><X/></button>
    <div className="course-label">MY LEARNING SPACE</div><div className="course-card"><div className="course-code">CS<span>320</span></div><div><strong>프로그래밍언어</strong><small>KAIST · 기말고사 준비</small></div></div>
    <nav>{nav.map(([id,label,Icon])=><button key={id} onClick={()=>id==='learn'?start():navigate(id)} className={section===id?'active':''}><Icon size={20}/>{label}{id==='learn'&&<ChevronRight size={15}/>}</button>)}</nav>
    <div className="sidebar-bottom"><div className="side-note"><Leaf size={20}/><p>작은 이해가 쌓여<br/>단단한 실력이 됩니다.</p></div><button className="help-link" onClick={()=>navigate('settings')}><CircleHelp size={17}/> 학습 환경 안내 <ArrowUpRight size={15}/></button><div className="profile"><div className="avatar">나</div><div><strong>나의 학습 공간</strong><small>이 기기에 안전하게 저장</small></div><span className="online-dot"/></div></div>
  </aside>{menu&&<div className="sidebar-scrim" onClick={()=>setMenu(false)}/>}
  <div className="main-shell"><header className="topbar"><div><button className="mobile-menu" aria-label="메뉴 열기" onClick={()=>setMenu(true)}><Menu/></button><span className="breadcrumb">내 학습 공간 <ChevronRight size={13}/> <strong>{nav.find(n=>n[0]===section)?.[1]||'오늘의 학습'}</strong></span></div><div className="topbar-right"><span className="semester">2026 · 가을학기</span><span className="mode-tag"><span/>{health==='mock'?(isHosted?(cloud.connected?'MOCK · 시트 연결':'MOCK · 브라우저'):'MOCK 모드'):'Gemini 미연결'}</span></div></header>
    <main>{error&&<div className="notice error" role="alert">{error}<button onClick={()=>setError('')} aria-label="알림 닫기"><X size={16}/></button></div>}
      {isHosted&&!cloud.connected&&<div className="notice subtle">브라우저 데모로 실행 중입니다. 설정에서 Google Sheets를 연결하면 제출·복습 기록을 시트에 저장할 수 있어요.<button className="text-button" onClick={()=>navigate('settings')}>연결 설정</button></div>}
      {!data||!problems.length?<div className="loading"><span className="loader"/>학습 공간을 준비하고 있어요.</div>:
      section==='learn'?<Study {...props} id={route.split('/')[1]} key={route.split('/')[1]||'empty'}/>:
      section==='bank'?<Bank {...props}/>:
      section==='review'?<Reviews {...props}/>:
      section==='materials'?<Materials {...props}/>:
      section==='settings'?<Settings {...props}/>:<Home {...props}/>}
    </main><footer><span>PLLingo <span className="footer-dot">·</span> Learn a little. Understand deeply.</span><span>CS320 · 나만의 PL 학습 루틴</span></footer>
  </div></div>;
}
