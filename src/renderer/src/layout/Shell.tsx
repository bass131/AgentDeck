/**
 * Shell.tsx — 3-pane 셸 (M2-01: 코드 뷰어 탑재).
 *
 * 레이아웃: 타이틀바 / 3-pane(좌:탐색기+diff / 중:대화|코드 탭 / 우:에이전트상태) / 하단바.
 *
 * M2-01 변경:
 *   - 중앙 pane: 대화 / 코드뷰어 탭 전환. 파일 선택 시 자동 코드탭 이동.
 *   - 좌측: diff 탭 유지(기존 기능 보존).
 *   - FileExplorer 파일 클릭 → openFile(코드뷰 1차) + selectDiffFile(diff도 병행).
 *
 * ⚠️ 토큰 게이지: 빈 placeholder DOM만 (B8=M4).
 * ⚠️ 백엔드 라벨: 고정 텍스트 'Claude Code' (A3=Track2·M6).
 *
 * CRITICAL: renderer untrusted — fs/Node 호출 0. IPC는 store 액션 경유.
 * 인라인 색상 0 — CSS 변수 토큰.
 */
import { useState, useEffect, memo, type JSX } from 'react'
import FileExplorer from '../components/FileExplorer'
import Conversation from '../components/Conversation'
import AgentPanel from '../components/AgentPanel'
import TitleBar from '../components/TitleBar'
import ResizeHandles from '../components/ResizeHandles'
import Sidebar from '../components/Sidebar'
import SettingsModal from '../components/SettingsModal'
import DiffViewerPane from './DiffViewerPane'
import CodeViewerPane from './CodeViewerPane'
import { useWindowState } from '../lib/useWindowState'
import {
  useAppStore,
  selectWorkspaceRoot,
  selectChangedFiles,
  selectIsRunning,
  selectDiffFilePath,
  selectOpenedFile,
} from '../store/appStore'
import './shell.css'

export function Shell(): JSX.Element {
  const workspaceRoot = useAppStore(selectWorkspaceRoot)
  const changedFiles = useAppStore(selectChangedFiles)
  const isRunning = useAppStore(selectIsRunning)
  const diffFilePath = useAppStore(selectDiffFilePath)
  const openedFile = useAppStore(selectOpenedFile)

  // 좌측 pane 탭: explorer | diff
  const [leftTab, setLeftTab] = useState<'explorer' | 'diff'>('explorer')
  // 중앙 pane 탭: conversation | code
  const [centerTab, setCenterTab] = useState<'conversation' | 'code'>('conversation')
  // 컬럼 접힘(F1-b Phase 04) — rail 토글. 영속화는 후속.
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [explorerOpen, setExplorerOpen] = useState(true)
  // 설정 모달(F5)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // diffFilePath 변경 시 좌측 diff 탭 자동 전환 (기존 동작 유지)
  useEffect(() => {
    if (diffFilePath) setLeftTab('diff')
  }, [diffFilePath])

  // 파일 열기(openedFile 변경) 시 중앙 코드 탭으로 자동 전환
  useEffect(() => {
    if (openedFile) setCenterTab('code')
  }, [openedFile])

  // 창 최대화 상태 — .win.max 토글(투명창 custom maximize, F1-b).
  const maximized = useWindowState()

  const workspaceName = workspaceRoot
    ? workspaceRoot.split(/[\\/]/).pop() ?? workspaceRoot
    : 'AgentDeck'

  return (
    <>
      {/* 투명창 위 16px inset 둥근 플로팅 카드 (데스크톱 투과). maximized면 가득 채움. */}
      <div className={`win${maximized ? ' max' : ''}`}>
        <TitleBar title={workspaceName} maximized={maximized} />

        {/* 4컬럼 본문 (F1-b): 사이드바 248 / 탐색기 236 / 대화 1fr / 에이전트 392 */}
        <div className="win-body">
        {/* ① 사이드바 (채팅목록 스텁, 접힘 rail) */}
        {sidebarOpen ? (
          <Sidebar onCollapse={() => setSidebarOpen(false)} onOpenSettings={() => setSettingsOpen(true)} />
        ) : (
          <div className="col-rail">
            <button
              type="button"
              className="col-rail-btn"
              aria-label="사이드바 펼치기"
              onClick={() => setSidebarOpen(true)}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M5 3 L9 7 L5 11" fill="none" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </button>
          </div>
        )}

        {/* ② 탐색기 (+diff 탭, 접힘 rail) */}
        {explorerOpen ? (
          <aside className="pane explorer">
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
              <button
                type="button"
                className="pane-collapse"
                aria-label="탐색기 접기"
                onClick={() => setExplorerOpen(false)}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path d="M9 3 L5 7 L9 11" fill="none" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </button>
            </div>
            {leftTab === 'explorer' ? <FileExplorer /> : <DiffViewerPane />}
          </aside>
        ) : (
          <div className="col-rail">
            <button
              type="button"
              className="col-rail-btn"
              aria-label="탐색기 펼치기"
              onClick={() => setExplorerOpen(true)}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M5 3 L9 7 L5 11" fill="none" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </button>
          </div>
        )}

        {/* ③ 대화 / 코드뷰어 탭 전환 */}
        <main className="pane chat">
          <div className="pane-tabs">
            <button
              className={`pane-tab${centerTab === 'conversation' ? ' pane-tab--active' : ''}`}
              onClick={() => setCenterTab('conversation')}
              type="button"
            >
              대화
            </button>
            <button
              className={`pane-tab${centerTab === 'code' ? ' pane-tab--active' : ''}`}
              onClick={() => setCenterTab('code')}
              type="button"
            >
              코드
            </button>
          </div>
          <div className="center-pane-content">
            {centerTab === 'conversation' ? <Conversation /> : <CodeViewerPane />}
          </div>
        </main>

        {/* ④ 에이전트 패널 (헤더는 AgentPanel 소유) */}
        <aside className="pane agent">
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

      {/* 리사이즈 핸들 — maximized면 여백 없어 불필요 */}
      {!maximized && <ResizeHandles />}

      {/* 설정 모달 (F5) */}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  )
}

export default memo(Shell)
