import type { Feedback, GradeRequest } from './types';
export class MockFailure extends Error {
  constructor(public code:string,message:string,public status=503){super(message);}
}
/** Same deterministic demo behavior in Node, static Pages, and Apps Script. */
export function gradeMock({problem,draft,scenario}:GradeRequest):Feedback {
  if(scenario==='rate_limit')throw new MockFailure('RATE_LIMIT','데모 요청 한도 초과(429). 답안은 저장되어 있습니다. 잠시 후 다시 시도하세요.',429);
  if(scenario==='network_error')throw new MockFailure('NETWORK_ERROR','데모 네트워크 오류. 답안은 저장되어 있습니다. 다시 시도하세요.');
  const status=scenario==='needs_clarification'?'needs_clarification':scenario;
  const fraction=status==='correct'?1:status==='partial'?.5:0;
  const maxScore=problem.rubric.reduce((s,r)=>s+r.points,0);
  const items=problem.rubric.map(r=>({label:r.label,score:Math.floor(r.points*fraction),max:r.points,detail:`데모 항목 · 확인 기준: ${r.description}`}));
  return {status,recognized:draft.correction||draft.text,score:status==='needs_clarification'?null:items.reduce((s,r)=>s+r.score,0),maxScore,items,
    strengths:status==='correct'?['정답 상태의 피드백 예시입니다. 실제 답안 내용은 평가하지 않았습니다.']:['입력한 답안과 사진을 로컬에 보관했습니다.'],
    errors:status==='needs_clarification'?['사진을 인식하지 않았습니다. 인식 내용 수정 입력으로 확인 흐름을 체험할 수 있습니다.']:status==='correct'?[]:[`데모 오류 예시: ${problem.commonErrors[0]}`],concepts:[problem.topic],demo:true};
}
