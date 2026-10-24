/** Local review annotations. These are scoped findings, not claims of complete review. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { problems, weekInfo } from '../server/content';
import { buildContext, digest } from '../server/context';
import type { Source } from '../shared/types';
import evidence from './review-evidence.json';
const root='private-data';
const save=async(file:string,data:unknown)=>{await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(data,null,2),'utf8');};
const manifest=JSON.parse(await readFile(root+'/manifests/sources.json','utf8')) as {sources:Source[]};
const visual:Record<string,number[]>={
  '09-4-kfae.pdf':[12,16], '11-3-tfae.pdf':[23], '11-4-tpfae.pdf':[8],
  '13-2-tifae.pdf':[27,33], '14-3-topbot.pdf':[14], '12-1-trfae.pdf':[26],
  '22-2-final.pdf':[3,4], '22-2-final-sol.pdf':[1,2]
};
// The generated contact sheet was actually inspected during implementation.
// New/changed PDFs cannot inherit a visual verification merely by filename.
const reviewed=manifest.sources.filter(s=>visual[s.path.split('/').pop()!] && evidence.documents.some(r=>r.sourceId===s.id&&r.sha256===s.sha256));
for(const s of manifest.sources){
  if(problems.some(p=>p.sources.some(r=>r.sourceId===s.id)))s.analysisStatus='partially_analyzed';
  if(reviewed.includes(s))s.reviewStatus='partially_reviewed';
  if(s.path.endsWith('22-2-final-sol.pdf')&&reviewed.includes(s))s.kind='solution';
}
await save(root+'/manifests/sources.json',manifest);
const review={
  scope:'선택된 규칙과 2022-2 기말 일부 원본 페이지 대조. 전체 자료/샘플의 최종 검수는 미완료.',
  pageConvention:'1-based PDF page. Printed slide numbers can repeat due to incremental slides.',
  documents:reviewed.map(s=>({sourceId:s.id,sha256:s.sha256,pages:visual[s.path.split('/').pop()!],status:'partially_reviewed',render:'renders/review-contact.png'})),
  conflicts:[
    {source:'12-3-tvfae-typing.pdf',pages:[11,12,18],finding:'앞쪽 슬라이드는 freshness와 결과 타입 비유출 조건이 없는 규칙을 소개한 뒤, PDF p.18에서 soundness 문제와 보완 조건 t∉Domain(Γ), Γ⊢τ₀를 제시한다. 새 문제는 보완된 규칙을 기준으로 삼는다. p.11의 중간 단계 규칙을 최종 규칙과 섞지 않는다.',status:'text_checked_visual_review_pending'},
    {source:'22-2-final.pdf',pages:[2],finding:'TVFAE reference sheet에 freshness와 결과 타입 well-formedness 조건이 명시되어 있다. 강의 보완 규칙과 같은 방향이다. 다른 과거 시험과의 일치 여부는 미분석.',status:'text_checked_visual_review_pending'},
    {source:'11-4-tpfae.pdf',pages:[7],finding:'운영 의미 소개의 lambda는 untyped 표기다. TFAE의 typed lambda 문법과 임의로 통합하지 않는다.',status:'needs_review'}
  ],
  remaining:'교과서와 나머지 기출·강의는 추출/인덱싱 완료. 본문의 전체 내용 분석 및 수식 원본 대조는 완료하지 않았다.'
};
await save(root+'/manifests/review.json',review);
const details:Record<number,Record<string,unknown>>={
  9:{syntax:'Num/Add/Sub/Id/Fun/App/Vcc. e ::= n | e+e | e-e | x | λx.e | e e | vcc x;e',values:'NumV(n), CloV(param,body,env), ContV(proc); Cont=Value=>Value; 환경 Var→Value 유한 매핑.',order:'왼쪽부터 call-by-value. 함수와 인자는 호출 위치 환경에서 평가한다.',semantics:'Vcc(x,b): interp(b,env+(x->ContV(k)),k). Continuation application: kv(av), 현재 k는 실행하지 않는다.',typingRules:'KFAE는 이 범위에서 정적 타입 규칙을 다루지 않는다.',implementation:'Closure 호출 interp(b,fenv+(p->av),k). ContV 호출 kv(av).',sideConditions:'Closure는 정의 시 환경 fenv를 보존. vcc의 k와 호출 시 현재 k를 구분.',prerequisites:['lexical scope','closure','CPS','left-to-right evaluation'],examples:['{vcc k;(100+k(7))} ⇒ 7'],commonErrors:['k(kv(av))로 현재 문맥을 재실행','closure 호출에 env 사용']},
  10:{syntax:'Expr는 이름을 갖는 Id; MExpr는 MId(pos), MFun(body), MApp 등을 사용.',values:'런타임 Env=List[Value]. translation TEnv=List[String]. 두 환경을 구분한다.',order:'기존 call-by-value 평가 순서를 유지한다.',semantics:'translate(Fun(x,b),tenv)=MFun(translate(b,x::tenv)); locate는 가장 가까운 바인딩을 index 0으로 찾는다.',typingRules:'실행기 표현 변환 주제. 별도 정적 타입 규칙 미분석.',implementation:'MId(pos)는 env(pos)를 읽는다. Defunctionalized continuation과 register 변환은 강의 전체 추가 검수 필요.',sideConditions:'free identifier는 locate에서 오류. continuation stack 저장/복원은 기출 Q2의 명시적 규칙으로만 해석.',prerequisites:['scope','CPS','environment'],examples:['λa.λb.a+b → MFun(MFun(MAdd(MId(1),MId(0))))'],commonErrors:['선언 순서대로 0부터 계산','translation environment와 runtime environment 혼동']},
  11:{syntax:'TFAE e ::= n | e+e | e-e | x | λx:τ.e | e e; τ ::= num | τ→τ. TPFAE는 Pair/First/Second로 확장.',values:'수, closure, pair 값. Γ는 타입 환경이고 σ는 값 환경.',order:'call-by-value. Pair는 두 성분 모두 평가. 순수 규칙에는 store가 없다.',semantics:'σ⊢e₁⇒v₁와 σ⊢e₂⇒v₂에서 σ⊢(e₁,e₂)⇒(v₁,v₂). projection은 먼저 pair를 평가해 해당 값을 반환.',typingRules:'Γ[x:τ₁]⊢e:τ₂ / Γ⊢λx:τ₁.e:τ₁→τ₂. Γ⊢f:τ₁→τ₂, Γ⊢a:τ₁ / Γ⊢f a:τ₂.',implementation:'Fun은 ArrowT(t,typeCheck(b,tyEnv+(x->t))). App은 매개변수와 인자 타입을 비교.',sideConditions:'Id는 Domain(Γ)에 있어야 한다. TPFAE p.7 untyped lambda와 TFAE typed lambda 표기를 구분.',prerequisites:['environment','lambda','function application'],examples:['λf:num→num.f 0 : (num→num)→num'],commonErrors:['함수 몸체 환경 확장 누락','표현식과 값 혼동']},
  12:{syntax:'TRFAE: def f(x:τ₁):τ₂=b;e, If0. TVFAE: type t=C₁@τ₁+C₂@τ₂ in e; match.',values:'TRFAE는 closure.env를 재귀 환경으로 갱신. TVFAE 타입 환경은 vars와 tbinds를 분리.',order:'call-by-value. match는 scrutinee를 평가한 뒤 선택된 분기만 실행하나 타입 검사는 두 분기 모두 수행.',semantics:'TRFAE closure를 만든 뒤 nenv=env+(f->cloV), cloV.env=nenv, e를 nenv에서 평가한다. TVFAE 원본 동적 규칙 추가 검수 필요.',typingRules:'TRFAE b는 Γ[f:τ₁→τ₂,x:τ₁], e는 Γ[f:τ₁→τ₂]. TVFAE 분기 결과 타입은 동일. 타입 정의의 final rule에는 freshness와 결과 타입 비유출 조건이 있다.',implementation:'nTyEnv=tyEnv+(f->ArrowT(xt,rt)); mustSame(rt,typeCheck(b,nTyEnv+(x->xt))); typeCheck(e,nTyEnv).',sideConditions:'TVFAE t∉Domain(Γ), Γ⊢τ₀. Γ′에 t의 constructor 정보와 Cᵢ:τᵢ→t를 추가. payload 타입은 Γ′에서 유효해야 한다.',prerequisites:['closure','type environment','recursive binding','well-formed types'],examples:['match 분기가 num과 num→num이면 no type; 선택 분기는 실행 가능할 수 있음'],commonErrors:['x를 e에도 노출','생성자 이름을 타입 바인딩과 혼동','초기 불완전 TVFAE 규칙 사용']},
  13:{syntax:'TIFAE 타입은 num | τ→τ | ?. VarT(var ty:Option[Type]).',values:'타입 추론은 정적 타입 객체를 다룸. VarT는 참조 동일성으로 구분.',order:'자료의 typeCheck/resolve/unify 순서를 따른다. 사용자 Scala를 실행하지 않는다.',semantics:'정적 제약 해결. ?는 단일 미해결 변수이며 자동 다형 일반화가 아니다.',typingRules:'App의 fresh β에 대해 type(f)=type(a)→β를 unify. if0 조건은 num, 양 분기 타입을 unify.',implementation:'resolve는 연결된 VarT를 따라간다. (a VarT,b)에서 a eq b이면 no-op, occurs(a,b)이면 오류, 아니면 a.ty=Some(b). ArrowT는 양 성분 unify.',sideConditions:'대입 전에 occurs 검사. occurs는 resolve한 ArrowT 양쪽 재귀 탐색, 미해결 변수는 eq. β는 fresh.',prerequisites:['TFAE typing','constraints','reference identity'],examples:['λx:?.x x 에서 α=α→β, occurs check 실패'],commonErrors:['α=α 거부','대입 후 occurs check','각 Id에 독립 변수 생성']},
  14:{syntax:'TpolyFAE: Λα.e, e[τ], ∀α.τ. Subtyping은 record와 arrow에 적용. Top/Bottom 추가 범위는 인덱싱 후 부분 확인.',values:'다형성의 동적 구현 및 type erasure는 기출 정의를 따른다. 전체 강의 추가 검수 필요.',order:'기존 언어의 평가 순서 유지. type erasure는 해당 기출에 제공된 규칙에 한정.',semantics:'타입 추상/적용의 전체 operational semantics는 미분석. 자료에 없는 규칙을 생성하지 않는다.',typingRules:'∀α.τ의 e[τ₀]는 τ[α←τ₀]. 함수 부분타입은 입력 반공변, 출력 공변.',implementation:'실행 가능한 type checker 구현을 추가하지 않았다. 모델 답안의 개념 설명으로 제공.',sideConditions:'자유 타입 변수 포획을 피하는 치환. 단형적 추론 변수와 universal binder를 구분.',prerequisites:['type inference','well-formed types','function types'],examples:['id=Λα.λx:α.x; id[num], id[num→num]은 별도 인스턴스'],commonErrors:['입력도 공변으로 가정','val이 언제나 다형적이라고 가정']}
};
for(const w of weekInfo){
  const ps=problems.filter(p=>p.week===w.week);const snapshots=await Promise.all(ps.map(p=>buildContext(p)));
  const refs=[...new Map(ps.flatMap(p=>p.sources).map(r=>[JSON.stringify(r),r])).values()];
  await save(`${root}/topics/week-${w.week}.json`,{version:1,week:w.week,topics:w.topics,status:'needs_review',languages:[...new Set(ps.map(p=>p.language))],problemTypes:[...new Set(ps.map(p=>p.kind))],...details[w.week],references:refs,originalComparison:review.documents.filter(d=>refs.some(r=>r.sourceId===d.sourceId)),hash:digest(snapshots.map(c=>c.hash)),contexts:snapshots});
}
for(const week of [2,3,4,5,6,7])await save(`${root}/topics/week-${week}.json`,{week,status:'unavailable',reason:'선수 개념 자료는 추출·인덱싱 완료. 내용 검수와 주제 context 작성은 미완료.',references:manifest.sources.filter(s=>s.week===week).map(s=>s.id)});
const rows=[
  [1,3,'Type systems','개념','용어 다섯 개 선택','type checking과 inference, soundness 구분','5개 단어','기초','공식 해설 단어별 정답; 샘플 부분점수는 자체 기준'],
  [2,3,'KFAE small-step','실행 분석','주어진 명령/값 stack으로 모든 상태 전이 작성','continuation 호출 때 기존 k와 s를 함께 버림','7회 전이','중급','누락된 상태와 stack 항목별 연습 기준 가능'],
  [3,3,'Lexical addresses','표현식 구성·변환','Expr→MExpr와 역방향 expression 구성','변수 이름이 아닌 가까운 바인딩의 거리','짧은 AST 두 개','중급','공식 해설: 각 소문항 부분점수 없음'],
  [4,4,'Defunctionalized KFAE','실행 분석','interp 호출에서 출력하는 e,env,k를 모두 추적','호출 시점 k와 캡처 k 구분, closure 환경','출력 여섯 줄','중급','공식 해설: 틀리거나 빠진 줄당 -1'],
  [5,4,'TFAE typing','Semantics','고차 함수 application 전체 proof tree 작성','f의 타입과 lambda 전체 타입 구분','다단 proof tree','중급','공식 해설: wrong type -4, minor mistake -1'],
  [6,4,'TVFAE well-formedness','Semantics','num→(num→num)의 타입 유효성 트리','표현식 typing과 type validity judgment 구분','트리 한 개','기초','공식 해설: 첫 subtree만 작성 3점'],
  [7,5,'KFAE print','실행 분석','주어진 interpreter로 인쇄 순서 추적','continuation 재진입과 captured computation','숫자 시퀀스','도전','공식 해설의 결과와 자체 풀이를 구분'],
  [8,5,'TVFAE ADT','타입·실행 분석','각 식의 타입과 타입 검사 생략 시 결과 작성','선택되지 않은 분기도 타입 검사, 동적 결과와 별개','타입/결과 네 항목','중급','공식 해설: 각 1점, 모두 맞으면 5점'],
  [9,6,'TIFAE Map extension','Scala','unify/occurs/typeCheck의 다섯 빈칸과 결과','Map key/value 재귀 탐색과 fresh 변수 두 개','5블록+타입 객체','도전','공식 해설: 항목별 1/1/3/5/5점; major -3, minor -1'],
  [10,7,'TpolyFAE','표현식 구성','type erasure가 같은 well-typed 식의 annotation 완성','타입 추상화와 각 사용에서 타입 적용','빈칸 5개','도전','공식 해설: 각 빈칸 2점'],
  [11,7,'Intersection / union subtyping','개념','다섯 추가 규칙의 soundness yes/no','함수 입력 반공변과 교집합/합집합','yes/no 다섯 개','도전','공식 해설: 2*max(0,맞음-틀림); 현재 기본 범위 밖 확장 규칙 자동 출제 제외'],
  [12,8,'Variance','Scala','type constructor variance 함수 완성','함수 parameter flip과 pair join, hole 없는 Top','빈칸 4개','도전','공식 해설: 각 소문항 부분점수 없음; 3/3/5/4점']
];
await save(`${root}/exam-patterns/22-2-final.json`,{exam:'22-2-final',term:'final',sources:manifest.sources.filter(s=>s.examId==='22-2-final').map(s=>s.id),officialSolution:true,status:'partially_analyzed',items:rows.map(([number,page,topic,kind,task,trap,length,difficulty,credit])=>({number,page,topic,kind,task,trap,length,difficulty,credit,currentScope:number===11?'extension_not_auto_selected':'final_9_14',providedRules:'시험 reference sheet와 해당 문항의 명시적 규칙',review:Number(page)<=4?'일부 원본 대조 · 최종 검수 전':'텍스트/해설 대조 · 원본 검수 전'}))});
console.log('Saved 12 topic indexes, 12 exam-pattern entries, scoped review log. All sample contexts need review.');
