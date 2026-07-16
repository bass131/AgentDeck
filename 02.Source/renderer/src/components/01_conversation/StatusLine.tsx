/**
 * StatusLine.tsx — 한 줄 상태 라인 (TG1 P04).
 *
 * 배경(01.Phases/18_TG1-thinking-gui/04-status-line.md): 흩어진 사고 신호(심볼 애니메이션 ·
 * 유희 동사 순환 · 경과 초 · 실시간 토큰)를 "✻ 궁리하는 중… (12s · ↑ 3.4k tokens)" 한 줄로
 * 통합한다. 구 WorkingIndicator(Conversation.tsx)를 단일챗(Conversation.tsx) 표면에서
 * 대체하되, WorkingIndicator 자체는 삭제하지 않는다 — PanelView.tsx(멀티패널)가 여전히
 * bare 미지정으로 소비 중이라 export를 유지해야 하위호환이 깨지지 않는다.
 *
 * 4요소 데이터 원천(Conversation.tsx가 prop으로 내려줌 — 이 컴포넌트는 store를 직접
 * 구독하지 않는다, 단방향 흐름):
 *   ① ✻ 심볼 — 이 컴포넌트가 그리는 순수 장식(회전/맥동, prefers-reduced-motion 존중).
 *   ② 유희 동사 순환 — text prop이 null일 때 WORKING_PHRASES를 5~20초 랜덤 간격으로 순환
 *      (WorkingIndicator와 동일 관례, lib/workingPhrases.ts 재사용 — 순환참조 회피로 그
 *      파일에서 직접 import한다, Conversation.tsx를 거치지 않음).
 *   ③ 경과 초 — thinkingStartedAt prop(AppState.thinkingStartedAt 그대로, TG1 P02) +
 *      store/thinkingElapsed.ts computeThinkingElapsedSeconds(순수 함수, 재구현 금지).
 *   ④ 토큰 실시간 — estimatedTokens prop(열린 마지막 thinking 아이템의 값, 런닝 토탈 —
 *      새 집계 파이프라인 없음, Conversation.tsx가 thread 마지막 항목에서 파생해 내려줌).
 *
 * CRITICAL(1초 틱 리렌더 격리): 경과 초 갱신용 nowMs는 이 컴포넌트의 로컬 state
 * (setInterval + useEffect)로만 갱신한다 — store에 1s 틱을 디스패치하지 않고, 부모
 * Conversation/thread 전체를 리렌더하지 않는다. 언마운트 시 인터벌+phrase 타이머 모두 정리.
 *
 * CRITICAL: 부수효과(window.api 호출) 0 — 순수 표시 컴포넌트.
 */
import { useState, useEffect, memo, type JSX } from 'react'
import { WORKING_PHRASES, nextPhraseIndex } from '../../lib/workingPhrases'
import { computeThinkingElapsedSeconds } from '../../store/thinkingElapsed'
import { buildStatusMeta, formatPhraseLabel } from '../../lib/statusLineFormat'
import './StatusLine.css'

export interface StatusLineProps {
  /**
   * thinkingText(또는 requires_action 등 우선순위 문구) — 있으면 이 텍스트를 그대로 표시.
   * null이면 WORKING_PHRASES를 순환 표시(WorkingIndicator와 동일 관례).
   */
  text: string | null
  /**
   * 경과 초 산출 원천 — AppState.thinkingStartedAt을 그대로 전달(named selector 없이 부모가
   * 인라인 구독해 넘긴 값). null이면 경과 초 세그먼트 자체를 표시하지 않는다.
   */
  thinkingStartedAt: number | null
  /**
   * 열린(마지막) thinking thread 아이템의 estimatedTokens — 런닝 토탈(누적 아님, replace).
   * undefined면 토큰 세그먼트 자체를 표시하지 않는다.
   */
  estimatedTokens?: number
}

export const StatusLine = memo(function StatusLine({
  text,
  thinkingStartedAt,
  estimatedTokens,
}: StatusLineProps): JSX.Element {
  // ② 유희 동사 순환 — WorkingIndicator와 동일 스케줄 관례(5~20초 랜덤, non-repeating).
  const [phraseIdx, setPhraseIdx] = useState(0)
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>
    function schedule(): void {
      const delay = 5000 + Math.random() * 15000
      id = setTimeout(() => {
        setPhraseIdx((n) => nextPhraseIndex(n, WORKING_PHRASES.length))
        schedule()
      }, delay)
    }
    schedule()
    return () => clearTimeout(id)
  }, [])

  // ③ 경과 초 — 1초 틱은 이 컴포넌트 로컬 state로 격리(hard rule: 스레드 전체 리렌더 유발 X).
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const label = text ?? WORKING_PHRASES[phraseIdx]
  const elapsedSeconds = computeThinkingElapsedSeconds(thinkingStartedAt, nowMs)
  const meta = buildStatusMeta(elapsedSeconds, estimatedTokens)

  return (
    <div className="msg ai-msg status-line">
      <div className="msg-main">
        {/* .thinking: 구 WorkingIndicator 호환 클래스(census §2.2③ ~10파일 의존) 유지 —
            상태 라인이 대체해도 이 셀렉터를 참조하는 소비처가 깨지지 않게 한다. */}
        <div className="thinking status-line-row" data-testid="status-line">
          <span className="status-line-symbol" aria-hidden="true">✻</span>
          <span className="status-line-phrase">{formatPhraseLabel(label)}</span>
          {meta && <span className="status-line-meta">{meta}</span>}
        </div>
      </div>
    </div>
  )
})

export default StatusLine
