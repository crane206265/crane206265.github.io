# PLLingo

CS320 프로그래밍언어를 매일 풀고 복습하는 학습 사이트입니다. 로컬 자료 분석 모드와 GitHub Pages + Google Sheets 모드를 지원합니다. React + Vite + TypeScript와 IndexedDB를 사용하며, 로컬 모드에는 Express 서버가 있습니다. 기본은 mock이며 실제 AI 요청과 외부 배포는 하지 않습니다.

**Google Sheets 모드 추가:** `build-pages.cmd`로 Node 서버가 필요 없는 GitHub Pages용 화면과 Apps Script 설치 파일을 생성합니다. 새 시트 생성·연결 방법은 [Google Sheets 설치 안내](google-apps-script/README.md)에 있습니다. 원본 자료 분석은 기존 로컬 모드에 유지하며, 호스팅 모드는 문제에 작성된 가정으로만 mock 학습을 제공합니다. 실제 Google 계정 연결·시트 생성·배포는 아직 수행하지 않았습니다.

## 바로 실행

GitHub Pages 저장소 안의 `PLLingo` 폴더에서 배포 파일을 준비하려면 `.\prepare-github.cmd`를 실행합니다. `src/index.html`이 개발용 원본이며, 루트 `index.html`, `assets/`, `hosted-catalog.json`은 `/PLLingo/`용 빌드 결과입니다. 기존 사이트의 다른 폴더를 바꾸지 않으며 Git 커밋·푸시는 자동 실행하지 않습니다. 배포 후 주소는 https://crane206265.github.io/PLLingo/ 입니다.

현재 작업 폴더에는 의존성과 프로젝트 전용 Node 도구를 준비했습니다. Windows에서는 다음 명령으로 실행하세요.

전역 `npm` 명령이 없어도 아래 명령은 실행할 수 있습니다. 이 문서의 다른 `npm` 명령은 `.\npm-local.cmd`로 대신 실행하세요. 예: `.\npm-local.cmd test`.

```powershell
.\dev.cmd
```

브라우저에서 **http://127.0.0.1:5173/** 을 여세요. 개발 서버와 API(127.0.0.1:3001)를 함께 실행합니다. 종료는 실행 터미널에서 Ctrl+C입니다. 사진과 기록은 같은 브라우저·동일 origin에 보관되므로 localhost와 127.0.0.1을 섞어 사용하지 마세요.

Node.js 22 이상이 PATH에 있는 환경의 표준 명령:

```powershell
npm ci
npm run dev
npm run build
npm start
```

`npm start`는 빌드된 화면과 API를 http://127.0.0.1:3001/ 에서 제공합니다. 개발 origin과 다르므로 개발 중 기록을 옮기려면 전체 백업/복원을 사용하세요. `.tools/`는 이 환경에 준비한 도구로 Git에 포함하지 않습니다.

## 포함한 기능

- 홈: 서울 날짜, 오늘 완료한 문제 수, 연속 학습, 주차별 진행률, 이어하기.
- 학습: 기본 5문제(1~20 조절), 새 문제와 기한이 된 복습 혼합, 한 문제씩 제출→피드백→다음 문제, 세션 완료.
- 답안: 서술/Scala 코드, 최대 12장 사진, 확대·순서 변경·90도 회전·삭제. 이미지 방향과 순서를 실제 요청 payload에도 반영합니다. 사진은 긴 변 2,000px 이하 JPEG로 보관합니다.
- 자동 저장: 작성 중 답안, 사진, 힌트 사용, 출제 버전, context snapshot, 제출/피드백을 IndexedDB에 보관합니다.
- 피드백: 항목별 점수, 잘한 부분, 예시 오류, 사용자 확인 답안, 모범 답안, 자기 평가·이의 기록, 답안 수정 후 재제출.
- 문제은행: 주차·주제·유형·난이도·검수 상태 필터, 검색, 즐겨찾기, 개인 오류 메모.
- 복습: 이전/최근 답안과 사진, 문제 버전·context 해시 비교. 오답/부분 정답은 1일, 첫 정답은 3일, 이후 연속 정답은 2배(최대 30일) 간격입니다.
- 자료실: 전체 manifest, 원본 PDF 페이지 링크, 주제별 context 상태, 기출 문항 분석, 실제 context 텍스트·필수 누락·제외 이유·추정 토큰 수.
- 설정: 목표·주차 선택, 기본 기록 내보내기(사진 제외), 전체 백업(사진 포함), 검증 후 복원, 데모 기록 초기화.

학습 화면의 mock 시나리오에서 정답 / 부분 정답 / 오답 / 인식 확인 필요 / 요청 한도 초과 / 네트워크 오류를 선택할 수 있습니다. **데모 채점: 실제 답안 분석 없음**입니다. 사진 OCR과 Scala 실행을 수행하지 않습니다. 확인 대기와 요청 실패는 완료·오답·복습 일정에 기록하지 않습니다. mock 기록과 live 기록은 제출별로 구분합니다.

## 자료 준비와 검수 범위

원본 `materials/`를 그대로 두고 다음을 실행합니다.

```powershell
python -m pip install --target .tools/python -r requirements-materials.txt
npm run materials
```

`MATERIALS_DIR=./materials`를 `.env` 또는 실행 환경에 지정할 수 있습니다. 경로는 프로젝트에서 해석하며 절대 경로를 코드에 고정하지 않습니다. 자료는 외부 서비스로 전송하지 않습니다.

```text
materials/                    # 원본, Git 제외
private-data/
  manifests/sources.json      # 105개 파일, 안정적 ID, SHA-256, 페이지 수, 상태, 해설 대응
  manifests/review.json       # 실제 대조한 페이지 및 규칙 차이
  extracted/<source-id>.json  # 페이지별 텍스트, 1-based PDF 번호, OCR 검토 플래그
  topics/week-*.json          # 주제/언어/유형 인덱스와 구조화된 규칙·선수 개념·context
  exam-patterns/22-2-final.json
  renders/review-contact.png  # 구현 중 원본 대조용 렌더 이미지
```

현재 자료 현황:

| 자료 | 수 | 처리·검수 범위 |
|---|---:|---|
| 교과서 | 1 | 텍스트 추출·목록 인덱싱. 전체 내용 분석 미완료 |
| 강의노트 | 47 | 전체 추출. 샘플에 필요한 기말 규칙 우선 확인 |
| 기출 문제 | 44 | 전체 인덱싱. 2022-2 기말 12문항 패턴 우선 분석 |
| 해설 PDF | 13 | `-sol` 후보 13개 중 2022-2 기말의 실제 해설 내용 확인. 나머지는 후보 상태 |
| 합계 | 105 | 2,136페이지. 추출 실패 0개, 텍스트가 적은 페이지가 있어 OCR 확인 대상인 문서 24개 |

원본 이미지 대조는 **8개 문서의 12페이지**에 한정합니다. 2022-2 기말의 나머지 문항은 텍스트와 해설을 확인했지만 원본 대조가 남아 있습니다. 교과서 전체와 나머지 기출을 읽었다고 표시하지 않습니다. `scripts/review-evidence.json`의 실제 검토 당시 파일 해시와 일치하는 자료에만 부분 검수 기록을 붙입니다. 빈 페이지와 수식만 있는 페이지도 텍스트 부족 후보로 표시하므로 OCR 필요 여부는 원본에서 판단해야 합니다. 자동 OCR은 하지 않습니다.

출처 번호는 **1부터 시작하는 PDF 페이지**입니다. 슬라이드 내부 인쇄 번호는 애니메이션으로 반복되기도 하며, 아직 전 페이지 대응을 검수하지 않아 `printedPage=null`로 구분합니다.

주제 context는 현재 모두 `needs_review`, 중간 2~7주차는 `unavailable`(자료는 추출되었지만 정리된 context 미작성)입니다. TVFAE 강의의 초기 규칙과 후반 soundness 보완 규칙 차이를 review log에 기록했습니다. 새 문제는 후반의 freshness·결과 타입 비유출 조건을 우선하며 시험에서 별도 제시한 규칙은 그 문항에만 적용합니다.

## 샘플 문제

다섯 유형 각각 2개 이상, 총 **12개**입니다. 모두 **최종 검수 전**입니다. 모범 답안과 부분점수 기준은 연습용으로 작성했으며 공식 해설과 구분합니다.

| 유형 | 문제 | 근거 PDF 페이지 |
|---|---|---|
| Semantics | Pair 규칙, TFAE 타입 유도 트리 | 11-4 p.7–8 / 11-3 p.19,23 / 22-2 기말 p.4, 해설 p.1 |
| Expression | continuation 탈출, 고차 함수 구성 | 09-4 p.3,12,16 / 11-3 p.19,23 |
| Scala | continuation 분기, occurs check, 재귀 타입 환경 | 09-4 p.10,12,16 / 13-2 p.27,33 / 12-1 p.21,26 |
| 개념 | 입력 반공변, 타입 추론과 다형성 | 14-3 p.13–14 / 14-1 p.7,13,20 |
| 실행·타입 | 자기 적용 제약, lexical address, ADT 분기 | 13-3 p.8 / 10-2 p.4–5,17 / 12-3 p.8,13,18 및 22-2 기말 p.2,5 |

TFAE 유도 트리와 ADT 문제는 **기출 변형**, 나머지는 **직접 작성**입니다. 실제 기출 원문이나 AI 생성 문제라고 표시하지 않습니다. 정확한 source ID와 각 문제별 전체 출처는 자료실과 학습 화면에서 확인합니다.

## 검증

```powershell
npm test
python tests/test_pipeline.py
npm run test:e2e
npm run build
```

브라우저 테스트는 실행 중인 `npm run dev`와 Chrome을 사용합니다. Windows Chrome 경로를 기본값으로 사용하며 다른 환경에서는 `CHROME_PATH`를 설정하세요. 별도 브라우저 다운로드는 하지 않습니다.

- 핵심 테스트: 서울 UTC+9 날짜 경계, 연속 학습의 mock/live 구분, 복습 간격, 세션 중복/범위, 다섯 문제 유형, 실제 출처 페이지, 필수 context 한도, snapshot 무결성, provider 오류, 백업 보존.
- PDF 파이프라인: 자료 폴더 누락, 손상 PDF와 정상 PDF 혼합, 안정적 source ID·해시·페이지 보존.
- Chrome: 모바일 레이아웃·수식, 사진 순서/회전의 실제 요청 이미지, 새로고침 복원, mock 6개 상태, 2문제 전체 세션, 힌트 기록, 사진 포함/제외 백업, 복원, 자료 링크·context·기출 분석·문제 필터.

스크린샷은 테스트 실행 후 `test-results/`에 저장됩니다. 테스트에서 입력한 자료는 격리된 테스트 브라우저 context의 데이터이며 사용자의 일반 브라우저 기록과 섞이지 않습니다.

## Gemini 연결 준비

현재는 다음 설정을 그대로 유지합니다. `.env.example`을 복사해 사용할 수 있으며 키를 입력할 필요가 없습니다.

```dotenv
AI_PROVIDER=mock
GEMINI_API_KEY=
GEMINI_MODEL=
MATERIALS_DIR=./materials
PORT=3001
VITE_BASE_PATH=/
```

`server/providers.ts`에 `generateProblem`, `gradeSubmission`, `requestHint` 인터페이스와 MockProvider/GeminiProvider를 분리했습니다. GeminiProvider는 키·모델이 없으면 `CONFIGURATION_ERROR`, 설정되어 있어도 현재 `NOT_CONNECTED`를 반환하며 실제 요청을 보내지 않습니다. 실패를 mock 성공으로 대체하지 않습니다. 요청과 응답은 서버의 Zod로 검증합니다.

context는 문제와 함께 고정하여 SHA-256으로 보존합니다. 채점에서 저장된 snapshot을 사용하므로 파일이나 최신 문제를 바꾸어도 과거 기준을 바꾸지 않습니다. 필수 자료가 한도를 넘으면 자르지 않고 오류를 반환합니다. 토큰 수는 문자 수를 이용한 추정입니다.

실제 연결을 요청하는 마지막 단계에서 공식 Gemini 문서로 모델 지원·무료 조건을 확인하고, 서버에서만 키를 사용하도록 구현해야 합니다. 실제 네트워크 요청의 제한된 재시도·429 정책·취소는 그 단계에서 검증합니다. 현재 브라우저 API 요청에는 20초 타임아웃을 적용합니다.

## 로컬 자료·배포

`materials/`, `private-data/`, `.env`, `.tools/`, `node_modules/`, `dist/`는 Git에서 제외합니다. 이 작업 시작 시 현재 폴더에 Git이 추적하던 자료는 없었습니다. 원본과 추출물을 public이나 프런트엔드 번들로 복사하지 않습니다. PDF는 localhost API가 source ID에 대응하는 파일만 제공합니다. 사용자 Scala 코드는 실행하지 않습니다.

`VITE_BASE_PATH=/PLLingo/`로 서브 경로 빌드를 준비할 수 있습니다. 로컬 모드의 빌드와 서버에서는 같은 값을 사용하세요. `build:pages`는 별도 Node 서버 없이 실행할 수 있는 정적 데모를 만들며, Google Sheets에 저장할 때는 함께 생성한 Apps Script 백엔드를 연결합니다. 비공개 PDF·강의 context를 읽고 대조하는 기능은 로컬 모드에 남습니다. 현재 외부 배포는 하지 않았습니다. 전체 백업에는 개인 답안과 context가 들어 있으므로 로컬 학습 데이터로 보관합니다.

UI 피드백은 홈 → 학습/피드백 → 문제은행 → 복습 노트 → 자료실 순서로 확인하면 전체 흐름을 볼 수 있습니다.
