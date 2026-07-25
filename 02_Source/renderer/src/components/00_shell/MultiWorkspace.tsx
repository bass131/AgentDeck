/**
 * MultiWorkspace.tsx — F13 멀티에이전트 워크스페이스 그리드 (조립 셸).
 *
 * 원본 AgentCodeGUI MultiAgent.tsx L1324~1370 시각 셸 이식.
 * Phase 13 분해 후 조립 셸로 슬림화:
 *   - PanelPicker  → ./panel/PanelPicker
 *   - PanelComposer → ./panel/PanelComposer
 *   - PanelView    → ./panel/PanelView (send/abort 직접 위임 — LR3-03: usePanelLoop 훅 폐기)
 *   - useMultiPersist → ../../hooks/useMultiPersist
 *
 * M4-3 23e: 정적 샘플 → 패널별 usePanelSession() 실 실행 배선.
 * - 6개 고정 훅(원본 s0~s5 미러): React 훅 규칙 — 조건/루프 금지.
 * M3 영속: 멀티 워크스페이스 복원/저장 (useMultiPersist 위임).
 * B4 picker 리프팅: picker 상태를 per-slot state로 관리.
 *
 * CRITICAL: renderer untrusted — fs/proc/db/network 직접 호출 0.
 * CRITICAL: 전역 appStore.sendMessage/subscribeAgentEvents 미사용 (패널 훅만).
 */
import { useState, useCallback, useEffect, useRef, type JSX } from 'react'
import { IconGrid, IconFolder, IconChevDown } from '../common/icons'
import { FolderSwitchDialog } from '../02_file/FolderSwitchDialog'
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

// PanelView 하위호환 재익스포트 — 기존 테스트(m3-persist-multiworkspace.test.tsx)가
// MultiWorkspace에서 PanelView를 동적 임포트하므로 이 재익스포트가 필요하다.
export { PanelView } from './panel/PanelView'

// ── 슬롯 인덱스 ──────────────────────────────────────────────────────────────
const SLOTS_ALL = SLOTS // useMultiPersist에서 공유

// ── MultiWorkspace ────────────────────────────────────────────────────────────

export function MultiWorkspace(): JSX.Element {
  // 2단계: 활성 멀티세션 ID — store가 소유(truth). MultiWorkspace는 key로 재마운트됨.
  // Phase 07(LR3): 6훅보다 먼저 읽어 usePanelSlot의 매니저 키(sessionId+slot) 구성에 사용.
  // key={activeMultiSessionId}(Shell.tsx)로 재마운트되므로 이 값은 이 컴포넌트 인스턴스
  // 생애 동안 불변 — usePanelSlot 훅 순서/개수(React 훅 규칙)에 영향 없음.
  const activeMultiSessionId = useAppStore(selectActiveMultiSessionId)

  // ── 6개 고정 훅 (원본 s0~s5 미러) ────────────────────────────────────────
  // CRITICAL: React 훅 규칙 — 조건/루프/함수 내부 호출 금지.
  // count(2~6) 표시와 무관하게 6훅 상주.
  // Phase 07(LR3): usePanelSlot(앱 수명 승격) — MultiWorkspace가 언마운트돼도(모드 전환·
  // 멀티세션 전환) (activeMultiSessionId, slot) 키의 상태·구독은 모듈 스코프 매니저에서
  // 계속 유지된다(단일채팅 bgRuns 패턴 미러 — 01.Phases/switch-continuity/_diagnosis.md 참조).
  const s0 = usePanelSlot(activeMultiSessionId, 0)
  const s1 = usePanelSlot(activeMultiSessionId, 1)
  const s2 = usePanelSlot(activeMultiSessionId, 2)
  const s3 = usePanelSlot(activeMultiSessionId, 3)
  const s4 = usePanelSlot(activeMultiSessionId, 4)
  const s5 = usePanelSlot(activeMultiSessionId, 5)
  const sessions = [s0, s1, s2, s3, s4, s5]

  // 워크스페이스 루트 — 패널 기본 cwd (null이면 send 비활성)
  const workspaceRoot = useAppStore(selectWorkspaceRoot)
  // 프로젝트 파일 목록 (@멘션 팔레트용) — 전역 store에서 구독
  const projectFiles = useAppStore(selectProjectFiles)

  // B8 실배선: OAuth 레이트리밋 게이지(5시간/주간) — 단일채팅과 동일 store.usage 구독.
  const usage = useAppStore(selectUsage)
  const loadUsage = useAppStore((s) => s.loadUsage)

  // ── 영속 상태 위임 (useMultiPersist) ──────────────────────────────────────
  // count / panelMetas / panelCwds / pickers + 마운트 복원 + 디바운스 저장.
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

  // ── UI-only 상태 ──────────────────────────────────────────────────────────
  const [expandedSlot, setExpandedSlot] = useState<number | null>(null)
  const [batchFolderOpen, setBatchFolderOpen] = useState(false)
  const [promptSlot, setPromptSlot] = useState<number | null>(null)

  // ── B8 실배선: usage 게이지 로드 ────────────────────────────────────────────
  // 마운트 시 1회 + 어느 패널이든 run 완료(running true→false) 전이 시 재로드.
  // loadUsage 내부 catch-and-ignore → IPC 실패 시 이전 게이지 유지.
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

  // ── Esc로 확장 패널 닫기 ──────────────────────────────────────────────────
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
    // CRITICAL: window.api.pickFolder(화이트리스트 IPC) 경유 — fs 직접 호출 0.
    try {
      const res = await window.api.pickFolder()
      if (res.path !== null) {
        setPanelCwds((prev) => ({ ...prev, [slot]: res.path }))
      }
    } catch {
      // IPC 실패 graceful 처리 — 컴포넌트 크래시 방지
    }
  }, [setPanelCwds])

  // B4: picker setter per-slot
  const handleSetPicker = useCallback((slot: number, p: PickerState) => {
    setPickers((prev) => {
      const next = [...prev]
      next[slot] = p
      return next
    })
  }, [setPickers])

  // 패널 메타 (M3: 복원 실데이터 우선 — SAMPLE 데이터 참조 0)
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
        {/* ── 헤더 ── */}
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

        {/* ── 그리드 ── */}
        <div
          className="ma-grid scroll"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {SLOTS_ALL.slice(0, count).map((slot) => {
            // 유효 cwd: 패널 개별 선택 우선, 없으면 복원 메타, 없으면 전역 기본
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

      {/* ── 확장 오버레이 (백드롭은 .win-body 전체 덮음) ── */}
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

      {/* ── 일괄 폴더 다이얼로그 (F11 재사용) ── */}
      {batchFolderOpen && (
        <FolderSwitchDialog
          from={''}
          to={SAMPLE_BATCH_TO}
          multi={true}
          onCancel={() => setBatchFolderOpen(false)}
          onConfirm={() => {
            // 일괄 폴더 확인: pickFolder IPC → 모든 패널 cwd 동일 설정
            // CRITICAL: window.api.pickFolder(화이트리스트 IPC) 경유 — fs 직접 호출 0.
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
                // IPC 실패 graceful 처리
              }
            })()
          }}
        />
      )}

      {/* ── 패널 프롬프트 모달 (F11 재사용) ── */}
      {promptSlot !== null && (
        <PromptModal
          target={panelAt(promptSlot).title || '새 작업'}
          scope={`패널 ${promptSlot + 1}에만 적용`}
          noun="패널"
          value={panelMetas[promptSlot]?.sysPrompt ?? ''}
          onSave={(text) => {
            // M3 sysPrompt 배선: 영속 상태(panelMetas)에 저장
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
