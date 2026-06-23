/**
 * Shell.tsx — 3-pane 셸 (F15-02 재구성).
 *
 * 레이아웃: 타이틀바 / 3-pane(좌:탐색기 / 중:채팅헤더+RecentFiles+대화 / 우:에이전트상태) / 하단바.
 *
 * F15-02 변경:
 *   - 좌측 pane: `탐색기/diff` pane-tabs 제거. FileExplorer 항상 표시. onCollapse 주입.
 *   - 중앙 pane: `대화/코드` pane-tabs 제거. 항상 = 채팅헤더 + RecentFiles(.chat-files) + Conversation.
 *   - 자동전환 useEffect 2개 제거 (diffFilePath→leftTab, openedFile→centerTab).
 *   - leftTab/centerTab state 삭제.
 *   - FileModal 오버레이 추가 (파일 클릭 시 플로팅 모달).
 *   - DiffViewerPane/CodeViewerPane 직접 렌더 제거 (FileModal로 이동).
 *
 * ⚠️ 토큰 게이지: 빈 placeholder DOM만 (B8=M4).
 * ⚠️ 백엔드 라벨: 고정 텍스트 'Claude Code' (A3=Track2·M6).
 *
 * CRITICAL: renderer untrusted — fs/Node 호출 0. IPC는 store 액션 경유.
 * 인라인 색상 0 — CSS 변수 토큰.
 */
import { useState, useEffect, memo, useCallback, type JSX } from 'react'
import FileExplorer from '../components/FileExplorer'
import { Conversation, type InjectedInput } from '../components/Conversation'
import AgentPanel from '../components/AgentPanel'
import TitleBar from '../components/TitleBar'
import ResizeHandles from '../components/ResizeHandles'
import Sidebar from '../components/Sidebar'
import SettingsModal from '../components/SettingsModal'
import GitModal from '../components/GitModal'
import AskModal from '../components/AskModal'
import RecentFiles from '../components/RecentFiles'
import FileModal from '../components/FileModal'
import { ImageViewer } from '../components/ImageViewer'
import { WhatsNew } from '../components/WhatsNew'
import { UpdateNotes } from '../components/UpdateNotes'
import { EngineGate } from '../components/EngineGate'
import { AppUpdateGate } from '../components/AppUpdateGate'
import { Profile } from '../components/Profile'
import MultiWorkspace from '../components/MultiWorkspace'
import { PermissionModal } from '../components/PermissionModal'
import { QuestionModal } from '../components/QuestionModal'
import { SAMPLE_PERMISSION, SAMPLE_QUESTIONS } from '../lib/f14SampleData'
import { useWindowState } from '../lib/useWindowState'
import { useGlobalShortcuts } from '../lib/useGlobalShortcuts'
import {
  useAppStore,
  selectWorkspaceRoot,
  selectChangedFiles,
  selectIsRunning,
  selectOpenedFile,
  selectRecentFiles,
  selectWorkspaceMode,
} from '../store/appStore'
import './shell.css'

export function Shell(): JSX.Element {
  const workspaceRoot = useAppStore(selectWorkspaceRoot)
  const changedFiles = useAppStore(selectChangedFiles)
  const isRunning = useAppStore(selectIsRunning)
  const openedFile = useAppStore(selectOpenedFile)
  const recentFiles = useAppStore(selectRecentFiles)
  const workspaceMode = useAppStore(selectWorkspaceMode)

  // 컬럼 접힘(F1-b Phase 04) — rail 토글. 영속화는 후속.
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [explorerOpen, setExplorerOpen] = useState(true)
  // 설정 모달(F5)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Git 모달(F11-01 / M3 3c)
  const [gitOpen, setGitOpen] = useState(false)
  /** git 레포 루트 — git버튼 클릭 시 window.api.git.root IPC로 해석 */
  const [gitRoot, setGitRoot] = useState<string | null>(null)
  /** AI 커밋 버튼으로 주입할 프롬프트 — nonce 키(같은 프롬프트 재클릭도 트리거) */
  const [gitInject, setGitInject] = useState<InjectedInput>({ text: '', nonce: 0 })
  // Ask 모달(F11-03)
  const [askOpen, setAskOpen] = useState(false)
  const [askMinimized, setAskMinimized] = useState(false)
  // ImageViewer 라이트박스 (F12-01)
  const [imageViewer, setImageViewer] = useState<{ images: string[]; index: number } | null>(null)
  // WhatsNew 온보딩 덱 (F12-02, default false — 자동 표시 안 함)
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)
  // UpdateNotes 패치노트 (F12-02, default false — 자동 표시 안 함)
  const [updateNotesOpen, setUpdateNotesOpen] = useState(false)
  // EngineGate (F12-03, default false — 라이브 트리거 없음, 자동 표시 안 함)
  const [engineGateOpen, setEngineGateOpen] = useState(false)
  // AppUpdateGate (F12-03, default false — 라이브 트리거 없음, 자동 표시 안 함)
  const [appUpdateOpen, setAppUpdateOpen] = useState(false)
  // Profile 온보딩 (F12-03, default false — 라이브 트리거 없음, 자동 표시 안 함)
  const [profileOpen, setProfileOpen] = useState(false)
  // PermissionModal (F14-01, default false — 자동 표시 안 함, M4 트리거)
  const [permissionOpen, setPermissionOpen] = useState(false)
  // QuestionModal (F14-01, default false — 자동 표시 안 함, M4 트리거)
  const [questionOpen, setQuestionOpen] = useState(false)

  const handleOpenImage = useCallback((images: string[], index: number) => {
    setImageViewer({ images, index })
  }, [])

  // 테스트 전용 캡처 훅(navigator.webdriver 게이트, 프로덕션 무영향).
  // Playwright 자동화 환경(navigator.webdriver=true)에서만 리스너를 등록한다.
  // 프로덕션 브라우저/Electron 런타임에서 navigator.webdriver는 undefined/false이므로
  // 이 useEffect는 즉시 return하고 window에 어떤 리스너도 붙지 않는다.
  useEffect(() => {
    if (!navigator.webdriver) return

    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<string>).detail
      if (detail === 'whatsnew') setWhatsNewOpen(true)
      else if (detail === 'updatenotes') setUpdateNotesOpen(true)
      else if (detail === 'profile') setProfileOpen(true)
    }

    window.addEventListener('agentdeck:test-open', handler)
    return () => window.removeEventListener('agentdeck:test-open', handler)
  }, [])

  // F14-03: 전역 단축키 훅 (renderer 부분)
  // Esc: 모달 우선 보장 — 이 훅에서 Esc의 preventDefault 절대 호출 안 함.
  useGlobalShortcuts({
    toggleSidebar: () => setSidebarOpen((v) => !v),
    // 기타 콜백은 M4 no-op
  })

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

        {/* ② 탐색기 — multi 모드에서는 숨김. 항상 FileExplorer(탭 없음, F15-02). */}
        {workspaceMode === 'single' && explorerOpen ? (
          <aside className="pane explorer">
            <FileExplorer
              onOpenGit={() => {
                // git.root IPC로 레포 루트 해석 후 GitModal 열기
                const cwd = workspaceRoot ?? ''
                window.api.git
                  .root({ cwd })
                  .then((root) => {
                    setGitRoot(root ?? cwd)
                    setGitOpen(true)
                  })
                  .catch(() => {
                    setGitRoot(cwd)
                    setGitOpen(true)
                  })
              }}
              onCollapse={() => setExplorerOpen(false)}
            />
          </aside>
        ) : workspaceMode === 'single' ? (
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
        ) : null}

        {/* ③ multi 모드: MultiWorkspace. single 모드: 채팅 항상 표시(탭 없음, F15-02) */}
        {workspaceMode === 'multi' ? null : (
        <main className="pane chat">
          {/* 채팅 헤더 + RecentFiles(.chat-files) 스트립 — 항상 표시 (F15-02) */}
          <RecentFiles
            files={recentFiles}
            activePath={openedFile}
            onOpen={(path) => useAppStore.getState().openFile(path)}
            onRemove={(paths) => useAppStore.getState().removeRecentFiles(paths)}
            onReorder={(files) => useAppStore.getState().reorderRecentFiles(files)}
          />
          {/* 대화 — 항상 표시 (중앙 pane 탭 없음) */}
          <Conversation
            onSlashAsk={() => {
              setAskOpen(true)
              setAskMinimized(false)
            }}
            onOpenImage={handleOpenImage}
            injectedInput={gitInject}
          />
        </main>
        )}

        {/* ③b multi 모드: MultiWorkspace (탐색기+대화+에이전트 대체, 사이드바 유지) */}
        {workspaceMode === 'multi' && <MultiWorkspace />}

        {/* ④ 에이전트 패널 (헤더는 AgentPanel 소유) — single 모드만 */}
        {workspaceMode === 'single' && (
        <aside className="pane agent">
          <AgentPanel />
        </aside>
        )}
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

      {/* FileModal — fragment 레벨 fixed 오버레이(다른 모달과 동일 패턴). openedFile 있을 때만 렌더. */}
      <FileModal />

      {/* 설정 모달 (F5) */}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      {/* Git 모달 (F11-01 / M3 3c) — root가 있을 때만 렌더 */}
      {gitOpen && gitRoot != null && (
        <GitModal
          root={gitRoot}
          onClose={() => {
            setGitOpen(false)
            setGitRoot(null)
          }}
          onOpenFile={(path, _content, _diff) => {
            // 파일 모달에 파일 열기 — 현재 openFile은 path 기반 IPC 읽기.
            // 커밋 시점 내용(_content)은 M4에서 FileModal 연결 시 활용.
            void useAppStore.getState().openFile(path)
          }}
          onAskClaude={(prompt) => {
            // nonce 증가로 주입 트리거 — 같은 프롬프트 재클릭도 반영(setTimeout 리셋 불요)
            setGitInject((prev) => ({ text: prompt, nonce: prev.nonce + 1 }))
          }}
        />
      )}

      {/* Ask 모달 (F11-03) */}
      {askOpen && (
        <AskModal
          minimized={askMinimized}
          onClose={() => {
            setAskOpen(false)
            setAskMinimized(false)
          }}
          onMinimizedChange={setAskMinimized}
        />
      )}

      {/* ImageViewer 라이트박스 (F12-01) */}
      {imageViewer && (
        <ImageViewer
          images={imageViewer.images}
          index={imageViewer.index}
          onIndexChange={(i) => setImageViewer((prev) => prev ? { ...prev, index: i } : null)}
          onClose={() => setImageViewer(null)}
        />
      )}

      {/* WhatsNew 온보딩 덱 (F12-02, default off — 자동 표시 안 함) */}
      <WhatsNew open={whatsNewOpen} onClose={() => setWhatsNewOpen(false)} />

      {/* UpdateNotes 패치노트 (F12-02, default off — 자동 표시 안 함) */}
      <UpdateNotes open={updateNotesOpen} onClose={() => setUpdateNotesOpen(false)} />

      {/* EngineGate (F12-03, default off — 라이브 트리거 없음, 실동작=M5) */}
      <EngineGate
        open={engineGateOpen}
        phase="prompt"
        onClose={() => setEngineGateOpen(false)}
      />

      {/* AppUpdateGate (F12-03, default off — 라이브 트리거 없음, 실동작=M5) */}
      <AppUpdateGate
        open={appUpdateOpen}
        phase="available"
        onClose={() => setAppUpdateOpen(false)}
      />

      {/* Profile 온보딩 (F12-03, default off — 라이브 트리거 없음, 실동작=M5) */}
      {profileOpen && (
        <div className="pf-overlay">
          <Profile
            initial={null}
            onEnter={() => setProfileOpen(false)}
          />
        </div>
      )}

      {/* PermissionModal (F14-01, default off — 자동 표시 안 함, 기존 e2e 무영향) */}
      <PermissionModal
        open={permissionOpen}
        toolName={SAMPLE_PERMISSION.toolName}
        summary={SAMPLE_PERMISSION.summary}
        onRespond={() => setPermissionOpen(false)}
      />

      {/* QuestionModal (F14-01, default off — 자동 표시 안 함, 기존 e2e 무영향) */}
      <QuestionModal
        open={questionOpen}
        questions={SAMPLE_QUESTIONS}
        onAnswer={() => setQuestionOpen(false)}
        onDismiss={() => setQuestionOpen(false)}
      />
    </>
  )
}

export default memo(Shell)
