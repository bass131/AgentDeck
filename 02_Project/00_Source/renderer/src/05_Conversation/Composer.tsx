import { memo, useLayoutEffect, useRef, useState, type JSX } from 'react'
import { DEFAULT_EFFORT } from '@renderer/03_Agent/pickerOptions'
import { useAppStore, selectPickerMode, selectReplMode, selectConversationId, selectSelectedModel } from '@renderer/00_App/appStore'
import { resolveReplLit } from './replIndicator'
import { useUltracodeToggle, SINGLE_CHAT_DEFAULT_SCOPE, migrateSingleChatDefaultScope } from '@renderer/03_Agent/state/ultracodeToggle'
import { ComposerView, type ComposerInputProps } from './ComposerView'

// 단일 대화의 입력창 — store 어댑터다. 선택기 값(모델·모드·REPL·UltraCode 범위)을 store에서 읽어
// 공용 본체 ComposerView에 넘긴다. 멀티 패널은 PanelView가 패널 상태로 같은 본체를 쓴다.

export type { QueuedMessageView, PickerValues } from './ComposerView'
export type ComposerProps = ComposerInputProps

function ComposerInner(props: ComposerProps): JSX.Element {
  const model = useAppStore(selectSelectedModel)
  const setModel = useAppStore.getState().setSelectedModel
  const [effort, setEffort] = useState<string>(DEFAULT_EFFORT)
  const mode = useAppStore(selectPickerMode)
  const setMode = useAppStore.getState().setPickerMode

  const conversationId = useAppStore(selectConversationId)
  const [orchestration, setOrchestration] = useUltracodeToggle(conversationId ?? SINGLE_CHAT_DEFAULT_SCOPE)

  const prevConversationIdRef = useRef(conversationId)
  useLayoutEffect(() => {
    const prev = prevConversationIdRef.current
    if (prev === null && conversationId !== null) {
      migrateSingleChatDefaultScope(conversationId)
    }
    prevConversationIdRef.current = conversationId
  }, [conversationId])

  const replMode = useAppStore(selectReplMode)
  const setReplMode = useAppStore((s) => s.setReplMode)
  const replLit = resolveReplLit(replMode)

  return (
    <ComposerView
      {...props}
      model={model}
      setModel={setModel}
      effort={effort}
      setEffort={setEffort}
      mode={mode}
      setMode={setMode}
      orchestration={orchestration}
      setOrchestration={setOrchestration}
      replMode={replMode}
      setReplMode={setReplMode}
      replLit={replLit}
    />
  )
}

export const Composer = memo(ComposerInner)
export default Composer
