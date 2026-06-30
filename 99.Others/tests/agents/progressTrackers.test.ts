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
