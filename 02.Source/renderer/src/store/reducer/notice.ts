/**
 * reducer/notice.ts — 기타 알림/변경 이벤트 핸들러 (P12 분해, 스펙상 "misc").
 *
 * file_changed · model-fallback · subagent · orchestration_denied(UC1 P10). applyAgentEvent 디스패처가 호출.
 * (파일명: TDD-guard 훅이 파일명 stem을 테스트 substring으로 검사 — "misc" 미존재라 "notice" 사용.)
 * CRITICAL: 순수 함수 — window.api/Node/fs 0. time은 받은 값만 사용.
 */
import type { AgentEvent, SubAgentInfo } from '../../../../shared/agent-events'
import type { ThreadItem } from '../threadTypes'
import type { AppState, FileDiffEntry } from './types'
import { copyForOrchestrationDenied } from '../../lib/orchestrationDeniedCopy'

type FileChangedEvent = Extract<AgentEvent, { type: 'file_changed' }>
type ModelFallbackEvent = Extract<AgentEvent, { type: 'model-fallback' }>
type SubagentEvent = Extract<AgentEvent, { type: 'subagent' }>
type OrchestrationDeniedEvent = Extract<AgentEvent, { type: 'orchestration_denied' }>

/** file_changed 이벤트 → changedFiles set + fileDiffs(diff 있을 때) 갱신. */
export function handleFileChanged(state: AppState, event: FileChangedEvent): AppState {
  const nextFiles = new Set(state.changedFiles)
  nextFiles.add(event.path)

  const diffKey = event.toolId ?? event.path
  if (event.diff && event.diff.length > 0) {
    const nextDiffs: Record<string, FileDiffEntry> = {
      ...state.fileDiffs,
      [diffKey]: {
        add: event.add ?? 0,
        del: event.del ?? 0,
        lines: event.diff,
      },
    }
    return {
      ...state,
      changedFiles: nextFiles,
      fileDiffs: nextDiffs,
    }
  }

  return {
    ...state,
    changedFiles: nextFiles,
  }
}

/**
 * model-fallback 이벤트 → 폴백 경고 배너 처리 (원본 session.ts L340-351 미러).
 *
 * retract: retractMessageId 있으면(null/undefined 아닌 non-empty string) thread에서
 *   kind==='msg' && id===retractMessageId인 항목 제거.
 *   거부된 부분 버블을 지워 재시도 답변이 새 버블로 시작되도록.
 *   openMsgId===retractMessageId면 openMsgId=null(열린 버블 닫기).
 *   kind!='msg'인 항목(toolgroup 등)은 retract 대상 아님(정확 매칭 필수).
 *
 * notice push: {kind:'notice', id:'fb'+(seq+1), text:event.text} append.
 *   seq++. id 접두사 'fb'로 msg('m')/toolgroup('tg')와 충돌 0.
 *
 * CRITICAL(순수함수): window.api/Node/fs 호출 없음.
 */
export function handleModelFallback(state: AppState, event: ModelFallbackEvent, time?: string): AppState {
  const retractId = event.retractMessageId
  const shouldRetract = typeof retractId === 'string' && retractId.length > 0

  const withoutRetracted: typeof state.thread = shouldRetract
    ? state.thread.filter(
        (item) => !(item.kind === 'msg' && item.id === retractId)
      )
    : state.thread

  const nextSeq = state.seq + 1
  const noticeId = `fb${nextSeq}`
  // W7: time 인자 있으면 notice에 부여
  const nextThread: typeof state.thread = [
    ...withoutRetracted,
    {
      kind: 'notice',
      id: noticeId,
      text: event.text,
      ...(time !== undefined ? { time } : {}),
    },
  ]

  // openMsgId 정리: retract 대상이 열린 버블이면 닫는다.
  const nextOpenMsgId =
    shouldRetract && state.openMsgId === retractId ? null : state.openMsgId

  return {
    ...state,
    thread: nextThread,
    seq: nextSeq,
    openMsgId: nextOpenMsgId,
  }
}

/**
 * subagent 이벤트 → state.subagents upsert/병합 + 신규 시 thread 인라인 마커 push.
 *
 * id 키로 upsert/병합: 존재하면 필드 병합, 없으면 추가.
 */
export function handleSubagent(state: AppState, event: SubagentEvent): AppState {
  const incoming = event.subagent
  const existing = state.subagents.find((sa) => sa.id === incoming.id)
  if (existing) {
    const merged: SubAgentInfo = {
      ...existing,
      ...incoming,
      tools: existing.tools,
    }
    return {
      ...state,
      subagents: state.subagents.map((sa) => (sa.id === incoming.id ? merged : sa)),
    }
  }
  // F-G: 신규 서브에이전트 → state.subagents 추가 + thread에 인라인 위치 마커 push.
  // 마커는 위치(id)만 — 데이터는 state.subagents 단일출처(렌더가 id로 조회). 단일·멀티 공통.
  // cmdresult/orchestration begin 미러: 인터리브 포인터 닫기(다음 text는 새 버블).
  const saMarker: ThreadItem = { kind: 'subagent', id: incoming.id }
  return {
    ...state,
    subagents: [...state.subagents, incoming],
    thread: [...state.thread, saMarker],
    openMsgId: null,
    openGroupId: null,
  }
}

/**
 * orchestration_denied 이벤트 → 대화 thread에 시스템 라인(kind:'notice') push (UC1 P10, ADR-032 v2 ④).
 *
 * OFF 턴에 모델이 Workflow를 자발 호출해 canUseTool G4가 즉시 거부하면(P09가 방출),
 * 사용자가 영문 모를 상황에 빠지지 않도록 표시 카피를 붙여 기존 notice 관례(model-fallback과
 * 동일 kind — NoticeItem 컴포넌트)로 렌더한다. 새 시각 문법 0 — 기존 경고색 notice 재사용.
 *
 * dedup: 직전 thread 아이템이 kind==='notice'이고 동일 reason(denyReason)의 deny 라인이면 스킵
 * (같은 턴 내 모델의 연속 재시도로 인한 라인 도배 방지 — 과설계 금지, 단순 인접 비교만).
 * id는 도구 호출마다 유일(P08 계약)해 dedup 키로 못 쓴다 — reason(고정 리터럴)로 비교.
 *
 * CRITICAL(순수함수): window.api/Node/fs 호출 없음. time은 받은 값만 사용.
 */
export function handleOrchestrationDenied(
  state: AppState,
  event: OrchestrationDeniedEvent,
  time?: string
): AppState {
  const last = state.thread[state.thread.length - 1]
  const isDuplicate = last?.kind === 'notice' && last.denyReason === event.reason
  if (isDuplicate) return state

  const nextSeq = state.seq + 1
  const noticeId = `dn${nextSeq}`
  const text = copyForOrchestrationDenied(event.reason)

  return {
    ...state,
    thread: [
      ...state.thread,
      {
        kind: 'notice',
        id: noticeId,
        text,
        denyReason: event.reason,
        ...(time !== undefined ? { time } : {}),
      },
    ],
    seq: nextSeq,
  }
}
