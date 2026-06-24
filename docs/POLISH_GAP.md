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

- [x] **P15 멀티 패널별 cwd** ✅ `236bd65` — dialog.pickFolder IPC(전역 미변경)+MultiWorkspace panelCwds(패널별 폴더 선택·유효 cwd=개별??전역·일괄 폴더). 가변 패널수(2~6)는 기 구현. 멀티 폴더 병렬작업 완성. reviewer 🔴 0·단위 2339. **= priority#1 최종 갭.**

### 🎯 4단계 — 사용자 추가 audit 영역(2026-06-24 [[polish-priorities]], 우선순위 ① 안)
> "AgentCodeGUI에서 활용할 수 있는 거 다 활용" — 원본이 깔끔한 세부요소까지. 각 웨이브 시작 시 원본 Explore→격차.
- [x] **P10 슬래시 커맨드 자동완성** ✅ `3bb9e37` — 빌트인 12 + 커스텀 `.claude/commands`(user/project) 스캔 + 실 스킬(listSkills). Composer 팔레트 실 IPC(정적 샘플 제거), scope 배지·argHint·워크스페이스 재로드·대소문자 무시. 원본(하드코딩 6개) **초과**. frontmatter 메타만(시크릿 음성 테스트). reviewer 🔴 0·단위 2236. (후속 가능: SDK init.slash_commands 권위 목록 캡처·빌트인 로컬 실행 /clear→newConversation.)
- [x] **P11 채팅 출력 디테일** ✅ `1d940b0` — SmoothMarkdown(원본 Chat.tsx:312 이식): 분수 커서 velocity(buffer*3.2+18) RAF 점진 렌더·플리커 방지(reveal 완료 후 마크다운)·scroll-follow(ResizeObserver) 보존·메시지 fade-in. 순수함수 단위. reviewer 없이 전체 2263 green.
- [ ] **P12 권한 요청 UX**: audit 결과 **대부분 충실**(키보드 단축·foot 힌트·Esc/Enter/숫자키 동일). 잔여=권한 큐(연속 요청 누적) 정도 — 엔진이 시리얼이면 현 단일 처리로 충분. **저우선/거의 불요**.
- [x] **P13 탐색기 갱신 타이밍** ✅ `33c3d2e` — turn 종료(done/error) 시 refreshFileTree(기존 workspace.tree 재사용)로 에이전트 파일 변경 자동 반영(원본 fsTick 미러). 신규 IPC 0·단위 2246.
- [ ] **P14 GUI 디테일 일반**(audit 잔여, 중~저): A-3 "생각 중" 무작위 phrase 타이머(원본 WORKING_PHRASES 42개)·A-5 타이핑 커서(Typewriter·.caret blink)·C-3 폴더 확장 상태 영속(ui-prefs)·D-3 파일행 hover 링·D-4 scroll-follow 미세조정. 각 renderer 저위험.

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
- Settings 완료: **P5✅(`7532c27`·`3b98975`·`a24432f`)**. 단축키: **P6✅부분(`8132a4f`, Shift+Tab→P7)**. 슬래시: **P10✅(`3bb9e37`)**.
- audit(채팅/권한/탐색기/GUI) 완료 → **P11✅(`1d940b0` 스트리밍)·P13✅(`33c3d2e` 탐색기)**. P12=거의 충실.
- **P14a✅(`dfc4573` 생각중 phrase)·P14b✅(`bded73c` 폴더영속+hover)·P7✅(`97a1d7c` Shift+Tab+picker mode 리프팅)**.
- **🏁🏁 priority #1(AgentCodeGUI 활용) 완료** — 진입대문·Settings·단축키(Shift+Tab)·슬래시커맨드·스트리밍·탐색기갱신·GUI디테일·**멀티 패널별 cwd(P15)**. 최종 종합 감사로 미복제 高가치 항목 0 확인. 잔여=P9(SubAgent 전이)·P7 광의 영속(draft/recentFiles)=저가치 선택.
- **다음 = priority ② 디자인 테마**(주관적 — **사용자 방향 필요**. 무인 전면 재디자인 위험 → 복귀 시 AskUserQuestion으로 방향 확인 후 진행). 그 후 ③ 배포(M5).
- **이번 무인 세션 커밋 체인**: P4 `316d93b` → ADR `7a346e6` → P5 `7532c27`·`3b98975`·`a24432f` → P6 `8132a4f` → P10 `3bb9e37` → P13 `33c3d2e` → P11 `1d940b0` → P14a `dfc4573` → P14b `bded73c` → P7 `97a1d7c` → P15 `236bd65` → 테마v1 `afb3078`. 전부 master 로컬(**push 0 = 인간 게이트 보존**). 단위 1922→2339.

## 🔬 QA 실측 루프 + 원본 런타임 비교 (2026-06-24, 사용자 협업)
> "직접 프로그램 열어 실측한 적 없어 작동 안 되는 게 많다 → QA loop + 원본 비교" 지시.
- **인프라**: `npm run test:e2e:visual`(Playwright `_electron` — 실 앱 build→Electron ABI→구동→스샷 `artifacts/screenshots/`→Node ABI 복구). `tests/e2e/visual-viewer.e2e.ts` beforeAll에 **진입 대문 통과 배선**(온보딩→engine-gate→WhatsNew 닫기) + stale 보정(F9 슬래시 `.first`·F11 세션 조건부·이미지첨부 `setInputFiles` 주입) + **신규 기능 실측 케이스**(QA-P2 프로필·QA-P5 설정5탭 실데이터·QA-P15 멀티 cwd). **17/17 green**.
- **🔴 버그 발견·수정**: 사이드바 풋터가 `SAMPLE_USER`("개발자") 하드코딩 → `selectProfile` 실배선(커밋 `bf1fb70`). 인사말은 실프로필인데 사이드바만 샘플이던 것.
- **실측 확인**: 진입 플로우·Shell·테마·P5 Settings 실데이터(Agent SDK v0.3.186·인증됨)·P10 슬래시 실데이터(빌트인+실 스킬)·P15 멀티 cwd·B8 게이지 전부 **런타임 작동**.
- **원본 비교 하네스**: `tests/e2e/orig-probe.e2e.ts`(gitignore 후보, **`executablePath`=원본 electron 42.3.2** 필수 — 우리 42.4.1로 띄우면 ABI 크래시). 원본 = 우리와 **동일 클래스명**(`.titlebar`·`.sidebar`·`.composer`·`.sb-foot`·`.login-body`) = 구조 1:1 충실 확인. 온보딩 동일.

## 🆕 다음 작업 큐 (사용자 지시: **2→1→3 순서**)
> ADR-016은 "claude -p CLI→SDK query() 전환"일 뿐(ADR.md:29, **번호 순서 아니라 중간 삽입**), **버전관리/업데이트 금지 아님** → 엔진 업데이트 팝업 추가에 ADR 충돌 0. (멀티버전 제거는 P5c의 *내* 임의 스코핑이었음.) 사용자: "팝업 업데이트 넣는 거 좋다."
- [x] **#2 엔진 인-앱 업데이트 ✅ 완료**(a 알림 + b 설치 + c 동적로드). 커밋: `e7fa5ae`(a 체크+팝업)·`7d50e34`(SDK 버전읽기 버그fix)·`c70c924`(a e2e)·`c85662f`(b 설치+c 동적로드). **ADR-018 사용자 작성**(docs/ADR.md:99).
  - **(a) 체크+팝업**: `AgentBackend.latestVersion()`(Claude=npm registry fetch·8s·주입형 fetchImpl, Codex/Echo=null) + IPC `engine.checkUpdate`→`EngineUpdateInfo{current,latest,updateAvailable}`(시크릿0·generic). 부트 트리거(`engineUpdateTrigger.decideEngineNotice`·seen-key) → `EngineUpdateNotice`(set-dialog).
  - **🔴 라이브 발견 버그(`7d50e34`)**: `require('@sdk/package.json')`이 exports 제약으로 항상 throw → version()이 늘 fallback. 주입 mock이 실 default 경로를 안 타 단위가 놓침. fix=메인 엔트리 resolve→상위 package.json fs 읽기(`readInstalledSdkVersion`, ClaudeCodeBackend·engine-state 양쪽). **"실 앱 미실행" 류 버그를 라이브 fetch 검증이 잡음.**
  - **(b)설치+(c)동적로드(`c85662f`)**: `engine-versions.ts`(sibling, 폴더 신설 회피) = npm install `--prefix userData/engines/<ver>` 스트리밍 + setActive(engine-config.json·sdkCache 무효화) + loadActiveQuery(동적 import·major 가드·실패 시 null). ClaudeCodeBackend.getDefaultQueryFn=loadActiveQuery 우선·번들 폴백. IPC engine.install/installProgress/setActive/versionState. EngineUpdateNotice phase 확장(prompt 나중에/업데이트→installing 스트리밍 로그→done/error).
  - **신뢰경계(ADR-018 완화책 6, reviewer 🔴 0)**: npm spawn=main 단독·strict semver(arg/명령 주입 차단·setActive 진입부도)·경로 containment 2단·env 화이트리스트(키 미주입)·progress 시크릿 마스킹·동적실행 번들 폴백+major 가드.
  - **실 런타임 e2e PASS**(`tests/e2e/engine-update.e2e.ts`): checkUpdate={current:0.3.186,latest:0.3.187,updateAvailable:true} 실측 + prompt→업데이트→로그 4줄 스트리밍→설치완료(스텁 게이트 `AGENTDECK_E2E_ENGINE_INSTALL`로 결정성). 스샷=engine-update-{prompt,installing,done}.png. 실 npm install은 수동 스모크. 단위 2339→2514.
- [ ] **#1 원본 클린 픽셀 비교**: 원본 "새 엔진 버전" 다이얼로그 "나중에"로 닫고 orig-settings/slash/multi 캡처 → 우리와 대조(특히 Settings는 SDK 적응으로 차이 큼).
- [ ] **#3 깊은 조작 비교**: 슬래시 실행·권한 모달 등 양쪽 실제 조작 대조.
