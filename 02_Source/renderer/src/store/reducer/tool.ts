/**
 * reducer/tool.ts — 도구 계열 이벤트 핸들러 (P12 분해).
 *
 * tool_call · tool_result · search_result(GAP1 P08) · bg_task(GAP1 P09).
 * applyAgentEvent 디스패처가 호출.
 * CRITICAL: 순수 함수 — window.api/Node/fs 0. time은 받은 값만 사용.
 */
import type { AgentEvent, SubAgentTool, SubAgentTranscriptItem } from '../../../../shared/agent-events'
import type { ThreadItem } from '../threadTypes'
import type { AppState, BgTaskState, ToolCard, ToolCardStatus } from './types'
import { extractTarget, extractSubagentText } from './helpers'

type ToolCallEvent = Extract<AgentEvent, { type: 'tool_call' }>
type ToolResultEvent = Extract<AgentEvent, { type: 'tool_result' }>
type SearchResultEvent = Extract<AgentEvent, { type: 'search_result' }>
type BgTaskEvent = Extract<AgentEvent, { type: 'bg_task' }>

/**
 * tool_call 이벤트 → thread toolgroup 처리 또는 서브에이전트 tools/transcript 라우팅.
 *
 * parentToolId가 있으면 해당 subagent.tools에 추가(thread 미관여) + transcript에 도구항목 append(통합 타임라인).
 */
export function handleToolCall(state: AppState, event: ToolCallEvent, time?: string): AppState {
  if (event.parentToolId) {
    const saId = event.parentToolId
    const verb = event.name.toLowerCase()
    const target = extractTarget(event.input)
    const childTool: SubAgentTool = {
      id: event.id,
      verb,
      target,
      status: 'running',
    }
    const transcriptItem: SubAgentTranscriptItem = {
      kind: 'tool',
      verb,
      target,
      status: 'running',
      id: event.id,
    }
    const updatedSubagents = state.subagents.map((sa) => {
      if (sa.id !== saId) return sa
      const prev = sa.transcript ?? []
      return { ...sa, tools: [...sa.tools, childTool], transcript: [...prev, transcriptItem] }
    })
    return {
      ...state,
      subagents: updatedSubagents,
      isRunning: true,
    }
  }

  // parentToolId 없음 → thread에 toolgroup 처리
  const newCard: ToolCard = {
    id: event.id,
    name: event.name,
    input: event.input,
    status: 'running',
    // GAP1 P09: background 플래그 보존(배경 셸 배지 신뢰 원천 — input 파싱 금지, 계약 필드만).
    // 미지정 이벤트는 필드 자체를 싣지 않는다(포그라운드 = undefined, 회귀 0).
    ...(event.background !== undefined ? { background: event.background } : {}),
  }

  // openGroupId가 있고 thread에 해당 toolgroup이 존재하면 tools에 append
  const hasOpen = state.openGroupId !== null &&
    state.thread.some((item) => item.kind === 'toolgroup' && item.id === state.openGroupId)

  let nextThread: ThreadItem[]
  let nextOpenGroupId: string | null
  let nextSeq = state.seq

  if (hasOpen) {
    // 기존 toolgroup에 append
    nextOpenGroupId = state.openGroupId
    nextThread = state.thread.map((item) => {
      if (item.kind === 'toolgroup' && item.id === state.openGroupId) {
        return { ...item, tools: [...item.tools, newCard] }
      }
      return item
    })
  } else {
    // 새 toolgroup 생성 — W7: time 인자 있으면 toolgroup에 부여
    nextSeq = state.seq + 1
    nextOpenGroupId = `tg${nextSeq}`
    nextThread = [
      ...state.thread,
      {
        kind: 'toolgroup' as const,
        id: nextOpenGroupId,
        tools: [newCard],
        ...(time !== undefined ? { time } : {}),
      },
    ]
  }

  return {
    ...state,
    thread: nextThread,
    seq: nextSeq,
    openGroupId: nextOpenGroupId,
    // openMsgId=null: 텍스트 버블 닫기 → 다음 text가 새 버블 시작
    openMsgId: null,
    isRunning: true,
  }
}

/**
 * tool_result 이벤트 → orchestration/subagent/자식tool/toolgroup 순으로 매칭하여 in-place 갱신.
 */
export function handleToolResult(state: AppState, event: ToolResultEvent): AppState {
  const resultId = event.id

  // ① orchestration id 매칭 (P-2: toolgroup 분기 앞, subagent 앞에 배치).
  // thread에서 kind:'orchestration' && id 일치 카드 찾으면 in-place 갱신 후 즉시 return.
  // 포인터(openMsgId/openGroupId) 불변 — thread in-place map만.
  const hasOrch = state.thread.some((item) => item.kind === 'orchestration' && item.id === resultId)
  if (hasOrch) {
    // output 문자열화: string이면 그대로, 객체면 text 필드 추출 또는 JSON.stringify (길이 cap 4096)
    const rawOutput = event.output
    let resultStr: string
    if (typeof rawOutput === 'string') {
      resultStr = rawOutput
    } else if (rawOutput !== null && typeof rawOutput === 'object' && 'text' in (rawOutput as object)) {
      resultStr = String((rawOutput as { text: unknown }).text)
    } else {
      resultStr = JSON.stringify(rawOutput)
    }
    if (resultStr.length > 4096) resultStr = resultStr.slice(0, 4096)

    const nextThread = state.thread.map((item) => {
      if (item.kind === 'orchestration' && item.id === resultId) {
        return {
          ...item,
          running: false,
          failed: !event.ok,
          result: resultStr,
        }
      }
      return item
    })
    return {
      ...state,
      thread: nextThread,
      // 포인터 불변 (toolgroup in-place 갱신과 동형)
    }
  }

  // ② subagent id 매칭: Task 완료 → subagent done + activity(정제)
  const matchedSubagent = state.subagents.find((sa) => sa.id === resultId)
  if (matchedSubagent) {
    // F-E: tool_result content를 정제(text 추출·메타 제거) — raw JSON 덤프 방지.
    const activity = extractSubagentText(event.output)
    const updatedSubagents = state.subagents.map((sa) =>
      sa.id === resultId ? { ...sa, status: 'done' as const, activity } : sa
    )
    return {
      ...state,
      subagents: updatedSubagents,
    }
  }

  // ② 자식 tool id 매칭: 해당 subagent의 자식 tool status='done' + transcript 동반 갱신
  // reviewer 권고1: transcript의 kind==='tool' && id===resultId 항목도 status='done'으로
  // (tools[]와 동일 정책 — ok 무관 done, immutable 갱신, thread/seq 불변)
  let childMatched = false
  const updatedSubagentsForChild = state.subagents.map((sa) => {
    const hasChild = sa.tools.some((t) => t.id === resultId)
    if (!hasChild) return sa
    childMatched = true
    return {
      ...sa,
      tools: sa.tools.map((t) =>
        t.id === resultId ? { ...t, status: 'done' as const } : t
      ),
      ...(sa.transcript ? {
        transcript: sa.transcript.map((it) =>
          it.kind === 'tool' && it.id === resultId ? { ...it, status: 'done' as const } : it
        ),
      } : {}),
    }
  })
  if (childMatched) {
    return {
      ...state,
      subagents: updatedSubagentsForChild,
    }
  }

  // ③ thread toolgroup에서 id 매칭 → in-place 갱신
  const nextThread = state.thread.map((item) => {
    if (item.kind !== 'toolgroup') return item
    const hasCard = item.tools.some((t) => t.id === resultId)
    if (!hasCard) return item
    return {
      ...item,
      tools: item.tools.map((card) => {
        if (card.id !== resultId) return card
        return {
          ...card,
          status: (event.ok ? 'done' : 'error') as ToolCardStatus,
          result: event.output,
        }
      }),
    }
  })

  return {
    ...state,
    thread: nextThread,
  }
}

/**
 * search_result 이벤트 → thread toolgroup 내 toolUseId 매칭 카드에 searchResult 부착 (GAP1 P08).
 *
 * tool_result의 ③ toolgroup 매칭과 동형의 in-place map — 단, 기존 status/result는
 * 건드리지 않고 card.searchResult에 이벤트 전체를 그대로 싣는다(표시 보강 전용).
 * toolUseId 없음 / 매칭 카드 없음 → no-op(state 그대로 반환, throw 없음) — 어댑터가
 * 상관관계 id를 못 실은 이벤트는 조용히 버리고 raw <pre> 폴백에 맡긴다(견고성).
 * 포인터(openMsgId/openGroupId)·seq 불변.
 */
export function handleSearchResult(state: AppState, event: SearchResultEvent): AppState {
  const targetId = event.toolUseId
  if (!targetId) return state

  const hasCard = state.thread.some(
    (item) => item.kind === 'toolgroup' && item.tools.some((t) => t.id === targetId)
  )
  if (!hasCard) return state

  const nextThread = state.thread.map((item) => {
    if (item.kind !== 'toolgroup') return item
    if (!item.tools.some((t) => t.id === targetId)) return item
    return {
      ...item,
      tools: item.tools.map((card) =>
        card.id === targetId ? { ...card, searchResult: event } : card
      ),
    }
  })

  return {
    ...state,
    thread: nextThread,
  }
}

// ── bg_task (GAP1 P09) ────────────────────────────────────────────────────────

/**
 * 누적 tail 상한(자) — 장시간 dev 서버 로그의 메모리·렌더 성능 보호.
 * 초과 시 *앞부분* 절단(최신 로그 유지). 테스트 계약 합의 표면(gap1-p09) — 변경 금지.
 */
export const MAX_BG_TAIL_CHARS = 100_000

/** thread toolgroup 카드 in-place 갱신 헬퍼 — match 카드만 update 적용(불변 map). */
function updateCardInThread(
  state: AppState,
  match: (card: ToolCard) => boolean,
  update: (card: ToolCard) => ToolCard
): AppState {
  const hasCard = state.thread.some(
    (item) => item.kind === 'toolgroup' && item.tools.some(match)
  )
  if (!hasCard) return state

  const nextThread = state.thread.map((item) => {
    if (item.kind !== 'toolgroup') return item
    if (!item.tools.some(match)) return item
    return {
      ...item,
      tools: item.tools.map((card) => (match(card) ? update(card) : card)),
    }
  })
  return { ...state, thread: nextThread }
}

/**
 * bg_task 이벤트 → toolUseId/taskId 매칭 카드에 bgTask 부착·갱신 (GAP1 P09).
 *
 * - kind='started'      → toolUseId 매칭 카드에 bgTask 생성(tail:'' 초기화, 비터미널 status).
 * - kind='output'       → outputChunk를 tail에 이어붙임 — **taskId 역인덱스**(output
 *   이벤트에는 toolUseId 없음, main 측 output 파일 폴링 합성). 상한 MAX_BG_TAIL_CHARS
 *   초과 시 앞부분 절단(최신 로그 유지) + truncated 표시.
 * - kind='updated'      → patch.status로 status 갱신 — **taskId 역인덱스**(SDK 선언상
 *   toolUseId 없음).
 * - kind='notification' → status 갱신(종료/중지 통지).
 * - 미매칭 toolUseId/taskId → no-op(state 그대로, throw 없음) — handleSearchResult와
 *   동일한 견고성 정책(상관 id를 못 실은 이벤트는 조용히 버린다).
 *
 * 기존 status/result는 tool_result 경로 그대로 — bgTask는 표시 보강 전용 부착.
 * 포인터(openMsgId/openGroupId)·seq 불변.
 */
export function handleBgTask(state: AppState, event: BgTaskEvent): AppState {
  if (event.kind === 'started') {
    const targetId = event.toolUseId
    if (!targetId) return state
    const bgTask: BgTaskState = {
      taskId: event.taskId,
      toolUseId: event.toolUseId,
      ...(event.description !== undefined ? { description: event.description } : {}),
      // started에 status 없으면 'running'(비터미널 — 정지 버튼 게이트 정합).
      status: event.status ?? 'running',
      tail: '',
    }
    return updateCardInThread(
      state,
      (card) => card.id === targetId,
      (card) => ({ ...card, bgTask })
    )
  }

  // output/updated/notification — taskId 역인덱스(부착된 bgTask.taskId로 카드를 찾는다).
  const byTaskId = (card: ToolCard): boolean => card.bgTask?.taskId === event.taskId

  if (event.kind === 'output') {
    return updateCardInThread(state, byTaskId, (card) => {
      const bg = card.bgTask as BgTaskState
      let tail = bg.tail + (event.outputChunk ?? '')
      let localCut = false
      if (tail.length > MAX_BG_TAIL_CHARS) {
        // 앞부분 절단 — 최신(뒤쪽) 로그 유지.
        tail = tail.slice(tail.length - MAX_BG_TAIL_CHARS)
        localCut = true
      }
      const truncated = bg.truncated === true || event.outputTruncated === true || localCut
      return {
        ...card,
        bgTask: { ...bg, tail, ...(truncated ? { truncated: true } : {}) },
      }
    })
  }

  // kind='updated'(patch.status) · kind='notification'(status) — status만 갱신.
  const nextStatus = event.kind === 'updated' ? event.patch?.status : event.status
  if (nextStatus === undefined) return state
  return updateCardInThread(state, byTaskId, (card) => ({
    ...card,
    bgTask: { ...(card.bgTask as BgTaskState), status: nextStatus },
  }))
}
