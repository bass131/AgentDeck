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

→ 다음: Opus 서브에이전트 편향차단 평가(F1/F2 우선순위·접근) 후 fix.
