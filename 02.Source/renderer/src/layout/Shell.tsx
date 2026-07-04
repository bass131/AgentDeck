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
 * 토큰 게이지: ContextStrip(Composer)에서 실 usage(lastUsage)로 연결됨(M4-1, done.usage÷selectedModel window). 5시간/주간 한도는 정적.
 * ⚠️ 백엔드 라벨: 고정 텍스트 'Claude Code' (A3=Track2·M6).
 *
 * CRITICAL: renderer untrusted — fs/Node 호출 0. IPC는 store 액션 경유.
 * 인라인 색상 0 — CSS 변수 토큰.
 */
import { useState, useEffect, useRef, memo, useCallback, type JSX } from 'react'
import PaneSplitter from '../components/00_shell/PaneSplitter'
import FileExplorer from '../components/02_file/FileExplorer'
import { Conversation, type InjectedInput } from '../components/01_conversation/Conversation'
import AgentPanel from '../components/05_agent/AgentPanel'
import TitleBar from '../components/00_shell/TitleBar'
import ResizeHandles from '../components/00_shell/ResizeHandles'
import Sidebar from '../components/00_shell/Sidebar'
import SettingsModal from '../components/00_shell/SettingsModal'
import GitModal from '../components/04_git/GitModal'
import AskModal from '../components/06_prompt/AskModal'
import RecentFiles from '../components/02_file/RecentFiles'
import FileModal from '../components/02_file/FileModal'
import type { AskSelectionArgs } from '../components/03_viewer/SelectionAskBar'
import { buildAskPayload } from '../components/03_viewer/SelectionAskBar'
import { ImageViewer } from '../components/03_viewer/ImageViewer'
import { WhatsNew } from '../components/07_notice/WhatsNew'
import { UpdateNotes } from '../components/07_notice/UpdateNotes'
import { AppUpdateGate } from '../components/07_notice/AppUpdateGate'
import { Profile } from '../components/00_shell/Profile'
import MultiWorkspace from '../components/00_shell/MultiWorkspace'
import { QuestionModal } from '../components/06_prompt/QuestionModal'
import { ZoomControl } from '../components/00_shell/ZoomControl'
import { SAMPLE_QUESTIONS } from '../lib/f14SampleData'
import { useWindowState } from '../lib/useWindowState'
import { useGlobalShortcuts } from '../lib/useGlobalShortcuts'
import { useGlobalZoomPersist, stepZoomFactor } from '../lib/useGlobalZoom'
import { getPref, setPref } from '../lib/prefs'
import { loadPaneWidth } from '../lib/paneResize'
import { SEEN_KEY, decideStartupModal } from '../lib/whatsNewTrigger'
import { ENGINE_SEEN_KEY, decideEngineNotice } from '../lib/engineUpdateTrigger'
import { EngineUpdateNotice } from '../components/07_notice/EngineUpdateNotice'
import type { EngineUpdateInfo } from '../../../shared/ipc-contract'
import { ZOOM_FACTOR_STEP } from '../../../shared/ipc-contract'
import {
  useAppStore,
  selectWorkspaceRoot,
  selectChangedFiles,
  selectIsRunning,
  selectOpenedFile,
  selectRecentFiles,
  selectWorkspaceMode,
  selectActiveMultiSessionId,
  selectReplMode,
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
  // 2단계: activeMultiSessionId를 key로 → 세션 전환 시 MultiWorkspace 재마운트(깨끗한 로드).
  // 단방향: store.activeMultiSessionId → key → 재마운트 → 마운트 load.
  // MultiWorkspace가 activeId의 truth가 아님(store 소유).
  const activeMultiSessionId = useAppStore(selectActiveMultiSessionId)
  // LR3-03: replMode 영속 — store → setPref IPC(단방향, workspace.mode와 동일 패턴).
  // replMode 복원(prefs → store)은 main.tsx boot에서 loadPrefs() 완료 후 처리.
  const replMode = useAppStore(selectReplMode)

  // #5: 마운트 시 localStorage에서 저장된 패널 너비 복원 (CSS 변수 갱신)
  useEffect(() => {
    const saved = loadPaneWidth('agentW', 0)
    if (saved > 0) {
      document.documentElement.style.setProperty('--agent-w', `${saved}px`)
    }
  }, [])

  // Phase 07(LR3, 역방향 유령 수리): 단일챗 agent 이벤트 구독을 Shell 수명으로 승격.
  // 기존엔 Conversation.tsx 마운트 effect가 subscribeAgentEvents()를 호출했는데, Shell이
  // workspaceMode==='multi'일 때 중앙 대화 컴포넌트를 언마운트하므로(아래 렌더 분기)
  // 구독도 함께 해제돼 단일챗 자신의 활성 run이 멀티 체류 중 보내는 done/session
  // 이벤트를 영구히 놓쳤다(isRunning/currentRunId 고착 — "역방향 유령", 01.Phases/
  // switch-continuity/_diagnosis.md §멀티패널). Shell은 워크스페이스 모드와 무관하게
  // 항상 마운트돼 있으므로(App.tsx→AppGate→Shell, key 없음) 여기서 구독하면 모드 전환과
  // 무관하게 항상 라이브 — 단일챗 자신의 run도 bgRuns처럼 백그라운드에서 계속 이어진다.
  useEffect(() => {
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    return unsubscribe
  }, [])

  // 컬럼 접힘(F1-b Phase 04) — rail 토글. 영속화는 후속.
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [explorerOpen, setExplorerOpen] = useState(true)
  // 설정 모달(F5)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Git 모달(F11-01 / M3 3c)
  const [gitOpen, setGitOpen] = useState(false)
  /** git 레포 루트 — git버튼 클릭 시 window.api.git.root IPC로 해석 */
  const [gitRoot, setGitRoot] = useState<string | null>(null)
  /**
   * 단일 composer 주입 채널 — Git AI커밋·W6b SelectionAskBar 공유.
   * 단일 카운터로 nonce 단조 증가 보장: 어느 소스든 prev.nonce+1 적용.
   * 이전 구현(gitInject·fileAskInject 독립 카운터 `>` 비교)의 무음 실패 버그 수정:
   *   Git(nonce=1) → SelectionAsk(nonce=1) → 1>1=false → 선택질문 미주입 버그.
   */
  const [inject, setInject] = useState<InjectedInput>({ text: '', nonce: 0 })
  // Ask 모달(F11-03)
  const [askOpen, setAskOpen] = useState(false)
  const [askMinimized, setAskMinimized] = useState(false)
  // ImageViewer 라이트박스 (F12-01)
  const [imageViewer, setImageViewer] = useState<{ images: string[]; index: number } | null>(null)
  // WhatsNew 온보딩 덱 / UpdateNotes 패치노트 (F12-02 / P4)
  // 자동 표시: Shell 부트 트리거가 결정 (첫 실행 WhatsNew · 마이너 업데이트 UpdateNotes)
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)
  const [updateNotesOpen, setUpdateNotesOpen] = useState(false)
  /** 닫을 때 seen-key 도장용 — 부트 IPC 결과 보관 */
  const [appVersion, setAppVersion] = useState('')
  // EngineUpdateNotice (폴리싱 #2a — 부트 시 엔진 새 버전 알림, 자동 트리거)
  const [engineNoticeOpen, setEngineNoticeOpen] = useState(false)
  /** 닫을 때 seen-key 도장용 — 부트 IPC 결과 보관 */
  const [engineUpdate, setEngineUpdate] = useState<EngineUpdateInfo | null>(null)
  // AppUpdateGate (F12-03, default false — 라이브 트리거 없음, 자동 표시 안 함)
  const [appUpdateOpen, setAppUpdateOpen] = useState(false)
  // Profile 온보딩 (F12-03, default false — 라이브 트리거 없음, 자동 표시 안 함)
  const [profileOpen, setProfileOpen] = useState(false)
  // BF3 Phase 06(ADR-030): PermissionModal 데모 마운트 폐기 — 모달→PermissionCard 인라인
  // 전환으로 Shell 레벨 오버레이 데모가 무의미해졌다(카드는 Conversation/PanelView가
  // pendingPermission 실데이터로 마운트). permissionOpen은 어디서도 true로 설정된 적이
  // 없던 죽은 데모 상태였다(항상 false — 실제 트리거 미배선).
  // QuestionModal (F14-01, default false — 자동 표시 안 함, M4 트리거)
  const [questionOpen, setQuestionOpen] = useState(false)

  const handleOpenImage = useCallback((images: string[], index: number) => {
    setImageViewer({ images, index })
  }, [])

  // P4: 부트 자동 트리거 — 첫 실행 WhatsNew / 마이너 업데이트 UpdateNotes.
  // cancelled 플래그로 언마운트 후 setState 방지. IPC 실패는 graceful catch(자동 표시 생략).
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
        // IPC 실패 graceful — 자동 표시 생략, 수동 오픈 경로는 유지
      })
    return () => {
      cancelledRef.current = true
    }
  }, [])

  // 폴리싱 #2a: 부트 엔진 업데이트 알림 트리거.
  // cancelledRef 재사용(WhatsNew 트리거와 동일 패턴). IPC 실패는 graceful catch(표시 생략).
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
        // IPC 실패(오프라인 등) graceful — 엔진 알림 표시 생략
      })
    return () => {
      cancelledRef.current = true
    }
  }, [])

  // P1: workspaceMode 변경 시 prefs에 저장 (단방향: store → setPref IPC).
  // 초기 마운트 직후 첫 실행도 포함되나, setPref는 멱등적으로 캐시 갱신만 한다.
  // workspace.mode 복원(prefs → store)은 main.tsx boot에서 loadPrefs() 완료 후 처리.
  // 마운트 effect로 복원하지 않는 이유: 테스트에서 _loaded=false이면 fallback('single')을
  // 반환해 multi 모드 직접 진입 테스트를 파괴한다(회귀 가드 C 보호).
  useEffect(() => {
    setPref('workspace.mode', workspaceMode)
  }, [workspaceMode])

  // LR3-03: replMode 변경 시 prefs에 저장 — workspace.mode와 동일 패턴(단방향: store → setPref IPC).
  // 초기 마운트 직후 첫 실행도 포함되나, setPref는 멱등적으로 캐시 갱신만 한다.
  // replMode 복원(prefs → store)은 main.tsx boot에서 loadPrefs() 완료 후 처리(기본 true 폴백).
  useEffect(() => {
    setPref('replMode', replMode)
  }, [replMode])

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

  // P6: 전역 단축키 배선 — Ctrl+N / Ctrl+O / Esc(조건부 abort).
  // Esc 모달 우선 보장: isAnyModalOpen() DOM 감지로 모달 열림 시 abort 스킵.
  // 단방향: 이벤트 → onEscape 콜백 → abortRun(store 액션) → IPC(window.api 경유).
  // window.api 직접 호출 0 — store 액션이 담당.
  useGlobalShortcuts({
    toggleSidebar: () => setSidebarOpen((v) => !v),
    onNewChat: () => {
      useAppStore.getState().newConversation()
    },
    onOpenFolder: () => {
      void useAppStore.getState().openWorkspace()
    },
    // FB2 P05: Ctrl/⌘+=(shift 없음) — 영호 버그 리포트(기본 zoomIn role은 Shift+=만
    // 커버) 해소. stepZoomFactor가 P03 클램프 setter에 위임 — 이 훅은 window.api를
    // 직접 모른다(단방향: 키 이벤트 → onZoomIn 콜백 → lib/useGlobalZoom.ts → window.api).
    onZoomIn: () => stepZoomFactor(ZOOM_FACTOR_STEP),
    onEscape: () => {
      // 모달이 열려 있으면 abort 금지 (모달 자체 Esc 핸들러가 우선)
      if (isAnyModalOpen()) return
      // multi 모드에서는 abort 금지 (멀티 pane은 별도 범위)
      if (workspaceMode !== 'single') return
      // 실행 중일 때만 abort
      if (isRunning) {
        void useAppStore.getState().abortRun()
      }
    },
    // P7: pickerMode가 store로 리프팅되어 직접 cyclePickerMode() 호출 가능.
    // 단방향: Shift+Tab → onModeSwitch → cyclePickerMode(store 액션) → store.pickerMode
    // → Composer(selectPickerMode 셀렉터) 리렌더. IPC 0, renderer-only 상태.
    onModeSwitch: () => useAppStore.getState().cyclePickerMode(),
  })

  // 창 최대화 상태 — .win.max 토글(투명창 custom maximize, F1-b).
  const maximized = useWindowState()

  // FB1 P04: 전역 page zoom(Ctrl+=/−/0, Electron 기본 role) 변화 감지 → ui.setPref
  // 저장(P03 부팅 복원과 라운드트립). 단축키는 새로 등록하지 않음 — 순수 부작용
  // 훅이라 반환값 없음. Shell 수명(항상 마운트) 1곳에서만 호출.
  useGlobalZoomPersist()

  // 타이틀바는 'AgentDeck' 상시 표시(사용자 요청). 워크스페이스가 열려 있으면
  // 부가 컨텍스트로 폴더명을 뒤에 덧붙인다("AgentDeck — myproject").
  const folderName = workspaceRoot ? (workspaceRoot.split(/[\\/]/).pop() ?? workspaceRoot) : ''
  const titleBarText = folderName ? `AgentDeck — ${folderName}` : 'AgentDeck'

  return (
    <>
      {/* 투명창 위 16px inset 둥근 플로팅 카드 (데스크톱 투과). maximized면 가득 채움. */}
      <div className={`win${maximized ? ' max' : ''}`}>
        <TitleBar title={titleBarText} maximized={maximized} />

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
            injectedInput={inject}
          />
        </main>
        )}

        {/* ③b multi 모드: MultiWorkspace (탐색기+대화+에이전트 대체, 사이드바 유지) */}
        {/* 2단계: key={activeMultiSessionId} → 세션 전환 시 재마운트(깨끗한 로드). */}
        {/* 단방향: store.activeMultiSessionId → key → 재마운트 → 마운트 load. */}
        {workspaceMode === 'multi' && <MultiWorkspace key={activeMultiSessionId} />}

        {/* ④ 스플리터 + 에이전트 패널 — single 모드만 (#5 드래그 리사이즈) */}
        {workspaceMode === 'single' && (
          <>
            <PaneSplitter />
            <aside className="pane agent">
              <AgentPanel />
            </aside>
          </>
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
        {/* FB2 P05: 우측 고정 줌 컨트롤 — single/multi 모드 무관 상시 노출(이 footer는
            조건부 렌더 아님, 워크스페이스 모드와 무관하게 항상 마운트). */}
        <ZoomControl />
      </footer>
      </div>

      {/* 리사이즈 핸들 — maximized면 여백 없어 불필요 */}
      {!maximized && <ResizeHandles />}

      {/* FileModal — fragment 레벨 fixed 오버레이(다른 모달과 동일 패턴). openedFile 있을 때만 렌더. */}
      {/* W6b: onAskSelection → buildAskPayload → 단일 inject 채널 → Conversation */}
      <FileModal
        onAskSelection={(args: AskSelectionArgs) => {
          setInject((prev) => ({
            text: buildAskPayload(args),
            nonce: prev.nonce + 1,
          }))
        }}
      />

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
            // 단일 inject 채널: fileAskInject 독립 카운터와 합산된 단조 증가 보장
            setInject((prev) => ({ text: prompt, nonce: prev.nonce + 1 }))
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

      {/* WhatsNew 온보딩 덱 (F12-02 / P4 자동 트리거) — 닫을 때 seen-key 도장 */}
      <WhatsNew
        open={whatsNewOpen}
        onClose={() => {
          if (appVersion) setPref(SEEN_KEY, appVersion)
          setWhatsNewOpen(false)
        }}
      />

      {/* UpdateNotes 패치노트 (F12-02 / P4 자동 트리거) — 닫을 때 seen-key 도장 */}
      <UpdateNotes
        open={updateNotesOpen}
        onClose={() => {
          if (appVersion) setPref(SEEN_KEY, appVersion)
          setUpdateNotesOpen(false)
        }}
      />

      {/* EngineUpdateNotice (폴리싱 #2a — 부트 엔진 새 버전 알림, seen-key 도장) */}
      <EngineUpdateNotice
        open={engineNoticeOpen}
        current={engineUpdate?.current ?? null}
        latest={engineUpdate?.latest ?? null}
        onClose={() => {
          if (engineUpdate?.latest) setPref(ENGINE_SEEN_KEY, engineUpdate.latest)
          setEngineNoticeOpen(false)
        }}
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
