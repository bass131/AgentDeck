/**
 * AgentPanel.tsx — 우측 에이전트 패널 (F4-01).
 *
 * .ag-head(에이전트 + 상태 pill) + 섹션 3(할 일 / 서브에이전트 / 변경된 파일).
 * 단방향: store 셀렉터 구독 → 렌더. 부수효과 없음.
 *
 * ⚠️ 경계(F4 시각 vs M4 실동작):
 *   - 할 일(todos)·서브에이전트 = 빈 placeholder(0/0). 진행률·체크·카드 실동작 = M4(B3/B4).
 *   - 상태 pill·변경된 파일 = 보유 데이터(isRunning/errorMessage/changedFiles).
 *
 * 인라인 색상 0. 벡터 아이콘(이모지 0).
 */
import { memo, type JSX } from 'react'
import {
  useAppStore,
  selectIsRunning,
  selectChangedFiles,
  selectErrorMessage,
} from '../store/appStore'
import './AgentPanel.css'

export function AgentPanel(): JSX.Element {
  const isRunning = useAppStore(selectIsRunning)
  const changedFiles = useAppStore(selectChangedFiles)
  const errorMessage = useAppStore(selectErrorMessage)

  const status = isRunning ? 'running' : errorMessage ? 'error' : 'idle'
  const statusLabel = status === 'running' ? '작업 중' : status === 'error' ? '오류' : '대기 중'

  return (
    <div className="agent-panel">
      <div className="ag-head">
        <span className="ag-title">에이전트</span>
        <span className={`ag-pill ${status}`}>
          <span className="ag-pill-dot" aria-hidden="true" />
          {statusLabel}
        </span>
      </div>

      <div className="ag-scroll">
        {/* 할 일 (M4 — placeholder) */}
        <section className="ag-sec">
          <div className="ag-sec-head">
            <span className="ag-sec-title">할 일</span>
            <span className="ag-count">0/0</span>
          </div>
          <p className="ag-empty">아직 할 일이 없어요</p>
        </section>

        {/* 서브에이전트 (M4 — placeholder) */}
        <section className="ag-sec">
          <div className="ag-sec-head">
            <span className="ag-sec-title">서브에이전트</span>
            <span className="ag-count">0/0</span>
          </div>
          <p className="ag-empty">아직 서브에이전트가 없어요</p>
        </section>

        {/* 변경된 파일 (데이터) */}
        <section className="ag-sec">
          <div className="ag-sec-head">
            <span className="ag-sec-title">변경된 파일</span>
            <span className="ag-count">{changedFiles.size}</span>
          </div>
          {changedFiles.size === 0 ? (
            <p className="ag-empty">아직 변경된 파일이 없어요</p>
          ) : (
            <ul className="ag-file-list">
              {[...changedFiles].map((path) => (
                <li key={path} className="ag-file-item" title={path}>
                  <span className="ag-file-dot" aria-hidden="true" />
                  <span className="ag-file-path">{path}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

export default memo(AgentPanel)
