import type { FileTreeNode } from '../../../../shared/ipcContract'
import type { AppState } from '@renderer/05_Conversation/state/reducer'
import type { OpenedViewer } from '@renderer/07_Workspace/viewer'

import type { SystemState, SystemActions } from './system'
import type { WorkspaceState, WorkspaceActions } from '@renderer/07_Workspace/state/workspace'
import type { ViewerState, ViewerActions } from '@renderer/07_Workspace/state/viewer'
import type { ConversationState, ConversationActions } from '@renderer/06_Sessions/state/conversation'
import type { SessionListState, SessionListActions } from '@renderer/06_Sessions/state/sessions'
import type { ComposerState, ComposerActions } from '@renderer/05_Conversation/state/composer'
import type { RuntimeState, RuntimeActions } from '@renderer/03_Agent/state/runtime'
import type { WindowModeState, WindowModeActions } from '@renderer/12_Window/windowMode'

export type { OpenedViewer }

export interface ReferenceEntry {
  id: string
  name: string
  tree: FileTreeNode | null
}

export type OpenedStatus = 'idle' | 'loading' | 'ready' | 'too-large' | 'binary-skipped' | 'not-found'

export interface AttachedImage {
  path: string
  dataUrl: string
}

export interface QueuedMessage {
  id: string
  text: string
  images: AttachedImage[]
  picker?: { model: string; effort: string; mode: string; orchestration?: boolean }
}

export type ConversationRunState = AppState & {
  runGeneration: string | null
  workspaceRoot: string | null
  attachedImages: AttachedImage[]
  restoredSession: boolean
  replMode: boolean
}

export type StoreState = AppState &
  SystemState &
  WindowModeState &
  WorkspaceState &
  ViewerState &
  ConversationState &
  SessionListState &
  ComposerState &
  RuntimeState

export type StoreActions = SystemActions &
  WindowModeActions &
  WorkspaceActions &
  ViewerActions &
  ConversationActions &
  SessionListActions &
  ComposerActions &
  RuntimeActions

export type AppStore = StoreState & StoreActions
