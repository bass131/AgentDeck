export const MAX_CELLS = 6
export const CLOSE_LINGER_MS = 4000

export interface SplitViewCell {
  id: string
  disabled: boolean
  doneAt?: number
}

export interface SplitViewState {
  cells: SplitViewCell[]
  queue: string[]
  activeId: string | null
}

export interface SplitViewSubagent {
  id: string
  status: 'queued' | 'running' | 'done'
}

export function emptySplitView(): SplitViewState {
  return { cells: [], queue: [], activeId: null }
}

function sameState(prev: SplitViewState, cells: SplitViewCell[], queue: string[], activeId: string | null): boolean {
  return (
    activeId === prev.activeId &&
    cells.length === prev.cells.length &&
    cells.every((c, i) => c === prev.cells[i]) &&
    queue.length === prev.queue.length &&
    queue.every((id, i) => id === prev.queue[i])
  )
}

export function applySubagents(
  prev: SplitViewState,
  subagents: readonly SplitViewSubagent[],
  now: number
): SplitViewState {
  const statusById = new Map<string, SplitViewSubagent['status']>()
  for (const s of subagents) statusById.set(s.id, s.status)

  const cells: SplitViewCell[] = []
  for (const cell of prev.cells) {
    const status = statusById.get(cell.id)
    if (status === undefined) continue
    const observed =
      status === 'done' && cell.doneAt === undefined ? { ...cell, doneAt: now } : cell
    if (observed.doneAt !== undefined && now >= observed.doneAt + CLOSE_LINGER_MS) continue
    cells.push(observed)
  }

  const queue = prev.queue.filter((id) => {
    const status = statusById.get(id)
    return status !== undefined && status !== 'done'
  })

  let promoted = 0
  while (cells.length < MAX_CELLS && promoted < queue.length) {
    cells.push({ id: queue[promoted], disabled: false })
    promoted += 1
  }
  const restQueue = queue.slice(promoted)

  const assigned = new Set<string>()
  for (const c of cells) assigned.add(c.id)
  for (const id of restQueue) assigned.add(id)
  for (const s of subagents) {
    if (assigned.has(s.id) || s.status === 'done') continue
    assigned.add(s.id)
    if (cells.length < MAX_CELLS) cells.push({ id: s.id, disabled: false })
    else restQueue.push(s.id)
  }

  const activeId =
    prev.activeId !== null && cells.some((c) => c.id === prev.activeId) ? prev.activeId : null

  if (sameState(prev, cells, restQueue, activeId)) return prev
  return { cells, queue: restQueue, activeId }
}

export function noteActivity(state: SplitViewState, id: string, _now: number): SplitViewState {
  if (state.activeId === id) return state
  if (!state.cells.some((c) => c.id === id)) return state
  return { ...state, activeId: id }
}

export function toggleCell(state: SplitViewState, id: string): SplitViewState {
  const idx = state.cells.findIndex((c) => c.id === id)
  if (idx === -1) return state
  const cells = state.cells.slice()
  cells[idx] = { ...cells[idx], disabled: !cells[idx].disabled }
  return { ...state, cells }
}

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
