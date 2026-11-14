import { useState, useCallback, useEffect, useRef, type JSX } from 'react'
import { IconGrid, IconFolder, IconChevDown } from '@renderer/02_Common/icons'
import { FolderSwitchDialog, type FolderSwitchMessage } from '@renderer/07_Workspace/file'
import { PromptModal } from '@renderer/03_Agent/prompt'
import {
  COLS,
  COUNT_OPTIONS,
  SAMPLE_BATCH_TO,
  type PickerState,
  type SamplePanel,
} from '@renderer/03_Agent/multiAgentDefaults'
import { usePanelSlot } from '@renderer/03_Agent/state/panelSession'
import {
  useAppStore,
  selectWorkspaceRoot,
  selectProjectFiles,
  selectActiveMultiSessionId,
  selectUsage,
} from '@renderer/00_App/appStore'
import { useMultiPersist, SLOTS } from '@renderer/06_Sessions/hooks/useMultiPersist'
import { UsagePill } from './UsagePill'
import { PanelView } from '@renderer/05_Conversation/PanelView'
import './MultiWorkspace.css'

export { PanelView } from '@renderer/05_Conversation/PanelView'

const SLOTS_ALL = SLOTS

// 일괄 폴더 변경 창의 패널 문구 — 폴더 변경 창 본문은 호출부가 넘긴다(G9c, 옛 multi prop).
const batchFolderMessage: FolderSwitchMessage = ({ to }) => (
  <>
    모든 패널의 작업 폴더가 <b>{to}</b>(으)로 바뀝니다. 대화가 진행 중인 패널은 내용이
    지워지고 새 대화로 시작됩니다.
  </>
)

// 펼침 닫기 Esc가 양보하는 질문 UI — QuestionModal의 창과 내려둔 pill.
const QUESTION_UI_SELECTOR = '.q-overlay, .q-mini-pill'

// 질문 창은 창 전역 keydown으로 답을 받으므로 작업 공간 전체에서 하나만 띄운다(G9b 검수 차단 1).
// 펼침이 있으면 펼친 패널의 질문만 — 격자 패널은 펼침에 가려 보이지 않으므로 펼침이 닫힐 때까지 미룬다.
// 펼침이 없으면 지금 키를 받는 슬롯(current)을 그 질문이 남아 있는 동안 유지하고 — 낮은 번호 패널의 새 질문이
// 열린 창·단계·직접 입력을 가로채지 않게(재검수 중요 1) — 그 질문이 끝나면 패널 순서로 다음 질문.
// 나머지는 패널 머리의 「질문 대기」로 기다린다.
export function pickQuestionSlot(
  pendingSlots: readonly number[],
  expandedSlot: number | null,
  current: number | null,
): number | null {
  if (expandedSlot !== null) return pendingSlots.includes(expandedSlot) ? expandedSlot : null
  if (current !== null && pendingSlots.includes(current)) return current
  return pendingSlots.length > 0 ? Math.min(...pendingSlots) : null
}

export interface MultiWorkspaceProps {
  // 패널 /ask(L2·C7)와 첨부 이미지 뷰어(C4) — 단일과 같은 Shell 창을 연다.
  onSlashAsk?: () => void
  onOpenImage?: (images: string[], index: number) => void
}

export function MultiWorkspace({ onSlashAsk, onOpenImage }: MultiWorkspaceProps = {}): JSX.Element {
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
        // 질문 창·내려둔 pill이 떠 있으면 Esc는 질문 창 쪽(내려두기·건너뛰기)만 한다(재검수 중요 2).
        if (document.querySelector(QUESTION_UI_SELECTOR)) return
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

  // 직전 커밋에서 키를 받던 슬롯 — 렌더마다 다시 고르되 이 슬롯의 질문이 남아 있으면 유지한다.
  const questionSlotRef = useRef<number | null>(null)
  const questionSlot = pickQuestionSlot(
    SLOTS_ALL.slice(0, count).filter((slot) => !!sessions[slot].state.pendingQuestion),
    expandedSlot,
    questionSlotRef.current,
  )
  useEffect(() => {
    questionSlotRef.current = questionSlot
  }, [questionSlot])

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
                questionActive={questionSlot === slot}
                onExpand={handleExpand}
                onPrompt={handlePrompt}
                onPickFolder={handlePickFolder}
                picker={pickers[slot]}
                setPicker={(p) => handleSetPicker(slot, p)}
                mentionFiles={projectFiles}
                onSlashAsk={onSlashAsk}
                onOpenImage={onOpenImage}
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
              questionActive={questionSlot === expandedSlot}
              onExpand={handleExpand}
              onPrompt={handlePrompt}
              onPickFolder={handlePickFolder}
              picker={pickers[expandedSlot]}
              setPicker={(p) => handleSetPicker(expandedSlot, p)}
              mentionFiles={projectFiles}
              onSlashAsk={onSlashAsk}
              onOpenImage={onOpenImage}
            />
          </div>
        </div>
      )}

      {batchFolderOpen && (
        <FolderSwitchDialog
          from={''}
          to={SAMPLE_BATCH_TO}
          message={batchFolderMessage}
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
