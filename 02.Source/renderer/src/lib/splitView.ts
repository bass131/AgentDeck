/**
 * splitView.ts — SubAgent 스플릿 뷰 배정 정책 순수 함수 (GAP1 P14 (b)).
 *
 * 계약 정본 = 99.Others/tests/renderer/gap1-p14-splitview-policy.test.ts (커밋 e3030cf).
 * 스펙 배경 = 01.Phases/17_GAP1-core-parity/14-subagent-split-view.md §📐 (영호 확정 2026-07-14).
 *
 * 정책 요지:
 *  - 배치: 배정 순서 = 슬롯 순서. index 0..2 = 컬럼1(위→아래), 3..5 = 컬럼2. 상한 MAX_CELLS=6.
 *    스냅샷 재적용은 재구축이 아니라 병합 — 기존 셀의 슬롯 순서·disabled·doneAt을 보존한다.
 *  - 대기열: 상한 초과분은 queue(FIFO). 셀 소멸·만료로 생긴 빈 슬롯 수만큼 선두부터 승격.
 *  - 자동닫기(린저): done 전이 관측 시 doneAt=now 기록(즉시 제거 X — 잠시 표시),
 *    now >= doneAt + CLOSE_LINGER_MS 재적용 시 제거 → queue 승격(재배치). doneAt은 최초
 *    관측 시각으로 고정(재적용에도 갱신 X — 린저 창 결정론).
 *  - 활성확대: activeId 셀만 ACTIVE_WEIGHT, 나머지 1. disabled 셀은 확대 제외(표시 정지
 *    상태 확대는 거짓 신호). 컬럼에 1개뿐이면 [1] 고정(상대 가중치 — 전체 높이 동일).
 *  - [계약 보완 — 테스트 헤더 확정] ① 신규 id가 이미 done이면 배정하지 않는다(린저 만료
 *    제거 후 무한 누적 입력에 남은 done id의 add/remove 플랩 방지 — 닫힘 이력 필드 없이
 *    성립). ② queue 대기 중 done 전이 → queue에서 즉시 제거(표시된 적 없어 린저 대상 아님).
 *    ③ 린저 만료 제거 셀이 activeId면 activeId=null(댕글링 참조 방지 — 소멸 정리와 동일).
 *
 * CRITICAL: 순수 함수 — Date.now/DOM/window/store 접근 0, 시간은 now(ms) 파라미터 주입.
 * 입력(state·subagents) 불변 — 변경 시 새 참조 반환, 의미 무변경이면 prev 참조 그대로 반환
 * (store 셀렉터/React 리렌더 최소화).
 */

/** 동시 표시 상한 — 2컬럼 × 컬럼당 3행. */
export const MAX_CELLS = 6
/** 컬럼당 최대 행 수 — 컬럼1 = cells[0..2], 컬럼2 = cells[3..5]. */
const ROWS_PER_COLUMN = 3
/** done 전이 관측 후 셀이 잠시 표시되는 시간(ms) — 경과 후 재적용 시 제거·승격. */
export const CLOSE_LINGER_MS = 4000
/** 활성(스트림 흐르는) 셀의 세로 가중치 — 나머지는 1. */
export const ACTIVE_WEIGHT = 2

/** 스플릿 뷰 셀 1개 — 표시 중인 SubAgent 슬롯. */
export interface SplitViewCell {
  id: string
  /** 사용자 토글로 표시 정지된 셀 — 활성 확대 제외. */
  disabled: boolean
  /** done 전이 최초 관측 시각(ms) — 미완료면 undefined. 린저 창 기준점(고정). */
  doneAt?: number
}

export interface SplitViewState {
  /** 표시 중 셀 — 배정 순서 = 슬롯 순서(index 0..2 컬럼1, 3..5 컬럼2). */
  cells: SplitViewCell[]
  /** 상한 초과 대기열 — 도착 순서 FIFO, 빈 슬롯 발생 시 선두부터 승격. */
  queue: string[]
  /** 최근 스트림 활동 셀 id — 자동 확대 대상. 표시 중 셀만 가리킨다(댕글링 금지). */
  activeId: string | null
}

/** applySubagents 입력 최소 셰이프 — shared SubAgentInfo(status 동일 유니온)가 그대로 대입 가능. */
export interface SplitViewSubagent {
  id: string
  status: 'queued' | 'running' | 'done'
}

/** 초기 상태 — 셀·대기열 없음, 활성 없음. */
export function emptySplitView(): SplitViewState {
  return { cells: [], queue: [], activeId: null }
}

/** 두 상태가 의미상 동일한지 — 동일하면 prev 참조를 그대로 반환해 리렌더를 아낀다. */
function sameState(prev: SplitViewState, cells: SplitViewCell[], queue: string[], activeId: string | null): boolean {
  return (
    activeId === prev.activeId &&
    cells.length === prev.cells.length &&
    cells.every((c, i) => c === prev.cells[i]) &&
    queue.length === prev.queue.length &&
    queue.every((id, i) => id === prev.queue[i])
  )
}

/**
 * applySubagents — 무한 누적 SubAgent 스냅샷을 유한 슬롯 상태에 병합(핵심 리듀서).
 *
 * 순서: (1) 셀 정리 — 소멸 제거·done 최초 관측 doneAt 기록·린저 만료 제거 →
 * (2) queue 정리 — 소멸·done 즉시 제거 → (3) 빈 슬롯만큼 queue 선두 승격(FIFO) →
 * (4) 신규 배정 — 미배정 id를 스냅샷 순서대로 셀(여유 시)/queue(초과 시)에, done은 제외 →
 * (5) activeId 검증 — 제거된 셀을 가리키면 null.
 */
export function applySubagents(
  prev: SplitViewState,
  subagents: readonly SplitViewSubagent[],
  now: number
): SplitViewState {
  const statusById = new Map<string, SplitViewSubagent['status']>()
  for (const s of subagents) statusById.set(s.id, s.status)

  // (1) 셀 정리 — 소멸 제거 · done 최초 관측 기록 · 린저 만료 제거. 무변경 셀은 참조 보존.
  const cells: SplitViewCell[] = []
  for (const cell of prev.cells) {
    const status = statusById.get(cell.id)
    if (status === undefined) continue // 입력에서 소멸 → 즉시 제거
    const observed =
      status === 'done' && cell.doneAt === undefined ? { ...cell, doneAt: now } : cell
    if (observed.doneAt !== undefined && now >= observed.doneAt + CLOSE_LINGER_MS) continue // 린저 만료
    cells.push(observed)
  }

  // (2) queue 정리 — 소멸 + done 즉시 제거([계약 보완] ② — 표시된 적 없어 린저 대상 아님).
  const queue = prev.queue.filter((id) => {
    const status = statusById.get(id)
    return status !== undefined && status !== 'done'
  })

  // (3) 빈 슬롯 수만큼 queue 선두부터 승격(FIFO) — 승격 셀은 말미에 신규 기본값으로.
  let promoted = 0
  while (cells.length < MAX_CELLS && promoted < queue.length) {
    cells.push({ id: queue[promoted], disabled: false })
    promoted += 1
  }
  const restQueue = queue.slice(promoted)

  // (4) 신규 배정 — done인 신규 id는 배정하지 않음([계약 보완] ① — add/remove 플랩 방지).
  const assigned = new Set<string>()
  for (const c of cells) assigned.add(c.id)
  for (const id of restQueue) assigned.add(id)
  for (const s of subagents) {
    if (assigned.has(s.id) || s.status === 'done') continue
    assigned.add(s.id)
    if (cells.length < MAX_CELLS) cells.push({ id: s.id, disabled: false })
    else restQueue.push(s.id)
  }

  // (5) activeId 검증 — 이번 병합에서 제거된 셀을 가리키면 null(댕글링 참조 방지).
  const activeId =
    prev.activeId !== null && cells.some((c) => c.id === prev.activeId) ? prev.activeId : null

  if (sameState(prev, cells, restQueue, activeId)) return prev
  return { cells, queue: restQueue, activeId }
}

/**
 * noteActivity — 셀에 스트림 활동 관측 → activeId 갱신(자동 확대 트리거).
 * 표시 중 셀만 대상 — queue 소속·미존재 id는 무시(상태 그대로 반환).
 * now는 계약상 주입되는 관측 시각(현 정책은 미사용 — 향후 활동 감쇠 확장용 자리).
 */
export function noteActivity(state: SplitViewState, id: string, _now: number): SplitViewState {
  if (state.activeId === id) return state
  if (!state.cells.some((c) => c.id === id)) return state
  return { ...state, activeId: id }
}

/**
 * toggleCell — 셀 표시 활성/비활성 반전(disabled만 반전 — activeId 무접촉).
 * 미존재 id는 무시(상태 그대로 반환).
 */
export function toggleCell(state: SplitViewState, id: string): SplitViewState {
  const idx = state.cells.findIndex((c) => c.id === id)
  if (idx === -1) return state
  const cells = state.cells.slice()
  cells[idx] = { ...cells[idx], disabled: !cells[idx].disabled }
  return { ...state, cells }
}

/**
 * computeColumns — cells를 렌더용 컬럼 배열로 분해.
 * 컬럼1 = cells[0..2](위→아래), 컬럼2 = cells[3..5]. 빈 컬럼은 반환하지 않는다
 * (3개 이하 = 컬럼 1개, 4번째는 컬럼2 혼자 = 큰 세로창).
 */
export function computeColumns(state: SplitViewState): SplitViewCell[][] {
  const columns: SplitViewCell[][] = []
  for (let start = 0; start < state.cells.length; start += ROWS_PER_COLUMN) {
    columns.push(state.cells.slice(start, start + ROWS_PER_COLUMN))
  }
  return columns
}

/**
 * rowWeights — 한 컬럼의 세로 가중치(상대값 — fr 단위 등으로 소비).
 * 활성(activeId)·비disabled 셀만 ACTIVE_WEIGHT, 나머지 1.
 * 컬럼에 1개뿐이면 [1] 고정 — 상대 가중치라 전체 높이는 동일하지만 계약이 [1]로 고정한다.
 */
export function rowWeights(column: readonly SplitViewCell[], activeId: string | null): number[] {
  if (column.length <= 1) return column.map(() => 1)
  return column.map((c) => (c.id === activeId && !c.disabled ? ACTIVE_WEIGHT : 1))
}
