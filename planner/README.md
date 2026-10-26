# 개인 플래너

월간 캘린더에서 날짜를 선택하고, 시간대별 일정·하위 메모·오늘의 TODO를 편집합니다. 휴대폰 레이아웃을 지원하며, Markdown 원문 편집과 일별 `.md` / 전체 `.zip` 내보내기가 가능합니다.

홈페이지와 연구 페이지의 사이드바에서 **Blog → Planner** 순서로 진입합니다. 플래너도 공통 `main_style.css`의 헤더·사이드바·색상을 사용하며, 날짜 선택과 가져오기·내보내기는 본문 상단 도구 모음에 있습니다.

일정 목록 아래에는 시간에 비례한 타임라인을 표시합니다. 겹치는 일정은 나란히 배치하고, 자정을 넘는 일정은 다음날까지 이어집니다. 타임라인의 일정을 누르면 수정할 수 있습니다. PC에서는 할 일·메모 패널이 오른쪽에서 스크롤을 따라오며, 모바일에서는 아래로 배치됩니다.

Obsidian 원본 폴더는 읽기만 했습니다. 개인 기록·실제 비밀번호·인증 설정값은 저장소나 배포 파일에 포함하지 않습니다. 기존 기록을 옮길 때는 화면의 **Markdown 가져오기**로 `YYYY-MM-DD.md`를 선택하세요. 원본 파일은 바뀌지 않습니다. 자동 Obsidian 동기화는 아직 구현하지 않았습니다.

## 먼저 미리보기

저장소 루트에서 `python -m http.server 8765 --bind 127.0.0.1`을 실행하고 `http://127.0.0.1:8765/planner/`를 엽니다.

일반 정적 주소에서는 **미리보기만** 제공됩니다. 예시 기록은 메모리에 있고 탭을 닫으면 사라집니다. 실제 비밀번호 보호와 기기 간 저장은 아래 Apps Script 전용 주소에서 작동합니다. 공개 홈페이지에는 개인 기록을 두지 않습니다.

## 실제 사용: Google Sheets + 별도 비밀번호

PC에서 한 번만 설치하면 이후 PC를 켜두지 않아도 휴대폰에서 사용할 수 있습니다. 이 저장소의 다른 앱과 별도 프로젝트·시트를 사용합니다.

### 1. 배포 파일 만들기

Node가 있는 환경에서:

```powershell
node planner/scripts/build-appsscript.cjs
```

이 작업 환경에서는 다음 Node도 사용할 수 있습니다:

```powershell
& './PLLingo/.tools/node.exe' planner/scripts/build-appsscript.cjs
```

생성되는 `planner/apps-script-dist/`는 Git에서 제외됩니다. `Index.html`에는 홈페이지 공통 CSS와 플래너 CSS·JS가 함께 들어 있어 외부 서버에 의존하지 않습니다. Apps Script에서도 홈페이지로 돌아갈 수 있도록 공통 내비게이션 링크는 홈페이지의 전체 주소로 변환합니다.

### 2. 비밀번호 설정값 만들기

1. 로컬 서버의 `http://127.0.0.1:8765/planner/setup-password.html`을 엽니다.
2. 비밀번호를 두 번 입력합니다. 6자 이상 사용할 수 있습니다.
3. **설정값 만들기**를 누릅니다. 브라우저가 PBKDF2-HMAC-SHA256 600,000회와 무작위 32바이트 salt로 키를 계산합니다.
4. 아래 단계에서 값을 넣은 뒤 **화면에서 지우기**를 누릅니다. 설정값도 비밀번호와 같은 비밀로 취급합니다.

### 3. 전용 Apps Script 설정

1. [Apps Script](https://script.google.com/)에서 새 프로젝트를 만듭니다.
2. 기본 `Code.gs`를 생성된 `Code.gs`로 교체합니다.
3. HTML 파일 **Index**를 만들고 생성된 `Index.html`을 붙여 넣습니다.
4. 프로젝트 설정에서 매니페스트 표시를 켜고 생성된 `appsscript.json`을 붙여 넣습니다.
5. 스크립트 속성에 **PLANNER_AUTH**를 추가하고, 비밀번호 설정 도구의 JSON 값을 넣습니다. 이 PC에 미리 생성한 `planner/private-data/auth.local.json`이 있으면 파일 내용 전체를 사용할 수 있습니다. 이 파일은 Git에서 제외되며 배포 파일에 포함되지 않습니다.
6. 편집기에서 `initializePlanner_`를 한 번 실행하고 Google 권한을 승인합니다. 새 비공개 스프레드시트를 만들고 **PLANNER_SHEET_ID**를 속성에 기록합니다. 다른 시트는 변경하지 않습니다.

함수 선택기에 밑줄로 끝나는 함수가 보이지 않으면, 편집기에 아래 임시 함수를 추가하고 한 번 실행하세요. **배포하기 전에 임시 함수를 반드시 삭제합니다.** 초기화 helper는 브라우저에서 호출할 수 없도록 비공개입니다.

```javascript
function initializePlanner() {
  console.log(initializePlanner_());
}
```

### 4. 웹앱 배포

- 배포 → 새 배포 → 웹 앱
- 실행 사용자: **나**
- 액세스 권한: **모든 사용자** (익명 포함)

공개되는 것은 로그인 화면과 비밀번호 인증 API입니다. **시트는 비공개로 유지**하고, 웹에 게시하거나 다른 사람과 공유하지 마세요. 모든 기록 읽기·쓰기·내보내기 API는 유효한 세션을 요구합니다.

배포된 `/exec` 주소를 휴대폰에서 열고 설정한 비밀번호로 로그인하세요. 홈 화면에 북마크로 추가할 수 있습니다. 학교/조직 계정이 익명 웹앱 배포를 막으면 해당 계정으로는 이 구성이 동작하지 않습니다.

### 5. 홈페이지의 Planner와 연결

`planner/config.js`의 `webAppUrl`에 방금 받은 `/exec` 주소를 넣습니다. 이 파일은 홈페이지에 공개되므로 URL만 넣고 비밀번호나 PLANNER_AUTH 값은 넣지 않습니다.

```javascript
window.PLANNER_CONFIG = Object.freeze({
  webAppUrl: 'https://script.google.com/macros/s/배포_ID/exec'
});
```

이후 홈페이지에서 Planner를 누르면 실제 플래너로 이동합니다. 홈페이지 파일을 수정한 뒤에는 GitHub Pages에도 변경 내용을 반영해야 합니다. 주소가 비어 있으면 기존 예시 미리보기가 열립니다. Apps Script에 배포하는 HTML은 이 리디렉션 설정을 포함하지 않습니다.

코드 수정 후에는 기존 배포의 버전을 새 버전으로 올립니다. PLANNER_AUTH와 PLANNER_SHEET_ID는 유지합니다. 설정값을 재생성해 PLANNER_AUTH를 바꾸면 이전 로그인 세션은 무효화되고 기록은 유지됩니다.

## 사용 및 저장

- 자동 저장: 변경 후 약 0.65초. 실패하면 실패 상태를 표시하고 화면의 편집 내용을 유지합니다. `.md`로 사본을 받을 수 있습니다.
- 동시 편집: 날짜별 버전을 비교합니다. 충돌하면 덮어쓰지 않고 사본 저장과 최신 기록 불러오기를 제공합니다.
- 잠그기: 서버 세션을 폐기하고 화면의 기록·메모를 지웁니다. 토큰은 브라우저 탭의 sessionStorage에만 저장하며 세션은 최대 8시간입니다.
- 가져오기: 선택한 파일만 읽습니다. 기존 웹 기록이 있으면 교체 전에 확인합니다.
- 내보내기: 전체 ZIP 안의 날짜 파일을 `2026/Oct. 2026/Oct. Week 5/2026-10-26.md` 같은 기존 구조로 만듭니다. Obsidian에 넣을 때 기존 파일과 중복되는 날짜를 확인하세요.
- 하루 기록은 UTF-8 24KB까지 지원합니다. 파일을 가져온 경우에도 지원하지 않는 Markdown·제목·임의 메모는 원문에 남습니다. 파싱 가능한 일정·TODO만 화면에 표시합니다.
- 시간은 Asia/Seoul 기준입니다. 실제 기기 간 연결과 Sheets 호출은 배포된 Google 환경에서 추가 확인해야 합니다.

## 인증 및 한계

원문 비밀번호 대신, 매 로그인마다 5분짜리 일회용 challenge에 대한 HMAC 증명을 보냅니다. challenge는 한 번 소비하고, 비밀번호 변경 시 세션을 무효화합니다. 15분 내 로그인 실패 10회면 전체 앱에 5분의 대기 시간을 두며, challenge 발급은 분당 30회로 제한합니다. 로그인 설정값과 서버 세션은 Script Properties에 보관합니다. 시트에는 Markdown을 base64 텍스트로 저장해 수식으로 실행되지 않도록 합니다.

이 저장 방식은 **접근 제어**이며 종단간 암호화는 아닙니다. Google과 시트 소유자는 원문을 읽을 수 있습니다. Apps Script 실행 한도 및 Google 서비스 가용성의 영향을 받습니다. 익명 주소에 대한 전역 대기 시간은 남의 로그인 시도로도 작동할 수 있습니다.

공식 참고: [HTML Service 호출과 비공개 함수](https://developers.google.com/apps-script/guides/html/communication), [Web Apps](https://developers.google.com/apps-script/guides/web), [Script Properties](https://developers.google.com/apps-script/reference/properties/properties-service), [LockService](https://developers.google.com/apps-script/reference/lock/lock-service).

## 검증

```powershell
node --test planner/tests/*.test.cjs
```

단위 테스트는 합성 기록만 사용하며, Obsidian 원본 파일과 Google 계정을 변경하지 않습니다.
