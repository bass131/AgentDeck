/**
 * reducer/text.ts — 텍스트 계열 이벤트 핸들러 (P12 분해).
 *
 * text · thinking · thinking_clear. applyAgentEvent 디스패처가 호출.
 * CRITICAL: 순수 함수 — window.api/Node/fs 0. time은 받은 값만 사용(nowTime() 0).
 */
import type { AgentEvent, SubAgentTranscriptItem } from '../../../../shared/agent-events'
import { CMD_CARDS } from '../../lib/cmdCards'
import type { ThreadItem } from '../threadTypes'
import type { AppState } from './types'

type TextEvent = Extract<AgentEvent, { type: 'text' }>
type ThinkingEvent = Extract<AgentEvent, { type: 'thinking' }>
type ThinkingDeltaEvent = Extract<AgentEvent, { type: 'thinking_delta' }>

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
      // GAP1 P04(S-02): 서브에이전트 transcript로 라우팅되는 텍스트도 실제 산출물 도착
      // 이므로 동일하게 재시도 인디케이터 clear(메인 스트림/서브 구분 없이 API 레벨 신호).
      apiRetry: null,
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

  // LR2-03: goal 진행 카드 턴 카운트 — 새 assistant msg 생성 = goal 턴 경계
  // (실측 goal-event-probe: /goal stop-hook 자기지속은 턴마다 messageId 증가).
  // goal 카드가 running인 동안에만 title을 "…(running) · N턴"으로 in-place 갱신.
  let nextPendingCommand = state.pendingCommand
  if (!existsInThread && state.pendingCommand?.name === 'goal') {
    const pc = state.pendingCommand
    const turns = (pc.turns ?? 0) + 1
    nextPendingCommand = { ...pc, turns }
    const goalCfg = CMD_CARDS['goal']
    nextThread = nextThread.map((item) =>
      item.kind === 'cmdresult' && item.id === pc.cardId && item.running
        ? { ...item, title: `${goalCfg.running} · ${turns}턴` }
        : item
    )
  }

  // goal 표시 수명 일원화(BL1 후속): goalRun.turns를 같은 트리거(신규 assistant msg 경계)로
  // 병렬 증가시킨다 — pendingCommand와 달리 이후 handleDone이 pendingCommand를 null로
  // 지워도 goalRun은 살아있는 한 계속 증가한다(카드-배너 단일 진실원 관계는
  // pendingCommand/cmdresult 카드 쪽에서 불변 — 이 필드는 배너 전용 병렬 소스).
  let nextGoalRun = state.goalRun
  if (!existsInThread && state.goalRun !== null) {
    nextGoalRun = { ...state.goalRun, turns: state.goalRun.turns + 1 }
  }

  return {
    ...state,
    thread: nextThread,
    seq: nextSeq,
    pendingCommand: nextPendingCommand,
    goalRun: nextGoalRun,
    // openGroupId=null: 도구 그룹 닫기 → 다음 tool_call이 새 그룹 시작
    openGroupId: null,
    // openMsgId=id: 다음 text 이벤트가 이 msg에 누적
    openMsgId: msgId,
    thinkingText: null,
    isRunning: true,
    // GAP1 P04(S-02): 실제 산출물(text)이 도착했다는 것 자체가 "재시도가 성공해 정상
    // 진행이 재개됐다"는 뜻 — 낡은 재시도 인디케이터를 이 시점에 clear한다.
    apiRetry: null,
  }
}

/**
 * thinking 이벤트 → 메인 thinkingText 갱신 + thread에 kind:'thinking' 아이템 전문 보존,
 * 또는 서브에이전트 transcript 라우팅.
 *
 * B2(§9-R): parentToolId 있으면 서브에이전트 transcript로 라우팅 — 메인 thinkingText/thread
 * 미관여(기존 동작 그대로 — SubAgentFullscreen이 별도 렌더 문법 소비).
 * openMsgId/openGroupId/펌프카운터 불변.
 *
 * GAP1 P06(I-01): 이전엔 thinkingText만 세팅하고 thread에는 반영하지 않아 사고가 끝나면
 * (thinking_clear) 90자 요약조차 흔적 없이 사라졌다 — 이제 thread에 전문을 남긴다(접이식
 * 블록, Conversation.tsx ThinkingItem).
 * "열린 thinking 아이템" = thread의 마지막 항목이 kind:'thinking'인 경우 — 있으면 그 아이템의
 * text를 전문으로 확정(replace, 권위 — coordinator 설계), 없으면 새로 연다. 별도 포인터
 * 필드(openThinkingId류) 불필요 — SDK 스트림 상 사고 구간은 text/thinking_clear가 오기
 * 전까지 다른 이벤트로 끊기지 않는다(threadTypes.ts kind:'thinking' 주석 참조).
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

  // parentToolId 없음 → 메인 thinkingText 갱신(기존 동작 유지, WorkingIndicator/
  // LoopStatusBanner 회귀 방지) + thread에 전문 아이템 생성/확정.
  const lastItem = state.thread[state.thread.length - 1]
  let nextThread: ThreadItem[]
  let nextSeq = state.seq

  if (lastItem && lastItem.kind === 'thinking') {
    // 열린 아이템 존재 — 전문으로 확정(replace, 권위). estimatedTokens는 보존.
    nextThread = [...state.thread.slice(0, -1), { ...lastItem, text: event.text }]
  } else {
    nextSeq = state.seq + 1
    nextThread = [...state.thread, { kind: 'thinking' as const, id: `th${nextSeq}`, text: event.text }]
  }

  return {
    ...state,
    thread: nextThread,
    seq: nextSeq,
    thinkingText: event.text,
    isRunning: true,
  }
}

/**
 * thinking_delta 이벤트 → 열린 thinking 아이템에 라이브 증분 반영(GAP1 P06, S-09).
 *
 * text(원문 증분): 열린 아이템 text에 append(첫 delta면 새 아이템 생성).
 * estimatedTokens(redacted 구간 진행치, 텍스트 없음): 열린 아이템에 세팅(런닝 토탈이라
 * 누적 없이 최신값으로 교체 — 열린 아이템 없으면 placeholder 아이템 생성).
 * 서브에이전트 라우팅 없음 — AgentEventThinkingDelta는 parentToolId를 선언하지 않는다
 * (계약 agent-events.ts:836, 메인 스트림 전용).
 * thinkingText는 건드리지 않는다(핸들러 범위 밖 — handleThinking의 기존 소비처 회귀 방지
 * 원칙을 따라 이 신규 핸들러는 thread 아이템만 담당).
 */
export function handleThinkingDelta(state: AppState, event: ThinkingDeltaEvent): AppState {
  const lastItem = state.thread[state.thread.length - 1]
  let nextThread: ThreadItem[]
  let nextSeq = state.seq

  if (lastItem && lastItem.kind === 'thinking') {
    const updated: ThreadItem = {
      ...lastItem,
      ...(event.text !== undefined ? { text: lastItem.text + event.text } : {}),
      ...(event.estimatedTokens !== undefined ? { estimatedTokens: event.estimatedTokens } : {}),
    }
    nextThread = [...state.thread.slice(0, -1), updated]
  } else {
    nextSeq = state.seq + 1
    nextThread = [
      ...state.thread,
      {
        kind: 'thinking' as const,
        id: `th${nextSeq}`,
        text: event.text ?? '',
        ...(event.estimatedTokens !== undefined ? { estimatedTokens: event.estimatedTokens } : {}),
      },
    ]
  }

  return {
    ...state,
    thread: nextThread,
    seq: nextSeq,
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
