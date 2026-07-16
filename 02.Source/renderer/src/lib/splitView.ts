/**
 * splitView.ts — SubAgent 스플릿 뷰 배정 정책 순수 함수 (GAP1 P14 (b), TG1 P08 정본 교체).
 *
 * 계약 정본 = 99.Others/tests/renderer/gap1-p14-splitview-policy.test.ts — **옛 계약 유지
 * 금지**, TG1 P08 개정판(영호 육안 피드백 2026-07-17)이 현재 정본이다.
 * 스펙 배경 = 01.Phases/18_TG1-thinking-gui/08-split-equal-zigzag.md §📐.
 *
 * 정책 요지:
 *  - 배치: 배정 순서 = 슬롯 순서(스냅샷 순서 그대로, 재정렬 X). 상한 MAX_CELLS=6.
 *    스냅샷 재적용은 재구축이 아니라 병합 — 기존 셀의 슬롯 순서·disabled·doneAt을 보존한다.
 *  - 대기열: 상한 초과분은 queue(FIFO). 셀 소멸·만료로 생긴 빈 슬롯 수만큼 선두부터 승격.
 *  - 자동닫기(린저): done 전이 관측 시 doneAt=now 기록(즉시 제거 X — 잠시 표시),
 *    now >= doneAt + CLOSE_LINGER_MS 재적용 시 제거 → queue 승격(재배치). doneAt은 최초
 *    관측 시각으로 고정(재적용에도 갱신 X — 린저 창 결정론).
 *  - 지그재그 스태킹(computeColumns): 짝수 index(0,2,4..)=좌 컬럼, 홀수 index(1,3,5..)=우
 *    컬럼. 셀 1개면 컬럼 1개(전폭 — 지그재그 미진입), 0개면 컬럼 0개.
 *  - 균등 크기(옛 활성확대 폐기): 이 모듈은 셀 크기를 다루지 않는다 — 항상 1:1이 계약이고
 *    소비처 CSS(`.sag-cell{flex:1 1 0}`)가 담당한다. activeId 기반 확대 가중치 함수
 *    (구 rowWeights/ACTIVE_WEIGHT)는 계약에서 완전히 제거됐다 — 재도입 금지.
 *  - activeId/noteActivity는 존속하되 목적이 바뀐다: 더는 "확대 대상"이 아니라 소비처
 *    (컨테이너)가 "정적 하이라이트"(테두리/헤더 점등, 크기 불변)로 소비하는 참조일 뿐이다.
 *  - [계약 보완 — 테스트 헤더 확정] ① 신규 id가 이미 done이면 배정하지 않는다(린저 만료
 *    제거 후 무한 누적 입력에 남은 done id의 add/remove 플랩 방지 — 닫힘 이력 필드 없이
 *    성립). ② queue 대기 중 done 전이 → queue에서 즉시 제거(표시된 적 없어 린저 대상 아님).
 *    ③ 린저 만료 제거 셀이 activeId면 activeId=null(댕글링 참조 방지 — 소멸 정리와 동일).
 *
 * CRITICAL: 순수 함수 — Date.now/DOM/window/store 접근 0, 시간은 now(ms) 파라미터 주입.
 * 입력(state·subagents) 불변 — 변경 시 새 참조 반환, 의미 무변경이면 prev 참조 그대로 반환
 * (store 셀렉터/React 리렌더 최소화).
 */

/** 동시 표시 상한 — 지그재그 2컬럼 × 컬럼당 3행. */
export const MAX_CELLS = 6
/** done 전이 관측 후 셀이 잠시 표시되는 시간(ms) — 경과 후 재적용 시 제거·승격. */
export const CLOSE_LINGER_MS = 4000

/** 스플릿 뷰 셀 1개 — 표시 중인 SubAgent 슬롯. */
export interface SplitViewCell {
  id: string
  /** 사용자 토글로 표시 정지된 셀 — 정적 하이라이트 대상에서도 제외(소비처 재량). */
  disabled: boolean
  /** done 전이 최초 관측 시각(ms) — 미완료면 undefined. 린저 창 기준점(고정). */
  doneAt?: number
}

export interface SplitViewState {
  /** 표시 중 셀 — 배정 순서 = 슬롯 순서(computeColumns가 지그재그로 좌우 분해). */
  cells: SplitViewCell[]
  /** 상한 초과 대기열 — 도착 순서 FIFO, 빈 슬롯 발생 시 선두부터 승격. */
  queue: string[]
  /** 최근 스트림 활동 셀 id — 정적 하이라이트 대상(크기 불변). 표시 중 셀만 가리킨다(댕글링 금지). */
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
 * noteActivity — 셀에 스트림 활동 관측 → activeId 갱신(정적 하이라이트 트리거).
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
 * computeColumns — cells를 렌더용 컬럼 배열로 분해(지그재그 스태킹).
 * 짝수 index(0,2,4..)=좌 컬럼, 홀수 index(1,3,5..)=우 컬럼. 우 컬럼이 비면(cells<=1)
 * 컬럼 1개만 반환(전폭 — 지그재그 미진입). cells가 비면 컬럼 0개.
 * 셀 크기는 이 함수의 관심사가 아니다 — 균등(1:1)은 소비처 CSS가 담당(계약 상단 주석).
 */
export function computeColumns(state: SplitViewState): SplitViewCell[][] {
  const left: SplitViewCell[] = []
  const right: SplitViewCell[] = []
  state.cells.forEach((cell, i) => {
    const column = i % 2 === 0 ? left : right
    column.push(cell)
  })
  if (left.length === 0) return []
  return right.length > 0 ? [left, right] : [left]
}
