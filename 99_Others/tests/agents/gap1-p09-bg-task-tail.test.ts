/**
 * gap1-p09-bg-task-tail.test.ts — GAP1 P09 백그라운드 태스크 output 파일 증분 tail 폴러 (TDD RED)
 *
 * 대상 모듈(신규 — 현재 미존재 → 전 테스트 import 에러 RED, P07/P08 dynamic import 선례):
 *   02.Source/main/01_agents/bgTaskTail.ts
 *
 * 합의된 표면(interface-of-record — 구현이 여기에 맞춘다):
 *   export interface BgTaskTailOptions {
 *     taskId: string
 *     outputFile: string
 *     emit: (ev: AgentEventBgTask) => void   // kind='output' 조각 방출
 *     intervalMs?: number        // 기본 750
 *     maxChunkBytes?: number     // 기본 65536 — 1회 폴링 조각 상한
 *     maxTotalBytes?: number     // 기본 1048576 — 태스크 누적 상한, 초과 시 outputTruncated
 *   }
 *   export interface BgTaskTailHandle { stop(finalFlush?: boolean): Promise<void> }
 *   export function startBgTaskTail(opts: BgTaskTailOptions): BgTaskTailHandle
 *
 * 배경(P09 tail 모델 확정 — agent-events.ts AgentEventBgTask 주석): SDK 스트림은
 * 생명주기+output 파일 *경로*만 운반하고 증분 출력 *내용*은 세션 tasks/{taskId}.output
 * 파일에만 쌓인다(probe④ 실측, 호스트측 SDK 폴링 메서드 없음) → main 측 파일 증분
 * 폴링이 kind='output' 조각을 합성한다(하이브리드).
 *
 * 결정론 노트(브리프 fake-timers 권장에서 의도적 이탈 — trade-off 기록):
 *   vi.useFakeTimers는 폴러 내부 fs IO 방식(sync vs fs/promises)에 테스트를 결합시킨다 —
 *   비동기 fs 구현이면 가짜 시계 진행만으로 IO promise가 정착하지 않아 구현 세부에 따라
 *   hang/flaky가 된다. 대신 옵션 주입 intervalMs(20ms)+이벤트 조건 대기(until)로
 *   벽시계 시각이 아닌 **관측 가능한 방출 순서·내용**만 단정한다(시간값 단정 0 — 결정적).
 *   기본값(750/65536/1048576)은 런타임 검증하지 않는다(기본 주기 대기는 테스트를 느리게
 *   할 뿐 계약 가치가 없음 — 값 자체는 옵션 주석·구현 상수로 고정).
 *
 * 신뢰경계: 실 SDK/네트워크 0 — 로컬 임시 파일만. afterEach에서 핸들 정지+임시 dir 제거.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// ── 대상 모듈 (미존재 — 문자열 경로 dynamic import: typecheck 비결합, 런타임 RED) ────

const TAIL_MODULE = '../../../02.Source/main/01_agents/bgTaskTail'

/** 방출 이벤트의 구조 계약(AgentEventBgTask kind='output' 부분집합 — 구조적 타입 다리). */
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

// ── 테스트 하네스 ────────────────────────────────────────────────────────────────

/** 폴링 주기(테스트 전용 — 옵션 주입). 어떤 단정도 이 값의 배수 시각에 결합하지 않는다. */
const INTERVAL = 20

let dir: string
let handles: TailHandle[]

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'agentdeck-p09-tail-'))
  handles = []
})

afterEach(async () => {
  // 타이머 누수 방지 — 테스트가 중간에 실패해도 핸들은 반드시 정지.
  for (const h of handles) {
    try {
      await h.stop(false)
    } catch {
      // stop 자체의 견고성은 개별 테스트가 단정 — 정리 경로에서는 삼킨다.
    }
  }
  rmSync(dir, { recursive: true, force: true })
})

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 조건 충족까지 이벤트 기반 대기(폴링 10ms) — 시간값이 아닌 관측 조건만 단정. */
async function until(cond: () => boolean, timeoutMs = 3000): Promise<boolean> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) return false
    await sleep(10)
  }
  return true
}

/** 새 이벤트가 spanMs 동안 없을 때까지 대기(유계 — 최대 50회). */
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

// ═══════════════════════════════════════════════════════════════════════════════

describe('gap1-p09 bgTaskTail — 증분 폴링 계약 (RED: 모듈 미존재)', () => {
  it('(a) append → 틱마다 새로 늘어난 부분만 outputChunk 방출(전체 재방출 금지) + 이벤트 봉투', async () => {
    const start = await loadStart()
    const file = path.join(dir, 'a.output')
    writeFileSync(file, 'tick-1\n')
    const events: TailEvent[] = []
    const h = start({ taskId: 'task-a', outputFile: file, emit: (e) => events.push(e), intervalMs: INTERVAL })
    handles.push(h)

    // 초기 내용 도달(조각 수는 구현 재량 — 이어붙인 결과만 단정).
    expect(await until(() => joined(events) === 'tick-1\n')).toBe(true)

    // 증분: 이후 조각은 새로 늘어난 부분만이어야 joined가 정확히 일치한다.
    appendFileSync(file, 'tick-2\n')
    expect(await until(() => joined(events) === 'tick-1\ntick-2\n')).toBe(true)

    // 파일 불변 구간 — 재방출 0(전체 내용을 틱마다 다시 쏘면 여기서 깨진다).
    const count = events.length
    await sleep(INTERVAL * 6)
    expect(events.length).toBe(count)

    // 이벤트 봉투 계약: type='bg_task', kind='output', taskId 전달값 그대로.
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

    // 모든 조각이 상한 이하 — 100바이트 burst가 한 조각으로 새어나오면 안 된다.
    for (const e of events) {
      expect((e.outputChunk ?? '').length).toBeLessThanOrEqual(16)
    }
    // 상한 발동을 소비자에게 알린다(렌더러 truncated 표시의 신뢰 원천).
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

    // 누적 상한 준수 + 절단 표시.
    expect(joined(events).length).toBeLessThanOrEqual(24)
    expect(events.some((e) => e.outputTruncated === true)).toBe(true)

    // 상한 도달 후 추가 append → 새 텍스트 조각 방출 없음(장시간 dev 서버 메모리 보호).
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

    // 아직 폴링되지 않은 잔여분을 남기고 즉시 정지 — finalFlush가 회수해야 한다.
    appendFileSync(file, 'BBB')
    await h.stop(true)
    expect(joined(events)).toBe('AAABBB')

    // 멱등: 재호출에 예외 없음.
    await h.stop(true)

    // 타이머 누수 없음: 정지 후 파일이 더 자라도 방출 0.
    const count = events.length
    appendFileSync(file, 'CCC')
    await sleep(INTERVAL * 8)
    expect(events.length).toBe(count)
  })

  it('(e-1) 파일 미존재 — throw 금지·방출 없음(graceful) + stop(true)도 안전', async () => {
    const start = await loadStart()
    const file = path.join(dir, 'no-such-file.output') // 생성하지 않음
    const events: TailEvent[] = []
    const h = start({ taskId: 'task-e1', outputFile: file, emit: (e) => events.push(e), intervalMs: INTERVAL })
    handles.push(h)

    await sleep(INTERVAL * 6)
    expect(events).toHaveLength(0)
    // 미존재 파일에 대한 finalFlush도 조용히 성공해야 한다.
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
    // 삭제 후 새 조각 없음 + 폴러 생존(예외로 죽지 않음 — stop이 정상 수행).
    expect(events.length).toBe(count)
    await h.stop(false)
  })

  it('(f) 파일 크기 축소(로테이션) — 오프셋 리셋 후 새 내용을 다시 tail(graceful)', async () => {
    const start = await loadStart()
    const file = path.join(dir, 'f.output')
    writeFileSync(file, 'AAAAAAAAAA') // 10바이트
    const events: TailEvent[] = []
    const h = start({ taskId: 'task-f', outputFile: file, emit: (e) => events.push(e), intervalMs: INTERVAL })
    handles.push(h)

    expect(await until(() => joined(events) === 'AAAAAAAAAA')).toBe(true)

    // 로테이션: 파일이 기존 오프셋(10)보다 작아짐(2바이트) → 오프셋 리셋 후 처음부터 tail.
    writeFileSync(file, 'BB')
    expect(await until(() => joined(events).endsWith('BB'))).toBe(true)
    await h.stop(false)
  })
})
