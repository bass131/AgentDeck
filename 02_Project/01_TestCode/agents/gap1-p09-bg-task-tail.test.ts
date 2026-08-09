import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TAIL_MODULE = '../../../02_Project/00_Source/main/01_agents/bgTaskTail'

interface TailEvent {
  type: string
  kind: string
  taskId: string
  outputChunk?: string
  outputTruncated?: boolean
}

interface TailHandle {
  stop(finalFlush?: boolean): Promise<void>
}

type StartBgTaskTail = (opts: {
  taskId: string
  outputFile: string
  emit: (ev: TailEvent) => void
  intervalMs?: number
  maxChunkBytes?: number
  maxTotalBytes?: number
}) => TailHandle

async function loadStart(): Promise<StartBgTaskTail> {
  const mod = (await import(TAIL_MODULE)) as { startBgTaskTail: StartBgTaskTail }
  expect(typeof mod.startBgTaskTail).toBe('function')
  return mod.startBgTaskTail
}

const INTERVAL = 20

let dir: string
let handles: TailHandle[]

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'agentdeck-p09-tail-'))
  handles = []
})

afterEach(async () => {
  for (const h of handles) {
    try {
      await h.stop(false)
    } catch {
    }
  }
  rmSync(dir, { recursive: true, force: true })
})

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function until(cond: () => boolean, timeoutMs = 3000): Promise<boolean> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) return false
    await sleep(10)
  }
  return true
}

async function quiet(events: TailEvent[], spanMs = INTERVAL * 6): Promise<void> {
  let last = events.length
  for (let i = 0; i < 50; i++) {
    await sleep(spanMs)
    if (events.length === last) return
    last = events.length
  }
  throw new Error('quiet(): 이벤트 방출이 안정되지 않음(무한 방출 의심)')
}

function joined(events: TailEvent[]): string {
  return events.map((e) => e.outputChunk ?? '').join('')
}

describe('gap1-p09 bgTaskTail — 증분 폴링 계약 (RED: 모듈 미존재)', () => {
  it('(a) append → 틱마다 새로 늘어난 부분만 outputChunk 방출(전체 재방출 금지) + 이벤트 봉투', async () => {
    const start = await loadStart()
    const file = path.join(dir, 'a.output')
    writeFileSync(file, 'tick-1\n')
    const events: TailEvent[] = []
    const h = start({ taskId: 'task-a', outputFile: file, emit: (e) => events.push(e), intervalMs: INTERVAL })
    handles.push(h)

    expect(await until(() => joined(events) === 'tick-1\n')).toBe(true)

    appendFileSync(file, 'tick-2\n')
    expect(await until(() => joined(events) === 'tick-1\ntick-2\n')).toBe(true)

    const count = events.length
    await sleep(INTERVAL * 6)
    expect(events.length).toBe(count)

    for (const e of events) {
      expect(e.type).toBe('bg_task')
      expect(e.kind).toBe('output')
      expect(e.taskId).toBe('task-a')
    }
    await h.stop(false)
  })

  it('(b) maxChunkBytes — 1회 폴링 조각 상한 + outputTruncated 표시', async () => {
    const start = await loadStart()
    const file = path.join(dir, 'b.output')
    writeFileSync(file, 'x'.repeat(100))
    const events: TailEvent[] = []
    const h = start({
      taskId: 'task-b',
      outputFile: file,
      emit: (e) => events.push(e),
      intervalMs: INTERVAL,
      maxChunkBytes: 16,
    })
    handles.push(h)

    expect(await until(() => events.length >= 1)).toBe(true)
    await quiet(events)

    for (const e of events) {
      expect((e.outputChunk ?? '').length).toBeLessThanOrEqual(16)
    }
    expect(events.some((e) => e.outputTruncated === true)).toBe(true)
    await h.stop(false)
  })

  it('(c) maxTotalBytes — 누적 상한 도달 후 조각 방출 중지 + truncated', async () => {
    const start = await loadStart()
    const file = path.join(dir, 'c.output')
    writeFileSync(file, 'a'.repeat(10))
    const events: TailEvent[] = []
    const h = start({
      taskId: 'task-c',
      outputFile: file,
      emit: (e) => events.push(e),
      intervalMs: INTERVAL,
      maxTotalBytes: 24,
    })
    handles.push(h)

    expect(await until(() => joined(events).length >= 10)).toBe(true)
    appendFileSync(file, 'b'.repeat(40))
    await quiet(events)

    expect(joined(events).length).toBeLessThanOrEqual(24)
    expect(events.some((e) => e.outputTruncated === true)).toBe(true)

    const count = events.length
    appendFileSync(file, 'c'.repeat(20))
    await sleep(INTERVAL * 6)
    const post = events.slice(count).filter((e) => (e.outputChunk ?? '').length > 0)
    expect(post).toHaveLength(0)
    await h.stop(false)
  })

  it('(d) stop(true) — 잔여분 최종 flush 후 정지·멱등·타이머 누수 없음', async () => {
    const start = await loadStart()
    const file = path.join(dir, 'd.output')
    writeFileSync(file, 'AAA')
    const events: TailEvent[] = []
    const h = start({ taskId: 'task-d', outputFile: file, emit: (e) => events.push(e), intervalMs: INTERVAL })
    handles.push(h)

    expect(await until(() => joined(events) === 'AAA')).toBe(true)

    appendFileSync(file, 'BBB')
    await h.stop(true)
    expect(joined(events)).toBe('AAABBB')

    await h.stop(true)

    const count = events.length
    appendFileSync(file, 'CCC')
    await sleep(INTERVAL * 8)
    expect(events.length).toBe(count)
  })

  it('(e-1) 파일 미존재 — throw 금지·방출 없음(graceful) + stop(true)도 안전', async () => {
    const start = await loadStart()
    const file = path.join(dir, 'no-such-file.output')
    const events: TailEvent[] = []
    const h = start({ taskId: 'task-e1', outputFile: file, emit: (e) => events.push(e), intervalMs: INTERVAL })
    handles.push(h)

    await sleep(INTERVAL * 6)
    expect(events).toHaveLength(0)
    await h.stop(true)
    expect(events).toHaveLength(0)
  })

  it('(e-2) 폴링 도중 파일 삭제 — throw 금지·이후 방출 없음(graceful)', async () => {
    const start = await loadStart()
    const file = path.join(dir, 'e2.output')
    writeFileSync(file, 'AAA')
    const events: TailEvent[] = []
    const h = start({ taskId: 'task-e2', outputFile: file, emit: (e) => events.push(e), intervalMs: INTERVAL })
    handles.push(h)

    expect(await until(() => joined(events) === 'AAA')).toBe(true)

    rmSync(file)
    const count = events.length
    await sleep(INTERVAL * 6)
    expect(events.length).toBe(count)
    await h.stop(false)
  })

  it('(f) 파일 크기 축소(로테이션) — 오프셋 리셋 후 새 내용을 다시 tail(graceful)', async () => {
    const start = await loadStart()
    const file = path.join(dir, 'f.output')
    writeFileSync(file, 'AAAAAAAAAA')
    const events: TailEvent[] = []
    const h = start({ taskId: 'task-f', outputFile: file, emit: (e) => events.push(e), intervalMs: INTERVAL })
    handles.push(h)

    expect(await until(() => joined(events) === 'AAAAAAAAAA')).toBe(true)

    writeFileSync(file, 'BB')
    expect(await until(() => joined(events).endsWith('BB'))).toBe(true)
    await h.stop(false)
  })
})
