# POLISH_GAP — 원본 대비 "놓친 구현 디테일" 폴리싱 드라이버

> 기능 트랙 완료(M1~M4·B8·B9·M2-LSP) 후, 원본 AgentCodeGUI의 **미세 동작/실배선 디테일** 격차를 audit→fix.
> 무인 /loop 드라이버(매 iteration 읽고 다음 미완 이어감, 압축 생존). "다른 부분 없을 때까지".
> **사용자 결정**: 진입 대문 = 원본 진입 흐름 **실배선(Track 1)** + 우리 스타일 가미(Track 2).
> audit 원천: 2026-06-24 Explore(원본 App.tsx 진입 시퀀스·prefs.ts·Settings.tsx·useGlobalShortcuts 대조).
>
> **🎯 우선순위(2026-06-24 사용자 지시 [[polish-priorities]])**: ① AgentCodeGUI 활용 가능한 것 **전부**(아래 웨이브 + 추가 audit 영역) → ② 디자인 테마 → ③ 배포(M5). 이 순서 엄수.
> **추가 audit 영역(① 안, 사용자 콕 집음)**: 채팅 출력 디테일 · 권한 요청 UX · 탐색기 갱신 타이밍 · GUI 디테일 전반 · **슬래시 커맨드 자동완성(프로젝트별 + Claude Code 기본, 최대한 다)**. → P10+ 웨이브로 정의 예정(P5~P9 후).

## 확인된 토대 부재 (우리 코드)
- **profile·ui-prefs·engine 탐지 IPC 전무**(grep 0). 대문은 main 영속/탐지부터 신규.
- 엔진 모델 차이(ADR-016): 우리는 Agent SDK(하드 의존, isAvailable=true) — 원본의 `claude` CLI 설치 탐지와 의미가 다름. **EngineGate는 1:1 아닌 적응**(SDK 가용 + OAuth 인증 상태) 필요.

## 우선순위 격차 → 웨이브 (🔴 기능결함 > 🟡 영속/UX > 🟢 폴리싱)

### 🔴 1단계 — 진입 대문 + 핵심 동작
- [x] **P1 ui-prefs 영속 토대** ✅ `221a317` — main prefs.ts(userData/ui-prefs.json)+IPC+renderer lib/prefs.ts(boot loadPrefs·getPref/setPref). reviewer 🔴 0·단위 1792.
- [x] **P2 Profile 진입 게이트(대문 핵심)** ✅ `06f3303` — profile.ts 영속+PROFILE_GET/SET + AppGate 부트 3단계(스플래시→온보딩→Shell·첫실행/복귀 분화)+인사말 닉네임 실연결+절제된 페이드인. reviewer 🔴 0·단위 1849.
- [x] **P3 EngineGate 적응** ✅ `926807e` — engine.state IPC(available/authed/version, authed 불리언만·토큰 미노출) + AppGate engine-check 단계 + EngineGate를 CLI 설치→OAuth 인증 안내로 적응(재확인/계속 우회). Shell stale EngineGate 제거. reviewer 🔴 0·단위 1898.
- [x] **P4 WhatsNew/UpdateNotes 자동 트리거** ✅ `316d93b` — app.getVersion IPC(shared 계약·preload getAppVersion·main 핸들러) + lib/whatsNewTrigger.ts(SEEN_KEY·seriesOf·decideStartupModal 순수) + Shell 부트 useEffect(첫실행 seen 빈값→WhatsNew·마이너 시리즈 상승→UpdateNotes·닫을 때 setPref 도장·같은 키 공유로 동시표시 방지). "자동 표시 안 함" 셸 상태→부트 트리거 대체, test-open 훅 보존. reviewer 🔴 0·계약 골든 5+트리거 순수함수 18·단위 1922.

### 🟡 2단계 — 실동작/영속
- [x] **P5 Settings 5탭 실동작** ✅ `7532c27`(P5a Skill)·`3b98975`(P5b MCP·시크릿 마스킹)·`a24432f`(P5c Engine/LSP 적응) — 테마=기존 실동작. Skill/MCP=`~/.claude` 읽기+userData disabled 오버레이+런타임 적용(skillOverrides/deniedMcpServers). MCP detail 화이트리스트 마스킹(시크릿 0). Engine=getEngineState 적응(멀티버전 제거), LSP=TS/Py 번들·C#/C++ M5. plan-auditor REVISE 4🔴 반영. reviewer 신뢰경계 🔴 0·시크릿 누출 🔴 0. 단위 2131.
- [~] **P6 전역 단축키 배선** ✅(부분) `8132a4f` — Ctrl/⌘+N(새채팅)·Ctrl/⌘+O(폴더)·Esc(실행중·single·모달미열림 시 중지, 오버레이 13종 가드). store 액션 재사용. reviewer 🔴 0·단위 2165. **Shift+Tab 모드순환은 Composer picker 상태 store 리프팅 필요 → P7과 함께.**
- [ ] **P7 대화 영속 보강 + Shift+Tab**(🟡): draft·draftImages·sysPrompt·recentFiles·picker(model/effort/mode) 채팅별 영속(원본 PersistedChats) + picker mode store 리프팅 → Shift+Tab 모드순환 배선.

### 🟢 3단계 — 폴리싱(선택)
- [ ] **P8** scroll-follow latch·메시지 animate·타임스탬프 미세동작.
- [ ] **P9** SubAgent 패널 상태 전이(멀티 초기).

### 🎯 4단계 — 사용자 추가 audit 영역(2026-06-24 [[polish-priorities]], 우선순위 ① 안)
> "AgentCodeGUI에서 활용할 수 있는 거 다 활용" — 원본이 깔끔한 세부요소까지. 각 웨이브 시작 시 원본 Explore→격차.
- [ ] **P10 슬래시 커맨드 자동완성**(사용자 명시·고가치): Composer에서 `/` 입력 시 **프로젝트별 슬래시 커맨드(`.claude/commands`) + Claude Code 기본 슬래시 커맨드** 자동완성. "왠만하면 다 쓸 수 있게". 원본 Composer 슬래시 팔레트 매핑.
- [ ] **P11 채팅 출력 디테일**: 스트리밍/메시지 렌더 미세동작(원본 대비 격차).
- [ ] **P12 권한 요청 UX**: PermissionModal 흐름 미세 디테일.
- [ ] **P13 탐색기 갱신 타이밍**: fs watch/트리 refresh 타이밍·반응성.
- [ ] **P14 GUI 디테일 일반**: 원본 대비 잔여 시각/상호작용 격차(catch-all).

### 🎨 5단계 — 디자인 테마 (기능 폴리싱 ① 완료 후 — [[polish-priorities]] ②)
- [ ] 디자인 테마 손보기(OKLCH 듀얼테마 위 우리 스타일 개선). 별도 단계.

### 📦 6단계 — 배포(M5, [[polish-priorities]] ③, 비가역 ask 게이트)
- [ ] NSIS·electron-updater·asarUnpack(번들 LSP)·엔진 버전관리.

## 이미 충실(폴리싱 불요 — 과잉수정 방지)
ImageViewer·FileModal/CodeViewer·Composer 기본·GitModal·AskModal·테마전환·Permission/Question 모달(기본)·RecentFiles 탭·Zoom·LSP·Settings(P5 완료).

## 사이클·정책
각 웨이브: (필요시 Explore 보강)→Phase/계획→plan-auditor(토대·신뢰경계 변경 시)→domain Worker TDD(실패 먼저)→reviewer(신뢰경계 🔴 0)→라이브(필요시 vite-node/실 동작)→conventional commit(master)→POLISH_GAP/FEATURE_MAP/replica-loop 갱신. 서브에이전트·도구 한국어·기본 foreground. 인간게이트(push/배포) 보존. 신뢰경계 불가침(fs/IPC main 단독·토큰0). 막힘=원본+Opus 5회 의논 후 정지.

## 상태
- 진입 대문 완료: **P1✅(`221a317`)·P2✅(`06f3303`)·P3✅(`926807e`)·P4✅(`316d93b`)**. ADR drift 정정✅(`7a346e6`).
- Settings 완료: **P5✅(`7532c27`·`3b98975`·`a24432f`)**. 단축키: **P6✅부분(`8132a4f`, Shift+Tab→P7)**.
- 진행: **P10 착수** (슬래시 커맨드 자동완성 — 사용자 명시 고가치). 이후 P7(영속+Shift+Tab)·P11~P14 → 디자인 테마 → 배포.
