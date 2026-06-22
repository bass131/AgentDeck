/**
 * Shell.tsx — 3-pane 셸 (Phase 05: 실 컴포넌트 탑재).
 *
 * 레이아웃: 타이틀바 / 3-pane(좌:탐색기+diff / 중:대화 / 우:에이전트상태) / 하단바.
 *
 * ⚠️ 토큰 게이지: 빈 placeholder DOM만 — 계산/전환 로직 0 (B8=M4).
 * ⚠️ 백엔드 라벨: 고정 텍스트 'Claude Code' — 전환 UI/로직 0 (A3=Track2·M6).
 *
 * CRITICAL: renderer untrusted — fs/Node 호출 0. IPC는 store 액션 경유.
 */
import { useState, useEffect, memo } from 'react'
import FileExplorer from '../components/FileExplorer'
import Conversation from '../components/Conversation'
import AgentPanel from '../components/AgentPanel'
import DiffViewerPane from './DiffViewerPane'
import { useAppStore, selectWorkspaceRoot, selectChangedFiles, selectIsRunning, selectDiffFilePath } from '../store/appStore'
import './shell.css'

export function Shell(): JSX.Element {
  const workspaceRoot = useAppStore(selectWorkspaceRoot)
  const changedFiles = useAppStore(selectChangedFiles)
  const isRunning = useAppStore(selectIsRunning)
  const diffFilePath = useAppStore(selectDiffFilePath)

  // 좌측 pane 탭: explorer | diff
  const [leftTab, setLeftTab] = useState<'explorer' | 'diff'>('explorer')

  // 파일 선택(diffFilePath 변경) 시 좌측 pane을 diff 탭으로 자동 전환
  useEffect(() => {
    if (diffFilePath) setLeftTab('diff')
  }, [diffFilePath])

  const workspaceName = workspaceRoot
    ? workspaceRoot.split(/[\\/]/).pop() ?? workspaceRoot
    : 'AgentDeck'

  return (
    <div className="shell">
      {/* 타이틀바 */}
      <header className="titlebar">
        <span className="workspace">{workspaceName}</span>
        <span className="spacer" />
        {/* 백엔드 라벨: 고정 텍스트, 전환 UI/로직 없음 */}
        <span className="backend">엔진: Claude Code</span>
        {/* 토큰 게이지: 빈 placeholder, 계산 로직 없음 (B8=M4) */}
        <span className="gauge" aria-hidden="true" />
      </header>

      {/* 3-pane */}
      <div className="panes">
        {/* 좌측: 파일 탐색기 + diff 탭 */}
        <aside className="pane left">
          <div className="pane-tabs">
            <button
              className={`pane-tab${leftTab === 'explorer' ? ' pane-tab--active' : ''}`}
              onClick={() => setLeftTab('explorer')}
              type="button"
            >
              탐색기
            </button>
            <button
              className={`pane-tab${leftTab === 'diff' ? ' pane-tab--active' : ''}`}
              onClick={() => setLeftTab('diff')}
              type="button"
              disabled={!diffFilePath}
            >
              diff
            </button>
          </div>
          {leftTab === 'explorer' ? (
            <FileExplorer />
          ) : (
            <DiffViewerPane />
          )}
        </aside>

        {/* 중앙: 대화 */}
        <main className="pane center">
          <div className="pane-head">대화</div>
          <Conversation />
        </main>

        {/* 우측: 에이전트 상태 */}
        <aside className="pane right">
          <div className="pane-head">에이전트 상태</div>
          <AgentPanel />
        </aside>
      </div>

      {/* 하단 바 */}
      <footer className="statusbar">
        <span>
          <span className={`dot${isRunning ? ' dot--run' : ''}`} />
          {isRunning ? '실행 중' : '준비됨'}
        </span>
        <span>변경 {changedFiles.size}</span>
        <span>{workspaceRoot ? 'main' : '—'}</span>
      </footer>
    </div>
  )
}

export default memo(Shell)
