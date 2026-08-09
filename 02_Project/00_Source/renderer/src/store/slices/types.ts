import type { FileTreeNode } from '../../../../shared/ipcContract'
import type { AppState } from '../reducer'
import type { OpenedViewer } from '../../lib/viewer'

import type { SystemState, SystemActions } from './system'
import type { WorkspaceState, WorkspaceActions } from './workspace'
import type { ViewerState, ViewerActions } from './viewer'
import type { ConversationState, ConversationActions } from './conversation'
import type { SessionListState, SessionListActions } from './sessions'
import type { MultiSessionState, MultiSessionActions } from './multiSession'
import type { ComposerState, ComposerActions } from './composer'
import type { RuntimeState, RuntimeActions } from './runtime'

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

export interface MultiSessionSummary {
  id: string
  title: string
  count: number
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
  WorkspaceState &
  ViewerState &
  ConversationState &
  SessionListState &
  MultiSessionState &
  ComposerState &
  RuntimeState

export type StoreActions = SystemActions &
  WorkspaceActions &
  ViewerActions &
  ConversationActions &
  SessionListActions &
  MultiSessionActions &
  ComposerActions &
  RuntimeActions

export type AppStore = StoreState & StoreActions
