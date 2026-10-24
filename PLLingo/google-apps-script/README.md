# 새 Google Sheet로 PLLingo 사용하기

GitHub Pages에서 화면을 제공하고, Apps Script가 요청을 처리하며, 새 Google Sheet가 제출·복습·설정 기록을 저장합니다. 운영 중 PC나 Node 서버를 켜둘 필요가 없습니다. Node는 **로컬 개발·빌드할 때만** 필요합니다. 현재 Gemini는 미연결이고 채점은 mock입니다.

현재는 설치 코드와 연결 화면을 준비한 상태입니다. 실제 계정에서 시트를 만들거나 Apps Script/GitHub Pages에 배포하지 않았습니다.

## 1. 설치 파일과 정적 앱 생성

Windows의 현재 작업 폴더에서는:

```powershell
.\build-pages.cmd
```

**이 PC에서는 전역 `npm` 명령을 설치할 필요가 없습니다.** 프로젝트의 `.tools/`에 Node/npm이 준비되어 있고 위 명령이 자동으로 사용합니다. 아래 안내에 나오는 `npm` 명령도 `npm` 대신 `.\npm-local.cmd`로 실행할 수 있습니다. 예: `.\npm-local.cmd run preview:pages`.

Node/npm이 PATH에 있으면:

```powershell
npm ci
npm run build:pages
```

생성되는 결과:

- `dist/`: GitHub Pages용 정적 HTML·JS·CSS·수식 폰트·직접 작성한 샘플 문제.
- `apps-script-dist/Code.gs`: 복사해 넣을 Apps Script 서버 전체 코드.
- `apps-script-dist/Bridge.html`: 사이트와 Apps Script 사이의 브리지.
- `apps-script-dist/appsscript.json`: 프로젝트 설정 파일.

원본 PDF, `private-data/` 추출문, API 키와 연결 비밀번호는 이 결과물에 넣지 않습니다. 설치 파일은 로컬에서 생성되며 자동 업로드하지 않습니다.

개발용 화면만 보려면 `.\pages.cmd`를 실행하고 출력된 URL을 여세요. 이 모드는 Node API가 필요 없습니다. 빌드 결과 확인은 `.\npm-local.cmd run preview:pages` → http://127.0.0.1:5174/PLLingo/ 입니다.

## 2. 새 Apps Script 프로젝트 만들기

1. https://script.google.com/ 에서 새 프로젝트를 만듭니다.
2. 기본 `Code.gs`를 `apps-script-dist/Code.gs` 내용으로 교체합니다.
3. HTML 파일 `Bridge`를 추가하고 `apps-script-dist/Bridge.html` 내용을 붙입니다.
4. 프로젝트 설정에서 `appsscript.json 매니페스트 파일 표시`를 켜고 생성된 JSON을 붙입니다.
5. 프로젝트 설정 → **스크립트 속성**에 다음을 추가합니다.

| 속성 | 값 |
|---|---|
| `ALLOWED_ORIGINS` | `https://crane206265.github.io` |
| `AI_PROVIDER` | `mock` |

origin은 경로와 마지막 `/`를 제외합니다. `/PLLingo/`는 여기에 넣지 않습니다. 로컬 테스트 주소도 허용하려면 `http://127.0.0.1:5174`를 쉼표로 이어 붙이세요. `http://127.0.0.1:5173` 개발 주소는 별도로 추가할 수 있습니다. `*`는 허용하지 않습니다.

## 3. 새 시트 생성

편집기의 함수 목록에서 **`setupPllingo_`** 를 선택하고 실행해 Google 권한을 승인합니다. 코드는 새 전용 시트를 만들고 스크립트 속성에 다음을 저장합니다.

- `SPREADSHEET_ID`: 생성한 학습 시트 ID.
- `ACCESS_TOKEN`: 무작위 연결 비밀번호. **설정 화면의 Google Sheets 연결에만 사용합니다. Gemini 키가 아닙니다.**

실행 로그에는 시트 URL만 출력합니다. 비밀번호는 프로젝트 설정에서 확인합니다. 초기화는 다시 실행해도 같은 전용 시트를 사용합니다. 다른 기존 시트를 덮어쓰지 않습니다. 시트 공유 설정은 비공개로 두세요.

생성되는 탭:

| 탭 | 역할 |
|---|---|
| `PLLingo_Metadata` | 스키마 표시와 현재 저장 버전 |
| `Snapshots` | 정확한 기록 JSON을 여러 셀로 나누어 저장하는 원본 저장소 |
| `Settings` | 학습 목표·선택 주차 요약 |
| `Submissions` | 제출·점수·답안·문제 버전·context 해시 요약 |
| `Reviews` | 다음 복습 날짜·간격 |
| `Notes` | 즐겨찾기와 개인 메모 |

요약 탭은 첫 저장 시 생성됩니다. **요약 탭을 직접 고쳐도 앱의 기록은 바뀌지 않습니다.** `Snapshots`와 버전 포인터가 실제 저장소입니다. 요약 셀은 긴 내용을 줄여 표시할 수 있지만 원본 JSON은 잘라 저장하지 않습니다.

## 4. 웹앱 배포

Apps Script에서 배포 → 새 배포 → 웹앱:

- 실행 사용자: **나(프로젝트 소유자)**
- 액세스 권한: **모든 사용자(익명 포함)**

여기서 공개하는 것은 **비밀번호로 보호된 요청 처리 주소**입니다. 학습 시트 자체를 공개하거나 웹에 게시하지 않습니다. 조직 계정에서 익명 웹앱 배포를 허용하지 않으면 이 설치 방식은 사용할 수 없으며, 계정 정책에 맞는 별도 인증 구성이 필요합니다.

배포한 `/exec` URL을 복사합니다. 테스트용 `/dev` 주소는 사용하지 않습니다. 코드 업데이트 후에는 배포 관리에서 새 버전을 선택해야 합니다.

## 5. 사이트에서 연결

PLLingo 설정 → **Google Sheets 연결**에 `/exec` URL과 `ACCESS_TOKEN`을 입력합니다. URL만 브라우저에 기억하며 비밀번호는 현재 탭의 메모리에만 둡니다. 새로고침하면 비밀번호를 다시 입력합니다.

- **시트에 저장:** 이 기기의 제출·복습·설정·즐겨찾기·메모를 시트에 저장합니다.
- **시트에서 불러오기:** 다른 기기에서 저장한 위 기록을 가져옵니다. 교체 전 확인을 표시하며 이 기기의 사진과 미제출 답안은 유지합니다.
- **연결 종료:** 비밀번호를 메모리에서 지웁니다. 로컬 기록은 유지됩니다.

동기화는 **버튼으로 명시적으로 수행**합니다. 접속하거나 답안을 입력할 때마다 모든 기록을 자동 업로드하지 않습니다. 다른 기기에서 학습했다면 먼저 불러온 후 작업하고, 마칠 때 저장하세요. 동시에 수정된 시트를 이전 버전으로 덮어쓰려 하면 오류를 표시합니다. 연결된 Apps Script의 실패를 브라우저 mock 성공으로 바꾸지 않습니다.

## 사진과 비공개 자료 보존

시트에는 사진, 작성 중 답안, 원본 PDF, 강의·기출 추출문, 원문 context를 저장하지 않습니다. 다른 기기의 제출 기록에는 사진 장수와 원본 context 해시만 남습니다. 같은 기기에 이미 있던 사진과 동일 해시의 context는 불러올 때 유지합니다. 사진과 원문 snapshot까지 옮기려면 기존의 **사진 포함 전체 백업/복원**을 사용하세요.

호스팅 데모의 context는 작성된 문제의 가정만 포함하고 `unavailable`로 표시합니다. 정확한 강의 원문을 읽어 AI가 검증한 것으로 표시하지 않습니다. 원본 자료를 읽고 대조하는 기존 로컬 모드는 `dev.cmd`로 계속 사용할 수 있습니다.

현재 mock 채점을 시트 서버에서 처리할 때도 사진 바이트를 전송하지 않고 사진 개수만 전달합니다. 실제 사진 인식과 Gemini 호출은 추후 별도 연결 단계입니다. Gemini 키를 연결 비밀번호 칸이나 `VITE_` 환경변수에 넣지 마세요.

## GitHub Pages에 올릴 결과물

기본 base path는 `/PLLingo/`입니다. `.env`의 `VITE_BASE_PATH`를 설정했다면 실제 경로와 맞추세요. 사용자/저장소 구성이 다르면 이 경로도 달라집니다.

GitHub Pages에는 **`dist/`의 빌드 결과**를 제공해야 합니다. TypeScript 소스를 그대로 올려도 GitHub Pages가 자동으로 Vite 앱을 빌드하지는 않습니다. 기존 저장소의 Pages 배포 방식에 맞춰 이 결과물을 배치하거나 빌드 산출물로 배포하면 됩니다. 이 작업에서는 실제 Pages 배포를 수행하지 않았습니다.

현재처럼 `crane206265.github.io` 저장소의 `PLLingo` 폴더에서 작업한다면 `.\prepare-github.cmd`를 실행하세요. `/PLLingo/` 경로로 빌드하고 `index.html`, `assets/`, `hosted-catalog.json`을 현재 폴더에 배치합니다. `src/index.html`은 개발용으로 보존합니다. 이후 저장소 루트에서 `git add -- PLLingo`, `git commit -m "Add PLLingo study site"`, `git push origin main`으로 반영할 수 있습니다. GitHub 저장소 Settings → Pages의 배포 소스가 `main` / `(root)`인 구성을 전제로 합니다. 다른 배포 설정이라면 기존 설정에 맞춰 반영하세요.

## 크기와 실행 한도

서버는 파일 변환이나 모델 실행 없이 작은 JSON 처리와 시트 읽기·쓰기만 담당합니다. 자료 PDF 추출은 계속 로컬 준비 단계에서 수행합니다. 기록은 저장당 최대 200만 UTF-16 문자이며 셀마다 약 38,000자로 나눠 저장합니다. 마지막 3개 저장 버전을 남기고 오래된 조각을 정리합니다. 자동 재시도는 하지 않으며 동일한 요청의 재전송은 중복 저장하지 않습니다.

Apps Script에는 실행 시간·호출 할당량이 있습니다. 상시 켜둔 전용 서버와 같은 가용성을 보장하지 않으며, 개인 학습 규모에서 사용하고 오류는 화면에서 확인합니다. [Google의 할당량 안내](https://developers.google.com/apps-script/guides/services/quotas)

## 검증과 확인이 남은 부분

```powershell
npm test
npm run test:e2e
npm run test:sheets:e2e
```

기존 테스트는 실행 중인 로컬 모드(5173), Sheets 브라우저 테스트는 빌드된 Pages 미리보기(5174)를 사용합니다. Sheets 테스트는 실제 설치 코드를 Google 서비스의 로컬 대체 구현으로 실행하고, 중첩 iframe의 브리지 경로를 Chrome에서 검사합니다. 인증 실패·버전 충돌·중복 요청·중단된 저장·비공개 데이터 제외·기기 간 텍스트 기록 복원을 다룹니다.

**실제 Google 계정의 권한 승인, 웹앱 배포, Google Sheets 원격 왕복은 아직 검증하지 않았습니다.** 새 시트를 설정한 후 연결 → 저장 → 새 브라우저에서 불러오기로 마지막 확인을 진행해야 합니다.

설계 근거: [Apps Script 웹앱](https://developers.google.com/apps-script/guides/web), [HTML 브리지의 서버 함수 호출](https://developers.google.com/apps-script/guides/html/communication), [임베드 허용](https://developers.google.com/apps-script/reference/html/x-frame-options-mode), [LockService](https://developers.google.com/apps-script/reference/lock/lock-service).
