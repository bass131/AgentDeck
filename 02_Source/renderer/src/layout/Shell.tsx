import { useState, useEffect, useRef, memo, useCallback, type JSX } from 'react'
import { FileExplorer } from '../features/file'
import { Conversation, type InjectedInput } from '../components/01_conversation/Conversation'
import SubAgentSplitView from '../components/05_agent/SubAgentSplitView'
import TitleBar from '../components/00_shell/TitleBar'
import ResizeHandles from '../components/00_shell/ResizeHandles'
import Sidebar from '../components/00_shell/Sidebar'
import SettingsModal from '../components/00_shell/SettingsModal'
import GitModal from '../components/04_git/GitModal'
import { AskModal } from '../features/prompt'
import { RecentFiles } from '../features/file'
import { FileModal } from '../features/file'
import type { AskSelectionArgs } from '../features/viewer'
import { buildAskPayload } from '../features/viewer'
import { ImageViewer } from '../features/viewer'
import { UpdateNotes } from '../features/notice'
import { AppUpdateGate } from '../features/notice'
import { Profile } from '../components/00_shell/Profile'
import MultiWorkspace from '../components/00_shell/MultiWorkspace'
import { QuestionModal } from '../features/prompt'
import { ZoomControl } from '../components/00_shell/ZoomControl'
import { SAMPLE_QUESTIONS } from '../lib/f14SampleData'
import { useWindowState } from '../lib/useWindowState'
import { useGlobalShortcuts } from '../lib/useGlobalShortcuts'
import { useGlobalZoomPersist, stepZoomFactor } from '../lib/useGlobalZoom'
import { getPref, setPref } from '../lib/prefs'
import { decideStopAction } from '../lib/stopAction'
import { loadPaneWidth } from '../lib/paneResize'
import { WhatsNew, SEEN_KEY, decideStartupModal } from '../features/whats-new'
import { ENGINE_SEEN_KEY, decideEngineNotice } from '../lib/engineUpdateTrigger'
import { EngineUpdateNotice } from '../features/notice'
import type { EngineUpdateInfo } from '../../../shared/ipcContract'
import { ZOOM_FACTOR_STEP } from '../../../shared/ipcContract'
import {
  useAppStore,
  selectWorkspaceRoot,
  selectChangedFiles,
  selectIsRunning,
  selectOpenedFile,
  selectRecentFiles,
  selectWorkspaceMode,
  selectActiveMultiSessionId,
} from '../store/appStore'
import { isAnyModalOpen } from '../lib/useGlobalShortcuts'
import './shell.css'

export function Shell(): JSX.Element {
  const workspaceRoot = useAppStore(selectWorkspaceRoot)
  const changedFiles = useAppStore(selectChangedFiles)
  const isRunning = useAppStore(selectIsRunning)
  const openedFile = useAppStore(selectOpenedFile)
  const recentFiles = useAppStore(selectRecentFiles)
  const workspaceMode = useAppStore(selectWorkspaceMode)
  const activeMultiSessionId = useAppStore(selectActiveMultiSessionId)

  useEffect(() => {
    const saved = loadPaneWidth('agentW', 0)
    if (saved > 0) {
      document.documentElement.style.setProperty('--agent-w', `${saved}px`)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    return unsubscribe
  }, [])

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [explorerOpen, setExplorerOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [gitOpen, setGitOpen] = useState(false)
  const [gitRoot, setGitRoot] = useState<string | null>(null)
  const [inject, setInject] = useState<InjectedInput>({ text: '', nonce: 0 })
  const [askOpen, setAskOpen] = useState(false)
  const [askMinimized, setAskMinimized] = useState(false)
  const [imageViewer, setImageViewer] = useState<{ images: string[]; index: number } | null>(null)
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)
  const [updateNotesOpen, setUpdateNotesOpen] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [engineNoticeOpen, setEngineNoticeOpen] = useState(false)
  const [engineUpdate, setEngineUpdate] = useState<EngineUpdateInfo | null>(null)
  const [appUpdateOpen, setAppUpdateOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [questionOpen, setQuestionOpen] = useState(false)

  const handleOpenImage = useCallback((images: string[], index: number) => {
    setImageViewer({ images, index })
  }, [])

  const cancelledRef = useRef(false)
  useEffect(() => {
    cancelledRef.current = false
    window.api
      .getAppVersion()
      .then((v) => {
        if (cancelledRef.current || !v) return
        setAppVersion(v)
        const seen = getPref<string>(SEEN_KEY, '')
        const which = decideStartupModal(v, seen)
        if (which === 'whatsnew') setWhatsNewOpen(true)
        else if (which === 'updatenotes') setUpdateNotesOpen(true)
      })
      .catch(() => {
      })
    return () => {
      cancelledRef.current = true
    }
  }, [])

  useEffect(() => {
    cancelledRef.current = false
    window.api
      .checkEngineUpdate()
      .then((info) => {
        if (cancelledRef.current) return
        if (decideEngineNotice(info, getPref<string>(ENGINE_SEEN_KEY, ''))) {
          setEngineUpdate(info)
          setEngineNoticeOpen(true)
        }
      })
      .catch(() => {
      })
    return () => {
      cancelledRef.current = true
    }
  }, [])

  useEffect(() => {
    setPref('workspace.mode', workspaceMode)
  }, [workspaceMode])

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

  useGlobalShortcuts({
    toggleSidebar: () => setSidebarOpen((v) => !v),
    onNewChat: () => {
      useAppStore.getState().newConversation()
    },
    onOpenFolder: () => {
      void useAppStore.getState().openWorkspace()
    },
    onZoomIn: () => stepZoomFactor(ZOOM_FACTOR_STEP),
    onEscape: () => {
      if (isAnyModalOpen()) return
      if (workspaceMode !== 'single') return
      if (isRunning) {
        const state = useAppStore.getState()
        const action = decideStopAction(state.replMode, state.activeLoops, state.pendingCommand)
        if (action === 'interrupt') void state.interruptRun()
        else void state.abortRun()
      }
    },
    onModeSwitch: () => useAppStore.getState().cyclePickerMode(),
  })

  const maximized = useWindowState()

  useGlobalZoomPersist()

  const folderName = workspaceRoot ? (workspaceRoot.split(/[\\/]/).pop() ?? workspaceRoot) : ''
  const titleBarText = folderName ? `AgentDeck — ${folderName}` : 'AgentDeck'

  return (
    <>
      <div className={`win${maximized ? ' max' : ''}`}>
        <TitleBar title={titleBarText} maximized={maximized} />

        <div className="win-body">
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

        {workspaceMode === 'single' && explorerOpen ? (
          <aside className="pane explorer">
            <FileExplorer
              onOpenGit={() => {
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

        {workspaceMode === 'multi' ? null : (
        <main className="pane chat">
          <RecentFiles
            files={recentFiles}
            activePath={openedFile}
            onOpen={(path) => useAppStore.getState().openFile(path)}
            onRemove={(paths) => useAppStore.getState().removeRecentFiles(paths)}
            onReorder={(files) => useAppStore.getState().reorderRecentFiles(files)}
          />
          <Conversation
            onSlashAsk={() => {
              setAskOpen(true)
              setAskMinimized(false)
            }}
            onOpenImage={handleOpenImage}
            injectedInput={inject}
          />
        </main>
        )}

        {workspaceMode === 'multi' && <MultiWorkspace key={activeMultiSessionId} />}

        {workspaceMode === 'single' && <SubAgentSplitView />}
      </div>

      <footer className="statusbar">
        <span>
          <span className={`dot${isRunning ? ' dot--run' : ''}`} />
          {isRunning ? '실행 중' : '준비됨'}
        </span>
        <span>변경 {changedFiles.size}</span>
        <span>{workspaceRoot ? 'main' : '—'}</span>
        <ZoomControl />
      </footer>
      </div>

      {!maximized && <ResizeHandles />}

      <FileModal
        onAskSelection={(args: AskSelectionArgs) => {
          setInject((prev) => ({
            text: buildAskPayload(args),
            nonce: prev.nonce + 1,
          }))
        }}
      />

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      {gitOpen && gitRoot != null && (
        <GitModal
          root={gitRoot}
          onClose={() => {
            setGitOpen(false)
            setGitRoot(null)
          }}
          onOpenFile={(path, _content, _diff) => {
            void useAppStore.getState().openFile(path)
          }}
          onAskClaude={(prompt) => {
            setInject((prev) => ({ text: prompt, nonce: prev.nonce + 1 }))
          }}
        />
      )}

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

      {imageViewer && (
        <ImageViewer
          images={imageViewer.images}
          index={imageViewer.index}
          onIndexChange={(i) => setImageViewer((prev) => prev ? { ...prev, index: i } : null)}
          onClose={() => setImageViewer(null)}
        />
      )}

      <WhatsNew
        open={whatsNewOpen}
        onClose={() => {
          if (appVersion) setPref(SEEN_KEY, appVersion)
          setWhatsNewOpen(false)
        }}
      />

      <UpdateNotes
        open={updateNotesOpen}
        onClose={() => {
          if (appVersion) setPref(SEEN_KEY, appVersion)
          setUpdateNotesOpen(false)
        }}
      />

      <EngineUpdateNotice
        open={engineNoticeOpen}
        current={engineUpdate?.current ?? null}
        latest={engineUpdate?.latest ?? null}
        onClose={() => {
          if (engineUpdate?.latest) setPref(ENGINE_SEEN_KEY, engineUpdate.latest)
          setEngineNoticeOpen(false)
        }}
      />

      <AppUpdateGate
        open={appUpdateOpen}
        phase="available"
        onClose={() => setAppUpdateOpen(false)}
      />

      {profileOpen && (
        <div className="pf-overlay">
          <Profile
            initial={null}
            onEnter={() => setProfileOpen(false)}
          />
        </div>
      )}

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
