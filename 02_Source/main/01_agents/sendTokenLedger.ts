export function isTurnAnchoringMessage(msg: unknown): boolean {
  if (msg === null || typeof msg !== 'object') return true
  const m = msg as Record<string, unknown>
  if (m['type'] !== 'system') return true
  const subtype = m['subtype']
  if (subtype === 'session_state_changed') {
    return m['state'] !== 'idle'
  }
  if (
    subtype === 'task_started' ||
    subtype === 'task_progress' ||
    subtype === 'task_updated' ||
    subtype === 'task_notification'
  ) {
    return false
  }
  return true
}

export class SendTokenLedger {
  private _nextSeq = 0
  private readonly _queued: number[] = []
  private _delivered: number | null = null
  private _owned: number | null = null
  private _anchored = false

  get queuedSeqs(): number[] {
    return this._queued
  }

  issue(): number {
    const seq = this._nextSeq++
    this._queued.push(seq)
    return seq
  }

  deliverNext(): boolean {
    const seq = this._queued.shift()
    this._delivered = seq ?? null
    return seq !== undefined
  }

  anchorIfEligible(msg: unknown): void {
    if (!isTurnAnchoringMessage(msg)) return
    if (this._anchored) return
    this._anchored = true
    this._owned = this._delivered
    this._delivered = null
  }

  hasOwnedToken(): boolean {
    return this._owned !== null
  }

  completeTurn(): void {
    this._owned = null
    this._anchored = false
  }

  outstandingCount(): number {
    return (
      this._queued.length +
      (this._delivered !== null ? 1 : 0) +
      (this._owned !== null ? 1 : 0)
    )
  }
}
