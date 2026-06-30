/**
 * useMultiPersist.ts — 멀티워크스페이스 영속 상태 관리 훅.
 *
 * 원본 MultiWorkspace.tsx에서 추출 (Phase 13 분해).
 * - count / panelMetas / panelCwds / pickers 상태 소유.
 * - 마운트 복원 effect (multiSessionLoad → setState → restoredRef=true).
 * - 디바운스 저장 effect (≥500ms, restoredRef 게이트).
 * - 언마운트 flush (세션 전환 key 재마운트 시 미저장 변경 보존).
 *
 * B3 race 게이트: restoredRef false → 저장 차단 → 복원 완료 후 허가.
 * 2단계 RMW: 디스크 read → 활성 세션 upsert → write (다른 세션 보존).
 *
 * CRITICAL: window.api 화이트리스트만(multiSessionLoad/Save). fs/Node 직접 0.
 * CRITICAL: React 훅 규칙 — 의존성 배열 정확성.
 */
import { useState, useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { PanelSessionHookResult } from '../store/panelSession'
import { snapshotForPersist } from '../store/panelSession'
import { DEFAULT_PICKER, SAMPLE_PANELS, type PickerState } from '../lib/multiAgentSampleData'
import type { PersistedMultiState, PersistedPanel, PersistedMultiSession } from '../../../shared/ipc-contract'

// ── 상수 ─────────────────────────────────────────────────────────────────────

/** 6개 슬롯 인덱스 — MultiWorkspace 그리드 + buildActiveSession 공유 */
export const SLOTS = [0, 1, 2, 3, 4, 5]

// ── 패널 메타 타입 ────────────────────────────────────────────────────────────

/** M3: 패널 메타 실데이터 (영속 복원 우선, SAMPLE 폴백) */
export interface PanelMeta {
  title: string
  cwd?: string
  sysPrompt?: string
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

/** 6개 picker 초기값 (DEFAULT_PICKER 복사, 리프팅용) */
function makeDefaultPickers(): PickerState[] {
  return Array.from({ length: 6 }, () => ({ ...DEFAULT_PICKER }))
}

/** 기본 패널 메타 (first-run용 — 빈 값). SAMPLE_PANELS는 패널 수(6) 보장용으로만 사용. */
function makeDefaultPanelMetas(): PanelMeta[] {
  return SAMPLE_PANELS.map(() => ({
    title: '',
    cwd: undefined,
    sysPrompt: undefined,
  }))
}

// ── 훅 반환 타입 ─────────────────────────────────────────────────────────────

export interface UseMultiPersistResult {
  count: number
  setCount: (n: number) => void
  panelMetas: PanelMeta[]
  setPanelMetas: Dispatch<SetStateAction<PanelMeta[]>>
  panelCwds: Record<number, string | null>
  setPanelCwds: Dispatch<SetStateAction<Record<number, string | null>>>
  pickers: PickerState[]
  setPickers: Dispatch<SetStateAction<PickerState[]>>
}

// ── 훅 본체 ──────────────────────────────────────────────────────────────────

export function useMultiPersist(
  sessions: PanelSessionHookResult[],
  activeMultiSessionId: string,
): UseMultiPersistResult {
  // ── 영속 상태 소유 ──────────────────────────────────────────────────────────
  const [count, setCount] = useState(4)
  const [panelMetas, setPanelMetas] = useState<PanelMeta[]>(makeDefaultPanelMetas)
  const [panelCwds, setPanelCwds] = useState<Record<number, string | null>>({})
  const [pickers, setPickers] = useState<PickerState[]>(makeDefaultPickers)

  // ── race 게이트 ref ──────────────────────────────────────────────────────────
  // B3: restoredRef false → 저장 차단. 마운트 복원 완료 후 true.
  // key 재마운트(세션 전환)로 항상 새 인스턴스 → 깨끗이 false에서 시작.
  const restoredRef = useRef(false)

  // ── 디바운스 타이머 ref ──────────────────────────────────────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // buildActiveSession 최신 참조 — 언마운트 flush용 (클로저 stale 방지)
  const buildActiveSessionRef = useRef<(() => PersistedMultiSession) | null>(null)

  // ── s0~s5 개별 참조 (buildActiveSession 의존성 배열 세분화) ─────────────────
  const [s0, s1, s2, s3, s4, s5] = sessions

  // ── buildActiveSession ───────────────────────────────────────────────────────
  // 활성 세션 하나의 PersistedMultiSession만 생성 (RMW upsert용).
  // id = 현재 activeMultiSessionId (store 소유). title은 RMW에서 디스크값 보존.
  // B4: pickers 배열에서 각 slot picker 수집 가능(리프팅 결과).
  const buildActiveSession = useCallback((): PersistedMultiSession => {
    const panels: PersistedPanel[] = SLOTS.slice(0, 6).map((slot) => {
      const meta = panelMetas[slot] ?? { title: '' }
      const picker = pickers[slot] ?? DEFAULT_PICKER
      const sessionState = sessions[slot]?.state
      const snapshot = sessionState ? snapshotForPersist(sessionState) : undefined
      const hasSnapshot = snapshot && snapshot.messages.length > 0

      return {
        title: meta.title,
        ...(panelCwds[slot] != null ? { cwd: panelCwds[slot] as string } : meta.cwd ? { cwd: meta.cwd } : {}),
        picker: {
          model: picker.model,
          effort: picker.effort,
          mode: picker.mode,
        },
        ...(meta.sysPrompt ? { sysPrompt: meta.sysPrompt } : {}),
        ...(hasSnapshot ? { snapshot } : {}),
      }
    })

    // 활성 세션 ID: store 소유(truth). 빈 문자열이면 그대로 '' 반환.
    // performRmwSave 가드(!activeSession.id)가 빈 id 저장을 차단함.
    return {
      id: activeMultiSessionId,
      // title: RMW에서 디스크의 기존 title 보존 (buildActiveSession은 title 미포함)
      count,
      panels,
    }
  // sessions는 훅 반환값(안정적 참조 아님) → 의존성 최소화
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMultiSessionId, count, panelMetas, pickers, panelCwds, s0.state, s1.state, s2.state, s3.state, s4.state, s5.state])

  // buildActiveSessionRef 항상 최신값 유지 (언마운트 flush에서 stale 클로저 방지)
  buildActiveSessionRef.current = buildActiveSession

  // ── performRmwSave ────────────────────────────────────────────────────────────
  // async RMW: 디스크 read → 활성 세션 upsert → write.
  // upsert: id 일치 세션 교체, 없으면 append. 나머지 세션 보존.
  // title: 디스크의 기존 세션 title 보존(renameMultiSession이 RMW로 기록한 값).
  // disk null/빈 → 활성 세션만으로 새로 생성(graceful first-run).
  const performRmwSave = useCallback(async (activeSession: PersistedMultiSession): Promise<void> => {
    // 방어 가드 1: activeSession.id가 빈 문자열이면 no-op.
    // 부트 직후 loadMultiSessions 완료 전 multi 진입 시 id='' → 유령 'main-session' append 차단.
    if (!activeSession.id) return
    // 방어 가드 2: window.api 미목/미존재 환경에서 unhandled rejection 방지.
    // 테스트에서 multiSessionLoad/Save mock이 없으면 조용히 no-op.
    if (
      typeof window?.api?.multiSessionLoad !== 'function' ||
      typeof window?.api?.multiSessionSave !== 'function'
    ) return
    try {
      const disk = await window.api.multiSessionLoad()
      const existingSessions = disk.state?.sessions ?? []
      const activeId = activeSession.id

      // upsert: 기존 세션 목록에서 id 일치하면 교체, 없으면 append
      // title 보존: 디스크의 기존 title 사용(rename이 기록한 값)
      const existingForId = existingSessions.find((s) => s.id === activeId)
      const mergedSession: PersistedMultiSession = {
        ...activeSession,
        // title: 디스크 기존값 우선(rename 보존), 없으면 현재값(or '')
        title: existingForId?.title ?? activeSession.title ?? '',
      }

      let merged: PersistedMultiSession[]
      const idx = existingSessions.findIndex((s) => s.id === activeId)
      if (idx >= 0) {
        merged = existingSessions.map((s, i) => (i === idx ? mergedSession : s))
      } else {
        merged = [...existingSessions, mergedSession]
      }

      const newState: PersistedMultiState = {
        version: 2,
        activeSessionId: activeId,
        sessions: merged,
      }

      await window.api.multiSessionSave(newState)
    } catch {
      // best-effort — 저장 실패해도 크래시 0
    }
  }, []) // 의존성 없음: IPC 경유만, 인자로 주입

  // ── 마운트 복원 effect ────────────────────────────────────────────────────────
  // CRITICAL: window.api.multiSessionLoad() IPC 경유 — fs 직접 호출 0.
  // B3: 이 effect가 완료된 후 restoredRef=true → 저장 effect 허가.
  // 2단계: store.activeMultiSessionId 우선 사용(없으면 첫/디스크activeSessionId 폴백).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await window.api.multiSessionLoad()
        if (cancelled) return

        if (res.state && res.state.version === 2 && res.state.sessions.length > 0) {
          // 2단계: store.activeMultiSessionId로 세션 선택(없으면 디스크 activeSessionId 폴백)
          const preferredId = activeMultiSessionId || res.state.activeSessionId
          const activeSession =
            res.state.sessions.find((s) => s.id === preferredId) ??
            res.state.sessions.find((s) => s.id === res.state!.activeSessionId) ??
            res.state.sessions[0]

          // count 복원 (2~6 범위 클램핑)
          const restoredCount = Math.min(Math.max(activeSession.count, 2), 6)
          setCount(restoredCount)

          // 패널 메타 복원 (실데이터 우선)
          const restoredMetas = makeDefaultPanelMetas()
          const restoredPickersArr = makeDefaultPickers()
          const restoredCwds: Record<number, string | null> = {}

          activeSession.panels.forEach((panel: PersistedPanel, i: number) => {
            if (i >= 6) return
            restoredMetas[i] = {
              title: panel.title,
              cwd: panel.cwd,
              sysPrompt: panel.sysPrompt,
            }
            restoredPickersArr[i] = {
              model: panel.picker.model,
              effort: panel.picker.effort,
              mode: panel.picker.mode,
            }
            if (panel.cwd) {
              // CRITICAL: 복원된 cwd는 main이 재검증한 값(B2) → 신뢰 가능
              restoredCwds[i] = panel.cwd
            }
          })

          setPanelMetas(restoredMetas)
          setPickers(restoredPickersArr)
          setPanelCwds(restoredCwds)

          // M3 thread 복원 배선: 각 패널 세션에 snapshot을 dispatch(RESTORE 액션).
          // usePanelSession().restore(snapshot) → panelReducer case 'RESTORE'
          //   → makePanelInitialState(snapshot) → thread 교체.
          // CRITICAL: shared reducer.ts 무변경 — panelSession 로컬 래퍼만 사용.
          // B5: seedCounter(seq + messages.length) → 복원 id < 미래 nextId() 보장.
          activeSession.panels.forEach((panel: PersistedPanel, i: number) => {
            if (i >= 6) return
            if (panel.snapshot && panel.snapshot.messages.length > 0) {
              sessions[i].restore(panel.snapshot)
            }
          })
        }
      } catch {
        // IPC 실패 graceful — 크래시 0, SAMPLE 폴백 유지
      } finally {
        if (!cancelled) {
          // B3: 복원 완료 → 저장 허가
          restoredRef.current = true
        }
      }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // 마운트 1회만 (key 재마운트로 새 인스턴스 보장)

  // ── 디바운스 저장 effect ─────────────────────────────────────────────────────
  // B3: restoredRef.current===true일 때만 발화 → 복원 전 빈 상태 저장 차단.
  // 디바운스 ≥500ms — 매 키입력 저장 폭주 방지.
  // 2단계: async RMW save (다른 세션 보존).
  // 언마운트 flush: cleanup에서 pending 타이머가 있으면 즉시 RMW save 발화(fire-and-forget).
  //   key 재마운트(세션 전환)로 언마운트 시 미저장 변경 보존. best-effort, 크래시 0.
  useEffect(() => {
    if (!restoredRef.current) return
    // 유령 세션 방지: activeMultiSessionId 빈 문자열이면 save 차단.
    // 부트 직후 loadMultiSessions 완료 전 multi 진입 시 id='' → 유령 append 차단.
    if (!activeMultiSessionId) return

    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current)
    }

    const activeSession = buildActiveSession()
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void performRmwSave(activeSession).catch(() => {
        // best-effort — performRmwSave 내부 try/catch와 이중 안전
      })
    }, 500)

    return () => {
      // 언마운트 flush: pending 타이머가 있으면 즉시 RMW save (fire-and-forget)
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
        // 최신 buildActiveSession 사용(ref에서 얻음 — stale 클로저 방지)
        const latest = buildActiveSessionRef.current
        if (latest) {
          void performRmwSave(latest()).catch(() => {
            // best-effort — 언마운트 flush 실패해도 크래시/미처리거부 0
          })
        }
      }
    }
  }, [buildActiveSession, performRmwSave])

  return {
    count,
    setCount,
    panelMetas,
    setPanelMetas,
    panelCwds,
    setPanelCwds,
    pickers,
    setPickers,
  }
}
