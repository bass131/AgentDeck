/**
 * reducer/reliability.ts — 턴 신뢰성 신호 핸들러 (GAP1 P04, P12 분해 관례 계승).
 *
 * api_retry · compact · session_state. applyAgentEvent 디스패처가 호출.
 * 계약은 P03 선정의분(shared/agent-events.ts AgentEventApiRetry·AgentEventCompact·
 * AgentEventSessionState) 소비만 — 이 파일에서 새 타입 추가 0.
 * store-shape 필드명은 coordinator 고정(gap1-p04-reliability-signals-reducer.test.ts 계약):
 *   apiRetry / compacting / sdkSessionState. compact-boundary thread item kind 이름도 고정.
 *
 * CRITICAL: 순수 함수 — window.api/Node/fs 0. time은 받은 값만 사용(nowTime() 0).
 */
import type { AgentEvent } from '../../../../shared/agent-events'
import type { AppState } from './types'

type ApiRetryEvent = Extract<AgentEvent, { type: 'api_retry' }>
type CompactEvent = Extract<AgentEvent, { type: 'compact' }>
type SessionStateEvent = Extract<AgentEvent, { type: 'session_state' }>

/**
 * api_retry 이벤트 → apiRetry 필드 세팅(S-02).
 *
 * 재시도 대기 중엔 다른 AgentEvent가 전혀 오지 않아 UI가 "멈춘 것처럼" 보이는 문제를
 * 인디케이터(LoopStatusBanner 재사용 변형)로 봉합하는 소스 데이터 — 값은 최신 통지를
 * 그대로 덮어쓴다(누적/병합 없음, 마지막 알림이 진실).
 */
export function handleApiRetry(state: AppState, event: ApiRetryEvent): AppState {
  return {
    ...state,
    apiRetry: {
      attempt: event.attempt,
      maxRetries: event.maxRetries,
      retryDelayMs: event.retryDelayMs,
    },
  }
}

/**
 * compact 이벤트 → kind로 분기(S-01).
 *
 * - kind:'boundary' → thread에 인라인 경계 마커 1개 push(seq++, id='cb'+seq — model-fallback
 *   의 'fb'+seq/orchestration_denied의 'dn'+seq와 동일 접두 관례, msg('m')/toolgroup('tg')와
 *   충돌 0). compacting 필드는 건드리지 않는다 — 경계(boundary)와 진행상태(status)는 SDK가
 *   별개 원시 메시지로 방출하는 별개 신호이기 때문(agent-events.ts AgentEventCompact 계약
 *   주석, sdk.d.ts:4128 근거).
 * - kind:'status' → compacting = event.status(정확히 그대로, status 미전달/null이면 null로
 *   clear — 진행 중 고착 방지가 store-shape 필수 조건).
 */
export function handleCompact(state: AppState, event: CompactEvent, time?: string): AppState {
  if (event.kind === 'boundary') {
    const nextSeq = state.seq + 1
    const markerId = `cb${nextSeq}`
    return {
      ...state,
      thread: [
        ...state.thread,
        {
          kind: 'compact-boundary' as const,
          id: markerId,
          trigger: event.trigger,
          preTokens: event.preTokens,
          postTokens: event.postTokens,
          ...(time !== undefined ? { time } : {}),
        },
      ],
      seq: nextSeq,
    }
  }

  // kind === 'status'
  return {
    ...state,
    compacting: event.status ?? null,
  }
}

/**
 * session_state 이벤트 → sdkSessionState 필드 그대로 반영(S-05, 권위 신호).
 *
 * 옵트인 환경(CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS=1)에서만 방출되므로 미수신 세션은
 * 이 필드가 계속 null(기본)로 남는다 — 이 핸들러가 호출되는 것 자체가 방출 확인 신호.
 */
export function handleSessionState(state: AppState, event: SessionStateEvent): AppState {
  return {
    ...state,
    sdkSessionState: event.state,
  }
}
