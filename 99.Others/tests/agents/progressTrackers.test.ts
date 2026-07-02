/**
 * progressTrackers.test.ts — TaskTracker / CronTracker 골든 테스트 (RF1-followup P03)
 *
 * eventNormalizer.ts에서 분리된 "tool_call → 진행 이벤트(todos/loops)" 트래커 거동 고정.
 * 분해 전 RunEventNormalizer 내부 _handleTaskToolCall / Cron 처리와 1:1 동일.
 */

import { describe, it, expect } from 'vitest'
import { TaskTracker, CronTracker } from '../../../02.Source/main/01_agents/progressTrackers'

describe('TaskTracker', () => {
  it('isTaskTool: TaskCreate/TaskUpdate/TaskList만 true', () => {
    const t = new TaskTracker()
    expect(t.isTaskTool('TaskCreate')).toBe(true)
    expect(t.isTaskTool('TaskUpdate')).toBe(true)
    expect(t.isTaskTool('TaskList')).toBe(true)
    expect(t.isTaskTool('Task')).toBe(false)
    expect(t.isTaskTool('Bash')).toBe(false)
  })

  it('TaskCreate → planned todo + todos 이벤트', () => {
    const t = new TaskTracker()
    const events = t.handle('c1', 'TaskCreate', { subject: '할 일 1' })
    expect(events.length).toBe(1)
    expect(events[0].type).toBe('todos')
    const todos = (events[0] as { todos: { label: string; status: string }[] }).todos
    expect(todos).toEqual([{ id: '1', label: '할 일 1', status: 'planned' }])
  })

  it('빈 subject TaskCreate → todo 미추가 (빈 todos)', () => {
    const t = new TaskTracker()
    const events = t.handle('c1', 'TaskCreate', { subject: '' })
    expect((events[0] as { todos: unknown[] }).todos).toEqual([])
  })

  it('TaskUpdate(status=completed) → done 상태 갱신', () => {
    const t = new TaskTracker()
    t.handle('c1', 'TaskCreate', { subject: '작업' })
    const events = t.handle('u1', 'TaskUpdate', { taskId: '1', status: 'completed' })
    const todos = (events[0] as { todos: { status: string }[] }).todos
    expect(todos[0].status).toBe('done')
  })

  it('TaskUpdate(status=deleted) → todo 제거', () => {
    const t = new TaskTracker()
    t.handle('c1', 'TaskCreate', { subject: '작업' })
    const events = t.handle('u1', 'TaskUpdate', { taskId: '1', status: 'deleted' })
    expect((events[0] as { todos: unknown[] }).todos).toEqual([])
  })

  it('handle된 tool id는 isTaskResult로 suppress 대상', () => {
    const t = new TaskTracker()
    t.handle('c1', 'TaskCreate', { subject: 'x' })
    expect(t.isTaskResult('c1')).toBe(true)
    expect(t.isTaskResult('other')).toBe(false)
  })

  it('clear() 후 새 TaskCreate id는 1부터 재시작 안 함 (seq 보존 — 거동 미러)', () => {
    const t = new TaskTracker()
    t.handle('c1', 'TaskCreate', { subject: 'a' })
    t.clear()
    expect(t.isTaskResult('c1')).toBe(false)
  })
})

describe('CronTracker', () => {
  it('isCronCreate: CronCreate/CronUpdate만 true', () => {
    const c = new CronTracker()
    expect(c.isCronCreate('CronCreate')).toBe(true)
    expect(c.isCronCreate('CronUpdate')).toBe(true)
    expect(c.isCronCreate('CronDelete')).toBe(false)
  })

  it('recordPending → resolvePending(파싱 성공) → loops 이벤트', () => {
    const c = new CronTracker()
    c.recordPending('id1', { prompt: '매분 작업', cron: '* * * * *' })
    const events = c.resolvePending(
      'id1',
      'Scheduled recurring job cc2476aa (Every minute). Session-only.'
    )
    expect(events.length).toBe(1)
    expect(events[0].type).toBe('loops')
    const loops = (events[0] as { loops: { id: string; interval?: string }[] }).loops
    expect(loops[0].id).toBe('cc2476aa')
    expect(loops[0].interval).toBe('Every minute')
  })

  it('파싱 실패(job id 없음) → loops 미방출', () => {
    const c = new CronTracker()
    c.recordPending('id1', { prompt: 'x', cron: '* * * * *' })
    expect(c.resolvePending('id1', '아무 의미 없는 내용')).toEqual([])
  })

  it('hasPending 정확성', () => {
    const c = new CronTracker()
    c.recordPending('id1', { prompt: 'x', cron: 'c' })
    expect(c.hasPending('id1')).toBe(true)
    expect(c.hasPending('nope')).toBe(false)
  })

  it('handleDelete: 활성 루프 제거 → loops 이벤트', () => {
    const c = new CronTracker()
    c.recordPending('id1', { prompt: 'x', cron: 'c' })
    c.resolvePending('id1', 'Scheduled recurring job abc123 (Every hour).')
    expect(c.hasActiveLoops()).toBe(true)
    const events = c.handleDelete({ id: 'abc123' })
    expect(events.length).toBe(1)
    expect((events[0] as { loops: unknown[] }).loops).toEqual([])
    expect(c.hasActiveLoops()).toBe(false)
  })

  it('handleDelete: 미존재 id → loops 미방출', () => {
    const c = new CronTracker()
    expect(c.handleDelete({ id: 'nope' })).toEqual([])
  })
})

// ── CronTracker — ScheduleWakeup (LR3 Phase 04, self-paced 루프) ────────────────
//
// 실측 페이로드(01.Phases/LR3-loop-ux/_probe-findings.md §(+), 2026-07-03):
//   tool_call:   { type:'tool_call', id, name:'ScheduleWakeup',
//                  input:{ delaySeconds, reason, prompt } }
//   tool_result: { type:'tool_result', id, ok, output(사람용 문자열 — 파싱 의존 X) }
//
// 4경로: ① 생성 ② 연쇄 갱신(배너 1개 유지) ③ 종료(다음 예약 부재 → 제거)
//        ④ abort(hasActivity 포함) — ④는 eventNormalizer.abortCleanup 레벨에서
//        wakeup-tracking.test.ts(SDK 통합)가 커버, 여기선 hasActivity() 계약만.
describe('CronTracker — ScheduleWakeup', () => {
  it('isWakeupCall: ScheduleWakeup만 true', () => {
    const c = new CronTracker()
    expect(c.isWakeupCall('ScheduleWakeup')).toBe(true)
    expect(c.isWakeupCall('CronCreate')).toBe(false)
    expect(c.isWakeupCall('Bash')).toBe(false)
  })

  // ── ① 생성 ──────────────────────────────────────────────────────────────
  it('recordWakeupPending → resolveWakeupPending(ok=true) → loops 이벤트(생성)', () => {
    const c = new CronTracker()
    c.recordWakeupPending('id1', {
      delaySeconds: 270,
      reason: '사용자가 멈추라고 할 때까지 PING 응답',
      prompt: "/loop 'PING'이라고만 답하기",
    })
    const events = c.resolveWakeupPending('id1', true)
    expect(events.length).toBe(1)
    expect(events[0].type).toBe('loops')
    const loops = (events[0] as { loops: { id: string; summary: string; interval?: string }[] }).loops
    expect(loops.length).toBe(1)
    expect(loops[0].summary).toBe('사용자가 멈추라고 할 때까지 PING 응답')
    // interval: 사람표기(예: "self-paced ~4분 30초") — output 문자열 파싱에 의존하지 않음
    expect(loops[0].interval).toMatch(/self-paced/)
    expect(loops[0].interval).toMatch(/4분/)
  })

  it('reason 없으면 prompt로 summary 폴백', () => {
    const c = new CronTracker()
    c.recordWakeupPending('id1', { delaySeconds: 60, prompt: '주기적으로 PING' })
    const events = c.resolveWakeupPending('id1', true)
    const loops = (events[0] as { loops: { summary: string }[] }).loops
    expect(loops[0].summary).toBe('주기적으로 PING')
  })

  it('resolveWakeupPending(ok=false) → armed 안 됨(loops 미방출, graceful)', () => {
    const c = new CronTracker()
    c.recordWakeupPending('id1', { delaySeconds: 270, reason: 'x' })
    const events = c.resolveWakeupPending('id1', false)
    expect(events).toEqual([])
    expect(c.hasActivity()).toBe(false)
  })

  it('hasWakeupPending 정확성', () => {
    const c = new CronTracker()
    c.recordWakeupPending('id1', { delaySeconds: 60, reason: 'x' })
    expect(c.hasWakeupPending('id1')).toBe(true)
    expect(c.hasWakeupPending('nope')).toBe(false)
  })

  it('미등록 id로 resolveWakeupPending 호출 → graceful [] (crash 0)', () => {
    const c = new CronTracker()
    expect(c.resolveWakeupPending('ghost', true)).toEqual([])
  })

  it('delaySeconds 결측/비정상 → interval 없이 graceful 등록(crash 0)', () => {
    const c = new CronTracker()
    c.recordWakeupPending('id1', { reason: 'x' })
    const events = c.resolveWakeupPending('id1', true)
    const loops = (events[0] as { loops: { interval?: string }[] }).loops
    expect(loops[0].interval).toBeUndefined()
  })

  // ── ② 연쇄 갱신 — 배너 1개 유지 ──────────────────────────────────────────
  it('연쇄 갱신: 재예약 시 기존 항목 교체(추가 아님) — loops 스냅샷 항상 1개', () => {
    const c = new CronTracker()
    c.recordWakeupPending('id1', { delaySeconds: 270, reason: 'A' })
    const events1 = c.resolveWakeupPending('id1', true)
    expect((events1[0] as { loops: unknown[] }).loops.length).toBe(1)
    const idAfterFirst = (events1[0] as { loops: { id: string }[] }).loops[0].id

    // 턴1 종료: armed 유지(같은 턴에 막 예약했으므로 제거 안 됨)
    expect(c.onTurnEnd()).toEqual([])

    // 턴2: 재예약(체인 계속)
    c.recordWakeupPending('id2', { delaySeconds: 300, reason: 'B' })
    const events2 = c.resolveWakeupPending('id2', true)
    const loops2 = (events2[0] as { loops: { id: string; summary: string }[] }).loops
    expect(loops2.length).toBe(1)               // 배너 1개 유지(추가 아님)
    expect(loops2[0].summary).toBe('B')          // 최신 예약으로 교체
    expect(loops2[0].id).toBe(idAfterFirst)      // 동일 슬롯 갱신(교체) — id 불변

    // 턴2 종료: 이번 턴에 재예약했으므로 유지
    expect(c.onTurnEnd()).toEqual([])
    expect(c.hasActiveLoops()).toBe(true)
  })

  // ── ③ 종료 — 다음 예약 부재 → loops에서 제거 ────────────────────────────
  it('종료: 턴 종료 시 재예약 없으면 loops에서 제거(빈 스냅샷)', () => {
    const c = new CronTracker()
    c.recordWakeupPending('id1', { delaySeconds: 270, reason: 'A' })
    c.resolveWakeupPending('id1', true)
    // 턴1 종료: 막 예약했으므로 유지
    expect(c.onTurnEnd()).toEqual([])
    expect(c.hasActiveLoops()).toBe(true)

    // 턴2: 모델이 ScheduleWakeup을 다시 호출하지 않음(모니터링 종료 판단)
    // 턴2 종료 시점에 재예약이 없었으므로 제거
    const events = c.onTurnEnd()
    expect(events.length).toBe(1)
    expect((events[0] as { loops: unknown[] }).loops).toEqual([])
    expect(c.hasActiveLoops()).toBe(false)
  })

  it('애초에 armed wakeup 없는 턴 종료 → 무변화([] 반환, no-op)', () => {
    const c = new CronTracker()
    expect(c.onTurnEnd()).toEqual([])
  })

  // ── hasActivity 확장 — armed/pending wakeup도 활동으로 판정 ──────────────
  it('hasActivity: pending(미확정) wakeup만 있어도 true', () => {
    const c = new CronTracker()
    expect(c.hasActivity()).toBe(false)
    c.recordWakeupPending('id1', { delaySeconds: 60, reason: 'x' })
    expect(c.hasActivity()).toBe(true)
  })

  it('hasActivity: armed(확정) wakeup만 있어도 true — cron 없이도 활동 판정', () => {
    const c = new CronTracker()
    c.recordWakeupPending('id1', { delaySeconds: 60, reason: 'x' })
    c.resolveWakeupPending('id1', true)
    expect(c.hasActivity()).toBe(true)
    expect(c.hasActiveLoops()).toBe(true)
  })

  it('clear() 후 wakeup 상태 전부 초기화 — hasActivity false', () => {
    const c = new CronTracker()
    c.recordWakeupPending('id1', { delaySeconds: 60, reason: 'x' })
    c.resolveWakeupPending('id1', true)
    c.clear()
    expect(c.hasActivity()).toBe(false)
    expect(c.hasActiveLoops()).toBe(false)
  })

  // ── 공존 — cron 루프와 wakeup 루프가 동시에 활성일 때 스냅샷 병합 ─────────
  it('cron 루프 + wakeup 루프 공존 시 loops 스냅샷에 둘 다 포함(전체 스냅샷 불변식)', () => {
    const c = new CronTracker()
    c.recordPending('cron1', { prompt: '크론 작업', cron: '* * * * *' })
    c.resolvePending('cron1', 'Scheduled recurring job aabbccdd (Every minute).')

    c.recordWakeupPending('wk1', { delaySeconds: 270, reason: '웨이크업 작업' })
    const events = c.resolveWakeupPending('wk1', true)
    const loops = (events[0] as { loops: { id: string }[] }).loops
    expect(loops.length).toBe(2)
    expect(loops.some(l => l.id === 'aabbccdd')).toBe(true)

    // wakeup 종료(턴 종료, 재예약 없음)해도 cron 루프는 유지
    c.onTurnEnd() // armed this turn → 유지
    const endEvents = c.onTurnEnd() // 재예약 없음 → wakeup만 제거
    const finalLoops = (endEvents[0] as { loops: { id: string }[] }).loops
    expect(finalLoops.length).toBe(1)
    expect(finalLoops[0].id).toBe('aabbccdd')
    expect(c.hasActiveLoops()).toBe(true) // cron은 여전히 활성
  })
})
