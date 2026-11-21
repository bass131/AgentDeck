import { GH_INSTALL_URL, IPC_CHANNELS, type Ack, type GhCheckResult } from '@shared/ipcContract'
import { checkGh } from '@main/14_GitHub/ghCli'
import { handle } from '../handle'

const OPEN_FAILED = '브라우저를 열지 못했어요'

export function registerOnboardingHandlers(deps: {
  openExternal?: (url: string) => Promise<void>
  checkGh?: () => Promise<GhCheckResult>
}): void {
  const check = deps.checkGh ?? (() => checkGh())
  handle(IPC_CHANNELS.ONBOARDING_GH_CHECK, () => check())
  handle(IPC_CHANNELS.ONBOARDING_OPEN_GH_INSTALL, async (): Promise<Ack> => {
    if (!deps.openExternal) return { ok: false, error: OPEN_FAILED }
    try {
      await deps.openExternal(GH_INSTALL_URL)
      return { ok: true }
    } catch {
      return { ok: false, error: OPEN_FAILED }
    }
  })
}
