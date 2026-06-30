/**
 * usePanelLoop.ts — 패널별 /loop 명령 상태 관리 훅.
 *
 * 원본 MultiWorkspace.tsx PanelView에서 추출 (Phase 13 분해).
 * - /loop 인터셉트 (단발 모드만 — replMode OFF)
 * - 루프 틱 스케줄 (busy→idle 전이 감지)
 * - 루프 타이머 정리 (언마운트·정지 시 clearTimeout)
 *
 * CRITICAL: React 훅 규칙 — 의존성 배열 정확성. 클로저 캡처 주의(stale state 방지).
 * CRITICAL: window.api 화이트리스트만(agentInterrupt). fs/Node 직접 0.
 */
import { useState, useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { PanelSessionHookResult } from '../store/panelSession'
import type { PickerState } from '../lib/multiAgentSampleData'
import type { AttachedImage } from '../store/appStore'
import { isLoopCommand, parseLoopCommand, decideLoopTick, type ActiveLoop } from '../lib/loopCommand'

// ── 훅 입력 ──────────────────────────────────────────────────────────────────

export interface UsePanelLoopOptions {
  session: PanelSessionHookResult
  picker: PickerState
  replMode: boolean
  workspaceRoot: string | null
  /** 패널별 커스텀 시스템 프롬프트 (M2) */
  panelSysPrompt?: string
  orchestration: boolean
  setOrchestration: (v: boolean) => void
  /** 지속세션 식별 키 — replMode ON 시 send에 포함 (Phase 5a) */
  panelSessionKey: string
  /** 현재 실행 중 여부 — 루프 틱 전이 감지에 사용 */
  isRunning: boolean
}

// ── 훅 반환 ──────────────────────────────────────────────────────────────────

export interface UsePanelLoopResult {
  activeLoop: ActiveLoop | null
  setActiveLoop: Dispatch<SetStateAction<ActiveLoop | null>>
  /** 사용자 전송 핸들러 — /loop 인터셉트 포함 */
  handleSend: (text: string, imgs?: AttachedImage[]) => void
  /** 실행 중단 핸들러 — replMode ON: turn만 중단 / OFF: 세션 종료 + 루프 해제 */
  handleAbort: () => void
}

// ── 훅 본체 ──────────────────────────────────────────────────────────────────

export function usePanelLoop({
  session,
  picker,
  replMode,
  workspaceRoot,
  panelSysPrompt,
  orchestration,
  setOrchestration,
  panelSessionKey,
  isRunning,
}: UsePanelLoopOptions): UsePanelLoopResult {
  const [activeLoop, setActiveLoop] = useState<ActiveLoop | null>(null)
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevRunningRef = useRef(isRunning)

  // ── sendNow: 실제 session.send (루프 틱·일반 전송 공통) ──────────────────
  // pickerOverride: 루프 시작 시점의 피커를 캡처해 틱마다 동일하게 사용.
  const sendNow = useCallback((
    text: string,
    imgs?: AttachedImage[],
    pickerOverride?: { model: string; effort: string; mode: string },
  ) => {
    // M3 sysPrompt 배선(M2 연계): panelSysPrompt → session.send() opts.sysPrompt 전달.
    // CRITICAL(신뢰경계): string만 운반 — SDK 형상은 backend 내부 처리(ADR-003).
    // orchestration: 엔진중립 boolean — 'Workflow' 리터럴 0. renderer는 boolean 전달만(ADR-003).
    void session.send(text, {
      picker: pickerOverride ?? picker,
      workspaceRoot: workspaceRoot ?? undefined,
      ...(panelSysPrompt ? { sysPrompt: panelSysPrompt } : {}),
      ...(orchestration ? { orchestration: true } : {}),
      ...(imgs && imgs.length > 0 ? { images: imgs } : {}),
      // Phase 5a(ADR-024): replMode ON → persistent + 패널별 sessionKey(단발 토글 OFF면 미포함).
      ...(replMode ? { persistent: true, sessionKey: panelSessionKey } : {}),
    })
    // 단발성(one-shot): 전송 후 UltraCode 자동 OFF — 단일 모드 Composer와 동일.
    if (orchestration) setOrchestration(false)
  }, [session, picker, workspaceRoot, panelSysPrompt, orchestration, replMode, panelSessionKey, setOrchestration])

  // ── handleSend: /loop 최상단 인터셉트 ────────────────────────────────────
  const handleSend = useCallback((text: string, imgs?: AttachedImage[]) => {
    // 🔴#1: /loop 최상단 인터셉트 — SDK로 안 보내고 패널이 직접 반복.
    // Phase 5a(ADR-024): replMode ON이면 인터셉트 건너뜀 → /loop가 SDK로 통과(Claude 자기제어).
    //   단발 모드(replMode OFF)에선 SDK 세션이 닫혀 크론 소멸하므로 기존 앱 레벨 인터셉트 유지(폴백).
    if (isLoopCommand(text) && !replMode) {
      const cmd = parseLoopCommand(text)
      if (cmd.kind === 'stop') {
        setActiveLoop(null) // 정지(타이머는 정리 effect가 clearTimeout)
        return
      }
      if (cmd.kind === 'invalid') return
      const loopPicker = { model: picker.model, effort: picker.effort, mode: picker.mode }
      setActiveLoop({
        prompt: cmd.prompt,
        intervalMs: cmd.intervalMs,
        picker: loopPicker,
        tickCount: 1,
        status: 'running',
        startedAt: Date.now(),
      })
      sendNow(cmd.prompt, imgs) // 첫 틱 즉시
      return
    }
    sendNow(text, imgs)
  }, [sendNow, picker, replMode])

  // ── handleAbort: 정지 의미 분리 ──────────────────────────────────────────
  const handleAbort = useCallback(() => {
    // Phase 5b: 정지 의미 분리 — replMode ON이면 turn만 중단(세션 유지), OFF면 세션 종료.
    // replMode ON: agentInterrupt(세션 유지) — 루프는 유지(cron 재발동 가능).
    // replMode OFF: agentAbort(세션 종료) + 루프 해제(기존 🔴#3).
    if (replMode) {
      // REPL 지속세션 정지: turn만 중단, 세션·루프 유지.
      const runId = session.state.currentRunId
      if (runId) {
        void window.api.agentInterrupt({ runId })
      }
    } else {
      // 단발 모드: 세션 종료 + 루프 해제(기존 동작 회귀 0).
      setActiveLoop(null)
      void session.abort()
    }
  }, [session, replMode])

  // ── 루프 틱 스케줄 (busy→idle 전이) ────────────────────────────────────
  useEffect(() => {
    const was = prevRunningRef.current
    prevRunningRef.current = isRunning
    if (isRunning || !was) return // busy→idle 전이일 때만
    const decision = decideLoopTick(activeLoop, Date.now())
    if (decision.action === 'halt') {
      setActiveLoop((l) => (l ? { ...l, status: 'stopped', stopReason: decision.reason } : l))
      return
    }
    if (decision.action === 'schedule' && activeLoop) {
      const { prompt, picker: lp } = activeLoop
      loopTimerRef.current = setTimeout(() => {
        setActiveLoop((l) => (l ? { ...l, tickCount: l.tickCount + 1 } : l))
        sendNow(prompt, undefined, lp)
      }, decision.intervalMs)
    }
  }, [isRunning, activeLoop, sendNow])

  // ── 루프 타이머 정리 (🔴#3): 정지/언마운트 시 대기 중 setTimeout 취소 ────
  useEffect(() => {
    if (!activeLoop || activeLoop.status !== 'running') {
      if (loopTimerRef.current) {
        clearTimeout(loopTimerRef.current)
        loopTimerRef.current = null
      }
    }
    return () => {
      if (loopTimerRef.current) {
        clearTimeout(loopTimerRef.current)
        loopTimerRef.current = null
      }
    }
  }, [activeLoop])

  return { activeLoop, setActiveLoop, handleSend, handleAbort }
}
