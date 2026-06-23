# Phase 24 — M4-4: 권한/질문 응답 + thinking/subagent/todo 이벤트

> Track 1 완전복제의 **대화 고도화 마지막 조각**. AgentEvent를 6종 → 11종으로 확장하고,
> 에이전트↔사용자 **양방향**(권한·질문) 흐름을 실배선한다.
> 드라이버: `docs/REPLICA_GAP.md` · FEATURE_MAP B4 + (M4-4 잔여).

## 결론 먼저 (핵심 발견)

1. **시각 셸은 이미 전부 존재**(F12/F14/F10 산출물) → M4-4 = **"시각 셸 → 실배선"**, 신규 구축 아님.
   - `PermissionModal.tsx` — props `{open, toolName?, summary?, onRespond:(choice)=>void}`, choice ∈ `allow|allow_always|deny`. 키 1·2·3·Esc 완비.
   - `QuestionModal.tsx` — props `{open, questions:AgentQuestion[], onAnswer:(string[][])=>void, onDismiss}`. 다단계·직접입력·최소화 완비. (`AgentQuestion` = `../lib/f14SampleData`)
   - `SubAgentModal.tsx` — props `{agent:SubAgentInfo|null, onClose}`. (`SubAgentInfo` = `../lib/agentSampleData`: `{id,name,role,status,activity?,tools[]}`)
   - `AgentPanel.tsx` — Todos·SubAgent 리스트가 샘플데이터로 이미 렌더 중(배선만 교체).

2. **현재 코드 상태**:
   - `agent-events.ts`: 6종(text/tool_call/tool_result/file_changed/done/error) → **5종 신규 필요**.
   - `claude-stream.ts` `mapClaudeStreamLine`: **순수 per-message 함수**(상태 없음). assistant/user/result/system 매핑, `stream_event` 무시.
   - `ClaudeCodeBackend.ts:173` `canUseTool`: 자동허용 `{behavior:'allow'}` (TODO(M4-4) 마커). `includePartialMessages:false`(L186).
   - `run-args.ts`: `mode` → `permissionMode`(default/plan/acceptEdits/bypassPermissions) 매핑 이미 존재.

3. **차단 게이트 (Wave B 데드락)**: `ClaudeAgentRun.events`는 **pull 제너레이터**, `agent-runs.ts`가 `for await`로 당김. SDK `canUseTool`이 렌더러 응답을 await하면 `for await (msg of queryIterable)`가 suspend → 그 사이 `permission_request`를 **yield 불가 = 데드락**. → **Wave B는 push-queue(채널) 리팩터 + `AgentRun.respond()` 신설 필수**. (실 SDK 스파이크 `artifacts/permission-canusetool-spike.mjs`로 토대 선검증.)

## 비범위 (이번 Phase 제외)

- **멀티 패널(MultiWorkspace) 권한/질문**: 원본 `ma:permission-respond` 류는 M4-5/후속. 이번엔 **단일 대화(Conversation)** 경로만. (단, `respond()`는 runId 기반이라 멀티 확장 자연스럽게 열어둠.)
- **TaskCreate/TaskUpdate/TaskList 누적 todo**: 이번엔 **TodoWrite 전체리스트**(단일 메시지, 무상태)만. 누적 taskMap은 후속(주석으로 갭 명시).
- **thinking 실시간 부분 스트리밍**(`includePartialMessages:true` + `thinking_delta`): 이번엔 assistant **thinking 블록**(완성 단위)만. 실시간 토큰 스트리밍은 후속 정제.
- 헌법/ADR/policies 변경 없음. 신규 의존성 0.

## 서브웨이브 (위험·의존 순)

### 24-pre · SDK canUseTool 스파이크 (차단 게이트) — main 직접
- `artifacts/permission-canusetool-spike.mjs` 실 SDK 실행.
- **검증**: Q1 SDK가 canUseTool Promise를 await로 일시정지하는가 / Q2 deny가 도구를 차단하는가.
- **✅ 스파이크 PASS (검증 완료, 3회 반복 끝에 토대 확정)** — 확정된 사실:
  1. **SDK가 canUseTool Promise를 await로 일시정지한다** — 콜백 1.5s 지연이 tool_result까지 1545ms로 전파됨. → **push-queue + waiter(Promise) 패턴 성립**(Wave B 데드락 해법의 토대 검증).
  2. **canUseTool은 *부수효과 도구*(Write/Edit/비안전 Bash)에서만 발화** — `echo`/`ls`/`cat` 등 안전 bash는 Claude Code 내장 분류기가 canUseTool **전에** 자동승인(프롬프트 0). 권한 프롬프트는 자연히 "위험" 작업에만 뜸(원본 동작 일치).
  3. **canUseTool 발화 전제 = 인라인 `settings: { permissions: { defaultMode: <permissionMode> } }` 필수** — 없으면 사용자 전역 `~/.claude/settings.json`의 allow 규칙/defaultMode(auto/bypass)가 canUseTool 전에 선승인. (원본 `engine.ts:291` 주석 일치.)
  4. **deny → 도구 차단 + 에이전트가 거부 인지**(파일 미생성, "denied" 응답).
- **프로덕션 구성 결정**: ClaudeCodeBackend sdkOptions에 `settings: { permissions: { defaultMode: <permissionMode 매핑값> } }` + `settingSources: ['user','project','local']`(사용자 allow 규칙 존중, 나머지는 canUseTool 프롬프트). **라이브 스모크만** `settingSources: []`로 격리(결정론적 프롬프트 유도).
- **→ 24c/24d 진행 승인.** 24a/24b는 이 게이트와 독립(단방향이라 push-queue 불요).

### 24a · thinking + todo 이벤트 (단방향·저위험·무상태)
- **shared**(`shared-ipc`): `AgentEventThinking {type:'thinking', text}` · `AgentEventThinkingClear {type:'thinking_clear'}` · `AgentEventTodos {type:'todos', todos:{id,label,status}[]}` union 추가.
- **agent-backend**: `mapClaudeStreamLine` — assistant content의 `{type:'thinking', thinking}` 블록 → thinking 이벤트(1줄 요약 cap). `tool_use` 중 `name==='TodoWrite'` → `input.todos` 정규화 → todos 이벤트. (무상태 유지: 단일 메시지에서 완결.)
- **renderer**: 대화 스레드에 thinking 아이템 렌더(WorkingIndicator/ThinkingItem 배선) · AgentPanel Todos를 실 todos 이벤트로 교체(샘플 제거). store에 `thinkingText`·`todos` 필드.
- **qa**: claude-stream 골든(thinking/TodoWrite 입력→이벤트), store reducer, 렌더 스냅샷.

### 24b · subagent 이벤트 + B4 카드 (단방향·중위험·약상태)
- **shared**: `AgentEventSubagent {type:'subagent', id, name, role, status:'queued'|'running'|'done', activity?, tools[]}`. tool_call에 `parentToolId?` 옵션 필드 추가(자식 도구 귀속).
- **agent-backend**: `Task`/`Agent` tool_use → subagent(running) · 매칭 tool_result → subagent(done, activity=결과). 자식 tool_use의 `parent_tool_use_id` → tool_call.parentToolId. (상태 최소화: 가능하면 renderer store에서 id 매칭으로 누적, claude-stream은 per-message 유지. 불가 시 `createStreamMapper()` 무상태→유상태 래퍼 도입하되 순수 코어 함수 보존.)
- **renderer**: AgentPanel subagent 리스트 + SubAgentModal을 실 이벤트로 배선(샘플 제거). store `subagents` 누적.
- **qa**: Task 분류·parentToolId 귀속·done 전이 골든 + 카드 렌더.

### 24c · 권한 응답 (양방향·고위험·backend-contract 변경) — 24-pre PASS 후
- **agent-backend(핵심 리팩터)**: `ClaudeAgentRun`을 **push-queue 모델**로 재구성.
  - SDK 소비 펌프(detached) + canUseTool 콜백 **둘 다** 내부 큐에 push, 공개 `events` 제너레이터는 큐 drain. (단일 정렬 이벤트 경로 보존.)
  - `canUseTool`: `permission_request` push → `waiters.set(requestId, resolver)` → Promise await → resolver가 준 결정 반환. `permissionMode`(acceptEdits 등) 분기는 run-args 매핑 존중.
  - **외부 계약 불변**: `events`/`abort()` 동작·정렬·done/error 보장 동일(전 기존 테스트 green 필수).
- **AgentBackend.ts(backend-contract 깃발)**: `AgentRun`에 `respond(requestId, response)` 추가. EchoBackend/CodexBackend no-op 구현.
- **shared**: `AgentEventPermissionRequest {type:'permission_request', requestId, toolName, summary}` · IPC `PERMISSION_RESPOND('agent.permissionRespond')` 채널 + `PermissionResponse {runId, requestId, behavior}` 타입. preload 화이트리스트 노출.
- **main(ipc)**: `agent-runs.ts` RunManager에 `respond(runId, requestId, response)` → `run.respond(...)`. `ipc/index.ts` PERMISSION_RESPOND 핸들러(입력검증, runId/requestId 매칭, 미존재 시 no-op).
- **renderer**: Conversation이 `permission_request` 이벤트 → `PermissionModal` open(state). onRespond → `permissionRespond(runId, requestId, choice)`. choice→behavior 매핑(allow/allow_always→allow, deny→deny).
- **qa**: push-queue 정렬·abort·done 불변 회귀 + permission round-trip(요청 emit→respond→resolver 호출) + 모달 배선.
- **라이브**: 스파이크를 확장해 "권한 콜백 자동응답" 스모크(스크립트가 permission_request 수신→allow/deny 자동 회신→도구 실행/차단 확인).

### 24d · 질문 응답 (양방향·24c 인프라 재사용)
- **agent-backend**: canUseTool에서 `AskUserQuestion` 도구 → `handleAskQuestion`: `question_request` push → waiter await → 사용자 답을 `{behavior:'deny', message:'사용자 답변:\n...'}`로 SDK에 전달(원본 패턴). questionWaiters는 24c waiters 인프라 공용.
- **shared**: `AgentEventQuestionRequest {type:'question_request', requestId, questions}` · IPC `QUESTION_RESPOND('agent.questionRespond')` + `QuestionResponse {runId, requestId, answers:string[][]|null}`.
- **main(ipc)**: QUESTION_RESPOND 핸들러 → `run.respond`.
- **renderer**: Conversation `question_request` → `QuestionModal` open. onAnswer→questionRespond(answers) · onDismiss→questionRespond(null=건너뛰기).
- **qa**: question round-trip + 모달 배선 + dismiss 경로.
- **라이브**: 질문 자동응답 스모크(AskUserQuestion 유도→question_request 수신→자동 답변→에이전트 진행).

## 완료조건 (측정가능)

- [ ] AgentEvent 11종 union 확정(타입·골든 테스트).
- [ ] `npm run typecheck` main+web green · `npm run test` 전 green(회귀 0) · `npm run build` 성공.
- [ ] thinking/todo/subagent: 실 SDK 단일 스모크에서 해당 이벤트 관측(라이브).
- [ ] 권한: 스크립트 자동응답으로 allow→실행 / deny→차단 라이브 확인.
- [ ] 질문: 스크립트 자동응답으로 AskUserQuestion 왕복 라이브 확인.
- [ ] reviewer 신뢰경계 CRITICAL 🔴 0(특히 AgentRun.respond·IPC respond 채널 입력검증, push-queue가 raw SDK 누수 0).
- [ ] FEATURE_MAP B4 ✅ · M4-4 잔여 ✅ · REPLICA_GAP·replica-loop 메모리 갱신.

## plan-auditor 가드 (4건 — PASS/승인, 구현단계 반영)

- **G1 (24a thinking 수신 미검증)**: `includePartialMessages:false`는 원본 *폴백 경로*(완성 assistant `{type:'thinking'}` 블록, engine.ts:457)만 잡는다. 주 경로는 partial(`thinking_delta`, engine.ts:427, partial:true). → **24a 착수 전 1줄 스모크로 SDK가 완성 content에 thinking 블록을 넣는지 선확인**(`artifacts/thinking-block-smoke.mjs`). 미포함 시 thinking을 24a 라이브 완료조건에서 강등하거나 partial을 24a로 끌어옴(scope 확대 주의).
- **G2 (24d questions 동형성)**: `AgentQuestion`(렌더 f14SampleData `{header?,question,options:{label,description?}[],multiSelect?}`)·원본 `parseQuestions`(engine.ts:880) 출력과 동형. **shared가 렌더 lib을 import 불가** → questions 항목 타입을 `src/shared`에 정식 정의, 렌더가 역import. `parseQuestions` 로직 main 이식.
- **G3 (24c/24d abort waiter 정리)**: abort/run-end 시 미해결 permissionWaiters→deny, questionWaiters→null resolve(원본 engine.ts:214/535). 누락 시 canUseTool Promise 영구 hang→펌프 teardown 차단(좀비). → **24c abort 회귀 테스트에 "미해결 waiter는 abort 시 deny/null resolve + push-queue done 닫힘" 명시**. `ClaudeAgentRun.abort()`에 waiter 드레인 포함.
- **G4 (requestId 유일성, 경미)**: requestId에 runId 임베드(`perm-${runId}-${n}`)로 전역 유일성→cross-run 오라우팅 구조적 차단(원본 패턴). main respond 핸들러는 runId+requestId 둘 다 매칭, 미존재 no-op.

## 신뢰경계·계약 체크 (CRITICAL)

- push-queue·canUseTool은 **main 단독**. raw SDKMessage 외부 누수 0(claude-stream만 스키마 가정 보유).
- `respond` 입력(runId·requestId·behavior·answers)은 **untrusted** → main에서 allowlist 검증(behavior ∈ {allow,deny}, runId 존재, requestId 매칭). 미매칭은 조용히 no-op(throw 금지).
- IPC 채널은 `src/shared/ipc-contract.ts` 단일 정의 → 양쪽 import. preload 화이트리스트만.
- `AgentBackend`/`AgentRun` 변경 = backend-contract 깃발 → reviewer 무조건 + 전 어댑터(Echo/Codex) 정합.
