import { describe, it, expect } from 'vitest'
import { TaskTracker, CronTracker } from '../../../02_Project/00_Source/main/01_agents/progressTrackers'

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

  it('파싱 실패(job id 없음) + ok:true → 보수 폴백: tool id로 활성 등록 + 배너 유지 (P02 reviewer 🟡-2)', () => {
    const c = new CronTracker()
    c.recordPending('id1', { prompt: '매분 작업', cron: '* * * * *' })
    const events = c.resolvePending('id1', '아무 의미 없는 내용', true)
    expect(events.length).toBe(1)
    const loops = (events[0] as { loops: { id: string; summary: string }[] }).loops
    expect(loops.length).toBe(1)
    expect(loops[0].id).toBe('id1')
    expect(loops[0].summary).toBe('매분 작업')
    expect(c.hasActivity()).toBe(true)
  })

  it('ok:false(크론 생성 실패) → loops 미방출 + 활동 없음(세션 정상 idle-close 허용)', () => {
    const c = new CronTracker()
    c.recordPending('id1', { prompt: 'x', cron: '* * * * *' })
    expect(c.resolvePending('id1', 'Error: cron creation failed', false)).toEqual([])
    expect(c.hasActivity()).toBe(false)
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

describe('CronTracker — ScheduleWakeup', () => {
  it('isWakeupCall: ScheduleWakeup만 true', () => {
    const c = new CronTracker()
    expect(c.isWakeupCall('ScheduleWakeup')).toBe(true)
    expect(c.isWakeupCall('CronCreate')).toBe(false)
    expect(c.isWakeupCall('Bash')).toBe(false)
  })

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

  it('연쇄 갱신: 재예약 시 기존 항목 교체(추가 아님) — loops 스냅샷 항상 1개', () => {
    const c = new CronTracker()
    c.recordWakeupPending('id1', { delaySeconds: 270, reason: 'A' })
    const events1 = c.resolveWakeupPending('id1', true)
    expect((events1[0] as { loops: unknown[] }).loops.length).toBe(1)
    const idAfterFirst = (events1[0] as { loops: { id: string }[] }).loops[0].id

    expect(c.onTurnEnd()).toEqual([])

    c.recordWakeupPending('id2', { delaySeconds: 300, reason: 'B' })
    const events2 = c.resolveWakeupPending('id2', true)
    const loops2 = (events2[0] as { loops: { id: string; summary: string }[] }).loops
    expect(loops2.length).toBe(1)
    expect(loops2[0].summary).toBe('B')
    expect(loops2[0].id).toBe(idAfterFirst)

    expect(c.onTurnEnd()).toEqual([])
    expect(c.hasActiveLoops()).toBe(true)
  })

  it('종료: 턴 종료 시 재예약 없으면 loops에서 제거(빈 스냅샷)', () => {
    const c = new CronTracker()
    c.recordWakeupPending('id1', { delaySeconds: 270, reason: 'A' })
    c.resolveWakeupPending('id1', true)
    expect(c.onTurnEnd()).toEqual([])
    expect(c.hasActiveLoops()).toBe(true)

    const events = c.onTurnEnd()
    expect(events.length).toBe(1)
    expect((events[0] as { loops: unknown[] }).loops).toEqual([])
    expect(c.hasActiveLoops()).toBe(false)
  })

  it('애초에 armed wakeup 없는 턴 종료 → 무변화([] 반환, no-op)', () => {
    const c = new CronTracker()
    expect(c.onTurnEnd()).toEqual([])
  })

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

  it('cron 루프 + wakeup 루프 공존 시 loops 스냅샷에 둘 다 포함(전체 스냅샷 불변식)', () => {
    const c = new CronTracker()
    c.recordPending('cron1', { prompt: '크론 작업', cron: '* * * * *' })
    c.resolvePending('cron1', 'Scheduled recurring job aabbccdd (Every minute).')

    c.recordWakeupPending('wk1', { delaySeconds: 270, reason: '웨이크업 작업' })
    const events = c.resolveWakeupPending('wk1', true)
    const loops = (events[0] as { loops: { id: string }[] }).loops
    expect(loops.length).toBe(2)
    expect(loops.some(l => l.id === 'aabbccdd')).toBe(true)

    c.onTurnEnd()
    const endEvents = c.onTurnEnd()
    const finalLoops = (endEvents[0] as { loops: { id: string }[] }).loops
    expect(finalLoops.length).toBe(1)
    expect(finalLoops[0].id).toBe('aabbccdd')
    expect(c.hasActiveLoops()).toBe(true)
  })
})
