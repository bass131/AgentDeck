import type { FileTreeNode, ConversationRecord, UsageInfo, Profile, BackendStatus } from '../../../../shared/ipcContract'
import type { TokenUsage, TodoItem, SubAgentInfo, LoopInfo } from '../../../../shared/agentEvents'
import type { AppState, PendingPermission, PendingQuestion, FileDiffEntry } from '../reducer'
import type { ThreadItem } from '../threadTypes'
import type { OpenedViewer } from '../../lib/viewer'
import type { AppStore, ReferenceEntry, OpenedStatus, AttachedImage, QueuedMessage, MultiSessionSummary } from './types'

export const selectProfile = (s: AppStore): Profile | null => s.profile

export const selectThread = (s: AppStore): ThreadItem[] => s.thread

export const selectChangedFiles = (s: AppStore): Set<string> => s.changedFiles

export interface TaskScope {
  fileCount: number
  toolCount: number
  changedFiles: string[]
}
export function computeTaskScope(s: Pick<AppState, 'changedFiles' | 'thread'>): TaskScope {
  const changedFiles = Array.from(s.changedFiles)
  let toolCount = 0
  for (const item of s.thread) {
    if (item.kind === 'toolgroup') toolCount += item.tools.length
  }
  return { fileCount: changedFiles.length, toolCount, changedFiles }
}
export const selectTaskScope = (s: AppStore): TaskScope => computeTaskScope(s)
export const selectIsRunning = (s: AppStore): boolean => s.isRunning
export const selectErrorMessage = (s: AppStore): string | undefined => s.errorMessage
export const selectFileTree = (s: AppStore): FileTreeNode | null => s.fileTree
export const selectWorkspaceRoot = (s: AppStore): string | null => s.workspaceRoot
export const selectDiffFilePath = (s: AppStore): string | null => s.diffFilePath
export const selectBackendLabel = (s: AppStore): string => s.backendLabel

export const selectOpenedFile = (s: AppStore): string | null => s.openedFile
export const selectOpenedContent = (s: AppStore): string | null => s.openedContent
export const selectOpenedLanguage = (s: AppStore): string | null => s.openedLanguage
export const selectOpenedStatus = (s: AppStore): OpenedStatus => s.openedStatus
export const selectOpenedLine = (s: AppStore): number | null => s.openedLine
export const selectOpenedViewer = (s: AppStore): OpenedViewer => s.openedViewer
export const selectOpenedDataUrl = (s: AppStore): string | null => s.openedDataUrl

export const selectReferences = (s: AppStore): ReferenceEntry[] => s.references
export const selectOpenedRootId = (s: AppStore): string | null => s.openedRootId

export const selectRecentFiles = (s: AppStore): string[] => s.recentFiles

export const selectWorkspaceMode = (s: AppStore): 'single' | 'multi' => s.workspaceMode

export const selectLastUsage = (s: AppStore): TokenUsage | undefined => s.lastUsage
export const selectLastContextWindow = (s: AppStore): number | undefined => s.lastContextWindow
export const selectSelectedModel = (s: AppStore): string => s.selectedModel

export const selectPickerMode = (s: AppStore): string => s.pickerMode

export const selectProjectFiles = (s: AppStore): string[] => s.projectFiles

export const selectAttachedImages = (s: AppStore): AttachedImage[] => s.attachedImages

export const selectQueue = (s: AppStore): QueuedMessage[] => s.queue

export const selectConversations = (s: AppStore): ConversationRecord[] => s.conversations

export const selectThinkingText = (s: AppStore): string | null => s.thinkingText
export const selectTodos = (s: AppStore): TodoItem[] => s.todos

export const selectSubagents = (s: AppStore): SubAgentInfo[] => s.subagents

export const selectPendingPermission = (s: AppStore): PendingPermission | null => s.pendingPermission

export const selectPendingQuestion = (s: AppStore): PendingQuestion | null => s.pendingQuestion

export const selectUsage = (s: AppStore): UsageInfo => s.usage

export const selectBackends = (s: AppStore): BackendStatus[] => s.backends

export const selectMultiSessions = (s: AppStore): MultiSessionSummary[] => s.multiSessions
export const selectActiveMultiSessionId = (s: AppStore): string => s.activeMultiSessionId

export const selectFileDiffs = (s: AppStore): Record<string, FileDiffEntry> => s.fileDiffs

export const selectReplMode = (s: AppStore): boolean => s.replMode
export const selectCurrentSessionKey = (s: AppStore): string => s.currentSessionKey

export const selectActiveLoops = (s: AppStore): LoopInfo[] => s.activeLoops

export const selectPendingCommand = (s: AppStore): AppState['pendingCommand'] => s.pendingCommand

export const selectLoopsStoppedNotice = (s: AppStore): boolean => s.loopsStoppedNotice

export const selectAutonomyActive = (s: AppStore): boolean => s.autonomyActive

export const selectBannerStale = (s: AppStore): boolean => s.bannerStale
export const selectStaleDismissed = (s: AppStore): boolean => s.staleDismissed

export const selectGoalRun = (s: AppStore): AppState['goalRun'] => s.goalRun

export const selectRestoredSession = (s: AppStore): boolean => s.restoredSession

export const selectConversationId = (s: AppStore): string | null => s.conversationId

export const selectApiRetry = (s: AppStore): AppState['apiRetry'] => s.apiRetry
export const selectCompacting = (s: AppStore): AppState['compacting'] => s.compacting
export const selectSdkSessionState = (s: AppStore): AppState['sdkSessionState'] => s.sdkSessionState

export const selectHookRuns = (s: AppStore): AppState['hookRuns'] => s.hookRuns
