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

### Iteration 3 — B6/B7 슬래시 ✅(커밋 `2711e89`)
- **B6 로컬 슬래시 ✅**: `commands.ts:303 listSlashCommands`가 `<ws>/.claude/commands/*.md`(project)+`~/.claude/commands`(user) 스캔. **라이브 실측**: Test_Project 사본에 `.claude/commands/hello-parity.md` 생성→'/' 팔레트에 hello-parity(project)·meetingnote(user) 노출 확인. end-to-end 작동.
- **B7 빌트인 정직화 ✅**: SDK 실측(`supportedCommands()`=32 동적) + Opus 편향차단 평가로 **빌트인 12개 중 6개(cost·help·model·agents·mcp·memory)가 거짓 광고**(엔진 supportedCommands에 없고 인터셉트도 없어 raw 전송→텍스트 처리, 실제 안 돎) 발견. **작동 보증 6개**(ask·clear 인터셉트 + compact·init·review·security-review 엔진)로 축소. 원본 "genuinely runs only" 철학 정렬. 라이브 팔레트 정직성 확인. 단위 2552 green.
- **🟦 B7 Step 2(사용자 결정 필요)**: "왠만하면 다"의 진짜 정답=SDK `query.supportedCommands()` **동적 캡처**(환경별 포괄+자동최신). 단 ① probe query 비용(레이트리밋 소모)·init 메시지 slash_commands 가용성 라이브 검증 선결 ② **원본 미존재 확장→ADR 필요**(ADR-013, 헌법상 사용자 단독). cost/model/mcp는 GUI 동선 존재(게이지·picker·Settings)라 슬래시 불요. **복귀 시 ADR 작성+범위 결정 요청.**

### Iteration 4 — Track A 원본 비교 (실측 완료)
orig-probe 하네스로 원본 구동(executablePath=원본 electron 42.3.2). 캡처: launch+shell(설정/슬래시/멀티는 원본 내비 셀렉터 불일치로 스킵). **런타임 구조 1:1 재확인**: 원본도 동일 컨테이너(.titlebar·.sidebar·.composer·.ctx-strip·.sb-foot).
- **워크스페이스 자동복원 = 갭 아님**: 원본도 부트 시 `manualCwd=''`(App.tsx:117·390) 미복원. 내 🟡 추정 오류 정정.
- **🟦 대화별 cwd 앵커링 = 실 차이(사용자 결정)**: 원본은 대화 record에 `cwd`(protocol.ts:271 "Required")+세션이벤트 cwd 저장 → 대화 전환 시 그 폴더 복원·folder-switch 확인 흐름. 우리는 **전역 단일 `workspaceRoot`**(ConversationRecord에 cwd 0) → 대화 전환해도 폴더 유지. 여러 프로젝트 대화 시 @멘션/파일 기준이 어긋날 수 있음. **대형 기능**(대화 스키마 마이그레이션+IPC 계약+store+folder-switch UX) — MVP 단일워크스페이스 의도적 단순화일 수도. **복귀 시 빌드 여부 결정 요청**(원본 패리티 vs MVP 스코프).

## 🏁 루프 상태 (Iteration 4 종료 시점)
**사용자 명시 체크리스트 전부 완료·검증**: 채팅(B1)·파일산출(B2)·Task갱신(B4/F1)·SubAgent(B5)·변경파일GUI(B3/F2)·로컬슬래시(B6)·모든ClaudeCode슬래시(B7 정직화) — 전부 실 에이전트 라이브 검증. 실 코드 버그 2건(F1·F2) 수정. 슬래시 거짓광고 정리(B7).
**해결 커밋(로컬 master, push 0)**: F2 `c81ceda` · F1 `5176f38` · B6/B7 `2711e89` + 드라이버.
**✅ 사용자 결정 2건 — 둘 다 승인·ADR·구현·검증 완료(2026-06-24)**:
- **① ADR-019 슬래시 동적 캡처 ✅**(커밋 `c1a7eaa` ADR·`214116b` 구현): SDK `supportedCommands()` 하이브리드(큐레이션 폴백 + run 캡처·워크스페이스별 캐시 + 머지·dedup, Composer run후 캐시무효화). **라이브: 실 run 후 팔레트 8→33개**(config·context·loop·schedule·usage 등 24개 캡처). reviewer 🔴0.
- **② ADR-020 대화별 cwd 앵커링 ✅**(커밋 `c1a7eaa`/`00c533a` ADR·`bc7211f` 구현): ConversationRecord.cwd + DB 마이그레이션 v3 + saveConversation 기록 + selectConversation 복원(workspace.open 재검증 재사용·graceful). plan-auditor 경로주입 신뢰경계 보완. **라이브: 실 run 후 대화 cwd=워크스페이스 기록**. reviewer 🔴0. (folder-switch 확인 UX는 MVP 축소로 후속.)
**저우선 🟡 이월**(비차단): 미오픈 cwd 경고, F2/F1 단일출처화, 캡처 name cap·meetingnote command/skill 중복 dedup, save 시 isAbsolute 게이트, 파일기반 마이그레이션 골든, folder-switch 확인 UX.
→ 위 항목 종결. 단위 2626 green·실 Electron e2e 6/6 PASS. 전부 로컬 master(push 0).

## 🆕 대화 렌더링 = Claude Code 원본 스타일 전환 (사용자 추가 요청, 2026-06-24)
사용자 요청 2건: ① **턴별 인터리브**(도구/진행이 "클로드 메시지별 분리" — 현재 [통합텍스트][평평한 툴목록]). ② **도구 세부 diff**(Read/Edit 수행 시 수정내용 표시, CLI 스타일). Opus 편향차단 평가: 방향(원본 ThreadItem 모델 전환) 옳으나 **순서 뒤집어 B(diff) 먼저**(저위험·flat 유지)→A(인터리브, 코어 리팩터·멀티패널·28테스트).

**✅ Phase B (도구 diff) 완료** (커밋 `df6ded7`): DiffLine→`diff-types.ts` 추출(순환 import 회피). `AgentEventFileChanged`+add/del/diff/**toolId**. ClaudeAgentRun이 baseline(tool_call)→after(tool_result 성공)→`computeDiff`(fs/diff.ts)로 whole-file diff 계산·emit(바이너리8KB/대형512KB 가드). reducer `fileDiffs`를 **toolId 키**로 저장(path는 워크스페이스 상대라 절대경로 도구입력과 키 불일치 → toolId 매칭). ToolCallCard에 `+N −M` 헤더+DiffViewer 펼침. reviewer 🔴0. **라이브: 실 run 편집카드 2개에 diff 요약(+4) 실측.** 🟡 후속: baseline size/binary 가드, diff 페이로드 라인 cap.

### 🔜 Phase A (턴별 인터리브) — 사용자 "1번 전체 진행" 결정, /compact 후 착수
**규모: 복잡~대규모**(코어 reducer 모델 + 멀티패널 + 28테스트 + 백엔드 messageId). plan-auditor 선행 필수.
**Opus 평가 핵심(원본 `C:/Dev/AgentCodeGUI/src/renderer/src/store/session.ts`·`Chat.tsx`·`App.tsx` 미러)**:
- **숨은 선행조건**: 현 `AgentEventText`는 `delta`만(messageId 없음, `agent-events.ts:29`) → 텍스트 블록 경계 못 나눔 → ThreadItem 도입해도 "1거대텍스트+1거대툴그룹"이 됨. **backend가 텍스트 블록 경계(messageId)를 emit해야 진짜 인터리브**(원본 `engine.ts:471` assistant-done messageId 미러). = backend-contract 변경.
- **모델 전환**: `AppState.messages`(텍스트만)+`streamingText`(1개)+`toolCards`(flat)를 **`ThreadItem[]` 단일 스트림**(`msg|thinking|toolgroup|notice`)으로. `openGroupId`로 턴 경계(텍스트 오면 새 그룹, 원본 `session.ts:230,266`). `lead`(턴 여는 toolgroup이 아바타, `App.tsx:988`).
- **멀티패널 동반 필수**: `panelSession.ts`가 `applyAgentEvent`/`makeInitialState` 재사용 → reducer 코어 변경 시 **같은 커밋에서 panelSession도** 안 바꾸면 멀티 6패널 컴파일 깨짐.
- **streamingText 확정 책임 3곳**(`appStore.ts:718` commit·`panelSession.ts:93`·reducer done) 재설계. `SmoothMarkdown` 자동스크롤(`Conversation.tsx:403`)이 streamingText 의존 → ThreadItem 마지막 라이브 항목으로 재배선.
**도메인 분담**: shared-ipc(AgentEventText+블록id) → agent-backend(블록 경계 emit) → renderer(reducer ThreadItem+openGroupId+lead, panelSession 동반, Conversation 렌더루프) → qa(28테스트 마이그레이션). reviewer+plan-auditor 필수.
**재사용 자산**: `DiffViewer`·`toolKind`·`ThinkingItem`·Phase B의 fileDiffs(toolId 키 그대로 toolgroup에서 승계). ToolCallCard→ToolGroup 컴포넌트화.
**ADR 불요**(원본 충실도 복원, ADR-014/UI_FIDELITY 이행). 단 AgentEvent 계약변경은 문서 흔적+reviewer.
**리스크**: messageId 선행조건·panelSession 동반·diff누적 카운트(Write교체/Edit누적)·done처리 3곳·스크롤 의존·IPC페이로드.
→ **compact 후 재개 1번째 스텝 = plan-auditor로 Phase A 설계 검증**(특히 messageId 선행조건·panelSession 동반·done 3곳 재설계), 그다음 shared-ipc(AgentEventText 블록경계)부터.
