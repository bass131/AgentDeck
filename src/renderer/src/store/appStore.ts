/**
 * appStore.ts — Zustand 전역 store.
 *
 * 단방향 흐름: window.api.onAgentEvent → applyAgentEvent(reducer) → state → 컴포넌트.
 * 컴포넌트는 window.api를 직접 호출하지 않고 액션 함수를 통해서만 호출한다.
 *
 * CRITICAL: renderer untrusted — fs/Node/require 직접 호출 0.
 */
import { create } from 'zustand'
import type { FileTreeNode, ConversationMessage, ConversationRecord } from '../../../shared/ipc-contract'
import { applyAgentEvent, makeInitialState } from './reducer'
import type { AppState, ToolCard } from './reducer'
import { viewerForPath } from '../lib/viewer'
import type { OpenedViewer } from '../lib/viewer'
import { isImagePath, extOf } from '../lib/images'

/** 채팅 상단 최근 파일 목록(.chat-files) 최대 개수 — 마지막 열었던 파일부터 5개 */
const MAX_RECENT_FILES = 5

// ── 레퍼런스 폴더 상태 ──────────────────────────────────────────────────────────

/** store 내 레퍼런스 폴더 항목 (tree는 로드 후 채워짐) */
export interface ReferenceEntry {
  id: string
  name: string
  tree: FileTreeNode | null
}

// ── 코드 뷰어 상태 ─────────────────────────────────────────────────────────────

/** 코드 뷰어 로드 상태 */
export type OpenedStatus = 'idle' | 'loading' | 'ready' | 'too-large' | 'binary-skipped' | 'not-found'

// ── 추가 UI 상태 ───────────────────────────────────────────────────────────────

/**
 * 이미지 첨부 항목 (22c).
 * path = 엔진 노트용 절대경로, dataUrl = 표시용 data URL.
 */
export interface AttachedImage {
  path: string
  dataUrl: string
}

/**
 * 예약 큐 항목 (22d).
 * 실행 중(isRunning)에 Enter/예약버튼으로 적재, busy→idle 전이 시 FIFO 드레인.
 */
export interface QueuedMessage {
  id: string
  text: string
  images: AttachedImage[]
  picker?: { model: string; effort: string; mode: string }
}

export interface ConversationEntry {
  id: string
  role: 'user' | 'assistant'
  /** 완성된 텍스트 (assistant의 경우 streaming 완료 후 확정) */
  content: string
  /**
   * 사용자 버블에 표시할 첨부 이미지 data URL 목록 (22c).
   * in-memory 전용 — 영속화 MVP 범위 외(saveConversation은 role/content만 저장).
   */
  images?: string[]
}

export interface StoreState extends AppState {
  // ── 워크스페이스 모드 (F13: renderer state 전용, 새 IPC 0) ─────────────────
  /** 단일/멀티 에이전트 워크스페이스 모드 */
  workspaceMode: 'single' | 'multi'

  // ── 워크스페이스 ────────────────────────────────────────────────────────────
  workspaceRoot: string | null
  fileTree: FileTreeNode | null
  /** diff 뷰어에 표시할 파일 경로 */
  diffFilePath: string | null

  // ── 최근 파일 탭바 (F10-01, renderer state 전용 — 새 IPC 0) ─────────────────
  /** 최근 열린 파일 경로 목록(최신순, cap 20, dedup) */
  recentFiles: string[]

  // ── 코드 뷰어 (M2-01) ──────────────────────────────────────────────────────
  /** 현재 열린 파일 경로 (null이면 미선택) */
  openedFile: string | null
  /** 파일 내용 (text 응답 시 채워짐) */
  openedContent: string | null
  /** 파일 언어 힌트 (FsReadResponse.language) */
  openedLanguage: string | null
  /** 코드 뷰어 로드 상태 */
  openedStatus: OpenedStatus

  // ── 뷰어 종류 / 이미지 (M2-02) ─────────────────────────────────────────────
  /** 현재 열린 파일의 뷰어 종류 */
  openedViewer: OpenedViewer
  /** 이미지 파일의 data URL (binary 응답 시 채워짐) */
  openedDataUrl: string | null

  // ── 레퍼런스 폴더 (M2-03) ───────────────────────────────────────────────────
  /** 등록된 레퍼런스 폴더 목록 */
  references: ReferenceEntry[]
  /**
   * 현재 열린 파일의 루트 ID.
   * null = 워크스페이스 파일, 'ref-N' = 레퍼런스 파일 → 읽기전용 표시용.
   */
  openedRootId: string | null

  // ── 대화 ───────────────────────────────────────────────────────────────────
  /** 확정된 대화 항목 목록 */
  messages: ConversationEntry[]
  /** 현재 대화 ID (conversationSave/Load용) */
  conversationId: string | null
  /** 백엔드 라벨 — Phase 05: 고정 텍스트 'Claude Code' */
  backendLabel: string

  // ── 피커 선택값 (M4-1) ─────────────────────────────────────────────────
  /**
   * 현재 선택된 모델 id (pickerOptions MODELS id: 'opus'|'sonnet'|'fable'|'haiku').
   * 토큰 게이지의 컨텍스트 윈도우 분모 결정에 사용.
   */
  selectedModel: string

  // ── 프로젝트 파일 목록 (M4-2: @멘션 팔레트) ─────────────────────────────
  /**
   * 워크스페이스 파일 플랫 목록. `window.api.listFiles()` 응답.
   * 워크스페이스 미오픈 시 빈 배열. Composer의 mentionFiles prop에 전달.
   */
  projectFiles: string[]

  // ── 이미지 첨부 (22c) ────────────────────────────────────────────────────
  /**
   * 현재 컴포저에 첨부된 이미지 목록.
   * 전송 후 clearAttachedImages()로 리셋.
   */
  attachedImages: AttachedImage[]

  // ── 메시지 예약 큐 (22d) ─────────────────────────────────────────────────
  /**
   * 실행 중(isRunning)에 적재된 예약 메시지 목록 (FIFO).
   * busy→idle 전이 시 첫 항목부터 자동 드레인.
   */
  queue: QueuedMessage[]

  // ── 세션 CRUD (23b) ──────────────────────────────────────────────────────
  /**
   * 사이드바에 표시할 대화 목록 (최근 20개).
   * listConversations() 액션으로 갱신. 초기값 [].
   */
  conversations: ConversationRecord[]
  // ── Phase 24a: thinkingText·todos는 AppState(reducer)에서 상속 ────────────
  // thinkingText: string | null — AppState 필드. 셀렉터: selectThinkingText.
  // todos: TodoItem[]          — AppState 필드. 셀렉터: selectTodos.
}

interface StoreActions {
  // ── 워크스페이스 모드 (F13) ────────────────────────────────────────────────
  /** 단일/멀티 에이전트 모드 전환 (renderer state, IPC 0) */
  setWorkspaceMode: (mode: 'single' | 'multi') => void

  // ── 워크스페이스 ────────────────────────────────────────────────────────────
  /** workspaceOpen IPC 호출 → tree 업데이트 */
  openWorkspace: () => Promise<void>
  /** 파일 클릭 → diff 뷰어 표시 */
  selectDiffFile: (path: string | null) => void
  /**
   * 최근 파일 탭바에서 경로 제거 (renderer state, IPC 0).
   */
  removeRecentFiles: (paths: string[]) => void
  /**
   * 드래그 재정렬 후 전체 순서 반영 (renderer state, IPC 0).
   */
  reorderRecentFiles: (files: string[]) => void
  /**
   * 파일 클릭 → window.api.fsRead(IPC) → 코드 뷰어에 내용 로드.
   * rootId가 있을 때만 root 포함. 없으면 기존 {path} 형태 유지.
   * CRITICAL: window.api.fsRead 경유만 — fs/Node 직접 0.
   */
  openFile: (path: string, rootId?: string) => Promise<void>

  // ── 레퍼런스 폴더 (M2-03) ───────────────────────────────────────────────────
  /**
   * OS 다이얼로그(또는 folderPath 힌트) → referenceAdd IPC → referenceTree IPC
   * → references 배열에 push (중복 id 방지).
   */
  addReference: () => Promise<void>
  /**
   * 세션 시작 시 기존 등록 레퍼런스 목록을 복원.
   * referenceList → 각 id별 referenceTree.
   */
  loadReferences: () => Promise<void>

  // ── 파일 모달 닫기 (F15-02) ────────────────────────────────────────────────
  /**
   * 파일 모달 닫기 — openedFile/openedContent/openedStatus/diffFilePath 초기화.
   * openFile 시그니처·기존 셀렉터 무변경.
   */
  closeOpenedFile: () => void

  // ── 에이전트 ───────────────────────────────────────────────────────────────
  /**
   * 메시지 전송 → agentRun IPC 호출. pickerValues 전달 시 model/effort/mode 포함(M4-1).
   * displayImages(22c): 사용자 버블에 표시할 data URL 목록 (in-memory — 영속화 미적용).
   */
  sendMessage: (text: string, pickerValues?: { model: string; effort: string; mode: string }, promptForEngine?: string, displayImages?: string[]) => Promise<void>
  /** 실행 중단 → agentAbort IPC 호출 */
  abortRun: () => Promise<void>

  // ── 대화 영속화 ────────────────────────────────────────────────────────────
  /** 마운트 시 최근 대화 로드 */
  loadConversation: () => Promise<void>
  /** 메시지 추가 후 저장 */
  saveConversation: () => Promise<void>

  // ── IPC 구독 초기화 ────────────────────────────────────────────────────────
  /** window.api.onAgentEvent 구독 등록 → unsubscribe 반환 */
  subscribeAgentEvents: () => () => void

  // ── 피커 선택값 (M4-1) ─────────────────────────────────────────────────────
  /** 선택된 모델 id를 store에 동기화 (토큰 게이지 분모 갱신) */
  setSelectedModel: (modelId: string) => void

  // ── 대화 초기화 (22a) ───────────────────────────────────────────────────────
  /**
   * 현재 대화를 초기화하고 새 대화를 시작한다.
   * messages·streamingText·toolCards·errorMessage·conversationId를 리셋.
   * /clear 슬래시 인터셉트 + Sidebar "새 대화" 버튼에서 사용.
   * CRITICAL: renderer 상태 리셋만 — IPC 미호출, fs 접근 0.
   */
  clearConversation: () => void

  // ── 프로젝트 파일 목록 (M4-2) ──────────────────────────────────────────────
  /**
   * window.api.listFiles() IPC 호출 → projectFiles 갱신.
   * Conversation mount 시 + openWorkspace 완료 후 호출.
   * CRITICAL: window.api 경유만 — fs/Node 직접 0.
   */
  loadProjectFiles: () => Promise<void>

  // ── 이미지 첨부 (22c) ──────────────────────────────────────────────────────
  /**
   * File[] → isImagePath 필터 → pathForFile 직득 or saveImageData 폴백 → dataUrl 생성
   * → attachedImages 누적.
   * CRITICAL: window.api 경유만 — fs/Node 직접 0. Composer에서 직접 호출 X.
   */
  attachImagesFromFiles: (files: File[]) => Promise<void>
  /** 특정 index 항목 제거. */
  removeAttachedImage: (index: number) => void
  /** 전송 후 초기화. */
  clearAttachedImages: () => void

  // ── 메시지 예약 큐 (22d) ──────────────────────────────────────────────────
  /** 항목 추가 (호출자가 id 생성 — 결정론 테스트 용이). */
  enqueueMessage: (item: QueuedMessage) => void
  /** FIFO: 첫 항목 반환 + 큐에서 제거. 빈 큐 → undefined. */
  dequeueMessage: () => QueuedMessage | undefined
  /** id로 특정 항목 제거 (스트립 × 버튼용). */
  removeQueued: (id: string) => void

  // ── 세션 CRUD (23b) ────────────────────────────────────────────────────────
  /**
   * 최근 대화 목록 로드 → conversations 갱신.
   * limit:20, id 미지정(목록 모드).
   */
  listConversations: () => Promise<void>
  /**
   * 특정 대화 선택 → 해당 대화의 메시지를 현재 대화로 로드.
   * conversationLoad({id}) IPC 경유. 없는 id면 no-op.
   * streaming·toolCards·errorMessage·attachedImages 리셋.
   */
  selectConversation: (id: string) => Promise<void>
  /**
   * 대화 제목 변경 → conversationRename IPC 경유 → 로컬 conversations 갱신.
   * ok:false면 로컬 목록 무변경.
   */
  renameConversation: (id: string, title: string) => Promise<void>
  /**
   * 대화 삭제 → conversationDelete IPC 경유 → conversations에서 제거.
   * 삭제된 id가 활성 conversationId이면 clearConversation() 호출.
   * ok:false면 로컬 목록 무변경.
   */
  deleteConversation: (id: string) => Promise<void>
  /**
   * 새 대화 시작 → clearConversation() 재사용.
   * messages·conversationId·streaming 등 리셋. IPC 미호출.
   */
  newConversation: () => void
}

export type AppStore = StoreState & StoreActions

let _msgIdCounter = 0
function nextMsgId(): string {
  _msgIdCounter += 1
  return `msg-${_msgIdCounter}`
}

export const useAppStore = create<AppStore>((set, get) => ({
  // ── AppState 초기값 ───────────────────────────────────────────────────────
  ...makeInitialState(),

  // ── 추가 초기값 ───────────────────────────────────────────────────────────
  workspaceMode: 'single' as const,
  workspaceRoot: null,
  fileTree: null,
  diffFilePath: null,
  recentFiles: [],
  openedFile: null,
  openedContent: null,
  openedLanguage: null,
  openedStatus: 'idle' as OpenedStatus,
  openedViewer: 'code' as OpenedViewer,
  openedDataUrl: null,
  references: [],
  openedRootId: null,
  messages: [],
  conversationId: null,
  backendLabel: 'Claude Code',
  selectedModel: 'opus', // M4-1: DEFAULT_MODEL 동기화 (토큰 게이지 분모)
  projectFiles: [], // M4-2: @멘션 팔레트 실 파일 목록
  attachedImages: [], // 22c: 이미지 첨부 목록
  queue: [], // 22d: 예약 메시지 큐
  conversations: [], // 23b: 사이드바 대화 목록

  // ── 워크스페이스 모드 (F13) ──────────────────────────────────────────────
  setWorkspaceMode: (mode) => {
    set({ workspaceMode: mode })
  },

  // ── 워크스페이스 ─────────────────────────────────────────────────────────
  openWorkspace: async () => {
    const res = await window.api.workspaceOpen({})
    if (res.rootPath) {
      set({ workspaceRoot: res.rootPath, fileTree: res.tree })
      // M4-2: 워크스페이스 바뀌면 파일 목록 갱신 (@멘션 팔레트)
      void get().loadProjectFiles()
    }
  },

  selectDiffFile: (path) => {
    set({ diffFilePath: path })
  },

  removeRecentFiles: (paths) => {
    const pathSet = new Set(paths)
    set((s) => ({ recentFiles: s.recentFiles.filter((p) => !pathSet.has(p)) }))
  },

  reorderRecentFiles: (files) => {
    set({ recentFiles: files })
  },

  openFile: async (path: string, rootId?: string) => {
    // recentFiles 최신순 누적(dedup, 마지막 열었던 파일부터 최근 5개만) — renderer state, IPC 0
    set((s) => {
      const filtered = s.recentFiles.filter((p) => p !== path)
      return { recentFiles: [path, ...filtered].slice(0, MAX_RECENT_FILES) }
    })
    // 파일 종류를 경로로 판별
    const viewer = viewerForPath(path)

    // loading 상태로 전환. openedViewer는 미리 세팅 (깜빡임 최소화)
    set({
      openedFile: path,
      openedStatus: 'loading',
      openedContent: null,
      openedLanguage: null,
      openedDataUrl: null,
      openedViewer: viewer,
      // rootId 유무로 읽기전용 판별 — loading 진입 시 미리 세팅
      openedRootId: rootId ?? null,
    })

    try {
      // 이미지일 때만 asBinary:true. rootId가 있을 때만 root 포함.
      // 기존 {path} 단언이 root 없는 케이스를 검사하므로 조건부로만 추가.
      let req: { path: string; asBinary?: boolean; root?: string }
      if (viewer === 'image') {
        req = rootId ? { path, asBinary: true, root: rootId } : { path, asBinary: true }
      } else {
        req = rootId ? { path, root: rootId } : { path }
      }

      // IPC 경유 — renderer는 fs/Node 직접 0
      const res = await window.api.fsRead(req)

      switch (res.kind) {
        case 'text':
          set({
            openedContent: res.content,
            openedLanguage: res.language,
            openedStatus: 'ready',
            openedDataUrl: null,
          })
          break
        case 'binary':
          // M2-02: 이미지 data URL 세팅
          set({
            openedDataUrl: res.dataUrl,
            openedContent: null,
            openedLanguage: null,
            openedStatus: 'ready',
          })
          break
        case 'too-large':
          set({ openedContent: null, openedLanguage: null, openedDataUrl: null, openedStatus: 'too-large' })
          break
        case 'binary-skipped':
          set({ openedContent: null, openedLanguage: null, openedDataUrl: null, openedStatus: 'binary-skipped' })
          break
        case 'not-found':
          set({ openedContent: null, openedLanguage: null, openedDataUrl: null, openedStatus: 'not-found' })
          break
        default: {
          // 타입 exhaustive 체크용 — 컴파일 시점에 never
          const _exhaustive: never = res
          void _exhaustive
          set({ openedContent: null, openedLanguage: null, openedDataUrl: null, openedStatus: 'not-found' })
        }
      }
    } catch {
      set({ openedContent: null, openedLanguage: null, openedDataUrl: null, openedStatus: 'not-found' })
    }
  },

  // ── 파일 모달 닫기 (F15-02) ──────────────────────────────────────────────
  closeOpenedFile: () => {
    set({
      openedFile: null,
      openedContent: null,
      openedLanguage: null,
      openedStatus: 'idle',
      openedDataUrl: null,
      diffFilePath: null,
    })
  },

  // ── 레퍼런스 폴더 (M2-03) ────────────────────────────────────────────────
  addReference: async () => {
    // IPC 경유 — main이 OS 다이얼로그 / 경로 검증 / ID 발급 담당
    const res = await window.api.referenceAdd({})
    if (!res.reference) return // 사용자 취소 or 검증 실패

    const { id, name } = res.reference

    // 중복 방지 — 이미 같은 id가 등록되어 있으면 skip
    const existing = get().references
    if (existing.some((r) => r.id === id)) return

    // 트리 로드 (IPC 경유)
    const treeRes = await window.api.referenceTree({ id })
    const tree = treeRes.tree

    set((s) => ({
      references: [...s.references, { id, name, tree }],
    }))
  },

  loadReferences: async () => {
    // IPC 경유 — 세션 초기화 시 기존 등록 목록 복원
    const listRes = await window.api.referenceList({})
    const entries = await Promise.all(
      listRes.references.map(async (ref) => {
        const treeRes = await window.api.referenceTree({ id: ref.id })
        return { id: ref.id, name: ref.name, tree: treeRes.tree }
      })
    )
    set({ references: entries })
  },

  // ── 에이전트 ─────────────────────────────────────────────────────────────
  sendMessage: async (text: string, pickerValues?: { model: string; effort: string; mode: string }, promptForEngine?: string, displayImages?: string[]) => {
    const state = get()
    if (state.isRunning) return

    const userEntry: ConversationEntry = {
      id: nextMsgId(),
      role: 'user',
      // 표시/저장 메시지는 항상 원문(text) — 노트는 엔진에만 전달
      content: text,
      // 22c: 사용자 버블 썸네일용 data URL (in-memory)
      ...(displayImages && displayImages.length > 0 ? { images: displayImages } : {}),
    }

    // 사용자 메시지를 목록에 추가하고 스트리밍 초기화
    set((s) => ({
      messages: [...s.messages, userEntry],
      streamingText: '',
      errorMessage: undefined,
      isRunning: true,
    }))

    // IPC 메시지 형식으로 변환
    const history: ConversationMessage[] = get().messages.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    // M4-2: promptForEngine 제공 시 history 마지막 메시지(=방금 추가한 user 메시지)
    // content를 엔진 전달용 prompt(멘션 노트 포함)로 교체.
    // 표시 메시지(userEntry.content)는 원문 text 유지.
    if (promptForEngine && history.length > 0) {
      history[history.length - 1] = { ...history[history.length - 1], content: promptForEngine }
    }

    const res = await window.api.agentRun({
      messages: history,
      workspaceRoot: get().workspaceRoot ?? undefined,
      // M4-1: picker 선택값 포함 (미전달 시 undefined → main이 CLI 기본값 사용)
      model: pickerValues?.model,
      effort: pickerValues?.effort,
      mode: pickerValues?.mode,
    })

    set({ currentRunId: res.runId })

    // 대화 저장 (비동기, 결과 무시)
    void get().saveConversation()
  },

  abortRun: async () => {
    const { currentRunId } = get()
    if (!currentRunId) return
    // 원본 미러(App.tsx:534): 실행 중단은 예약 큐도 함께 폐기한다.
    // 큐를 먼저 비워야 abort→done/error 전이 시 드레인 effect가 자동전송하지 않는다.
    set({ queue: [] })
    await window.api.agentAbort({ runId: currentRunId })
  },

  // ── 대화 영속화 ──────────────────────────────────────────────────────────
  loadConversation: async () => {
    const res = await window.api.conversationLoad({ limit: 1 })
    if (res.conversations.length === 0) return
    const conv = res.conversations[0]
    set({
      conversationId: conv.id,
      messages: conv.messages.map((m) => ({
        id: nextMsgId(),
        role: m.role,
        content: m.content,
      })),
    })
  },

  saveConversation: async () => {
    const { messages, conversationId } = get()
    if (messages.length === 0) return
    // ConversationSaveRequest: id optional (intersection trick) → 명시적 캐스트
    type SaveConv = Parameters<typeof window.api.conversationSave>[0]['conversation']
    const convPayload: SaveConv = {
      id: conversationId ?? (undefined as unknown as string),
      title: (messages[0]?.content ?? '').slice(0, 40) || 'untitled',
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      backendId: 'claude-code',
    }
    const res = await window.api.conversationSave({
      conversation: convPayload,
    })
    if (!conversationId) {
      set({ conversationId: res.id })
    }
    // 23b: 목록 즉시 갱신 — 신규 대화가 사이드바에 반영됨.
    // listConversations는 읽기 전용(saveConversation 미호출) → 무한루프 없음.
    void get().listConversations()
  },

  // ── IPC 구독 초기화 ──────────────────────────────────────────────────────
  subscribeAgentEvents: () => {
    const unsubscribe = window.api.onAgentEvent((payload) => {
      // 리듀서를 통해 상태 갱신 (단방향)
      set((state) => {
        const next = applyAgentEvent(state as AppState, payload)

        // done 이벤트: 스트리밍 텍스트를 확정 메시지로 이동
        if (payload.event.type === 'done') {
          const currentText = state.streamingText
          if (currentText.length > 0) {
            const assistantEntry: ConversationEntry = {
              id: nextMsgId(),
              role: 'assistant',
              content: currentText,
            }
            return {
              ...next,
              messages: [...(state as AppStore).messages, assistantEntry],
              streamingText: '',
            }
          }
        }

        return next as Partial<AppStore>
      })

      // done 이벤트 후 대화 저장 (side-effect은 액션에서)
      if (payload.event.type === 'done') {
        void get().saveConversation()
      }
    })
    return unsubscribe
  },

  // ── 피커 선택값 (M4-1) ──────────────────────────────────────────────────
  setSelectedModel: (modelId) => {
    set({ selectedModel: modelId })
  },

  // ── 대화 초기화 (22a) ────────────────────────────────────────────────────
  clearConversation: () => {
    // renderer 상태 리셋만 — IPC/fs 0. 단방향: 상태 → 뷰.
    // makeInitialState()로 AppState(streamingText·toolCards·changedFiles·isRunning 등) 리셋 +
    // messages·conversationId(StoreState 추가 필드)도 함께 초기화.
    // 22c: attachedImages도 함께 리셋.
    // 22d: queue도 함께 리셋.
    // 24a: thinkingText·todos는 makeInitialState()에 포함(null·[]).
    set({
      ...makeInitialState(),
      messages: [],
      conversationId: null,
      attachedImages: [],
      queue: [],
    })
  },

  // ── 이미지 첨부 (22c) ────────────────────────────────────────────────────
  attachImagesFromFiles: async (files: File[]) => {
    const added: AttachedImage[] = []
    for (const file of files) {
      // 이미지가 아니면 skip
      const isImage = file.type.startsWith('image/') || isImagePath(file.name)
      if (!isImage) continue

      // dataUrl 생성 (FileReader, Promise 래핑)
      const dataUrl: string = await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => resolve('')
        reader.readAsDataURL(file)
      })
      if (!dataUrl) continue

      // path 취득: pathForFile 직득 → 실패/비이미지이면 saveImageData 폴백
      let path = ''
      try {
        path = window.api.pathForFile(file)
      } catch {
        path = ''
      }

      if (!path || !isImagePath(path)) {
        // 클립보드 붙여넣기 등 — saveImageData IPC 경유
        try {
          const buf = await file.arrayBuffer()
          const res = await window.api.saveImageData({ bytes: buf, ext: extOf(file) })
          path = res.path
        } catch {
          // unreadable blob — skip
          continue
        }
      }

      if (path) {
        added.push({ path, dataUrl })
      }
    }
    if (added.length > 0) {
      set((s) => ({ attachedImages: [...s.attachedImages, ...added] }))
    }
  },

  removeAttachedImage: (index: number) => {
    set((s) => ({ attachedImages: s.attachedImages.filter((_, i) => i !== index) }))
  },

  clearAttachedImages: () => {
    set({ attachedImages: [] })
  },

  // ── 메시지 예약 큐 (22d) ─────────────────────────────────────────────────
  enqueueMessage: (item) => {
    set((s) => ({ queue: [...s.queue, item] }))
  },

  dequeueMessage: () => {
    const [first, ...rest] = get().queue
    if (!first) return undefined
    set({ queue: rest })
    return first
  },

  removeQueued: (id) => {
    set((s) => ({ queue: s.queue.filter((q) => q.id !== id) }))
  },

  // ── 세션 CRUD (23b) ──────────────────────────────────────────────────────
  listConversations: async () => {
    // id 미지정 → 최근 목록 모드 (읽기 전용, saveConversation 미호출 → 무한루프 없음)
    // 응답이 비정상(undefined)이어도 크래시 없이 빈 목록 유지(방어적).
    const res = await window.api.conversationLoad({ limit: 20 })
    set({ conversations: res?.conversations ?? [] })
  },

  selectConversation: async (id: string) => {
    const res = await window.api.conversationLoad({ id })
    if (!res?.conversations?.length) return // no-op: 없는 id / 비정상 응답
    const conv = res.conversations[0]
    set({
      conversationId: conv.id,
      messages: conv.messages.map((m) => ({
        id: nextMsgId(),
        role: m.role,
        content: m.content,
      })),
      // 스트리밍·도구카드·오류·첨부 리셋 (makeInitialState의 AppState 필드 부분)
      streamingText: '',
      toolCards: [],
      errorMessage: undefined,
      isRunning: false,
      attachedImages: [],
    })
  },

  renameConversation: async (id: string, title: string) => {
    const res = await window.api.conversationRename({ id, title })
    if (!res.ok) return
    // ok: 로컬 목록 해당 항목 title만 갱신 (전체 리로드 없이 즉시 반영)
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, title } : c
      ),
    }))
  },

  deleteConversation: async (id: string) => {
    const res = await window.api.conversationDelete({ id })
    if (!res.ok) return
    // 목록에서 제거
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
    }))
    // 삭제된 대화가 현재 활성 대화이면 빈 대화로 리셋
    if (get().conversationId === id) {
      get().clearConversation()
    }
  },

  newConversation: () => {
    // clearConversation 재사용 — IPC 미호출, renderer 상태 리셋만
    get().clearConversation()
  },

  // ── 프로젝트 파일 목록 (M4-2) ────────────────────────────────────────────
  loadProjectFiles: async () => {
    // IPC 경유 — renderer는 fs/Node 직접 0. main이 워크스페이스 루트 열거.
    try {
      const res = await window.api.listFiles()
      set({ projectFiles: res.files })
    } catch {
      // 워크스페이스 미오픈 등 실패 시 빈 배열 유지 — 팔레트는 graceful degradation
    }
  },
}))

// ── 셀렉터 (과리렌더 방지) ──────────────────────────────────────────────────────

/** 스트리밍 텍스트만 구독 */
export const selectStreamingText = (s: AppStore): string => s.streamingText
/** 도구 카드 목록만 구독 */
export const selectToolCards = (s: AppStore): ToolCard[] => s.toolCards
/** 변경 파일 set만 구독 */
export const selectChangedFiles = (s: AppStore): Set<string> => s.changedFiles
/** 실행 중 여부만 구독 */
export const selectIsRunning = (s: AppStore): boolean => s.isRunning
/** 메시지 목록만 구독 */
export const selectMessages = (s: AppStore): ConversationEntry[] => s.messages
/** 에러 메시지만 구독 */
export const selectErrorMessage = (s: AppStore): string | undefined => s.errorMessage
/** 파일 트리만 구독 */
export const selectFileTree = (s: AppStore): FileTreeNode | null => s.fileTree
/** 워크스페이스 루트만 구독 */
export const selectWorkspaceRoot = (s: AppStore): string | null => s.workspaceRoot
/** diff 파일 경로만 구독 */
export const selectDiffFilePath = (s: AppStore): string | null => s.diffFilePath
/** 백엔드 라벨만 구독 */
export const selectBackendLabel = (s: AppStore): string => s.backendLabel

// ── 코드 뷰어 셀렉터 ────────────────────────────────────────────────────────────
/** 열린 파일 경로만 구독 */
export const selectOpenedFile = (s: AppStore): string | null => s.openedFile
/** 열린 파일 내용만 구독 */
export const selectOpenedContent = (s: AppStore): string | null => s.openedContent
/** 열린 파일 언어만 구독 */
export const selectOpenedLanguage = (s: AppStore): string | null => s.openedLanguage
/** 코드 뷰어 상태만 구독 */
export const selectOpenedStatus = (s: AppStore): OpenedStatus => s.openedStatus
/** 뷰어 종류만 구독 (M2-02) */
export const selectOpenedViewer = (s: AppStore): OpenedViewer => s.openedViewer
/** 이미지 data URL만 구독 (M2-02) */
export const selectOpenedDataUrl = (s: AppStore): string | null => s.openedDataUrl

// ── 레퍼런스 폴더 셀렉터 (M2-03) ────────────────────────────────────────────────
/** 등록된 레퍼런스 폴더 목록만 구독 */
export const selectReferences = (s: AppStore): ReferenceEntry[] => s.references
/** 현재 열린 파일의 루트 ID만 구독 (null = 워크스페이스, 'ref-N' = 레퍼런스) */
export const selectOpenedRootId = (s: AppStore): string | null => s.openedRootId

// ── 최근 파일 셀렉터 (F10-01) ────────────────────────────────────────────────
/** 최근 열린 파일 경로 목록만 구독 */
export const selectRecentFiles = (s: AppStore): string[] => s.recentFiles

// ── 워크스페이스 모드 셀렉터 (F13) ──────────────────────────────────────────
/** 단일/멀티 워크스페이스 모드만 구독 */
export const selectWorkspaceMode = (s: AppStore): 'single' | 'multi' => s.workspaceMode

// ── M4-1 셀렉터 ──────────────────────────────────────────────────────────────
/** 마지막 run usage만 구독 (토큰 게이지) */
export const selectLastUsage = (s: AppStore): import('../../../shared/agent-events').TokenUsage | undefined => s.lastUsage
/** SDK가 보고한 실 컨텍스트 윈도우 크기만 구독 (Phase 21c — 게이지 분모 우선값) */
export const selectLastContextWindow = (s: AppStore): number | undefined => s.lastContextWindow
/** 선택된 모델 id만 구독 (토큰 게이지 분모) */
export const selectSelectedModel = (s: AppStore): string => s.selectedModel

// ── M4-2 셀렉터 ──────────────────────────────────────────────────────────────
/** 프로젝트 파일 플랫 목록만 구독 (@멘션 팔레트) */
export const selectProjectFiles = (s: AppStore): string[] => s.projectFiles

// ── 22c 셀렉터 ────────────────────────────────────────────────────────────────
/** 현재 첨부 이미지 목록만 구독 */
export const selectAttachedImages = (s: AppStore): AttachedImage[] => s.attachedImages

// ── 22d 셀렉터 ────────────────────────────────────────────────────────────────
/** 예약 메시지 큐만 구독 */
export const selectQueue = (s: AppStore): QueuedMessage[] => s.queue

// ── 23b 셀렉터 ────────────────────────────────────────────────────────────────
/** 사이드바 대화 목록만 구독 (세션 CRUD) */
export const selectConversations = (s: AppStore): ConversationRecord[] => s.conversations

// ── 24a 셀렉터 ────────────────────────────────────────────────────────────────
/** 에이전트 사고 텍스트만 구독 (null=비표시) */
export const selectThinkingText = (s: AppStore): string | null => s.thinkingText
/** 에이전트 작업목록(TodoItem[])만 구독 */
export const selectTodos = (s: AppStore): import('../../../shared/agent-events').TodoItem[] => s.todos
