import { useState, useCallback, useEffect, useRef, type JSX } from 'react'
import { IconGrid, IconFolder, IconChevDown } from '../common/icons'
import { FolderSwitchDialog } from '../../features/file'
import { PromptModal } from '../06_prompt/PromptModal'
import {
  COLS,
  COUNT_OPTIONS,
  SAMPLE_BATCH_TO,
  type PickerState,
  type SamplePanel,
} from '../../lib/multiAgentSampleData'
import { usePanelSlot } from '../../store/panelSession'
import {
  useAppStore,
  selectWorkspaceRoot,
  selectProjectFiles,
  selectActiveMultiSessionId,
  selectUsage,
} from '../../store/appStore'
import { useMultiPersist, SLOTS } from '../../hooks/useMultiPersist'
import { UsagePill } from './panel/PanelPicker'
import { PanelView } from './panel/PanelView'
import './MultiWorkspace.css'

export { PanelView } from './panel/PanelView'

const SLOTS_ALL = SLOTS

export function MultiWorkspace(): JSX.Element {
  const activeMultiSessionId = useAppStore(selectActiveMultiSessionId)

  const s0 = usePanelSlot(activeMultiSessionId, 0)
  const s1 = usePanelSlot(activeMultiSessionId, 1)
  const s2 = usePanelSlot(activeMultiSessionId, 2)
  const s3 = usePanelSlot(activeMultiSessionId, 3)
  const s4 = usePanelSlot(activeMultiSessionId, 4)
  const s5 = usePanelSlot(activeMultiSessionId, 5)
  const sessions = [s0, s1, s2, s3, s4, s5]

  const workspaceRoot = useAppStore(selectWorkspaceRoot)
  const projectFiles = useAppStore(selectProjectFiles)

  const usage = useAppStore(selectUsage)
  const loadUsage = useAppStore((s) => s.loadUsage)

  const {
    count,
    setCount,
    panelMetas,
    setPanelMetas,
    panelCwds,
    setPanelCwds,
    pickers,
    setPickers,
  } = useMultiPersist(sessions, activeMultiSessionId)

  const [expandedSlot, setExpandedSlot] = useState<number | null>(null)
  const [batchFolderOpen, setBatchFolderOpen] = useState(false)
  const [promptSlot, setPromptSlot] = useState<number | null>(null)

  useEffect(() => {
    void loadUsage()
  }, [loadUsage])

  const anyRunning = sessions.some((s) => s.state.isRunning)
  const prevAnyRunningRef = useRef(false)
  useEffect(() => {
    if (prevAnyRunningRef.current && !anyRunning) {
      void loadUsage()
    }
    prevAnyRunningRef.current = anyRunning
  }, [anyRunning, loadUsage])

  useEffect(() => {
    if (expandedSlot === null) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setExpandedSlot(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expandedSlot])

  const handleExpand = useCallback((slot: number) => {
    setExpandedSlot(slot >= 0 ? slot : null)
  }, [])

  const handlePrompt = useCallback((slot: number) => {
    setPromptSlot(slot)
  }, [])

  const handlePickFolder = useCallback(async (slot: number): Promise<void> => {
    try {
      const res = await window.api.pickFolder()
      if (res.path !== null) {
        setPanelCwds((prev) => ({ ...prev, [slot]: res.path }))
      }
    } catch {
    }
  }, [setPanelCwds])

  const handleSetPicker = useCallback((slot: number, p: PickerState) => {
    setPickers((prev) => {
      const next = [...prev]
      next[slot] = p
      return next
    })
  }, [setPickers])

  const panelAt = (slot: number): SamplePanel => {
    const meta = panelMetas[slot]
    return {
      title: meta?.title ?? '',
      status: 'idle',
      cwd: meta?.cwd ?? '',
      ctxPct: 0,
      sysPrompt: meta?.sysPrompt,
    }
  }

  const cols = COLS[count] ?? 2

  return (
    <>
      <section className="multi">
        <div className="ma-head">
          <span className="ma-head-ic" aria-hidden="true">
            <IconGrid size={17} />
          </span>
          <span className="ma-head-title">멀티 에이전트</span>
          <span className="ma-spacer" />
          <button
            type="button"
            className="ma-batch"
            title="모든 패널 작업 폴더 설정"
            onClick={() => setBatchFolderOpen(true)}
          >
            <IconFolder size={14} />
            <span>일괄 폴더</span>
            <IconChevDown size={11} />
          </button>
          <UsagePill label="5시간 한도" pct={usage.fiveHour?.pct ?? null} />
          <UsagePill label="주간 한도" pct={usage.weekly?.pct ?? null} />
          <div className="ma-count" role="tablist" aria-label="패널 수">
            {COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={count === n}
                className={`ma-count-btn${count === n ? ' on' : ''}`}
                onClick={() => setCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div
          className="ma-grid scroll"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {SLOTS_ALL.slice(0, count).map((slot) => {
            const effectiveCwd = panelCwds[slot] ?? panelMetas[slot]?.cwd ?? workspaceRoot
            return expandedSlot === slot ? (
              <div key={slot} className="ma-panel ma-placeholder" />
            ) : (
              <PanelView
                key={slot}
                slot={slot}
                panel={panelAt(slot)}
                session={sessions[slot]}
                workspaceRoot={effectiveCwd}
                expanded={false}
                onExpand={handleExpand}
                onPrompt={handlePrompt}
                onPickFolder={handlePickFolder}
                picker={pickers[slot]}
                setPicker={(p) => handleSetPicker(slot, p)}
                mentionFiles={projectFiles}
              />
            )
          })}
        </div>
      </section>

      {expandedSlot !== null && (
        <div
          className="ma-expand-overlay"
          onMouseDown={() => setExpandedSlot(null)}
          data-testid="ma-expand-overlay"
        >
          <div
            className="ma-expand-card"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <PanelView
              slot={expandedSlot}
              panel={panelAt(expandedSlot)}
              session={sessions[expandedSlot]}
              workspaceRoot={panelCwds[expandedSlot] ?? panelMetas[expandedSlot]?.cwd ?? workspaceRoot}
              expanded={true}
              onExpand={handleExpand}
              onPrompt={handlePrompt}
              onPickFolder={handlePickFolder}
              picker={pickers[expandedSlot]}
              setPicker={(p) => handleSetPicker(expandedSlot, p)}
              mentionFiles={projectFiles}
            />
          </div>
        </div>
      )}

      {batchFolderOpen && (
        <FolderSwitchDialog
          from={''}
          to={SAMPLE_BATCH_TO}
          multi={true}
          onCancel={() => setBatchFolderOpen(false)}
          onConfirm={() => {
            setBatchFolderOpen(false)
            void (async () => {
              try {
                const res = await window.api.pickFolder()
                if (res.path !== null) {
                  const batchCwds: Record<number, string | null> = {}
                  for (let i = 0; i < 6; i++) {
                    batchCwds[i] = res.path
                  }
                  setPanelCwds(batchCwds)
                }
              } catch {
              }
            })()
          }}
        />
      )}

      {promptSlot !== null && (
        <PromptModal
          target={panelAt(promptSlot).title || '새 작업'}
          scope={`패널 ${promptSlot + 1}에만 적용`}
          noun="패널"
          value={panelMetas[promptSlot]?.sysPrompt ?? ''}
          onSave={(text) => {
            setPanelMetas((prev) => {
              const next = [...prev]
              next[promptSlot] = { ...next[promptSlot], sysPrompt: text }
              return next
            })
          }}
          onClose={() => setPromptSlot(null)}
        />
      )}
    </>
  )
}

export default MultiWorkspace
