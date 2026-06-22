/**
 * ToolCallCard.tsx — 도구 호출 접이식 카드.
 *
 * UI_GUIDE: 기본 접힘, 실행중/에러는 펼침.
 * 이모지 기능 아이콘 금지. 색은 상태 전달에만(토큰 변수).
 */
import { useState, useEffect, memo } from 'react'
import type { ToolCard } from '../store/reducer'
import './ToolCallCard.css'

interface ToolCallCardProps {
  card: ToolCard
}

function ToolCallCardInner({ card }: ToolCallCardProps): JSX.Element {
  // 실행중·에러는 자동 펼침
  const autoOpen = card.status === 'running' || card.status === 'error'
  const [open, setOpen] = useState(autoOpen)

  // status 변경에 따라 자동 펼침 동기화
  useEffect(() => {
    if (autoOpen) setOpen(true)
  }, [autoOpen])

  const statusLabel =
    card.status === 'running' ? '실행중' : card.status === 'done' ? '완료' : '오류'

  return (
    <div
      className={`tool-card tool-card--${card.status}`}
      role="region"
      aria-label={`도구 호출: ${card.name}`}
    >
      <button
        className="tool-card-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        type="button"
      >
        <span className="tool-card-indicator" aria-hidden="true" />
        <span className="tool-card-name">{card.name}</span>
        <span className="tool-card-status">{statusLabel}</span>
        <span className="tool-card-chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="tool-card-body">
          {card.input !== undefined && (
            <section className="tool-card-section">
              <div className="tool-card-section-label">입력</div>
              <pre className="tool-card-code mono">
                {typeof card.input === 'string'
                  ? card.input
                  : JSON.stringify(card.input, null, 2)}
              </pre>
            </section>
          )}
          {card.result !== undefined && (
            <section className="tool-card-section">
              <div className="tool-card-section-label">결과</div>
              <pre className="tool-card-code mono">
                {typeof card.result === 'string'
                  ? card.result
                  : JSON.stringify(card.result, null, 2)}
              </pre>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

export const ToolCallCard = memo(ToolCallCardInner)
export default ToolCallCard
