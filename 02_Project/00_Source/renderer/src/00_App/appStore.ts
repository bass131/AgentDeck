import { create } from 'zustand'
import { makeInitialState } from '@renderer/05_Conversation/state/reducer'

import { createSystemSlice } from './slices/system'
import { createWorkspaceSlice } from './slices/workspace'
import { createViewerSlice } from './slices/viewer'
import { createConversationSlice } from './slices/conversation'
import { createSessionListSlice } from './slices/sessions'
import { createMultiSessionSlice } from './slices/multiSession'
import { createComposerSlice } from '@renderer/05_Conversation/state/composer'
import { createRuntimeSlice } from '@renderer/03_Agent/state/runtime'

import type { AppStore } from './slices/types'

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
} from './slices/types'

export * from './slices/selector'
