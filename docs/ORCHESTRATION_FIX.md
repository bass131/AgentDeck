# SDK Workflow 오케스트레이션 — 경험적 레퍼런스 (✅ 완료, ADR-021)

> **상태**: 구현 완료(2026-06-26). 결정/근거/트레이드오프는 **ADR-021**. 이 문서는 raw SDK
> 프로브로 규명한 **Workflow/task_* 런타임 동작 ground truth**만 보존(향후 SDK 작업 참조용).
> 프로브: `artifacts/workflow-probe.mjs`(gitignore, `node artifacts/workflow-probe.mjs`로 재현).

## Workflow 도구 런타임 동작 (fire-and-watch)

에이전트가 `Workflow` tool_use를 호출하면:
1. tool_result = **"Workflow launched in background. Task ID: … Transcript dir: … Script file: …"**
   (= fire-and-watch, **최종 결과 아님**).
2. 첫 `result(success)`로 1번째 턴 종료 + 에이전트 "백그라운드로 실행했습니다, 완료되면 전달".
3. 워크플로 완료 시 **`system/task_notification` → `system/init` → 2번째 턴**에서 에이전트가
   진짜 결과를 전달. → **결과는 실제로 메인 컨텍스트에 복귀함**(블랙박스 아님).
4. 단일프롬프트 query의 iterator는 워크플로 완료 후 **자연 종료**.

→ 우리가 본 "결과 미수신" 증상은 Workflow의 한계가 아니라 **run-manager(`agent-runs.ts`)가
*첫* `done`(=launched 직후 result)에 run을 break/폐기**해 2번째 턴을 못 받던 버그였다(F-B로 수정:
펌프가 중간 done 보류 → iterator 종료 시 최종 done 1회).

## task_* 시스템 이벤트 페이로드 (진행 표면화 ground truth)

모두 **`tool_use_id`**(= Workflow tool_use id = orchestration 카드 id)를 운반 → 카드와 1:1 상관.
(F-C가 claude-stream에서 엔진중립 `orchestration_progress`로 정규화 — 'task_*'/'workflow_*'
리터럴은 어댑터 내부에만.)

- **`task_started`**: `{task_id, tool_use_id, description, task_type:"local_workflow", workflow_name, prompt:<script>}`.
- **`task_progress`**(여러 번): `{task_id, tool_use_id, usage:{total_tokens,tool_uses,duration_ms},
  workflow_progress:[ {type:"workflow_phase",index,title},
  {type:"workflow_agent",index,label,phaseTitle,model,state:"start"|"progress"|"done",tokens,toolCalls,resultPreview} ]}`.
- **`task_updated`**: `{task_id, patch:{status:"completed",end_time}}` — **tool_use_id 없음**(stateless
  claude-stream에서 카드 상관 불가 → 제외, 완료는 task_notification이 담당).
- **`task_notification`**: `{task_id, tool_use_id, status:"completed", output_file, summary, usage}`.
  (신뢰경계: `output_file` 등 파일경로는 정규화에서 제외 — 진행 메타만 표면화.)

- **카드 오완료 버그**: Workflow "launched" tool_result가 카드 id와 일치 → reducer가 카드를 즉시
  완료시킴. F-C가 펌프 `_orchestrationToolIds`로 그 tool_result를 suppress해 차단(카드는 진행
  이벤트로만 완료 + done/error 백스톱).

## 핵심 결합부 (코드)
- `src/main/agents/ClaudeCodeBackend.ts` — 펌프 done 병합(F-B)·orchestration tool_result suppress(F-C).
- `src/main/agents/claude-stream.ts` — `mapTaskProgress`(task_* → orchestration_progress).
- `src/main/ipc/agent-runs.ts` — run 생명주기(단일 terminal done 전제).
- `src/shared/agent-events.ts` — `AgentEventOrchestrationProgress`(엔진중립 단일정의).
- `src/renderer/.../reducer.ts`·`OrchestrationCard.tsx`·`SubAgentInline.tsx` — 카드 라이브·인라인.
- 검증: `tests/agents/workflow-result-lifecycle.test.ts`·`orchestration-stream.test.ts`·
  `tests/renderer/orchestration-reducer.test.ts`·`tests/e2e/orchestration-live.e2e.ts`(LIVE_SDK).
