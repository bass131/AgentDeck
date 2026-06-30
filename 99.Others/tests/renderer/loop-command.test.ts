/**
 * loop-command.test.ts — 앱 레벨 /loop 순수 함수 단위 (2단계).
 *
 * parseLoopCommand: 인터셉트할 텍스트를 start/stop/invalid로 분류 + interval 파싱.
 * decideLoopTick: idle 전이 시 다음 행동(schedule/halt/idle) 결정 — 안전 가드 포함.
 * isLoopCommand: dispatchSend/handleSend 최상단 인터셉트 판정.
 *
 * 전부 순수(window.api/타이머 무관) — Vitest node 환경 단언. 신뢰경계 영향 0.
 */
import { describe, it, expect } from 'vitest'
import {
  isLoopCommand,
  parseLoopCommand,
  decideLoopTick,
  formatLoopInterval,
  LOOP_DEFAULT_INTERVAL_MS,
  LOOP_MAX_INTERVAL_MS,
  LOOP_MAX_TICKS,
  LOOP_MAX_DURATION_MS,
  type ActiveLoop,
} from '../../../02.Source/renderer/src/lib/loopCommand'

// ── isLoopCommand ─────────────────────────────────────────────────────────────
describe('isLoopCommand — 인터셉트 판정', () => {
  it('정확히 /loop → true', () => {
    expect(isLoopCommand('/loop')).toBe(true)
  })
  it('/loop <인자> → true', () => {
    expect(isLoopCommand('/loop 5m do X')).toBe(true)
    expect(isLoopCommand('/loop stop')).toBe(true)
  })
  it('일반 텍스트/다른 슬래시 → false (SDK 누수 차단의 첫 게이트)', () => {
    expect(isLoopCommand('hello')).toBe(false)
    expect(isLoopCommand('/clear')).toBe(false)
    expect(isLoopCommand('/review')).toBe(false)
    expect(isLoopCommand('/looping something')).toBe(false) // 접두만 같은 단어 오인 금지
  })
  it('앞뒤 공백 허용', () => {
    expect(isLoopCommand('  /loop 5m x  ')).toBe(true)
  })
})

// ── parseLoopCommand: stop ────────────────────────────────────────────────────
describe('parseLoopCommand — stop/off 인터셉트', () => {
  it('/loop stop → {kind:stop}', () => {
    expect(parseLoopCommand('/loop stop')).toEqual({ kind: 'stop' })
  })
  it('/loop off → {kind:stop} (alias)', () => {
    expect(parseLoopCommand('/loop off')).toEqual({ kind: 'stop' })
  })
  it('대소문자 무시 (/loop STOP)', () => {
    expect(parseLoopCommand('/loop STOP')).toEqual({ kind: 'stop' })
  })
})

// ── parseLoopCommand: start + interval ────────────────────────────────────────
describe('parseLoopCommand — interval 파싱', () => {
  it('/loop 30s X → 30000ms', () => {
    expect(parseLoopCommand('/loop 30s do X')).toEqual({ kind: 'start', intervalMs: 30_000, prompt: 'do X' })
  })
  it('/loop 5m X → 300000ms', () => {
    expect(parseLoopCommand('/loop 5m do X')).toEqual({ kind: 'start', intervalMs: 300_000, prompt: 'do X' })
  })
  it('/loop 2m X → 120000ms', () => {
    expect(parseLoopCommand('/loop 2m run tests')).toEqual({ kind: 'start', intervalMs: 120_000, prompt: 'run tests' })
  })
  it('/loop 1h X → 3600000ms', () => {
    expect(parseLoopCommand('/loop 1h check')).toEqual({ kind: 'start', intervalMs: 3_600_000, prompt: 'check' })
  })
  it('interval 없음 → 기본 5초 (Q1 self-pace)', () => {
    expect(parseLoopCommand('/loop keep improving')).toEqual({
      kind: 'start',
      intervalMs: LOOP_DEFAULT_INTERVAL_MS,
      prompt: 'keep improving',
    })
  })
  it('인라인 슬래시 프롬프트 허용 (/loop 5m /review) — SDK loop 시맨틱', () => {
    expect(parseLoopCommand('/loop 5m /review')).toEqual({ kind: 'start', intervalMs: 300_000, prompt: '/review' })
  })
  it('잘못된 interval 토큰(5x)은 interval 아님 → 프롬프트 일부로 흡수 + 기본 간격', () => {
    expect(parseLoopCommand('/loop 5x do X')).toEqual({
      kind: 'start',
      intervalMs: LOOP_DEFAULT_INTERVAL_MS,
      prompt: '5x do X',
    })
  })
  it('거대 interval은 MAX로 클램프 (9999h 방어)', () => {
    const r = parseLoopCommand('/loop 9999h spam')
    expect(r.kind).toBe('start')
    if (r.kind === 'start') expect(r.intervalMs).toBe(LOOP_MAX_INTERVAL_MS)
  })
  it('앞뒤 공백 정규화', () => {
    expect(parseLoopCommand('  /loop 5m   do X  ')).toEqual({ kind: 'start', intervalMs: 300_000, prompt: 'do X' })
  })
})

// ── parseLoopCommand: invalid ─────────────────────────────────────────────────
describe('parseLoopCommand — invalid', () => {
  it('/loop (프롬프트 없음) → invalid', () => {
    const r = parseLoopCommand('/loop')
    expect(r.kind).toBe('invalid')
  })
  it('/loop  (공백만) → invalid', () => {
    const r = parseLoopCommand('/loop   ')
    expect(r.kind).toBe('invalid')
  })
  it('/loop 5m (interval만, 프롬프트 없음) → invalid', () => {
    const r = parseLoopCommand('/loop 5m')
    expect(r.kind).toBe('invalid')
  })
})

// ── decideLoopTick: 안전 가드 ─────────────────────────────────────────────────
function loop(partial: Partial<ActiveLoop> = {}): ActiveLoop {
  return {
    prompt: 'do X',
    intervalMs: 5000,
    tickCount: 1,
    status: 'running',
    startedAt: 1_000_000,
    ...partial,
  }
}

describe('decideLoopTick — 다음 틱 판정 + 안전 가드', () => {
  it('running + 가드 미달 → schedule(intervalMs)', () => {
    expect(decideLoopTick(loop({ intervalMs: 30_000, tickCount: 3 }), 1_000_100)).toEqual({
      action: 'schedule',
      intervalMs: 30_000,
    })
  })
  it('null 루프 → idle', () => {
    expect(decideLoopTick(null, 1_000_000)).toEqual({ action: 'idle' })
  })
  it('status=stopped → idle (재개 안 함)', () => {
    expect(decideLoopTick(loop({ status: 'stopped' }), 1_000_000)).toEqual({ action: 'idle' })
  })
  it('tickCount >= MAX_TICKS → halt(max-ticks)', () => {
    expect(decideLoopTick(loop({ tickCount: LOOP_MAX_TICKS }), 1_000_100)).toEqual({
      action: 'halt',
      reason: 'max-ticks',
    })
  })
  it('tickCount = MAX-1 → 아직 schedule (경계)', () => {
    const r = decideLoopTick(loop({ tickCount: LOOP_MAX_TICKS - 1 }), 1_000_100)
    expect(r.action).toBe('schedule')
  })
  it('누적 시간 >= MAX_DURATION → halt(max-duration)', () => {
    const started = 1_000_000
    expect(decideLoopTick(loop({ startedAt: started, tickCount: 2 }), started + LOOP_MAX_DURATION_MS)).toEqual({
      action: 'halt',
      reason: 'max-duration',
    })
  })
  it('틱 상한이 시간 상한보다 우선 (둘 다 초과 시 max-ticks)', () => {
    const started = 1_000_000
    const r = decideLoopTick(
      loop({ startedAt: started, tickCount: LOOP_MAX_TICKS }),
      started + LOOP_MAX_DURATION_MS + 1,
    )
    expect(r).toEqual({ action: 'halt', reason: 'max-ticks' })
  })
})

// ── formatLoopInterval — 인디케이터 표시용 ────────────────────────────────────
describe('formatLoopInterval — 한국어 간격 표시', () => {
  it('초 단위', () => {
    expect(formatLoopInterval(5_000)).toBe('5초')
    expect(formatLoopInterval(30_000)).toBe('30초')
  })
  it('분 단위 (정확히 나눠떨어지면 분)', () => {
    expect(formatLoopInterval(60_000)).toBe('1분')
    expect(formatLoopInterval(300_000)).toBe('5분')
  })
  it('시간 단위', () => {
    expect(formatLoopInterval(3_600_000)).toBe('1시간')
  })
})
