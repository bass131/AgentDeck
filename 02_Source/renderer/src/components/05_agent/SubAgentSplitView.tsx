import { memo, useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { PaneSplitter } from '../../features/shell'
import AgentPanel from './AgentPanel'
import SubAgentCell from './SubAgentCell'
import { IconGrid, IconList } from '../common/icons'
import type { SubAgentInfo } from '../../lib/agentSampleData'
import {
  CLOSE_LINGER_MS,
  applySubagents,
  computeColumns,
  emptySplitView,
  noteActivity,
  toggleCell,
  type SplitViewState,
} from '../../lib/splitView'
import { loadPaneWidth } from '../../lib/paneResize'
import { useAppStore, selectSubagents } from '../../store/appStore'
import './SubAgentSplitView.css'

const SPLIT_W_VAR = '--split-w'
const SPLIT_W_KEY = 'splitW'

const MemoCell = memo(SubAgentCell)

export function SubAgentSplitView(): JSX.Element {
  const subagents = useAppStore(selectSubagents)
  const [split, setSplit] = useState<SplitViewState>(emptySplitView)
  const [showPanel, setShowPanel] = useState(false)

  const subagentsRef = useRef(subagents)
  const lastSeenRef = useRef(new Map<string, SubAgentInfo>())
  const toggleHandlersRef = useRef(new Map<string, () => void>())

  useEffect(() => {
    subagentsRef.current = subagents
    const now = Date.now()
    setSplit((prev) => applySubagents(prev, subagents, now))
    for (const a of subagents) {
      const seen = lastSeenRef.current.get(a.id)
      if (seen === a) continue
      lastSeenRef.current.set(a.id, a)
      if (a.status === 'running') {
        setSplit((s) => noteActivity(s, a.id, now))
      }
    }
    const ids = new Set(subagents.map((a) => a.id))
    for (const id of lastSeenRef.current.keys()) {
      if (!ids.has(id)) lastSeenRef.current.delete(id)
    }
    for (const id of toggleHandlersRef.current.keys()) {
      if (!ids.has(id)) toggleHandlersRef.current.delete(id)
    }
  }, [subagents])

  useEffect(() => {
    let target = Infinity
    for (const c of split.cells) {
      if (c.doneAt !== undefined) target = Math.min(target, c.doneAt + CLOSE_LINGER_MS)
    }
    if (!Number.isFinite(target)) return
    const timer = setTimeout(
      () => {
        setSplit((prev) => applySubagents(prev, subagentsRef.current, Math.max(Date.now(), target)))
      },
      Math.max(0, target - Date.now())
    )
    return () => clearTimeout(timer)
  }, [split])

  const hasCells = split.cells.length > 0

  useEffect(() => {
    if (!hasCells) {
      setShowPanel(false)
      return
    }
    const saved = loadPaneWidth(SPLIT_W_KEY, 0)
    if (saved > 0) {
      document.documentElement.style.setProperty(SPLIT_W_VAR, `${saved}px`)
    }
  }, [hasCells])

  const getToggleHandler = useCallback((id: string): (() => void) => {
    let handler = toggleHandlersRef.current.get(id)
    if (!handler) {
      handler = () => setSplit((s) => toggleCell(s, id))
      toggleHandlersRef.current.set(id, handler)
    }
    return handler
  }, [])

  if (!hasCells) {
    return (
      <>
        <PaneSplitter />
        <aside className="pane agent">
          <AgentPanel />
        </aside>
      </>
    )
  }

  const byId = new Map(subagents.map((a) => [a.id, a] as const))
  const columns = computeColumns(split)
  const queueEntries = split.queue.map((id) => {
    const info = byId.get(id)
    return { id, label: info ? (info.displayName ?? info.name) : id }
  })

  return (
    <>
      <PaneSplitter
        cssVar={SPLIT_W_VAR}
        storageKey={SPLIT_W_KEY}
        minWidth={392}
        maxWidth={1280}
        fallbackWidth={640}
        maxViewportRatio={0.7}
        ariaLabel="분할 그리드 너비 조절"
      />
      <aside className="pane agent sag-split">
        <div className="sag-head">
          <span className="sag-count">동시 표시 {split.cells.length}</span>
          <span className="sag-spacer" />
          <button
            type="button"
            className="sag-view-btn"
            aria-label={showPanel ? '분할 그리드 보기' : '상태 패널 보기'}
            aria-pressed={showPanel}
            onClick={() => setShowPanel((v) => !v)}
          >
            {showPanel ? <IconGrid size={14} /> : <IconList size={14} />}
          </button>
        </div>

        {queueEntries.length > 0 && (
          <div className="sag-queue" aria-label="표시 대기 목록">
            <span className="sag-queue-label">대기 {queueEntries.length}</span>
            {queueEntries.map((q) => (
              <span className="sag-queue-tab" key={q.id} title={q.label}>
                {q.label}
              </span>
            ))}
          </div>
        )}

        {showPanel ? (
          <AgentPanel />
        ) : (
          <div className="sag-grid">
            {columns.map((column, colIdx) => (
              <div className="sag-col" key={colIdx}>
                {column.map((cell) => {
                  const agent = byId.get(cell.id)
                  if (!agent) return null
                  const isActive = cell.id === split.activeId && !cell.disabled
                  return (
                    <div
                      className={'sag-cell' + (isActive ? ' sag-cell--active' : '')}
                      key={cell.id}
                    >
                      <MemoCell
                        agent={agent}
                        disabled={cell.disabled}
                        onToggle={getToggleHandler(cell.id)}
                      />
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </aside>
    </>
  )
}

export default SubAgentSplitView
