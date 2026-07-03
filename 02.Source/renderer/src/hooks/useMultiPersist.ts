/**
 * useMultiPersist.ts — 멀티워크스페이스 영속 상태 관리 훅.
 *
 * 원본 MultiWorkspace.tsx에서 추출 (Phase 13 분해). RMW1-P04: 저장(발사체)을 분산
 * RMW에서 의도 명령(multiCmdUpsert)으로 이관(ADR-031).
 * - count / panelMetas / panelCwds / pickers 상태 소유.
 * - 마운트 복원 effect (multiSessionLoad → setState → restoredRef=true) — 읽기는 유지.
 * - 디바운스 저장 effect (≥500ms, restoredRef 게이트).
 * - 언마운트 flush (세션 전환 key 재마운트 시 미저장 변경 보존).
 *
 * B3 race 게이트: restoredRef false → 저장 차단 → 복원 완료 후 허가.
 * 명령 1발(ADR-031): 활성 세션 스냅샷을 multiCmdUpsert로 전송 — main이 read→upsert→write를
 * 단일 원자 블록으로 실행(다른 세션 보존은 main 책임). 응답 state로 Zustand 미러(멀티세션
 * 요약 목록)를 동기화한다 — 단, 언마운트 flush 경로는 fire-and-forget(전송만, 미러 동기화 0.
 * 언마운트된 훅 인스턴스의 응답이 이미 다른 세션으로 전환된 미러를 stale로 덮어쓸 수 있어서다).
 *
 * CRITICAL: window.api 화이트리스트만(multiSessionLoad + multiCmdUpsert). fs/Node 직접 0.
 * CRITICAL: React 훅 규칙 — 의존성 배열 정확성.
 */
import { useState, useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { PanelSessionHookResult } from '../store/panelSession'
import { snapshotForPersist } from '../store/panelSession'
import { DEFAULT_PICKER, SAMPLE_PANELS, type PickerState } from '../lib/multiAgentSampleData'
import type { PersistedPanel, PersistedMultiSession } from '../../../shared/ipc-contract'
import { useAppStore } from '../store/appStore'
import { mirrorFromState } from '../store/slices/multiSession'

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
    // performUpsert 가드(!activeSession.id)가 빈 id 저장을 차단함.
    return {
      id: activeMultiSessionId,
      // title 미포함 — upsert 요청 타입(Omit<PersistedMultiSession,'title'>)과 동형.
      // main(multiStore.ts upsertSession)이 기존 title을 보존한다.
      count,
      panels,
    }
  // sessions는 훅 반환값(안정적 참조 아님) → 의존성 최소화
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMultiSessionId, count, panelMetas, pickers, panelCwds, s0.state, s1.state, s2.state, s3.state, s4.state, s5.state])

  // buildActiveSessionRef 항상 최신값 유지 (언마운트 flush에서 stale 클로저 방지)
  buildActiveSessionRef.current = buildActiveSession

  // ── performUpsert ────────────────────────────────────────────────────────────
  // 명령 1발(ADR-031): multiCmdUpsert(activeSession) — main이 read→upsert→write를
  // 단일 원자 블록으로 실행(다른 세션 보존·title 보존은 main 책임 — multiStore.ts upsertSession).
  // 정상 디바운스 발화 경로 전용: 응답 state로 Zustand 미러(multiSessions/activeMultiSessionId)를
  // 동기화한다 — ok:false(미지 id — stale upsert)여도 state는 권위 상태이므로 그대로 수렴.
  const performUpsert = useCallback(async (activeSession: PersistedMultiSession): Promise<void> => {
    // 방어 가드 1: activeSession.id가 빈 문자열이면 no-op.
    // 부트 직후 loadMultiSessions 완료 전 multi 진입 시 id='' → 유령 세션 upsert 차단.
    if (!activeSession.id) return
    // 방어 가드 2: window.api 미목/미존재 환경에서 unhandled rejection 방지.
    // 테스트에서 multiCmdUpsert mock이 없으면 조용히 no-op.
    if (typeof window?.api?.multiCmdUpsert !== 'function') return
    try {
      const res = await window.api.multiCmdUpsert(activeSession)
      useAppStore.setState(mirrorFromState(res.state))
    } catch {
      // best-effort — 저장 실패해도 크래시 0
    }
  }, []) // 의존성 없음: IPC 경유만, 인자로 주입

  // ── flushUpsert ──────────────────────────────────────────────────────────────
  // 언마운트(cleanup) flush 전용: 전송만(fire-and-forget) — 응답을 기다려 미러를 갱신하지 않는다.
  // 함정: 언마운트 시점엔 이미 다른 세션으로 전환됐을 수 있다 — 이 훅 인스턴스(옛 세션)의
  // 늦게 도착한 응답으로 미러를 덮어쓰면 방금 전환된 새 세션의 미러를 stale 값으로 되돌린다.
  const flushUpsert = useCallback((activeSession: PersistedMultiSession): void => {
    if (!activeSession.id) return
    if (typeof window?.api?.multiCmdUpsert !== 'function') return
    void window.api.multiCmdUpsert(activeSession).catch(() => {
      // best-effort — 언마운트 flush 실패해도 크래시/미처리거부 0
    })
  }, [])

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
          // BF3 Phase 05: 폴백 소유권 검증 — 자기 세션(activeMultiSessionId)이 디스크에
          // 없으면 "남의" 세션으로 대신 채우지 않는다.
          //
          // 구코드는 여기서 못 찾으면 res.state.activeSessionId(디스크가 "마지막으로 기록한
          // 누군가의" 활성 id)로, 그마저 없으면 sessions[0]으로 폴백했다. 문제는
          // res.state.activeSessionId가 항상 "지금 이 세션"을 가리키는 값이 아니라는 것 —
          // (과거의) performRmwSave는 자기 자신을 저장할 때마다 activeSessionId를 자기 id로
          // 덮어썼다(RMW1-P04 이후 폐기 — 현재 multiCmdUpsert는 main upsertSession이
          // activeSessionId를 절대 건드리지 않는다). 그래서 신규(디스크에 한 번도 저장 안 된) 세션이 이 마운트 복원
          // 시점에 *다른* 세션의 언마운트-플러시 저장과 경합하면, 그 다른 세션이 방금 남긴
          // activeSessionId를 자기 것인 양 주워 그 세션의 스냅샷을 통째로 상속했다
          // (01.Phases/LR3-loop-ux/07-multipanel-continuity-DONE.md §범위 밖 발견 — 레이스
          // 재현: 99.Others/tests/renderer/bf3-p05-multipersist-restore-race.test.tsx).
          //
          // preferredId 자체의 `activeMultiSessionId || res.state.activeSessionId` OR는
          // 보존한다 — activeMultiSessionId가 부트 직후 아직 비어있는 정당한 초기상태
          // (예: multi-session-persist-2.test.tsx P2)에서는 "내 세션"이라는 대안 truth가
          // 아예 없으므로 disk의 activeSessionId를 쓰는 것이 유일한 선택이고, 소유권
          // 충돌이 발생할 수 없다(비교 대상이 없다). 위험한 건 "내 id(진짜 truth)가
          // 있는데 못 찾았다"는 경우에 남의 id로 대신 채우는 2차 폴백뿐이었다 — 그 2차
          // 폴백(및 sessions[0] 3차 폴백)을 제거한다: 못 찾으면 그냥 빈 상태로 시작한다.
          const preferredId = activeMultiSessionId || res.state.activeSessionId
          const activeSession = res.state.sessions.find((s) => s.id === preferredId)

          if (activeSession) {
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
            //
            // Phase 07(LR3): 앱 수명 승격(usePanelSlot) 이후, 이 마운트 복원 effect는
            // "MultiWorkspace가 처음 마운트될 때"뿐 아니라 "같은 세션으로 재마운트될 때"도
            // 매번 실행된다(모드 전환·멀티세션 재전환 시 key 재마운트). 세션이 이 앱 실행
            // 중 이미 방문돼 매니저에 라이브 진행(비어있지 않은 thread·실행 중·runId 보유)이
            // 남아있다면 여기서 디스크 스냅샷으로 덮어쓰면 안 된다 — 그게 바로 진단서의
            // "표시 끊김" 재발이다. 실 재시작(프로세스 리로드)에서는 매니저 Map 자체가
            // 비어있으므로 이 가드는 항상 통과해 기존 복원 거동(M3)을 그대로 유지한다.
            activeSession.panels.forEach((panel: PersistedPanel, i: number) => {
              if (i >= 6) return
              const live = sessions[i]?.state
              const hasLiveProgress = !!live && (
                live.thread.length > 0 || live.isRunning || live.currentRunId !== null
              )
              if (hasLiveProgress) return // 앱 수명 상주 라이브 상태 보존(Phase 07) — 디스크로 미덮어씀
              if (panel.snapshot && panel.snapshot.messages.length > 0) {
                sessions[i].restore(panel.snapshot)
              }
            })
          }
          // else: 자기 세션(activeMultiSessionId)이 디스크에 없음(신규 세션, 저장 이력 0)
          // — 폴백 없이 빈 상태로 시작한다. 불변조건: 엉뚱한 세션 데이터는 절대 상속 금지.
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
  // 명령 1발(ADR-031): multiCmdUpsert — main이 원자적으로 read→upsert→write(다른 세션 보존).
  // 함정: activeSession 스냅샷을 setTimeout 스케줄 시점(effect 본문)에서 미리 빌드해 클로저에
  // 가두지 않는다 — buildActiveSessionRef 경유로 타이머 발화 시점에 최신 상태를 빌드한다.
  // 언마운트 flush: cleanup에서 pending 타이머가 있으면 즉시 flushUpsert 발화(fire-and-forget,
  //   응답 미러 동기화 없음). key 재마운트(세션 전환)로 언마운트 시 미저장 변경 보존. 크래시 0.
  useEffect(() => {
    if (!restoredRef.current) return
    // 유령 세션 방지: activeMultiSessionId 빈 문자열이면 save 차단.
    // 부트 직후 loadMultiSessions 완료 전 multi 진입 시 id='' → 유령 upsert 차단.
    if (!activeMultiSessionId) return

    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      // 발화 시점 최신 스냅샷 — ref 경유(스케줄 시점 클로저 stale 방지, 위 함정 참조).
      const latest = buildActiveSessionRef.current
      if (latest) {
        void performUpsert(latest()).catch(() => {
          // best-effort — performUpsert 내부 try/catch와 이중 안전
        })
      }
    }, 500)

    return () => {
      // 언마운트 flush: pending 타이머가 있으면 즉시 전송(fire-and-forget) — 미러 동기화 0.
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
        // 최신 buildActiveSession 사용(ref에서 얻음 — stale 클로저 방지)
        const latest = buildActiveSessionRef.current
        if (latest) {
          flushUpsert(latest())
        }
      }
    }
  }, [activeMultiSessionId, buildActiveSession, performUpsert, flushUpsert])

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
