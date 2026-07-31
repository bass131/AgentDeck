import type { ChildProcess } from 'node:child_process'

interface Pending {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface RpcMessage {
  id?: number | string | null
  method?: string
  params?: unknown
  result?: unknown
  error?: { code?: number; message?: string }
}

export class StdioRpc {
  private buf: Buffer = Buffer.alloc(0)
  private nextId = 1
  private pending = new Map<number, Pending>()
  private dead: Error | null = null

  onRequest: (method: string, params: unknown) => unknown = () => null

  onNotify: (method: string, params: unknown) => void = () => {}

  constructor(private child: ChildProcess) {
    child.stdout?.on('data', (chunk: Buffer) => this.feed(chunk))
  }

  request<T>(method: string, params: unknown, timeoutMs = 15000): Promise<T> {
    if (this.dead) return Promise.reject(this.dead)
    const id = this.nextId++
    this.write({ jsonrpc: '2.0', id, method, params })
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`LSP 요청 시간 초과: ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
    })
  }

  notify(method: string, params: unknown): void {
    if (this.dead) return
    this.write({ jsonrpc: '2.0', method, params })
  }

  dispose(reason: string): void {
    if (this.dead) return
    this.dead = new Error(reason)
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(this.dead)
    }
    this.pending.clear()
  }

  private write(msg: Record<string, unknown>): void {
    try {
      const body = Buffer.from(JSON.stringify(msg), 'utf8')
      this.child.stdin?.write(`Content-Length: ${body.length}\r\n\r\n`)
      this.child.stdin?.write(body)
    } catch {
    }
  }

  private feed(chunk: Buffer): void {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk
    for (;;) {
      const sep = this.buf.indexOf('\r\n\r\n')
      if (sep < 0) return
      const header = this.buf.subarray(0, sep).toString('ascii')
      const m = /Content-Length:\s*(\d+)/i.exec(header)
      if (!m) {
        this.buf = this.buf.subarray(sep + 4)
        continue
      }
      const len = parseInt(m[1], 10)
      const end = sep + 4 + len
      if (this.buf.length < end) return
      const body = this.buf.subarray(sep + 4, end).toString('utf8')
      this.buf = this.buf.subarray(end)
      try {
        this.dispatch(JSON.parse(body) as RpcMessage)
      } catch {
      }
    }
  }

  private dispatch(msg: RpcMessage): void {
    if (msg.method && msg.id != null) {
      Promise.resolve()
        .then(() => this.onRequest(msg.method!, msg.params))
        .then(
          (result) => this.write({ jsonrpc: '2.0', id: msg.id, result: result ?? null }),
          (e) => this.write({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: String(e) } })
        )
      return
    }
    if (msg.method) {
      try {
        this.onNotify(msg.method, msg.params)
      } catch {
      }
      return
    }
    if (msg.id == null) return
    const p = this.pending.get(Number(msg.id))
    if (!p) return
    this.pending.delete(Number(msg.id))
    clearTimeout(p.timer)
    if (msg.error) p.reject(new Error(msg.error.message || 'LSP 오류'))
    else p.resolve(msg.result)
  }
}
