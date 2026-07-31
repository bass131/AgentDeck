import type { AgentEvent } from '../../shared/agentEvents'

export const IDLE_CLOSE_GRACE_MS = 3000

export interface IdleCloseGovernorDeps {
  emit: (ev: AgentEvent) => void
  isRunActive: () => boolean
  externalGatesOpen: () => boolean
  onGraceCommit: () => void
}

export class IdleCloseGovernor {
  private readonly _deps: IdleCloseGovernorDeps

  private _graceTimer: ReturnType<typeof setTimeout> | null = null

  private _sessionStateSeen = false

  private _lastSessionState: 'idle' | 'running' | 'requires_action' | null = null

  private _autonomyActiveEmitted = false

  constructor(deps: IdleCloseGovernorDeps) {
    this._deps = deps
  }

  observeSessionState(state: 'idle' | 'running' | 'requires_action'): void {
    this._sessionStateSeen = true
    this._lastSessionState = state
  }

  sessionStateGateOpen(): boolean {
    return !this._sessionStateSeen || this._lastSessionState === 'idle'
  }

  isGracePending(): boolean {
    return this._graceTimer !== null
  }

  scheduleGrace(): void {
    if (this._graceTimer !== null) return
    this._autonomyActiveEmitted = false
    this._graceTimer = setTimeout(() => {
      this._graceTimer = null
      if (!this._deps.isRunActive()) return
      if (this._deps.externalGatesOpen() && this.sessionStateGateOpen()) {
        this._deps.emit({ type: 'autonomy_status', status: 'ended', reason: 'grace-expired' })
        this._deps.onGraceCommit()
      }
    }, IDLE_CLOSE_GRACE_MS)
  }

  cancelGrace(): void {
    if (this._graceTimer !== null) {
      clearTimeout(this._graceTimer)
      this._graceTimer = null
    }
  }

  absorbActivity(turnOrigin: 'user' | 'cron'): void {
    if (this._graceTimer === null) return
    this.cancelGrace()
    if (!this._autonomyActiveEmitted && turnOrigin === 'cron') {
      this._autonomyActiveEmitted = true
      this._deps.emit({ type: 'autonomy_status', status: 'active' })
    }
  }
}
