# 오케스트레이션 수정 + 인라인 동적 표시 (드라이버 — compact 생존)

> 사용자 승인 방향(2026-06-26): **Workflow 되살리기 + 결과 복귀 버그 수정 + Claude Code CLI식
> 인라인 동적 서브에이전트/UltraCode 표시**. 이 문서가 compact 후 이어가는 단일 진실원.

## 배경 — 경험적으로 규명된 근본 원인 (확정)

사용자 실측 2증상: ① UltraCode 켜면 오른쪽 탭에 실시간 진행 안 보임 ② 워크플로 결과를
메인 세션이 못 이어받음("백그라운드로 돌린다"만 하고 멈춤).

**raw SDK 프로브(`artifacts/workflow-probe.mjs`, node 직접 실행)로 확정한 SDK 동작**:
1. 에이전트가 `Workflow` tool_use 호출 → tool_result = **"Workflow launched in background.
   Task ID: … Transcript dir: …/subagents/workflows/… Script file: …/workflows/scripts/….js"**
   (= **fire-and-watch**, 최종 결과 아님).
2. 첫 턴이 `result(success)`로 종료 + 에이전트 "워크플로 실행했습니다. 완료되면 결과 전달" ←
   **사용자가 본 그 증상**.
3. 워크플로 완료 시 **`system/task_notification`** → **`system/init`** → **2번째 턴**에서 에이전트가
   진짜 결과("WORKFLOW_RESULT_OK") 전달. → **결과는 실제로 돌아옴**.
4. 진행 시스템 이벤트 존재: `system/task_started · task_progress(여러번) · task_updated ·
   task_notification`. → 진행 표시 **가능**(guide가 "블랙박스"라 한 것보다 나음).

**버그 위치 = `src/main/ipc/agent-runs.ts` L120-128** (run-manager):
```js
for await (const event of run.events) {
  if (activeRun.done) break              // ← 2번째 턴에서 여기서 끊김
  onEvent(event, runId)
  if (event.type === 'done' || event.type === 'error') {
    activeRun.done = true
    activeRuns.delete(runId)             // ← 첫 done(=workflow launched 직후)에 run 폐기
  }
}
```
백엔드 펌프(`ClaudeCodeBackend._runPump`, `for await (msg of queryIterable)` L915)는 done에
break 안 하고 queryIterable 소진까지 돈다 → **2번째 턴도 받을 구조**. 문제는 run-manager가
**첫 `done`(=fire-and-watch "launched" 직후 result)에서 run을 폐기·break**해서 완료 턴을 못 받음.

## F-C ground truth — task_* 이벤트 실페이로드 (프로브 2차, 2026-06-26)

프로브(`artifacts/workflow-probe.mjs`)를 보강해 task_* system 메시지 전체를 덤프, 확정:
- **`tool_use_id`가 카드 연결 키**: `task_started`·`task_progress`·`task_notification` 모두
  `tool_use_id`(= Workflow tool_use id = orchestration 카드 id) 운반 → 카드와 1:1 상관 가능.
- **`task_started`**: `{task_id, tool_use_id, description, task_type:"local_workflow",
  workflow_name, prompt:<script>}`. → status=running.
- **`task_progress`**(여러 번): `{task_id, tool_use_id, usage:{total_tokens,tool_uses,duration_ms},
  workflow_progress:[ {type:"workflow_phase",index,title}, {type:"workflow_agent",index,label,
  phaseTitle,model,state:"start"|"progress"|"done",tokens,toolCalls,resultPreview} ]}`. → 라이브 진행.
- **`task_updated`**: `{task_id, patch:{status:"completed",end_time}}`. → status 전이.
- **`task_notification`**: `{task_id, tool_use_id, status:"completed", output_file, summary,usage}`. → 완료.
- **현 버그 확정**: Workflow `tool_result`("Workflow launched in background. Task ID:…")가 카드
  id와 일치 → reducer(`tool_result` hasOrch L542)가 카드를 즉시 running:false+result="launched…"로
  만듦(오완료). 진짜 결과는 turn2 assistant 텍스트(F-B로 복귀). → F-C: launched tool_result를
  펌프에서 suppress(`_orchestrationToolIds`, Task* 패턴 미러) + task_* → 엔진중립
  `orchestration_progress` 이벤트로 카드 라이브 갱신·완료(task_notification) + done 백스톱.

## 승인된 수정 방향

### F-A. Workflow 되살리기 (O1 revert)
- 현재 O1(커밋 `087834c`)이 UltraCode를 Task 서브에이전트로 전환 + Workflow 항상 차단했음.
  → **revert**: UltraCode ON = Workflow 허용(이전 Phase 37 동작) 복원. 가이드/disallowedTools/
  canUseTool 게이트 원복. (관련 단위테스트 orchestration-sdkoptions O3·permission-gate G1/G2도 원복.)
  AgentBackend JSDoc(`3671ec4`)도 원복 또는 양립 표현으로.
- O2 라이브 스모크(`142bfc7`)는 서브에이전트 경로 검증용 — 유지하거나 Workflow용으로 보강.
- **선택**: 서브에이전트 오케스트레이션도 유지하고 싶으면 "둘 다"(가이드만 조정) — 사용자 확인.

### F-B. run 생명주기 수정 (핵심)
- **첫 `result`에서 run을 끝내지 말 것** — query 스트림이 *진짜* 끝날 때까지 소비해야
  워크플로 완료 턴(결과)이 메인 세션에 도착한다.
- 후보 설계(구현 시 plan-auditor와 확정):
  - (가장 견고) 백엔드가 `result`→`done` 매핑을 **터미널로 emit하지 말고**, queryIterable
    for-await 루프가 **자연 종료(iterator 소진)될 때 단 한 번 `done`**(마지막 result의
    usage/contextWindow 실어서). 단일프롬프트 query는 워크플로 완료 후 iterator가 종료됨(프로브 확인).
  - 또는 `_workflowPending` 추적(Workflow tool_use/`task_started` 시 set, `task_notification` 시 clear)
    → pending이면 첫 done 보류, 최종 result에 done.
  - 엣지: error result, abort(L916 `_aborted` return), usage carry, 다중/중첩 워크플로, 비워크플로
    회귀 0(정상 단일턴은 result==마지막 메시지라 타이밍 동일).
- ADR 필요(run 생명주기 변경 — 사용자 게이트, 초안 제공).

### F-C. 진행 표시 — `task_*` 시스템 이벤트 표면화 (보너스/핵심)
- `system/task_started·task_progress·task_updated·task_notification` 를 AgentEvent로 정규화
  (claude-stream, 엔진중립 — ADR-003: 'Workflow'/'task_' 리터럴은 어댑터 내부에만) → 정적
  블랙박스 OrchestrationCard를 **라이브 진행 카드**로. transcript dir/script file 경로도 tool_result에
  있으니 필요 시 파일 tail도 검토(신뢰경계: rootId/resolveSafe 게이트 — fs 직접 접근 main 단독).

## 사용자 추가 UI 개선 요구 (이번 배치 — F-D ~ F-G)

### F-D. 오른쪽 패널 SubAgent 생명주기
- **현 버그**: 작업 끝난 SubAgent 카드가 계속 남음.
- **수정**: SubAgent **완료 시 즉시 제거 금지 → 완료 2초 뒤 표기 제거**.
- **Task 처리**: "다음 Task가 새로 생기기 전까지는 그대로 두다가, 새 Task 생기면 새로 업데이트"
  — 즉 현재 Task/표시는 다음 것으로 교체될 때까지 유지(즉시 비우지 않음). (구현 시 정확한
  대상=todo vs subagent 재확인.)

### F-E. SubAgent 상세 = 동적 대화 세션 뷰
- SubAgent 클릭 → 상세를 **Claude Code처럼 대화 세션**으로, 사람이 봤을 때 **실제 동적으로
  돌아가는 구조**(라이브/실시간 갱신)로 개선. (현 `SubAgentFullscreen` transcript를 라이브
  스트리밍 뷰로 — parent_tool_use_id 라우팅된 서브에이전트 메시지가 실시간 누적되는 걸 보여줌.)

### F-F. SubAgent 패널 스크롤 → 동적 리사이즈
- 스크롤바로 사람이 직접 내리는 대신 **표시 공간을 동적으로 위/아래로 늘렸다 줄였다**.
  (고정높이+스크롤 → 내용에 따라 세로 공간 자동 신축.)

### F-G. 인라인 동적 표시 (단일 + 멀티 + UltraCode) — Claude Code CLI식
- **멀티 에이전트 패널엔 오른쪽 표시 패널이 없음** → 그 부분들을 **단일·멀티 둘 다 채팅 내부에**
  Claude Code CLI가 채팅 안에서 SubAgent 도는 걸 보여주듯 **동적으로 인라인 표시**.
- **UltraCode도** 같은 방식(채팅 인라인 동적)으로 표시 추가.
- 즉 핵심 테마: 서브에이전트/오케스트레이션 진행을 **채팅 스트림 안에 라이브로** (오른쪽 패널과
  별개로/추가로), 단일·멀티 공통.

## 현재 커밋 상태 (미push — 인간 게이트)
이번 세션 누적 15 커밋(origin/master 앞섬). O 시리즈: `087834c`(O1 서브에이전트 전환 — **revert 대상**)·
`142bfc7`(O2 스모크)·`3671ec4`(JSDoc). 그 앞: 테마 트랙 9 + 창/테마 수정 3.

## 구현 순서(제안 — compact 후 plan-auditor로 확정)
1. **O1 revert** (F-A): Workflow 복원 + 테스트 원복. (서브에이전트 "둘 다" 여부 사용자 확인.)
2. **F-B run 생명주기** (agent-backend, plan-auditor 선행 — 토대 가정: "iterator가 워크플로 완료 후
   종료"=프로브 확인됨. TDD: 단일턴 회귀0 + 워크플로 2턴 done 1회). + **라이브 e2e**(Workflow 실행→
   결과 메인 도착 단언, LIVE_SDK).
3. **F-C task_* 진행 이벤트** (shared 신규 AgentEvent + claude-stream + reducer + 카드 라이브화).
4. **F-G 인라인 동적 표시** (renderer — 채팅 thread에 서브에이전트/오케스트레이션 라이브, 단일·멀티).
5. **F-E 상세 동적 대화 뷰** + **F-D 생명주기(2초 제거·Task 교체)** + **F-F 동적 리사이즈** (renderer).
6. ADR 초안(run 생명주기·진행이벤트) 사용자 게이트.

## 불변 제약
- 신뢰경계(fs/SDK main 단독·시크릿0·transcript 경로 게이트) · ADR-003(엔진 고유 도구명/이벤트
  어댑터 내부) · TDD · reviewer · push 0(인간 게이트) · 한국어 보고 · Worker 보고 직접 검증.
- SDK 사실은 claude-code-guide 권위 확인(기억 금지). 라이브 결합부는 프로브/LIVE_SDK e2e로.

## 핵심 파일
- `src/main/ipc/agent-runs.ts`(L120-128 버그) · `src/main/agents/ClaudeCodeBackend.ts`(O1 revert·펌프
  done 타이밍) · `src/main/agents/claude-stream.ts`(task_* 정규화) · `src/shared/agent-events.ts`(신규
  진행 이벤트) · `src/renderer/.../reducer.ts`·`AgentPanel.tsx`·`SubAgentFullscreen.tsx`·`Conversation.tsx`·
  `MultiWorkspace.tsx`·`OrchestrationCard.tsx`(인라인/라이브/생명주기) · 프로브 `artifacts/workflow-probe.mjs`(gitignore).
