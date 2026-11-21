import { useState, useEffect, useRef, memo, useCallback, type JSX } from 'react'
import { FileExplorer } from '@renderer/07_Workspace/file'
import { Conversation, type InjectedInput } from '@renderer/05_Conversation'
import { SubAgentSplitView } from '@renderer/03_Agent'
import { TitleBar, ResizeHandles, Sidebar, SettingsModal, Profile, ZoomControl } from '.'
import { GitModal } from '@renderer/08_Git'
import { WorkView, useWorkStore, startAlerts } from '@renderer/13_Loop'
import { AskModal } from '@renderer/03_Agent/prompt'
import { RecentFiles } from '@renderer/07_Workspace/file'
import { FileModal } from '@renderer/07_Workspace/file'
import type { AskSelectionArgs } from '@renderer/07_Workspace'
import { buildAskPayload } from '@renderer/07_Workspace'
import { ImageViewer } from '@renderer/07_Workspace'
import { UpdateNotes, EngineGate } from '@renderer/10_Engine'
import { Onboarding, ONBOARDING_KEY, autoOpenWanted, type OnboardingTarget } from '@renderer/14_Onboarding'
import { useWindowState } from './useWindowState'
import { useStatusBranch } from './useStatusBranch'
import { ipc } from '@renderer/01_Ipc'
import { useGlobalShortcuts, globalModeSwitchFor, shellEscape } from './useGlobalShortcuts'
import { useGlobalZoomPersist, stepZoomFactor } from './useGlobalZoom'
import { getPref, setPref } from '@renderer/11_Settings/prefs'
import { useModalLayer } from '@renderer/02_Common/modalStack'
import { loadPaneWidth } from './paneResize'
import { WhatsNew, SEEN_KEY, decideStartupModal } from '@renderer/10_Engine/whats-new'
import { ENGINE_SEEN_KEY, decideEngineNotice } from '@renderer/10_Engine/engineUpdateTrigger'
import { EngineUpdateNotice } from '@renderer/10_Engine'
import type { EngineState, EngineUpdateInfo } from '@shared/ipcContract'
import { ZOOM_FACTOR_STEP } from '@shared/ipcContract'
import {
  useAppStore,
  selectWorkspaceRoot,
  selectChangedFiles,
  selectIsRunning,
  selectOpenedFile,
  selectRecentFiles,
  selectWorkspaceMode,
} from '@renderer/00_App/appStore'
import { nextInject } from './inject'
import './shell.css'

// away: 안내의 단계 버튼이 연 모달(엔진 로그인 안내·설정) 동안 — 그 모달을 닫으면 안내로 돌아온다
type GuidePhase = 'closed' | 'open' | 'away'

const UNREAD_ENGINE: EngineState = { available: true, authed: false, version: null }

export function Shell(): JSX.Element {
  const workspaceRoot = useAppStore(selectWorkspaceRoot)
  const changedFiles = useAppStore(selectChangedFiles)
  const isRunning = useAppStore(selectIsRunning)
  const openedFile = useAppStore(selectOpenedFile)
  const recentFiles = useAppStore(selectRecentFiles)
  const workspaceMode = useAppStore(selectWorkspaceMode)
  const statusBranch = useStatusBranch(workspaceRoot, isRunning)

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
  const [settingsNav, setSettingsNav] = useState<'version' | 'github'>('version')
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
  const [profileOpen, setProfileOpen] = useState(false)
  const [guide, setGuide] = useState<GuidePhase>('closed')
  const [engineGate, setEngineGate] = useState<EngineState | null>(null)
  // 프로필 창은 Esc로 닫지 않는다 — 층에만 올라 그동안 Esc가 채팅 실행을 끊지 않게 한다
  useModalLayer(profileOpen)
  // 첫 그리기 전에 저장된 작업 폴더를 읽어, 작업 모드가 빈 폴더로 한 번 그려지지 않게 한다
  useState(() => { useWorkStore.getState().hydrate(); return null })
  // 알림 목록은 모드와 상관없이 구독한다 — Windows 알림을 누르면 그 작업 폴더의 작업 모드로 연다
  useEffect(() => startAlerts((cwd) => {
    useAppStore.getState().setWorkspaceMode('work')
    useWorkStore.getState().choose(cwd)
  }), [])

  const handleOpenImage = useCallback((images: string[], index: number) => {
    setImageViewer({ images, index })
  }, [])

  const cancelledRef = useRef(false)
  useEffect(() => {
    cancelledRef.current = false
    // 버전 판정이 끝난 뒤에 연다 — 그리기는 새 버전 소개·엔진 알림이 닫힐 때까지 미룬다
    const autoGuide = (): void => {
      if (autoOpenWanted(getPref<unknown>(ONBOARDING_KEY, null))) setGuide((g) => (g === 'closed' ? 'open' : g))
    }
    ipc.engine
      .appVersion()
      .then((v) => {
        if (cancelledRef.current) return
        if (v) {
          setAppVersion(v)
          const seen = getPref<string>(SEEN_KEY, '')
          const which = decideStartupModal(v, seen)
          if (which === 'whatsnew') setWhatsNewOpen(true)
          else if (which === 'updatenotes') setUpdateNotesOpen(true)
        }
        autoGuide()
      })
      .catch(() => {
        if (!cancelledRef.current) autoGuide()
      })
    return () => {
      cancelledRef.current = true
    }
  }, [])

  useEffect(() => {
    cancelledRef.current = false
    ipc.engine
      .checkUpdate()
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
      else if (detail === 'onboarding') setGuide('open')
    }

    window.addEventListener('agentdeck:test-open', handler)
    return () => window.removeEventListener('agentdeck:test-open', handler)
  }, [])

  const backToGuide = (): void => setGuide((g) => (g === 'away' ? 'open' : g))
  const closeEngineGate = (): void => {
    setEngineGate(null)
    backToGuide()
  }
  const goFromGuide = (target: OnboardingTarget): void => {
    const work = useWorkStore.getState()
    const toWork = (): void => useAppStore.getState().setWorkspaceMode('work')
    if (target === 'claude') {
      setGuide('away')
      ipc.engine.state().then(setEngineGate, () => setEngineGate(UNREAD_ENGINE))
    } else if (target === 'github') {
      setGuide('away')
      setSettingsNav('github')
      setSettingsOpen(true)
    } else if (target === 'project') {
      toWork()
      work.pickProject().catch(() => undefined)
    } else {
      toWork()
      work.setRight(target === 'taste' ? 'taste' : 'board')
      setGuide('closed')
    }
  }
  const startupModalOpen = whatsNewOpen || updateNotesOpen || engineNoticeOpen || profileOpen

  useGlobalShortcuts({
    toggleSidebar: () => setSidebarOpen((v) => !v),
    onNewChat: () => {
      useAppStore.getState().newConversation()
    },
    onOpenFolder: () => {
      void useAppStore.getState().openWorkspace()
    },
    onZoomIn: () => stepZoomFactor(ZOOM_FACTOR_STEP),
    onEscape: (e) => shellEscape(e, { isRunning, workspaceMode, getState: useAppStore.getState }),
    onModeSwitch: globalModeSwitchFor(workspaceMode, () => useAppStore.getState().cyclePickerMode()),
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
          <Sidebar
            onCollapse={() => setSidebarOpen(false)}
            onOpenSettings={() => {
              setSettingsNav('version')
              setSettingsOpen(true)
            }}
            onOpenOnboarding={() => setGuide('open')}
          />
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
                ipc.git
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

        {workspaceMode === 'work' ? (
          <main className="pane work">
            <WorkView />
          </main>
        ) : (
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

        {workspaceMode === 'single' && <SubAgentSplitView />}
      </div>

      <footer className="statusbar">
        <span>
          <span className={`dot${isRunning ? ' dot--run' : ''}`} />
          {isRunning ? '실행 중' : '준비됨'}
        </span>
        <span>변경 {changedFiles.size}</span>
        <span data-status-branch>{statusBranch ?? '—'}</span>
        <ZoomControl />
      </footer>
      </div>

      {!maximized && <ResizeHandles />}

      <FileModal
        onAskSelection={(args: AskSelectionArgs) => {
          setInject((prev) => nextInject(prev, buildAskPayload(args)))
        }}
      />

      {settingsOpen && (
        <SettingsModal
          initialNav={settingsNav}
          onClose={() => {
            setSettingsOpen(false)
            backToGuide()
          }}
        />
      )}

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
            setInject((prev) => nextInject(prev, prompt))
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

      {guide === 'open' && !startupModalOpen && (
        <Onboarding onClose={() => setGuide('closed')} onGo={goFromGuide} />
      )}

      {engineGate && (
        <EngineGate
          open
          available={engineGate.available}
          authed={engineGate.authed}
          version={engineGate.version}
          onRetry={() => {
            ipc.engine.state().then((s) => {
              if (s.available && s.authed) closeEngineGate()
              else setEngineGate(s)
            }, () => undefined)
          }}
          onSkip={closeEngineGate}
        />
      )}

      {profileOpen && (
        <div className="pf-overlay">
          <Profile
            initial={null}
            onEnter={() => setProfileOpen(false)}
          />
        </div>
      )}
    </>
  )
}

export default memo(Shell)
