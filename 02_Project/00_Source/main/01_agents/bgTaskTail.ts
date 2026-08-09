import { open, stat } from 'node:fs/promises'
import type { AgentEventBgTask } from '../../shared/agentEvents'

export const DEFAULT_TAIL_INTERVAL_MS = 750
export const DEFAULT_MAX_CHUNK_BYTES = 65536
export const DEFAULT_MAX_TOTAL_BYTES = 1048576

export interface BgTaskTailOptions {
  taskId: string
  outputFile: string
  emit: (ev: AgentEventBgTask) => void
  intervalMs?: number
  maxChunkBytes?: number
  maxTotalBytes?: number
}

export interface BgTaskTailHandle {
  stop(finalFlush?: boolean): Promise<void>
}

class Tailer {
  private readonly _taskId: string
  private readonly _outputFile: string
  private readonly _emit: (ev: AgentEventBgTask) => void
  private readonly _intervalMs: number
  private readonly _maxChunkBytes: number
  private readonly _maxTotalBytes: number

  private _offset = 0
  private _totalEmitted = 0
  private _capReached = false
  private _stopped = false
  private _timer: ReturnType<typeof setTimeout> | null = null
  private _inflight: Promise<void> = Promise.resolve()

  constructor(opts: BgTaskTailOptions) {
    this._taskId = opts.taskId
    this._outputFile = opts.outputFile
    this._emit = opts.emit
    this._intervalMs = opts.intervalMs ?? DEFAULT_TAIL_INTERVAL_MS
    this._maxChunkBytes = opts.maxChunkBytes ?? DEFAULT_MAX_CHUNK_BYTES
    this._maxTotalBytes = opts.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES
  }

  schedule(): void {
    if (this._stopped || this._capReached) return
    this._timer = setTimeout(() => {
      this._timer = null
      this._inflight = this._pollOnce()
        .catch(() => {
        })
        .finally(() => this.schedule())
    }, this._intervalMs)
  }

  async stop(finalFlush: boolean): Promise<void> {
    if (this._stopped) return
    this._stopped = true
    if (this._timer !== null) {
      clearTimeout(this._timer)
      this._timer = null
    }
    try {
      await this._inflight
    } catch {
    }
    if (finalFlush) {
      try {
        await this._drainAll()
      } catch {
      }
    }
  }

  private async _pollOnce(): Promise<void> {
    if (this._stopped || this._capReached) return
    await this._readNextChunk()
  }

  private async _drainAll(): Promise<void> {
    for (;;) {
      if (this._capReached) return
      const emitted = await this._readNextChunk()
      if (!emitted) return
    }
  }

  private async _readNextChunk(): Promise<boolean> {
    let size: number
    try {
      size = (await stat(this._outputFile)).size
    } catch {
      return false
    }

    if (size < this._offset) {
      this._offset = 0
    }

    const avail = size - this._offset
    if (avail <= 0) return false

    const budget = this._maxTotalBytes - this._totalEmitted
    if (budget <= 0) {
      this._capReached = true
      return false
    }

    const len = Math.min(avail, this._maxChunkBytes, budget)
    let bytesRead = 0
    const buf = Buffer.alloc(len)
    try {
      const fh = await open(this._outputFile, 'r')
      try {
        const res = await fh.read(buf, 0, len, this._offset)
        bytesRead = res.bytesRead
      } finally {
        await fh.close()
      }
    } catch {
      return false
    }
    if (bytesRead <= 0) return false

    this._offset += bytesRead
    this._totalEmitted += bytesRead
    if (this._totalEmitted >= this._maxTotalBytes) {
      this._capReached = true
    }
    const truncated = bytesRead < avail

    const event: AgentEventBgTask = {
      type: 'bg_task',
      kind: 'output',
      taskId: this._taskId,
      outputChunk: buf.subarray(0, bytesRead).toString('utf8'),
      ...(truncated ? { outputTruncated: true } : {}),
    }
    this._emit(event)
    return true
  }
}

export function startBgTaskTail(opts: BgTaskTailOptions): BgTaskTailHandle {
  const tailer = new Tailer(opts)
  tailer.schedule()
  return {
    stop: (finalFlush = false) => tailer.stop(finalFlush),
  }
}
