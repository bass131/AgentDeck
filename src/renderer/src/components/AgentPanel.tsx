/**
 * AgentPanel.tsx — 우측 패널: 현재 작업 상태 + 변경 파일 목록.
 *
 * 단방향: store 셀렉터 구독 → 렌더. 부수효과 없음.
 */
import { memo } from 'react'
import { useAppStore, selectIsRunning, selectChangedFiles, selectToolCards, selectErrorMessage } from '../store/appStore'
import './AgentPanel.css'

export function AgentPanel(): JSX.Element {
  const isRunning = useAppStore(selectIsRunning)
  const changedFiles = useAppStore(selectChangedFiles)
  const toolCards = useAppStore(selectToolCards)
  const errorMessage = useAppStore(selectErrorMessage)

  const activeCard = [...toolCards].reverse().find((c) => c.status === 'running')

  return (
    <div className="agent-panel">
      {/* 현재 작업 상태 */}
      <section className="ap-section">
        <div className="ap-section-head">현재 작업</div>
        {isRunning ? (
          <div className="ap-status ap-status--running">
            <span className="ap-status-dot" />
            {activeCard ? `${activeCard.name} 실행 중` : '실행 중...'}
          </div>
        ) : errorMessage ? (
          <div className="ap-status ap-status--error">
            <span className="ap-status-dot ap-status-dot--error" />
            {errorMessage}
          </div>
        ) : (
          <div className="ap-empty">진행 중 작업 없음</div>
        )}
      </section>

      {/* 변경 파일 목록 */}
      <section className="ap-section">
        <div className="ap-section-head">
          변경 파일
          {changedFiles.size > 0 && (
            <span className="ap-badge">{changedFiles.size}</span>
          )}
        </div>
        {changedFiles.size === 0 ? (
          <div className="ap-empty">변경 없음</div>
        ) : (
          <ul className="ap-file-list">
            {[...changedFiles].map((path) => (
              <li key={path} className="ap-file-item mono" title={path}>
                <span className="ap-file-dot" />
                {path}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 도구 카드 요약 */}
      {toolCards.length > 0 && (
        <section className="ap-section">
          <div className="ap-section-head">최근 도구 호출</div>
          <ul className="ap-tool-list">
            {toolCards.slice(-5).map((card) => (
              <li
                key={card.id}
                className={`ap-tool-item ap-tool-item--${card.status}`}
              >
                <span className="ap-tool-name">{card.name}</span>
                <span className="ap-tool-status">
                  {card.status === 'running'
                    ? '실행중'
                    : card.status === 'done'
                      ? '완료'
                      : '오류'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export default memo(AgentPanel)
