import { describe, it, expect } from 'vitest'
import {
  applyAgentEvent,
  makeInitialState,
} from '../../../02_Project/00_Source/renderer/src/store/reducer'
import type { AppState } from '../../../02_Project/00_Source/renderer/src/store/reducer'
import type { AgentEventPayload } from '../../../02_Project/00_Source/shared/ipcContract'
import type { DiffLine } from '../../../02_Project/00_Source/shared/diffTypes'

const runId = 'run-b'

function payload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId, event }
}

const sampleDiff: DiffLine[] = [
  { kind: 'context', content: 'const x = 1', lineOld: 1, lineNew: 1 },
  { kind: 'remove', content: 'const y = 2', lineOld: 2 },
  { kind: 'add', content: 'const y = 99', lineNew: 2 },
]

describe('Phase B — fileDiffs reducer', () => {
  it('file_changed + diff → fileDiffs[toolId] 저장(toolId 우선, path 폴백)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({
        type: 'file_changed',
        path: 'src/a.ts',
        change: 'modify',
        toolId: 'tool-77',
        add: 3,
        del: 1,
        diff: sampleDiff,
      })
    )
    expect((s1 as AppState & { fileDiffs: Record<string, unknown> }).fileDiffs).toBeDefined()
    const all = (s1 as AppState & { fileDiffs: Record<string, { add: number; del: number; lines: DiffLine[] }> }).fileDiffs
    expect(all['src/a.ts']).toBeUndefined()
    const entry = all['tool-77']
    expect(entry).toBeDefined()
    expect(entry.add).toBe(3)
    expect(entry.del).toBe(1)
    expect(entry.lines).toEqual(sampleDiff)
  })

  it('changedFiles는 기존대로 계속 추가됨 (회귀 없음)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({
        type: 'file_changed',
        path: 'src/a.ts',
        change: 'modify',
        add: 3,
        del: 1,
        diff: sampleDiff,
      })
    )
    expect(s1.changedFiles.has('src/a.ts')).toBe(true)
  })

  it('diff 없는 file_changed → fileDiffs 미변경', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({
        type: 'file_changed',
        path: 'src/b.ts',
        change: 'modify',
      })
    )
    const fileDiffs = (s1 as AppState & { fileDiffs: Record<string, unknown> }).fileDiffs
    expect(fileDiffs['src/b.ts']).toBeUndefined()
  })

  it('같은 path 재이벤트 → 최신 diff로 교체', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(
      s0,
      payload({
        type: 'file_changed',
        path: 'src/c.ts',
        change: 'modify',
        add: 1,
        del: 0,
        diff: [{ kind: 'add', content: 'first', lineNew: 1 }],
      })
    )
    const newDiff: DiffLine[] = [{ kind: 'add', content: 'second', lineNew: 5 }]
    const s2 = applyAgentEvent(
      s1,
      payload({
        type: 'file_changed',
        path: 'src/c.ts',
        change: 'modify',
        add: 2,
        del: 3,
        diff: newDiff,
      })
    )
    const entry = (s2 as AppState & { fileDiffs: Record<string, { add: number; del: number; lines: DiffLine[] }> }).fileDiffs['src/c.ts']
    expect(entry.add).toBe(2)
    expect(entry.del).toBe(3)
    expect(entry.lines).toEqual(newDiff)
  })

  it('makeInitialState()에 fileDiffs: {} 포함', () => {
    const s = makeInitialState()
    expect((s as AppState & { fileDiffs: Record<string, unknown> }).fileDiffs).toEqual({})
  })
})
