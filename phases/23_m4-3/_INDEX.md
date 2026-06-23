# Phase 23 — M4-3: 멀티 에이전트 동시 실행 + 세션 CRUD

> M4-2(대화 고도화) 완료 후, **여러 에이전트 동시 실행(B3)** + **세션 CRUD(rename/delete/new/select)**를 실 데이터/실행에 배선. 원본 AgentCodeGUI 미러.
> **핵심 발견(Explore 2026-06-23)**:
> - **멀티 = 원본은 패널별 독립 `useAgentSession(chan(sessionId,slot))`** (`MultiAgent.tsx`), 식별자 `panelId="${sessionId}::${slot}"`, 패널별 `multi.run`/`onEvent`. **우리는 백엔드가 이미 동시 run 지원**(`AGENT_RUN`→runId, `AGENT_EVENT={runId,event}`, `createRunManager`가 runId로 동시 추적) → **멀티용 신규 IPC 불요**. renderer에 패널별 run 상태 + runId 라우팅만 추가.
> - **세션 CRUD = 원본 Sidebar.RecentChats**(rename 인라인/delete 확인/new/select) + `chatsGet/Save`. **우리는 sqlite `conversation.load`(목록)/`save`(upsert) 존재** → `delete`/`rename` 추가 + 사이드바 실데이터 배선.
> - **현 상태**: `Sidebar.tsx`·`MultiWorkspace.tsx` 모두 **정적 샘플 + 로컬 state**(SAMPLE_SESSIONS/SAMPLE_PANELS, onSend/new/delete=no-op 또는 로컬). M4-3 = 실 persistence·실 실행 연결.

## 근거 (원본 매핑 — Explore, file:line)
- **멀티 동시실행**: `MultiAgent.tsx:147` `chan(sessionId,slot)="${id}::${slot}"` · `:924-929` 6 독립 `useAgentSession` · `:1117-1189` `sendPanel`→`MultiRunRequest{panelId,...}`→`multi.run` · 패널별 `subFor(chan)` 이벤트 구독 → 패널 reducer. **동시성=패널별 독립 엔진+채널 라우팅, 패널 간 lock 없음.**
- **세션 CRUD(단일)**: `Sidebar.tsx`(원본) RecentChats rename/delete/new/select · `App.tsx:242-292` chats 로드/저장(`chatsGet/Save`) · `chats.ts` per-file 저장 · 이름 자동생성=첫 메시지 `slice(0,80)`, 빈 제목 fallback. 우리는 sqlite 단일 store 사용(per-file 미러 불요 — ADR-006).

## 설계 결정
0. **🔴 동시실행 토대 — runId 라우팅 정확성(plan-auditor 차단 게이트)**: 현 `ipc/index.ts:218-231`은 `runIdBox` 늦은 바인딩으로 이벤트에 runId를 태깅 — `start()`가 박스에 쓰기 *전* 첫 콜백이 발화하면 `runId:''`로 push되는 레이스(단일 모드에선 reducer가 runId 무시라 무해했음). 멀티는 runId 라우팅이 메커니즘 자체이므로 **반드시 선수정**: `agent-runs.ts`의 `onEvent` 시그니처를 주석에 명시된 원의도 `(event, runId) => void`로 복원(runId는 `start()`가 소비 *전* 동기 발급 — line 83). IPC 핸들러는 `(event, runId) => send({runId, event})`로 박스 제거. **EchoBackend 2-동시-run 통합 테스트로 `AGENT_EVENT.runId ↔ agentRun 반환 runId 1:1` green 증명** = 멀티 착수 차단 게이트.
1. **멀티용 신규 IPC 0**: 패널별 실행은 기존 `agentRun`(runId 반환) 재사용. 각 패널이 자신의 runId로 `onAgentEvent` 필터링(원본 `subFor(channel)` 등가). 백엔드/run-manager는 runId별 격리 확인됨(activeRuns Map·독립 AbortController) — 결함은 IPC 어댑터 한 곳(결정0)뿐. → **멀티는 renderer 전용 + 결정0 1줄 토대**.
2. **패널 상태 = 컴포넌트-로컬 훅**(원본 미러): 신규 `usePanelSession()` 훅이 한 패널의 live run(messages/streaming/toolCards/isRunning/runId/usage)을 reducer로 관리 + onAgentEvent(자기 runId) 구독 + send/abort 노출. **전역 appStore 단일-run 필드는 불변**(단일 모드 전용). 멀티는 패널 훅 N개.
3. **세션 CRUD = sqlite store 확장**: `ConversationStore += delete(id)`·`rename(id,title)`. 신규 IPC `CONVERSATION_DELETE`·`CONVERSATION_RENAME`(additive). 사이드바는 store 액션 경유(window.api 직접 0). 활성 세션=store `conversationId`와 동기. **select(id)→해당 대화 로드(🟡-2)**: 현 `loadConversation`은 마운트 시 `limit:1` 자동로드뿐 → **id 지정 로드 액션 `selectConversation(id)` 신규**(마운트 자동로드 흐름 무파손, 별도 액션).
4. **세션 자동 제목 vs rename(🟡-3 함정)**: 첫 user 메시지 `slice(0,40)` 자동 제목 · 빈/없음 fallback '새 대화'. **현 `saveConversation`은 매 저장 `title=messages[0].slice(0,40)` 무조건 재계산 → rename을 덮어씀.** 수정: `rename(id,title)`이 설정한 사용자 지정 title을 이후 자동저장이 덮지 않도록 보존(store에 `customTitle` 플래그 또는 save가 기존 title 유지 옵션). ②"자동 재제목이 덮어쓰지 않음" 단위로 매핑.
5. **패널 cwd(🟡-4)**: MVP=각 패널 기본 현재 워크스페이스 루트. **워크스페이스 미오픈 시 패널 send 비활성**(또는 워크스페이스 오픈 전제) — `process.cwd()` 폴백(앱 설치 디렉토리 실행) 방지. 패널별 폴더 전환 다이얼로그 실동작은 범위 외(시각 유지).
6. **전역 구독 게이팅(🟡-1)**: 전역 `subscribeAgentEvents`는 runId 무관 모든 이벤트를 단일-run thread에 누적 — 멀티 패널 이벤트의 단일 thread 오염 위험. **멀티 패널 훅은 자기 runId만 수용**(필터), 전역 구독도 자신이 발급한 단일-모드 runId만 수용하도록 게이팅. 23e AC.
9. **신뢰경계**: persistence(delete/rename)는 main 단독·sqlite. renderer untrusted → IPC `id`/`title` 타입·존재 검증. API 키 0.

## 추가/변경 계약 (shared) — additive
- `src/shared/ipc-contract.ts`: `CONVERSATION_DELETE`·`CONVERSATION_RENAME` 채널 + req/res 타입. 기존 `CONVERSATION_LOAD/SAVE` 불변.
- `AGENT_RUN`/`AGENT_EVENT`/`AgentRunInput` **불변**(멀티는 기존 계약 재사용).

## 서브웨이브 (의존성 순서 — plan-auditor 권고: 23a 공통 선행 → {23b·23c·23d 병렬가능} → 23e)
- **23a (🔴 동시실행 토대 — 차단 게이트)** — main-process: `agent-runs.ts` `onEvent` 시그니처 `(event, runId)=>void` 복원(runId는 소비 전 동기 발급) + `ipc/index.ts` runIdBox 제거. **EchoBackend 2-동시-run 통합 테스트**(`AGENTDECK_E2E=1`)로 `AGENT_EVENT.runId ↔ agentRun 반환 runId 1:1` green 증명. **이 게이트 green 전 멀티(23d/23e) 착수 금지.** qa: 동시 run runId 격리 단위/통합.
- **23b (세션 CRUD persistence+IPC)** — shared(`CONVERSATION_DELETE`/`RENAME`) → main-process(`ConversationStore.delete/rename` + save가 rename title 보존 + 핸들러 신뢰경계 검증) → store 액션(`listConversations`/`selectConversation(id)`/`renameConversation`/`deleteConversation`/`newConversation`). qa: store delete/rename/title 보존 단위 + 핸들러 입력검증.
- **23c (사이드바 실데이터)** — renderer: Sidebar 샘플→실 conversation 목록(store 셀렉터) + select(id)→대화 로드/rename/delete/new를 store 액션 배선 + 활성=conversationId 동기 + 마운트 시 목록 로드. *(23b 의존.)* qa: 사이드바 CRUD 통합.
- **23d (멀티 패널 세션 훅)** — renderer hook: `usePanelSession()` 신규(패널 1개 live run reducer + onAgentEvent **자기 runId 필터** + send/abort). 기존 reducer 재사용분 추출. *(23a 의존.)* qa: 훅 reducer 단위(이벤트→상태, runId 필터, 타 runId 무시, done 확정).
- **23e (멀티 동시실행 배선)** — renderer: MultiWorkspace 샘플→패널별 `usePanelSession` + PanelComposer 실 onSend(패널 cwd/picker→agentRun, 워크스페이스 미오픈 시 비활성) + 패널 thread 렌더 + 패널 abort + **전역 구독 게이팅**(단일 thread 오염 차단). **동시 실행 증명**(2+ 패널). *(23d 의존.)* qa: 멀티 패널 송신→agentRun 패널별 호출·이벤트 라우팅·미오염 통합.

## 검증 / 완료조건 (측정가능)
- 각 서브웨이브 = Worker TDD(실패 먼저) → reviewer(**신뢰경계 CRITICAL**: persistence main 단독·IPC 입력검증·renderer untrusted·window.api는 store만·API 키 0) → typecheck 양쪽 + 단위 green → conventional commit.
- ⓪ **(차단 게이트, 23a)** EchoBackend 2-동시-run → 각 `agentRun` 반환 runId와 AGENT_EVENT.runId 1:1 일치(첫 이벤트 포함 `runId:''` 0). ① 세션 삭제 — `delete(id)` 후 목록 제거 + 활성 삭제 시 다른 세션/빈상태 전환. ② 세션 rename — title 갱신 영속 + 자동 재제목이 덮어쓰지 않음(store/저장 단위). ③ 사이드바 — 실 목록 표시(샘플 0) + select→thread 로드 + new→빈 대화. ④ 멀티 — 패널 send→그 패널 runId로 agentRun + 이벤트가 **그 패널에만** 라우팅(타 패널 미오염, ⓪ 토대 위) + 2패널 동시 run. ⑤ 패널 abort→해당 패널만 중단. ⑥ delete/rename이 잘못된 id에 안전(신뢰경계 단위). ⑦ 기존 단위 전부 green + 신규 green. ⑧ **라이브 검증**(LIVE_SDK=1 e2e 또는 dev): 멀티 2패널에 서로 다른 프롬프트 동시 전송 → 각 패널 **독립** 실 응답(교차 오염 0); 세션 삭제/이름변경 영속.
- **범위 외(후속/M4-3b·M4-4)**: 멀티 세션 영속(maGet/maSave 등가)·패널별 큐/폴더전환 실동작/sysPrompt 실저장·멀티 모드 사이드바 세션 목록·서브에이전트 검사 카드(B4)·권한/질문 응답(M4-4)·입력 히스토리 ↑↓(B9).
