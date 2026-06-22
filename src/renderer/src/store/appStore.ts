/**
 * appStore.ts — Zustand 전역 store.
 *
 * 단방향 흐름: window.api.onAgentEvent → applyAgentEvent(reducer) → state → 컴포넌트.
 * 컴포넌트는 window.api를 직접 호출하지 않고 액션 함수를 통해서만 호출한다.
 *
 * CRITICAL: renderer untrusted — fs/Node/require 직접 호출 0.
 */
import { create } from 'zustand'
import type { FileTreeNode, ConversationMessage } from '../../../shared/ipc-contract'
import { applyAgentEvent, makeInitialState } from './reducer'
import type { AppState, ToolCard } from './reducer'

// ── 코드 뷰어 상태 ─────────────────────────────────────────────────────────────

/** 코드 뷰어 로드 상태 */
export type OpenedStatus = 'idle' | 'loading' | 'ready' | 'too-large' | 'binary-skipped' | 'not-found'

// ── 추가 UI 상태 ───────────────────────────────────────────────────────────────

export interface ConversationEntry {
  id: string
  role: 'user' | 'assistant'
  /** 완성된 텍스트 (assistant의 경우 streaming 완료 후 확정) */
  content: string
}

export interface StoreState extends AppState {
  // ── 워크스페이스 ────────────────────────────────────────────────────────────
  workspaceRoot: string | null
  fileTree: FileTreeNode | null
  /** diff 뷰어에 표시할 파일 경로 */
  diffFilePath: string | null

  // ── 코드 뷰어 (M2-01) ──────────────────────────────────────────────────────
  /** 현재 열린 파일 경로 (null이면 미선택) */
  openedFile: string | null
  /** 파일 내용 (text 응답 시 채워짐) */
  openedContent: string | null
  /** 파일 언어 힌트 (FsReadResponse.language) */
  openedLanguage: string | null
  /** 코드 뷰어 로드 상태 */
  openedStatus: OpenedStatus

  // ── 대화 ───────────────────────────────────────────────────────────────────
  /** 확정된 대화 항목 목록 */
  messages: ConversationEntry[]
  /** 현재 대화 ID (conversationSave/Load용) */
  conversationId: string | null
  /** 백엔드 라벨 — Phase 05: 고정 텍스트 'Claude Code' */
  backendLabel: string
}

interface StoreActions {
  // ── 워크스페이스 ────────────────────────────────────────────────────────────
  /** workspaceOpen IPC 호출 → tree 업데이트 */
  openWorkspace: () => Promise<void>
  /** 파일 클릭 → diff 뷰어 표시 */
  selectDiffFile: (path: string | null) => void
  /**
   * 파일 클릭 → window.api.fsRead(IPC) → 코드 뷰어에 내용 로드.
   * 응답 kind 분기: text→ready / too-large|binary-skipped|not-found→각 상태.
   * CRITICAL: window.api.fsRead 경유만 — fs/Node 직접 0.
   */
  openFile: (path: string) => Promise<void>

  // ── 에이전트 ───────────────────────────────────────────────────────────────
  /** 메시지 전송 → agentRun IPC 호출 */
  sendMessage: (text: string) => Promise<void>
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
  workspaceRoot: null,
  fileTree: null,
  diffFilePath: null,
  openedFile: null,
  openedContent: null,
  openedLanguage: null,
  openedStatus: 'idle' as OpenedStatus,
  messages: [],
  conversationId: null,
  backendLabel: 'Claude Code',

  // ── 워크스페이스 ─────────────────────────────────────────────────────────
  openWorkspace: async () => {
    const res = await window.api.workspaceOpen({})
    if (res.rootPath) {
      set({ workspaceRoot: res.rootPath, fileTree: res.tree })
    }
  },

  selectDiffFile: (path) => {
    set({ diffFilePath: path })
  },

  openFile: async (path: string) => {
    // loading 상태로 전환 (기존 내용 유지 — 깜빡임 최소화)
    set({ openedFile: path, openedStatus: 'loading', openedContent: null, openedLanguage: null })

    try {
      // IPC 경유 — renderer는 fs/Node 직접 0
      const res = await window.api.fsRead({ path })

      switch (res.kind) {
        case 'text':
          set({
            openedContent: res.content,
            openedLanguage: res.language,
            openedStatus: 'ready',
          })
          break
        case 'binary':
          // M2-02에서 이미지 처리 — 지금은 binary-skipped와 동일하게 처리
          set({ openedContent: null, openedLanguage: null, openedStatus: 'binary-skipped' })
          break
        case 'too-large':
          set({ openedContent: null, openedLanguage: null, openedStatus: 'too-large' })
          break
        case 'binary-skipped':
          set({ openedContent: null, openedLanguage: null, openedStatus: 'binary-skipped' })
          break
        case 'not-found':
          set({ openedContent: null, openedLanguage: null, openedStatus: 'not-found' })
          break
        default: {
          // 타입 exhaustive 체크용 — 컴파일 시점에 never
          const _exhaustive: never = res
          void _exhaustive
          set({ openedContent: null, openedLanguage: null, openedStatus: 'not-found' })
        }
      }
    } catch {
      set({ openedContent: null, openedLanguage: null, openedStatus: 'not-found' })
    }
  },

  // ── 에이전트 ─────────────────────────────────────────────────────────────
  sendMessage: async (text: string) => {
    const state = get()
    if (state.isRunning) return

    const userEntry: ConversationEntry = {
      id: nextMsgId(),
      role: 'user',
      content: text,
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

    const res = await window.api.agentRun({
      messages: history,
      workspaceRoot: get().workspaceRoot ?? undefined,
    })

    set({ currentRunId: res.runId })

    // 대화 저장 (비동기, 결과 무시)
    void get().saveConversation()
  },

  abortRun: async () => {
    const { currentRunId } = get()
    if (!currentRunId) return
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
