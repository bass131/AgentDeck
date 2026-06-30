/**
 * reducer/text.ts — 텍스트 계열 이벤트 핸들러 (P12 분해).
 *
 * text · thinking · thinking_clear. applyAgentEvent 디스패처가 호출.
 * CRITICAL: 순수 함수 — window.api/Node/fs 0. time은 받은 값만 사용(nowTime() 0).
 */
import type { AgentEvent, SubAgentTranscriptItem } from '../../../../shared/agent-events'
import type { ThreadItem } from '../threadTypes'
import type { AppState } from './types'

type TextEvent = Extract<AgentEvent, { type: 'text' }>
type ThinkingEvent = Extract<AgentEvent, { type: 'thinking' }>

/**
 * text 이벤트 → 메인 thread assistant msg 누적 또는 서브에이전트 transcript 라우팅.
 *
 * B2(§9-R): parentToolId 있으면 서브에이전트 transcript로 라우팅 — 메인 thread 미관여(버그수정 핵심).
 * thread/openMsgId/openGroupId/seq/펌프카운터 불변.
 */
export function handleText(state: AppState, event: TextEvent, time?: string): AppState {
  if (event.parentToolId) {
    const saId = event.parentToolId
    const transcriptItem: SubAgentTranscriptItem = {
      kind: 'text',
      text: event.delta,
    }
    const updatedSubagents = state.subagents.map((sa) => {
      if (sa.id !== saId) return sa
      const prev = sa.transcript ?? []
      return { ...sa, transcript: [...prev, transcriptItem] }
    })
    return {
      ...state,
      subagents: updatedSubagents,
      isRunning: true,
    }
  }

  // parentToolId 없음 → 기존 동작: 메인 thread assistant msg 누적
  // messageId 결정: 이벤트 messageId → openMsgId 폴백 → 합성
  const msgId: string = event.messageId ?? state.openMsgId ?? `m${state.seq + 1}`
  const isNewId = !event.messageId && !state.openMsgId

  // thread에서 id 일치 msg 찾기
  const existsInThread = state.thread.some(
    (item) => item.kind === 'msg' && item.id === msgId
  )

  let nextThread: ThreadItem[]
  let nextSeq = state.seq

  if (existsInThread) {
    // 기존 msg에 append — time은 최초 생성 시만 부여(append 시 불변)
    nextThread = state.thread.map((item) => {
      if (item.kind === 'msg' && item.id === msgId) {
        return { ...item, text: item.text + event.delta }
      }
      return item
    })
  } else {
    // 새 msg push — W7: time 인자 있으면 msg에 부여
    if (isNewId) nextSeq = state.seq + 1
    nextThread = [
      ...state.thread,
      {
        kind: 'msg' as const,
        role: 'assistant' as const,
        id: msgId,
        text: event.delta,
        ...(time !== undefined ? { time } : {}),
      },
    ]
  }

  return {
    ...state,
    thread: nextThread,
    seq: nextSeq,
    // openGroupId=null: 도구 그룹 닫기 → 다음 tool_call이 새 그룹 시작
    openGroupId: null,
    // openMsgId=id: 다음 text 이벤트가 이 msg에 누적
    openMsgId: msgId,
    thinkingText: null,
    isRunning: true,
  }
}

/**
 * thinking 이벤트 → 메인 thinkingText 갱신 또는 서브에이전트 transcript 라우팅.
 *
 * B2(§9-R): parentToolId 있으면 서브에이전트 transcript로 라우팅 — 메인 thinkingText 미관여.
 * thread/openMsgId/openGroupId/seq/펌프카운터 불변.
 */
export function handleThinking(state: AppState, event: ThinkingEvent): AppState {
  if (event.parentToolId) {
    const saId = event.parentToolId
    const transcriptItem: SubAgentTranscriptItem = {
      kind: 'thinking',
      text: event.text,
    }
    const updatedSubagents = state.subagents.map((sa) => {
      if (sa.id !== saId) return sa
      const prev = sa.transcript ?? []
      return { ...sa, transcript: [...prev, transcriptItem] }
    })
    return {
      ...state,
      subagents: updatedSubagents,
      isRunning: true,
    }
  }

  // parentToolId 없음 → 기존 동작: 메인 thinkingText 갱신
  return {
    ...state,
    thinkingText: event.text,
    isRunning: true,
  }
}

/** thinking_clear 이벤트 → thinkingText 리셋. */
export function handleThinkingClear(state: AppState): AppState {
  return {
    ...state,
    thinkingText: null,
  }
}
