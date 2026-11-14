import { create } from 'zustand'
import { makeInitialState } from '@renderer/05_Conversation/state/reducer'

import { createSystemSlice } from './state/system'
import { createWorkspaceSlice } from '@renderer/07_Workspace/state/workspace'
import { createViewerSlice } from '@renderer/07_Workspace/state/viewer'
import { createConversationSlice } from '@renderer/06_Sessions/state/conversation'
import { createSessionListSlice } from '@renderer/06_Sessions/state/sessions'
import { createMultiSessionSlice } from '@renderer/06_Sessions/state/multiSession'
import { createComposerSlice } from '@renderer/05_Conversation/state/composer'
import { createRuntimeSlice } from '@renderer/03_Agent/state/runtime'

import type { AppStore } from './state/types'

export const useAppStore = create<AppStore>()((...a) => ({
  ...makeInitialState(),
  ...createSystemSlice(...a),
  ...createWorkspaceSlice(...a),
  ...createViewerSlice(...a),
  ...createConversationSlice(...a),
  ...createSessionListSlice(...a),
  ...createMultiSessionSlice(...a),
  ...createComposerSlice(...a),
  ...createRuntimeSlice(...a),
}))

export type {
  AppStore,
  StoreState,
  ReferenceEntry,
  OpenedStatus,
  AttachedImage,
  QueuedMessage,
  MultiSessionSummary,
} from './state/types'

export * from './state/selector'
