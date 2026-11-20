// M10 G5 — 앱 안 알림 표시의 원천. main이 정한 알림 목록을 loop.alerts로 한 번 읽고 loop.alertsState push로 갈아 끼운다.
// 채팅 모드의 「작업」 버튼 점은 작업 화면이 떠 있지 않아도 맞아야 하므로 Shell 수명으로 구독한다(startAlerts).
import { create } from 'zustand'
import type { LoopAlert } from '@shared/ipcContract'
import { ipc } from '@renderer/01_Ipc'
import { sameCwd } from './loopModel'

export interface AlertStore { alerts: LoopAlert[] }

export const useAlertStore = create<AlertStore>(() => ({ alerts: [] }))

export const alertsOf = (alerts: readonly LoopAlert[], cwd: string | null): LoopAlert[] => alerts.filter((a) => sameCwd(a.cwd, cwd))

// 옛 목처럼 알림 길이 없는 브리지에서는 아무것도 하지 않는다
export function startAlerts(onOpen: (cwd: string) => void): () => void {
  const loop = ipc.loop as Partial<typeof ipc.loop>
  let pushed = false
  const offs: (() => void)[] = []
  if (typeof loop.onAlerts === 'function') {
    offs.push(loop.onAlerts((l) => { pushed = true; useAlertStore.setState({ alerts: l.alerts }) }))
  }
  if (typeof loop.onAlertOpen === 'function') offs.push(loop.onAlertOpen((o) => onOpen(o.cwd)))
  if (typeof loop.alerts === 'function') {
    loop.alerts()
      .then((l) => { if (!pushed) useAlertStore.setState({ alerts: l.alerts }) })
      .catch(() => { /* 다음 push가 채운다 */ })
  }
  return () => { for (const off of offs) off() }
}
