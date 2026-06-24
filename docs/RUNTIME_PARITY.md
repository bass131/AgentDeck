# RUNTIME_PARITY — 실 런타임 비교·기능검증 루프 드라이버

> 사용자 지시(2026-06-24): "AgentCodeGUI ↔ 우리 앱을 실 런타임 실조작으로 비교해 원본이 더 나은(시각·조작감·편의성) 부분을 실측 개선" + "Test_Project에서 실제 작업 가능한지 검증(채팅·파일산출·Task 갱신·SubAgent 갱신·변경파일 GUI 갱신·로컬+모든 ClaudeCode 슬래시·각 기능 부족분)". **편향 방지: 판단 분기점마다 Opus 서브에이전트 평가.** 막힘=[[loop-stuck-policy]]. push 0(인간 게이트). 문서 갱신 권한 위임받음(ADR 결정/헌법 핵심 제외).

## 환경
- 원본: `C:/Dev/AgentCodeGUI`(out/ 빌드됨, electron 42.3.2 — Playwright `executablePath` 필수). 우리: `C:/Dev/CustomGUI_Agent`(electron 42.4.1).
- Test_Project: `C:/Dev/Test_Project`(git+TS: src/{components/Button,Card.ts, utils/greet.ts, index.ts}, national_anthem.txt, README, package.json). 로컬 `.claude/commands` 없음(테스트 생성).
- 실 에이전트: `LIVE_SDK=1 node scripts/run-e2e.cjs <file>`(구독 인증·credentials.json 존재). 스텁 비사용.
- e2e 하네스: `tests/e2e/{live-sdk,visual-viewer,orig-probe,engine-update}.e2e.ts`. 스샷=`artifacts/screenshots/`(gitignore).

## 검증 체크리스트 (Track B — Test_Project 실기능)
- [ ] **B1 채팅**: 프롬프트→실 SDK 응답 스트리밍(라이브 검증됨 — live-sdk.e2e). 재확인 + 디테일.
- [ ] **B2 파일산출**: 에이전트 Write→디스크 생성.
- [ ] **B3 변경파일 GUI 갱신**: 생성/수정 파일이 탐색기 트리 + Git 변경목록에 자동 반영(P13 refreshFileTree·turn종료).
- [ ] **B4 Task(todos) 갱신**: TodoWrite→AgentPanel todos 실시간.
- [ ] **B5 SubAgent 갱신**: Task/Agent 도구→subagent 카드.
- [ ] **B6 로컬 슬래시**: Test_Project `.claude/commands/*.md`→팔레트 노출·실행.
- [ ] **B7 모든 ClaudeCode 빌트인 슬래시**: SDK `supportedCommands()`/init.slash_commands 실제 목록 vs 우리 12개 하드코딩 — 누락 점검.
- [ ] **B8 각 기능 부족분**: 조작 중 발견되는 미세 갭.

## 비교 체크리스트 (Track A — 원본이 더 나은 부분)
- [ ] **A1 시각**: 화면별 픽셀/레이아웃 대조.
- [ ] **A2 조작감**: 인터랙션 반응·피드백·애니메이션.
- [ ] **A3 편의성**: 단축키·자동완성·기본동작·에러처리.

## 사이클
각 iteration: 대상 선정 → 실 런타임 조작(Playwright `_electron`, 필요시 LIVE_SDK) → 스샷/동작 실측 → **Opus 서브에이전트 평가(편향 차단)** → 갭/버그면 domain Worker TDD→reviewer→fix → conventional commit(master) → 이 문서 + 관련 핵심문서 갱신. 서브에이전트·도구 한국어·기본 foreground.

## Iteration 로그
(아래 append)

### Iteration 1 — Test_Project 실 에이전트 기능 검증 (실측 완료, 2026-06-24)
하네스: `tests/e2e/live-test-project.e2e.ts`(LIVE_SDK=1·Test_Project 임시 사본·실 SDK). 디버그 반복으로 e2e 토대 정립(부트 모달 Esc·엔진알림 나중에·**워크스페이스는 자동오픈 아님→"폴더 선택" 클릭 필요**). 실 에이전트가 GENERATED.md 생성+national_anthem.txt 수정 수행. 스샷=live-tp-{00-initial,01-after-edit,02-subagent}.png.

**작동 확인**: B1 채팅 스트리밍·툴 타임라인(Bash/Glob/Read/Write/Edit)✓ · B2 파일산출(Write→디스크·트리 노출)✓ · B5 SubAgent 카드(노드 2)✓ · 컨텍스트 게이지 갱신✓.

**🔴 실 갭 발견(원본은 하는데 우리는 누락):**
- **F1 todos 패널이 폐기 도구에 배선**: TodoWrite는 SDK 0.3.142+ 폐기→Task 도구(TaskCreate/Update/List) 대체(claude-code-guide 권위 확인). SDK 0.3.186은 TodoWrite 미제공(정상). 모델이 "TodoWrite 제공 안 됨"+ToolSearch 시도. 우리 `claude-stream.ts:197`은 todos를 **TodoWrite에만** 배선→영구 빈 "할 일" 패널. **원본 `engine.ts:117` `TASK_TOOLS={TodoWrite,TaskCreate,TaskUpdate,TaskList}` 신구 모두 처리.** → Task* 라우팅(payload 매핑) 필요.
- **F2 changed-files 실backend 미emit**: `file_changed` 이벤트가 **EchoBackend(L45)만** emit. 실 ClaudeCodeBackend/claude-stream은 Write/Edit에 미emit→"변경된 파일" 패널·트리 changed-dot 0(실측 0개). **원본 `engine.ts:643` Write/Edit/MultiEdit 추적.** → claude-stream에 Write/Edit/MultiEdit/NotebookEdit→file_changed emit 필요.

**🟡 부수 관측(저~중)**:
- 워크스페이스 **마지막 선택 자동 복원 없음**(매 실행 폴더 재선택) — 원본 대비 편의성 점검 대상.
- **워크스페이스 미오픈 시 에이전트 cwd=process.cwd()**(앱 dir) 폴백 → 엉뚱한 위치 작업(테스트 중 우리 repo에 GENERATED.md 생성됨, 정리함). 미오픈 시 전송 차단/경고 검토.
- Edit national_anthem.txt 첫 시도 "오류" 후 재시도 성공(string-match 1회 실패) — 모델측, 비차단.
- 빌드 경고: engine-versions.ts 동적+정적 import 혼재(청크 분리 안 됨) — 기능 무관, 정리 가능.

→ Opus 편향차단 평가: F1·F2 전면 동의, **F2 먼저**(가시성·실측정합·단순), 근본원인=원본 engine.ts의 tool_use/result 부가처리 누락(둘 다 run 스코프 stateful 필요).

**✅ F2 완료(커밋 `c81ceda`)**: ClaudeAgentRun pending-map — Write/Edit/MultiEdit/NotebookEdit tool_use {id→path,change} → tool_result 성공(is_error=false)에만 file_changed push(거부/실패 유령마커0), abort/종료 pending 정리. emit 경로=워크스페이스 상대 POSIX 정규화(절대경로 input→트리 node.path 매칭). 골든 20·802 green·reviewer 🔴0. **라이브 e2e 실측: 변경파일 패널 2건·트리 changed-dot 2개 점등 확인**(이전 0→2). claude-stream 순수 보존. 🟡 후속(비차단): `_FILE_CHANGE_TOOLS`/`MUTATING_TOOLS` 단일출처화.

**B 검증 현황**: B1 채팅✅·B2 파일산출✅·B3 변경파일 GUI✅(F2)·B5 SubAgent✅ · **B4 todos=F1 미해결**·B6 로컬슬래시 미검·B7 모든 빌트인 슬래시 미검.

### Iteration 2 — F1(Task*→todos) ✅ 완료(커밋 `5176f38`)
ClaudeAgentRun stateful taskMap(TaskCreate=순서 id·TaskUpdate=taskId로 status/label·deleted 제거·TaskList=resync) → todos 전체 재emit, Task* tool_call·tool_result suppress(도구로그 제외·원본 TASK_TOOLS 미러), abort/finally 정리. mapClaudeStreamLine 순수 보존. 골든 19·821 green·reviewer 🔴0·shared 무변경. **라이브 e2e 실측: Task 도구 명시 프롬프트로 "할 일" 2/2 점등**(Create GENERATED.md·Modify national_anthem.txt 완료·진행바). 모델이 Task 미사용 시 인라인 추적(SDK 정상). 🟡 후속(비차단): `_mapTaskStatus`↔claude-stream `todoStatus` 중복·taskId 폴백 변형 테스트.

**🏁 B 핵심 검증 완료**: B1 채팅✅·B2 파일산출✅·B3 변경파일 GUI✅(F2)·**B4 todos✅(F1)**·B5 SubAgent✅ — 실 에이전트로 5종 동작 확인. 남은: B6 로컬슬래시·B7 빌트인 슬래시 전수.

### Iteration 3 — B6/B7 슬래시 + Track A (다음)
- **B6 로컬 슬래시**: Test_Project에 `.claude/commands/<name>.md` 생성 → Composer '/' 팔레트 노출·실행 검증(P10 command.list가 워크스페이스 .claude/commands 스캔하는지 실측).
- **B7 빌트인 슬래시 전수**: 우리 P10 빌트인 12개(하드코딩) vs SDK `query.supportedCommands()`/init.slash_commands 실제 목록 대조 — 누락 점검("왠만하면 다 쓸 수 있게"). 필요시 보강.
- **Track A**: 원본↔우리 화면별 시각/조작 비교(orig-probe 하네스). 원본이 더 나은 디테일 실측.
- **🟡**: 워크스페이스 마지막 선택 자동복원(원본 확인 후), 미오픈 시 cwd 경고.
분기점마다 Opus 편향차단 평가.
