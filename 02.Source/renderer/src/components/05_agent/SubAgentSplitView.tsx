/**
 * SubAgentSplitView.tsx — 단일채팅모드 우측 도크: AgentPanel ↔ SubAgent 스플릿 그리드 분기
 * (GAP1 P14 sub-C 최종 조립).
 *
 * Shell 우측(기존 AgentPanel 392px 자리)을 소유하는 컨테이너. store `state.subagents`
 * (무한 누적 스냅샷)를 lib/splitView.ts 순수 정책(계약 정본 = gap1-p14-splitview-policy
 * .test.ts)에 병합해 유한 슬롯 상태(SplitViewState)를 유지하고, 완성된 SubAgentCell을
 * 배선한다. **비순수 계층은 여기만** — Date.now/setTimeout은 이 컨테이너가 주입하고,
 * 정책 함수는 now(ms) 파라미터로만 시간을 본다(결정론 테스트 보존).
 *
 * 분기(§📐 6): 표시할 셀이 0이면 기존과 문자 그대로 동일한 DOM(PaneSplitter +
 * .pane.agent > AgentPanel — components.test.tsx·e2e 소비 계약 보존, 현행 무회귀).
 * 셀이 생기면 우측이 스플릿 그리드로 전환:
 *   - 헤더 스트립: 표시 수 + 대기열 수 + **보기 전환 토글**(분할 그리드 ↔ 상태 패널 —
 *     그리드 점유 중에도 AgentPanel(할 일·변경 파일)에 접근할 수단. 셀이 전부 사라지면
 *     오버라이드는 리셋 — 다음 배치는 다시 그리드 우선).
 *   - 대기열 탭(§📐 3): queue id들의 표시명 나열 — **표시 전용**(수동 승격은 스펙
 *     미정의라 발명하지 않음, 상호작용 요소 0).
 *   - 그리드(§📐 1·2, TG1 P08 개정): computeColumns 출력 그대로 — 짝수 index=좌 컬럼,
 *     홀수 index=우 컬럼(지그재그), 컬럼 안 셀 세로 스택. 크기는 항상 균등(CSS
 *     `.sag-cell{flex:1 1 0}`, 인라인 flexGrow 없음 — 옛 활성확대 계약 폐기). activeId는
 *     정적 하이라이트 클래스(`.sag-cell--active`)로만 소비 — reflow 없는 테두리/헤더 점등.
 *   - 폭: PaneSplitter 재사용(--split-w/splitW — 392px 고정보다 넓게, localStorage 복원).
 *
 * 활동 감지(§📐 2): reducer가 갱신된 서브에이전트만 새 객체로 교체(map)하므로
 * **참조 비교**(AgentPanel lastSeenRef 선례 계승)로 "이번 스냅샷에서 갱신된 항목"을
 * 식별 — running 항목의 참조 변경 = 스트림 활동 → noteActivity. done 전이·완료 항목,
 * disabled(표시 정지) 항목은 하이라이트하지 않는다(정지 상태 강조는 거짓 신호).
 *
 * 자동 닫기(§📐 4): 정책이 doneAt만 기록 — 컨테이너가 min(doneAt+CLOSE_LINGER_MS)에
 * 맞춘 단일 setTimeout으로 재평가를 구동한다. 발화 시 now=max(Date.now(), 목표시각)로
 * 주입해 타이머 지터(1~2ms 이른 발화)에도 만료 판정이 결정론적으로 성립 — 만료 셀이
 * 반드시 제거되므로 상태가 변하고, 효과가 다음 만료를 재예약한다(체인).
 *
 * 성능: SubAgentCell을 memo로 감싸고 셀별 onToggle을 id 고정 핸들러 맵으로 안정화 —
 * 6셀 동시 스트리밍에서 갱신된 셀만 재렌더(참조 불변 셀은 skip, 60fps 목표).
 *
 * P14 비범위(함정): 셀별 입력·개별 abort·세션 조작 없음 — 표시 전용. AgentPanel의
 * hiddenIds 2초 정리 메커니즘은 별개 정책(불간섭).
 * CRITICAL: renderer untrusted — window.api/fs/Node 직접 0(이 컨테이너는 IPC 신규 0).
 * 인라인 색상 0(크기 인라인도 0 — 균등은 CSS `.sag-cell{flex:1 1 0}`, 하이라이트는 클래스).
 * CRITICAL(ADR-003): 'Agent'/'Task'/'Workflow' 리터럴 0 — 중립 표현만.
 */
import { memo, useCallback, useEffect, useRef, useState, type JSX } from 'react'
import PaneSplitter from '../00_shell/PaneSplitter'
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

/** 분할 도크 폭 CSS 변수/영속 키 — PaneSplitter 일반화 props로 소비. */
const SPLIT_W_VAR = '--split-w'
const SPLIT_W_KEY = 'splitW'

/** 갱신된 셀만 재렌더 — agent 참조 불변이면 skip(스트리밍 성능, 위 헤더 주석). */
const MemoCell = memo(SubAgentCell)

export function SubAgentSplitView(): JSX.Element {
  const subagents = useAppStore(selectSubagents)
  const [split, setSplit] = useState<SplitViewState>(emptySplitView)
  /** 셀 존재 중 상태 패널 보기 오버라이드(보기 전환 토글) — 셀 소멸 시 리셋. */
  const [showPanel, setShowPanel] = useState(false)

  /** 린저 타이머 발화 시점의 최신 스냅샷 참조(재구독 없이). */
  const subagentsRef = useRef(subagents)
  /** 활동 감지 — id별 마지막 관측 참조(AgentPanel lastSeenRef 선례). */
  const lastSeenRef = useRef(new Map<string, SubAgentInfo>())
  /** 셀별 onToggle 안정 핸들러(id 고정) — MemoCell 무효화 방지. */
  const toggleHandlersRef = useRef(new Map<string, () => void>())

  // (1) 스냅샷 병합 + 활동 감지 — store 갱신마다 정책 재평가.
  useEffect(() => {
    subagentsRef.current = subagents
    const now = Date.now()
    setSplit((prev) => applySubagents(prev, subagents, now))
    for (const a of subagents) {
      const seen = lastSeenRef.current.get(a.id)
      if (seen === a) continue // 참조 불변 = 이번 스냅샷에서 갱신 없음
      lastSeenRef.current.set(a.id, a)
      // running 항목의 갱신만 활동으로 — noteActivity는 표시 중 셀만 반영(queue 무시).
      // 함수형 업데이트라 위 applySubagents 반영 후 상태에 적용된다(배치 순서 보장).
      if (a.status === 'running') {
        setSplit((s) => noteActivity(s, a.id, now))
      }
    }
    // 소멸 id 프루닝 — 참조 맵·토글 핸들러 맵 누수 방지(CP1 P06 ② 선례).
    const ids = new Set(subagents.map((a) => a.id))
    for (const id of lastSeenRef.current.keys()) {
      if (!ids.has(id)) lastSeenRef.current.delete(id)
    }
    for (const id of toggleHandlersRef.current.keys()) {
      if (!ids.has(id)) toggleHandlersRef.current.delete(id)
    }
  }, [subagents])

  // (2) 완료 창 자동 닫기 — 다음 만료 시각(min doneAt+CLOSE_LINGER_MS) 단일 타이머.
  useEffect(() => {
    let target = Infinity
    for (const c of split.cells) {
      if (c.doneAt !== undefined) target = Math.min(target, c.doneAt + CLOSE_LINGER_MS)
    }
    if (!Number.isFinite(target)) return
    const timer = setTimeout(
      () => {
        // now는 최소 목표시각 — 지터로 이르게 발화해도 만료 판정 성립(헤더 주석).
        setSplit((prev) => applySubagents(prev, subagentsRef.current, Math.max(Date.now(), target)))
      },
      Math.max(0, target - Date.now())
    )
    return () => clearTimeout(timer)
  }, [split])

  const hasCells = split.cells.length > 0

  // (3) 그리드 진입 시 분할 폭 복원(--split-w ← localStorage) · 셀 소멸 시 오버라이드 리셋.
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

  // 분기(§📐 6) — 표시할 셀 0 = 기존 우측 도크 문자 그대로(현행 무회귀).
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
      {/* 그리드는 392px 고정보다 넓게 — 별도 변수/키로 리사이즈·영속(기존 agentW 불간섭) */}
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
        {/* 헤더 스트립 — 표시/대기 수 + 보기 전환 토글(AgentPanel 접근 수단) */}
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

        {/* 대기열 탭 스트립(§📐 3) — 표시 전용, 수동 승격 발명 금지(상호작용 0) */}
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
              // 컬럼은 위치(슬롯) 의미 — index key로 충분(셀 key는 id).
              <div className="sag-col" key={colIdx}>
                {column.map((cell) => {
                  const agent = byId.get(cell.id)
                  if (!agent) return null // 병합 직전 1프레임 소멸 방어
                  // 정적 하이라이트(§📐 TG1 P08) — 크기 인라인 0, 클래스만(disabled는 제외).
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
