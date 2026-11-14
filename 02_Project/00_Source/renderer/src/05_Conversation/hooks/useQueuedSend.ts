import { useCallback, useEffect, useRef } from 'react'
import type { AttachedImage, QueuedMessage } from '@renderer/00_App/state/types'
import type { PickerValues } from '../ComposerView'

// 예약 전송과 드레인 하나(C1, 단일 규칙) — 실행 중 Enter는 대기열에 넣고, 실행이 끝나는 하강 에지에
// 맨 앞 하나를 보낸다. 대기열의 거처(단일 store, 패널 상태)는 호출부가 enqueue·dequeue로 넘긴다.
export interface UseQueuedSendOptions {
  isRunning: boolean
  queueLength: number
  enqueue: (item: QueuedMessage) => void
  dequeue: () => QueuedMessage | undefined
  sendNow: (text: string, images: AttachedImage[], picker?: PickerValues) => void
}

function queueId(queueLength: number, text: string): string {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `q-${queueLength}-${text.slice(0, 8)}`
}

export function useQueuedSend({
  isRunning,
  queueLength,
  enqueue,
  dequeue,
  sendNow,
}: UseQueuedSendOptions): (text: string, images: AttachedImage[], picker?: PickerValues) => void {
  const prevRunningRef = useRef(isRunning)
  useEffect(() => {
    const was = prevRunningRef.current
    prevRunningRef.current = isRunning
    if (isRunning || !was) return
    if (queueLength === 0) return
    const next = dequeue()
    if (next) sendNow(next.text, next.images, next.picker)
  }, [isRunning, queueLength, dequeue, sendNow])

  return useCallback((text: string, images: AttachedImage[], picker?: PickerValues): void => {
    if (isRunning) {
      enqueue({ id: queueId(queueLength, text), text, images, picker })
      return
    }
    sendNow(text, images, picker)
  }, [isRunning, queueLength, enqueue, sendNow])
}
