# WEAKNESS_BOOST — 원본 대비 "더 부족한 부분" 전면 보강 드라이버

> **compact 생존 드라이버.** 사용자 지시(2026-06-24): 완성도 관측 Workflow가 도출한 "AgentCodeGUI 대비 우리가 부족한 7약점"을 **부족한 것부터 전부 보강 + 스모크 + 실 런타임 조작 테스트, 중간에 멈추지 말고 완료까지 자율**. 컨텍스트 압축돼도 이 문서에서 이어간다. push 0(인간 게이트). 막힘=[[loop-stuck-policy]].

## 확정 결정 (사용자, 이번 세션)
- **멀티 세션 영속 = JSON blob**(원본 maStore.ts 1:1). [근거: 원본·Claude Code 둘 다 DB 없이 파일 기반(원본 maStore.ts JSON blob·chats.ts fan-out / Claude Code per-session JSONL). 우리만 sqlite(ADR-006) 분기.]
- **단일 대화도 JSON fan-out 통일, sqlite 완전 제거**(ADR-006 supersede). [sqlite가 이 규모엔 과했고 ABI 마찰만 유발. 원본 chats.ts 미러.]
- 나머지 6약점 = 원본 충실도 복원(ADR 불요, backend-contract/IPC 깃발+reviewer).

## 실행 방법론 (compact 생존 핵심)
**각 마일스톤마다**: ① `phases/NN_<name>/_INDEX.md` 정의서 **먼저 작성**(범위·도메인 R/W·의존성·측정가능 AC·검증) → ② **plan-auditor 검증**(Tier 2-B, 구현 *전* 설계 결함 차단) → ③ 도메인 Worker **TDD**(실패 테스트 먼저, tdd-guard) → ④ **reviewer**(CRITICAL 0) → ⑤ conventional commit(master) → ⑥ **이 드라이버 진행 트래커 갱신**.
- phase 문서는 디스크 durable → compact로 컨텍스트 날아가도 정의서+이 드라이버에서 이어감.
- phase 문서는 **just-in-time**(마일스톤 직전 작성, 이전 학습 반영). 전부 선작성 X.

## 검증 3층 (전 마일스톤·사용자 요구)
① **단위 TDD**(실패 먼저) ② **스모크**(vite-node 실 ClaudeCodeBackend 직접 — 결합부 정밀 타격: M2 sysPrompt→관찰가능 행동변화["프랑스어로만"→프랑스어]·M4 onUserDialog→notice emit·M5 토큰 수신) ③ **실 런타임 e2e**(`LIVE_SDK=1 node scripts/run-e2e.cjs <file>` 또는 스텁 e2e, Playwright `_electron` DOM/조작 실측). 기존 하네스 확장: `tests/e2e/{a3-interleave,live-sdk,live-test-project,visual-viewer}.e2e.ts` + 신규(멀티 reload·explorer 대형트리).

## 불변 제약 (전 마일스톤)
- **신뢰경계**: fs/child_process/DB/network=main 단독. renderer untrusted, window.api 화이트리스트. 신규 IPC=shared 단일정의.
- **엔진 추상화(ADR-003)**: UI/IPC/reducer 구체엔진 무지. 엔진 고유처리=ClaudeCodeBackend 내부.
- **교차 동반 불변식**: `panelSession.ts`가 reducer `applyAgentEvent`/`makeInitialState`/`ThreadItem` 재사용 → reducer·shared·threadTypes 변경 시 **같은 커밋에서 panelSession + MultiWorkspace 동반**(Phase A 차단결함 선례).
- **messageId 소스=펌프 카운터(B)** 불변(`message.id` 미사용) — Phase A 인터리브 전제 보존.

## 마일스톤 (실행 순서) — 진행 트래커
| | 마일스톤 | 도메인 | 상태 |
|---|---|---|---|
| **M1** | 영속 JSON 통일 (chats sqlite→fan-out, sqlite 제거) | main-process+shared+qa | ✅ (Phase 29·c2b1d05) |
| **M2** | systemPrompt 동적 주입 (W2α) | shared-ipc+agent-backend+renderer | ⬜ |
| **M3** | 멀티 세션 영속 (W2β, JSON blob) | shared+main+renderer | ⬜ |
| **M4** | model-fallback notice (W4) | shared+agent-backend+renderer | ⬜ |
| **M5** | 진짜 토큰 스트리밍 (W1) — 최고리스크 | agent-backend+renderer | ⬜ |
| **M6** | cmdresult 슬래시 진행카드 (W3) | agent-backend+renderer | ⬜ |
| **M7** | 탐색기 스케일링 (W5) | shared+main+renderer | ⬜ |
| **M8** | 코드뷰어 호버카드+검색+선택질문 + bash/time/Typewriter + --gold (W6+W7+W8) | renderer+theme | ⬜ |

### M1 — 영속 JSON 통일 (sqlite 제거) 〔토대〕 ✅ 완료 (Phase 29, c2b1d05)
- `persistence/store.ts` → JSON fan-out 재작성(원본 chats.ts 미러: `userData/chats/<id>.json`+`index.json`, 변경파일만 재기록, safeId path-traversal 가드). **custom_title·cwd 보존**. `ConversationRecord`/`ConversationStore` 계약 불변 → IPC/renderer 무변경.
- better-sqlite3·@types/better-sqlite3·@electron/rebuild 제거 + rebuild 훅(predev/prestart/pretest)·run-e2e.cjs 듀얼 ABI 댄스 제거(네이티브 의존 0).
- **결과**: store.test 56/56 green · grep better-sqlite3(src/scripts/tests)=0 · typecheck 양쪽 green · build 3타깃 green · reviewer CRITICAL 0(머지가능). plan-auditor 차단 2건(B1 정렬동형성·B2 결합처) 정의서 선반영.
- **잔여(사용자 게이트)**: ⚠️ `docs/ADR.md`(ADR-006 supersede 노트)·`CLAUDE.md`(L19/L22 스택)·`.claude/agents/main-process.md`는 권한 deny → **사용자가 직접 적용**(제안 diff는 세션 보고). 마이그레이션 store.db→JSON은 배포 사용자 0이라 생략(필요시 스크래치 임시 스크립트).
- **기존 회귀(M1 무관·범위밖)**: `m4-4-permission/question-conversation` "thinkingText 동시" 2건 — Phase A-3 WorkingIndicator 게이트 변경 vs 구behavior 단정 테스트(stale). 후속 정리 대상.

### M2 — systemPrompt 동적 주입 (W2α) 〔멀티 선행〕
- shared: `AgentRunRequest/Input += systemPrompt?`·`SendOptions += sysPrompt?`. agent-backend: custom 있으면 `systemPrompt:{type:'preset',preset:'claude_code',append:<custom>}`(없으면 기존). 신뢰경계: 모델컨텍스트만·cap·로그미노출. renderer: panelSession.send 전파.
- AC: SDK options 반영 단위 · IPC payload · **스모크**(sysPrompt 관찰가능 행동변화 증명).

### M3 — 멀티 세션 영속 (W2β, JSON blob) 〔most-lacking〕
- shared: `MULTI_SESSION_SAVE/LOAD` IPC+`PersistedMultiState`(version/activeSessionId/sessions[panels{title,cwd,picker,sysPrompt,snapshot}]). main: `multiStore.ts`(maStore.ts 미러, `userData/multi-agent.json`). **load 패널 cwd resolveSafe 재검증**(ADR-020). renderer: MultiWorkspace 복원+디바운스 저장, 패널 메타 실데이터화. **ADR-021 신설**.
- AC: round-trip · **재시작 복원 e2e** · roots 밖 cwd 거부 · sysPrompt 실행 반영.

### M4 — model-fallback notice (W4) 〔죽은경로 부활·스트림 토대〕
- shared: model-fallback/notice 이벤트(retractMessageId?). agent-backend: `supportedDialogKinds:['refusal_fallback_prompt']`+`onUserDialog`(engine.ts:329-354 미러)+`system/model_refusal_fallback`+`_pendingFallbackNotices` 중복제거+`fallbackNotice()`. 신뢰경계: 모델명/카테고리만. renderer: reducer notice push+retract. (NoticeItem 렌더 완비.)
- AC: reducer notice+retract 단위 · **스모크**(onUserDialog→notice 1회·중복억제) · NoticeItem DOM.

### M5 — 진짜 토큰 스트리밍 (W1) 〔최고리스크·격리〕
- agent-backend: `includePartialMessages:true`. mapClaudeStreamLine `stream_event`→`text{delta}`(순수 유지). 펌프 `_streamedThisMsg` 추가 — delta는 `_curTextId` messageId로, **최종 full 블록은 streamedThisMsg면 suppress**(engine.ts:459 미러), 메시지경계 리셋. renderer: reducer `text` append-only 무변경.
- AC: 펌프 단위(delta N+full→1버블 중복0) · **인터리브 회귀가드**(`delta→tool_call→delta`→`[msg,toolgroup,msg]`, Phase A AC① 재실행) · **라이브 e2e**(토큰 단조증가+인터리브).
- 롤백 안전선: `includePartialMessages:false` 1줄 복귀→즉시 Phase A.

### M6 — cmdresult 슬래시 진행카드 (W3)
- agent-backend: done 이벤트에 `contextTokens` 추가(/compact 통계용). renderer: threadTypes `cmdresult`(+`time`) 복원·CMD_CARDS/commandOf 이식·reducer begin(슬래시→running카드)+done in-place+/compact 통계(session.ts:374-433)·슬래시 인터셉트(Conversation dispatchSend 확장). panelSession 동반.
- AC: begin→done in-place 단위 · /compact 절감통계 · 라이브 e2e(/compact 진행카드→완료 DOM).

### M7 — 탐색기 스케일링 (W5)
- shared: `FS_LIST_DIR(relDir)→entries[]`(lazy). main: workspace.ts buildTree 루트 1레벨+SKIP_DIRS/KEEP_DOT_DIRS(listProjectFiles 상수 단일출처화)+listDir(resolveSafe)+깊이/MAX 캡. renderer: FileExplorer lazy 펼침+변경점 조상 폴더 롤업(Explorer.tsx:87-102)+refreshKey 지정폴더.
- AC: listDir resolveSafe 밖 거부·1레벨 단위 · **node_modules repo 즉시로드(폭발0)** e2e · lazy+조상 dot 롤업 e2e.

### M8 — 코드뷰어 호버/검색/선택질문 + 폴리시 (W6+W7+W8)
- renderer(W6): 원본 FileModal `parseHover`/`HoverContent`(createRoot 구조화카드, M2-LSP hover 연계)/`FindBar`(CSS Custom Highlight)/`SelectionAskBar`(줄범위 lineOf) CodeViewer 이식. renderer(W7): BashOutput 이식(고스트·자동펼침·error틴트·복사)·ThreadItem `time`+`nowTime()` reducer/**panelReducer 동반**·Typewriter·MessageBubble/ToolGroup time 렌더. theme(W8): `tokens.css --gold: oklch(0.67 0.15 68)`/다크 `oklch(0.81 0.12 75)`.
- AC: parseHover/Highlight 매치수/줄범위 단위 · hover카드/검색/선택질문/bash카드/Fable도트/time DOM e2e · panelReducer time 회귀가드.

## 리스크·롤백
- **M5 인터리브 회귀(최우선)**: partial streaming이 Phase A 전제 역전→full 중복/델타 경계병합. 완화: `_streamedThisMsg` suppress 펌프 선검증 / messageId=펌프카운터 불변 / M4 선배치(stream_event 선검증) / 토큰단조+인터리브 동시단정. 롤백=1줄.
- **M1 영속 회귀**: chats sqlite→JSON이 CRUD/cwd/custom_title 깨면. 완화: 원본 chats.ts 정밀미러+마이그레이션 round-trip+기존 e2e 재실행.
- **M2/M3 신뢰경계**: load cwd 임의경로·systemPrompt 무검증. 완화: resolveSafe 재검증+systemPrompt cap·로그미노출+reviewer.
- **M7 IPC 4면**: shared 단일정의+typecheck 양쪽 / buildTree 축소가 FileExplorer 전체트리 가정 깨면 lazy 미들스텝.

## ADR (사용자 단독통제 — 이 세션 결정)
- **ADR-006 supersede**(sqlite→JSON 통일, M1) · **ADR-021 신설**(멀티 JSON blob, M3). 사용자가 이 세션 명시결정 → 실행 중 ADR.md 기록. M2/M4/M5/M7=backend-contract/IPC 깃발(ADR 불요·문서흔적+reviewer).

## Critical 파일
- `src/main/persistence/store.ts`(M1) + `src/main/multiStore.ts`(M3 신규)
- `src/main/agents/ClaudeCodeBackend.ts`(M2 sysPrompt·M4 onUserDialog·M5 streamedThisMsg·M6 contextTokens — 코어) + `claude-stream.ts`(M4/M5 순수매퍼)
- `src/renderer/src/store/reducer.ts`(M4·M5·M6·W7 — 순수, panel 공유) + `panelSession.ts`+`MultiWorkspace.tsx`(M2/M3·교차)
- `src/main/fs/workspace.ts`+`src/shared/ipc-contract.ts`(M7·IPC 단일·M2·M3)
- `src/renderer/src/components/CodeViewer.tsx`(M8) + `theme/tokens.css`(W8)
