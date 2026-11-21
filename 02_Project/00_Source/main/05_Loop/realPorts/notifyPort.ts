// Electron Notification으로 Windows 알림을 띄운다.
// 누르거나 닫을 때까지 객체를 쥐고 있다 — 놓으면 가비지 수집으로 누름 사건이 오지 않을 수 있다.
import { Notification } from 'electron'
import type { NotifyPort } from '../ports'

export function createNotifyPort(): NotifyPort & { held(): number } {
  const live = new Set<Notification>()
  return {
    show({ title, body, onClick }) {
      if (!Notification.isSupported()) return
      const n = new Notification({ title, body })
      let done = false
      const release = (): void => { live.delete(n) }
      n.on('click', () => {
        if (done) return
        done = true
        release()
        onClick()
      })
      n.on('close', release)
      live.add(n)
      n.show()
    },
    held: () => live.size,
  }
}
