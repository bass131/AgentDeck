/**
 * stopAction.ts — 정지 버튼 판정 헬퍼 (FB2 Phase 02, P01 진단 반영판).
 *
 * 배경(01.Phases/FB2-ui-feedback2/01-interrupt-repro-diagnose.md,
 * 02-interrupt-fix.md): `ClaudeAgentRun.interrupt()`(main, 수정 금지 영역)는 설계상
 * "현재 턴"만 중단한다(ADR-024). `/goal`·`/loop`·`/schedule` 계열의 self-re-arm
 * (세션 스코프 자기지속 — ScheduleWakeup 재무장)은 그 턴이 끝나도 살아남으므로,
 * 세션 자체를 끝내는 `abort()`만이 반복을 멈출 수 있다(fb2-p01-interrupt-scope-selfrearm
 * .test.ts 증거 — 대조군: interrupt 직후 abort는 자율 턴 도착 전에 스트림을 확실히
 * 끊는다). `LoopStatusBanner`의 "sdk"(크론) 변형은 이미 onStopSdk → abortRun() 배선
 * 선례가 있다 — 이 헬퍼는 그 선례를 컴포저 자체 정지 버튼(Conversation.tsx·
 * PanelView.tsx handleAbort)까지 확장한다.
 *
 * decideStopAction — goal/loop가 활성이면(activeLoops 비어있지 않음 또는
 * pendingCommand.name==='goal') 항상 abort. 아니면 기존 계약(replMode ? interrupt :
 * abort, BF1 P03)을 그대로 유지 — 일반 스트리밍 턴의 interrupt 거동은 불변이어야 한다.
 *
 * CRITICAL: 순수 함수 — window.api/fs/타이머 0. 두 버튼(Conversation·PanelView)이
 * 이 함수 하나를 공유해 판정 로직 중복 정의를 막는다(단일 진실원).
 */
import type { LoopInfo } from '../../../shared/agent-events'
import type { GoalPendingLike } from './loopStatus'

/** decideStopAction의 반환값 — 정지 버튼이 실제로 호출해야 할 액션. */
export type StopAction = 'interrupt' | 'abort'

/**
 * decideStopAction — 정지 버튼이 interrupt()/abort() 중 무엇을 호출할지 결정.
 *
 * 우선순위(resolveLoopStatus와 동일한 "goal/loop 활성 신호" 판정을 재사용하지 않고
 * 독립 함수로 두는 이유: resolveLoopStatus는 표시 우선순위(sdk>goal>stopped>none)를
 * 결정하는 표시 전용 로직이고, 이 함수는 "활성이면 abort"라는 단순 OR 판정만 필요
 * — 억지로 얽으면 표시 로직과 정지 로직이 결합돼 서로의 변경에 취약해진다):
 *   1) activeLoops.length > 0(SDK 크론 활성) 또는 pendingCommand?.name === 'goal'
 *      → 'abort' (세션 종료로 self-re-arm 해제, replMode 무관)
 *   2) 그 외 → replMode ? 'interrupt' : 'abort' (BF1 P03 기존 계약 불변)
 */
export function decideStopAction(
  replMode: boolean,
  activeLoops: LoopInfo[],
  pendingCommand?: GoalPendingLike | null,
): StopAction {
  if (activeLoops.length > 0 || pendingCommand?.name === 'goal') {
    return 'abort'
  }
  return replMode ? 'interrupt' : 'abort'
}
