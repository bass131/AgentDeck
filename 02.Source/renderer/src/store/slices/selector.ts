/**
 * slices/selector.ts — store 셀렉터 (과리렌더 방지) + computeTaskScope (P12 분해).
 *
 * 거동 보존: 셀렉터 본문/의미는 기존 appStore.ts에서 그대로 이전. appStore.ts가 re-export.
 * (파일명: TDD-guard 훅 stem 매칭 — "selectors" 미존재라 "selector" 사용.)
 */
import type { FileTreeNode, ConversationRecord, UsageInfo, Profile, BackendStatus } from '../../../../shared/ipc-contract'
import type { TokenUsage, TodoItem, SubAgentInfo, LoopInfo } from '../../../../shared/agent-events'
import type { AppState, PendingPermission, PendingQuestion, FileDiffEntry } from '../reducer'
import type { ThreadItem } from '../threadTypes'
import type { OpenedViewer } from '../../lib/viewer'
import type { AppStore, ReferenceEntry, OpenedStatus, AttachedImage, QueuedMessage, MultiSessionSummary, ConversationEntry } from './types'

/** 프로필만 구독 (P2 — 부트 게이트 + 인사말 닉네임) */
export const selectProfile = (s: AppStore): Profile | null => s.profile

// ── Phase A-2: thread 셀렉터 ─────────────────────────────────────────────────
/**
 * 시간순 단일 스트림 thread 구독.
 * Conversation.tsx 렌더 루프의 진실 소스.
 */
export const selectThread = (s: AppStore): ThreadItem[] => s.thread

/** 변경 파일 set만 구독 */
export const selectChangedFiles = (s: AppStore): Set<string> => s.changedFiles

// ── B2: 작업 범위 파생 (실데이터 — changedFiles + thread toolgroup) ─────────────
/** 작업 범위 요약: 변경 파일 수·도구 호출 수·변경 파일 목록. 허구값 0 — 실데이터만. */
export interface TaskScope {
  fileCount: number
  toolCount: number
  changedFiles: string[]
}
/**
 * 상태(changedFiles Set + thread toolgroup)에서 작업 범위를 파생하는 순수 함수.
 * AppStore(단일)·PanelSessionState(패널, extends AppState) 양쪽 재사용.
 * 신규 IPC/상태 0 — 기존 실데이터만 집계(toolgroup 없으면 toolCount=0, 변경없으면 []).
 */
export function computeTaskScope(s: Pick<AppState, 'changedFiles' | 'thread'>): TaskScope {
  const changedFiles = Array.from(s.changedFiles)
  let toolCount = 0
  for (const item of s.thread) {
    if (item.kind === 'toolgroup') toolCount += item.tools.length
  }
  return { fileCount: changedFiles.length, toolCount, changedFiles }
}
/** 작업 범위 셀렉터(단일 store). 패널은 computeTaskScope(session.state) 직접 호출. */
export const selectTaskScope = (s: AppStore): TaskScope => computeTaskScope(s)
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
export const selectLastUsage = (s: AppStore): TokenUsage | undefined => s.lastUsage
/** SDK가 보고한 실 컨텍스트 윈도우 크기만 구독 (Phase 21c — 게이지 분모 우선값) */
export const selectLastContextWindow = (s: AppStore): number | undefined => s.lastContextWindow
/** 선택된 모델 id만 구독 (토큰 게이지 분모) */
export const selectSelectedModel = (s: AppStore): string => s.selectedModel

// ── P7 셀렉터 (Shift+Tab 모드 순환) ─────────────────────────────────────────
/** 현재 실행 모드 id만 구독 (Composer Picker · cyclePickerMode) */
export const selectPickerMode = (s: AppStore): string => s.pickerMode

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
export const selectTodos = (s: AppStore): TodoItem[] => s.todos

// ── 24b 셀렉터 ────────────────────────────────────────────────────────────────
/** 서브에이전트 목록만 구독 (Phase 24b) */
export const selectSubagents = (s: AppStore): SubAgentInfo[] => s.subagents

// ── 24c 셀렉터 ────────────────────────────────────────────────────────────────
/** 보류 중인 권한 요청만 구독 (Phase 24c) — null이면 PermissionCard 미표시(BF3 P06/ADR-030) */
export const selectPendingPermission = (s: AppStore): PendingPermission | null => s.pendingPermission

// ── 24d 셀렉터 ────────────────────────────────────────────────────────────────
/** 보류 중인 질문 요청만 구독 (Phase 24d) — null이면 QuestionModal 미표시 */
export const selectPendingQuestion = (s: AppStore): PendingQuestion | null => s.pendingQuestion

// ── B8 셀렉터 (Phase 26) ──────────────────────────────────────────────────────
/** OAuth 레이트리밋 게이지만 구독 (ContextStrip 5h·주간 칩) */
export const selectUsage = (s: AppStore): UsageInfo => s.usage

// ── B1 셀렉터 (듀얼 프로바이더 상태 패널) ──────────────────────────────────
/** 백엔드 프로바이더 상태 목록만 구독 (ProviderStatusPanel) */
export const selectBackends = (s: AppStore): BackendStatus[] => s.backends

// ── 멀티세션 셀렉터 (1단계) ──────────────────────────────────────────────────
/** 멀티세션 요약 목록만 구독 */
export const selectMultiSessions = (s: AppStore): MultiSessionSummary[] => s.multiSessions
/** 활성 멀티세션 ID만 구독 */
export const selectActiveMultiSessionId = (s: AppStore): string => s.activeMultiSessionId

// ── Phase B 셀렉터 (fileDiffs) ────────────────────────────────────────────────
/**
 * 파일별 diff 요약+라인 Record 구독.
 * ToolCallCard에서 target path로 조회하여 DiffViewer 렌더에 사용.
 * 키 = 파일 경로, 값 = { add, del, lines: DiffLine[] }.
 */
export const selectFileDiffs = (s: AppStore): Record<string, FileDiffEntry> => s.fileDiffs

// ── Phase 5a 셀렉터 (REPL 지속세션 ADR-024) ──────────────────────────────────
/** REPL 모드 토글 구독 — true: 지속(기본), false: 단발(-p 옵트아웃). Composer 배지용. */
export const selectReplMode = (s: AppStore): boolean => s.replMode
/** 현재 대화의 안정 sessionKey 구독 — agentRun 페이로드 라우팅용(내부). */
export const selectCurrentSessionKey = (s: AppStore): string => s.currentSessionKey

// ── 5c 셀렉터 (활성 루프 — loop 진행중 표시기) ───────────────────────────────
/**
 * 활성 루프 전체 구독 — 통합 루프 배너(LoopStatusBanner) 표시용(5c → LR2-03 통합).
 * 빈 배열=루프 없음, 1개 이상=진행중.
 * CRITICAL: 빈 배열 상수를 반환하지 않는다(매 호출 새 참조 → 불필요 리렌더).
 *   s.activeLoops는 reducer가 event.loops(배열 참조 교체)로만 갱신하므로
 *   셀렉터는 그대로 전달 — 참조 안정성은 reducer의 덮어쓰기 언제만 발화 보장.
 */
export const selectActiveLoops = (s: AppStore): LoopInfo[] => s.activeLoops

// ── LR3-06 셀렉터 (goal 배너 — resolveLoopStatus 두 번째 인자) ────────────────
/**
 * 진행 중인 슬래시 커맨드 카드 추적 상태 구독 — LoopStatusBanner의 goal 변형 판정용.
 * (name='goal'·turns·detail) 외 필드도 그대로 노출하지만 소비측은 resolveLoopStatus의
 * GoalPendingLike(name·turns·detail — FB2 P08: detail=작업 주제)만 사용한다.
 */
export const selectPendingCommand = (s: AppStore): AppState['pendingCommand'] => s.pendingCommand

/**
 * 정지 확인 배너(loopsStoppedNotice) 구독 — resolveLoopStatus 세 번째 인자
 * (LR3-06 정지 신뢰 피드백). abort로 루프를 끊은 직후 true.
 */
export const selectLoopsStoppedNotice = (s: AppStore): boolean => s.loopsStoppedNotice

// ── LR1 셀렉터 (맥락 복원 배지) ────────────────────────────────────────────────
/**
 * 현재 대화가 디스크에서 복원되어 sessionId(resume 활성)를 가진 경우만 true 구독.
 * loadConversation/selectConversation에서 파생(store가 이미 조건 계산) — 컴포넌트는 그대로 반영만.
 */
export const selectRestoredSession = (s: AppStore): boolean => s.restoredSession
