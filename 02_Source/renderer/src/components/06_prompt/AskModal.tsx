/**
 * AskModal.tsx — /ask 분리 대화 모달 (F11-03).
 *
 * 원본 AgentCodeGUI AskModal.tsx 1:1 시각 이식 (로컬 전용 버전).
 * - orb 헤더: "빠른 질문" + "/ask" 배지 + 휘발성 pill + 최소화 ⌄ + 닫기 ✕
 * - 본문: 빈상태 기본 "무엇이든 편하게 물어보세요" (MessageView 재사용 X, 간단 빈상태)
 * - 컴포저: textarea + 전송 버튼 (시각만, 실 엔진 = M4)
 * - 풋노트: "창을 닫으면 이 대화는 저장되지 않고 즉시 사라집니다"
 * - 최소화 → 우하단 q-mini 알약 (펼치기/닫기)
 * - Esc (열림) → 최소화, Esc (최소화) → 닫기
 *
 * CRITICAL: window.api 실 호출 0. 인라인 색상 0 — CSS 토큰.
 */
import { useEffect, useRef, useState, type JSX } from 'react'
import { IconChevDown, IconClose, IconSend } from '../common/icons'
import './AskModal.css'

export function AskModal({
  minimized,
  onClose,
  onMinimizedChange,
}: {
  /** 최소화 상태. 부모(Shell)가 관리 */
  minimized: boolean
  onClose: () => void
  onMinimizedChange: (v: boolean) => void
}): JSX.Element {
  const [input, setInput] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  // 열릴 때 / 복원될 때 포커스
  useEffect(() => {
    if (!minimized) requestAnimationFrame(() => taRef.current?.focus())
  }, [minimized])

  // 키보드 핸들러
  // - Esc (열림)  → 최소화
  // - Esc (최소화) → 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (minimized) {
          onClose()
        } else {
          onMinimizedChange(true)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [minimized, onClose, onMinimizedChange])

  const grow = (el: HTMLTextAreaElement | null): void => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }

  // 전송 시각 — 실 엔진 연결은 M4
  const send = (): void => {
    const text = input.trim()
    if (!text) return
    // M4: 실 엔진 send. 현재는 입력 클리어만
    setInput('')
    requestAnimationFrame(() => grow(taRef.current))
  }

  return (
    <>
      {minimized ? (
        /* 최소화 알약 */
        <div className="ask-mini" onClick={() => onMinimizedChange(false)}>
          <div className="mini-orb">
            <BoltGlyph />
          </div>
          <div className="mini-text">
            <div className="mini-title">
              빠른 질문
              <span className="ask-eph mini-eph">
                <span className="dot" />
                휘발성
              </span>
            </div>
            <div className="mini-sub">아직 질문 전이에요</div>
          </div>
          <span className="mini-spacer" />
          <button
            className="mini-btn has-tip"
            data-tip="펼치기"
            aria-label="펼치기"
            onClick={(e) => {
              e.stopPropagation()
              onMinimizedChange(false)
            }}
          >
            <RestoreGlyph />
          </button>
          <button
            className="mini-btn close has-tip"
            data-tip="닫기"
            aria-label="닫기"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
          >
            <IconClose size={16} />
          </button>
        </div>
      ) : (
        /* 전체 모달 */
        <div className="ask-overlay">
          <div className="ask-modal" onMouseDown={(e) => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="ask-head">
              <div className="ask-orb">
                <BoltGlyph />
              </div>
              <div className="ask-titles">
                <div className="ask-title">
                  빠른 질문 <span className="ask-cmd">/ask</span>
                </div>
                <div className="ask-sub">본 작업 대화와 분리된 일회용 질문이에요</div>
              </div>
              <span className="ask-spacer" />
              <span className="ask-eph">
                <span className="dot" />
                휘발성
              </span>
              <button
                className="ask-min has-tip"
                data-tip="최소화 (Esc)"
                aria-label="최소화"
                onClick={() => onMinimizedChange(true)}
              >
                <IconChevDown size={18} />
              </button>
              <button
                className="ask-close has-tip"
                data-tip="닫기"
                aria-label="닫기"
                onClick={onClose}
              >
                <IconClose size={17} />
              </button>
            </div>

            {/* 본문 — 빈상태 기본 */}
            <div className="ask-body">
              <div className="ask-empty">
                <div className="ask-empty-orb">
                  <QuestionGlyph />
                </div>
                <h2>무엇이든 편하게 물어보세요</h2>
                <p>
                  지금 보고 있는 코드나 개념을 가볍게 질문해 보세요.
                  <br />이 대화는 작업 기록에 남지 않고, 창을 닫으면 사라져요.
                </p>
              </div>
            </div>

            {/* 컴포저 */}
            <div className="ask-foot">
              <div className="ask-composer">
                <textarea
                  ref={taRef}
                  rows={1}
                  placeholder="궁금한 걸 물어보세요…"
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value)
                    grow(e.target)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      send()
                    }
                  }}
                />
                <button
                  className="ask-send has-tip"
                  data-tip="보내기 (Enter)"
                  aria-label="보내기"
                  onClick={send}
                  disabled={!input.trim()}
                >
                  <IconSend size={17} />
                </button>
              </div>
            </div>

            {/* 풋노트 */}
            <div className="ask-note">
              <TrashGlyph />
              창을 닫으면 이 대화는 저장되지 않고 즉시 사라집니다
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default AskModal

// ── 인라인 글리프 (공유 아이콘 없음) ────────────────────────────────────────

function BoltGlyph(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z" />
    </svg>
  )
}

function QuestionGlyph(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="30"
      height="30"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2.5-3 4.5" />
      <circle cx="12" cy="18.5" r="0.6" fill="currentColor" />
    </svg>
  )
}

function RestoreGlyph(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  )
}

function TrashGlyph(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  )
}
