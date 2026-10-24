export const kinds = ['semantics', 'expression', 'scala', 'concept', 'analysis'] as const;
export type Kind = typeof kinds[number];
export const kindNames: Record<Kind, string> = { semantics: 'Semantics 작성', expression: 'Expression 구성', scala: 'Scala 코드 수정', concept: '개념 설명', analysis: '실행·타입 분석' };
export type Scenario = 'correct' | 'partial' | 'incorrect' | 'needs_clarification' | 'rate_limit' | 'network_error';
export interface Reference { sourceId: string; path: string; pages: number[]; role: 'lecture' | 'pattern' | 'solution'; }
export interface Rubric { label: string; points: number; description: string; }
export interface Problem {
  id: string; version: number; week: number; topic: string; language: string; kind: Kind;
  difficulty: '기초' | '중급' | '도전'; title: string; body: string; assumptions: string;
  objective: string; hints: string[]; answer: string; rubric: Rubric[]; commonErrors: string[];
  sources: Reference[]; reviewStatus: 'needs_review' | 'ready'; origin: '직접 작성' | '기출 변형' | '기출 원문' | 'AI 생성';
}
export interface Source {
  id: string; path: string; materialsPath: string; kind: string; week: number | null; topic: string;
  term: string | null; examId: string | null; counterpart: string | null; pageCount: number; sha256: string;
  extractionStatus: string; reviewStatus: string; analysisStatus: string; errors: string[];
}
export interface ContextSnapshot {
  version: number; hash: string; problemHash: string; status: 'ready' | 'needs_review' | 'unavailable';
  text: string; references: (Reference & { sha256: string; available: boolean })[];
  missing: string[]; excluded: { sourceId: string; reason: string }[]; estimatedTokens: number;
}
export interface Photo { id: string; name: string; data: string; rotation: number; }
export interface Draft { problemId: string; text: string; mode: 'text' | 'code'; photos: Photo[]; hintCount: number; answerRevealed: boolean; startedAt: string; correction: string; submissionId?: string; }
export interface Feedback {
  status: 'correct' | 'partial' | 'incorrect' | 'needs_clarification'; recognized: string; score: number | null;
  maxScore: number; items: { label: string; score: number; max: number; detail: string }[];
  strengths: string[]; errors: string[]; concepts: string[]; demo: boolean;
}
export interface Submission {
  id: string; problem: Problem; context: ContextSnapshot; draft: Draft; feedback: Feedback;
  createdAt: string; elapsedSeconds: number; mode: 'mock' | 'live'; appeal: string; selfRating?: string;
  cloudOmissions?: { photoCount:number; contextText:boolean };
}
export interface Review { problemId: string; due: string; interval: number; successes: number; history: { at: string; status: string; interval: number }[]; }
export interface Settings { goal: number; weeks: number[]; }
export interface Session { ids: string[]; index: number; startedAt: string; finished: boolean; }
export interface StudyData {
  schemaVersion: 1; settings: Settings; submissions: Submission[]; reviews: Review[];
  drafts: Record<string, Draft>; bookmarks: string[]; notes: Record<string, string>; session: Session | null;
  issued: Record<string, { problem: Problem; context: ContextSnapshot }>;
}
export interface GradeRequest { problem: Problem; context: ContextSnapshot; draft: Draft; scenario: Scenario; }
