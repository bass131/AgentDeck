import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileChangeTracker } from '../../../02_Project/00_Source/main/01_agents/fileChangeTracker'

let ws: string
let outside: string

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), 'p15s5-ws-'))
  outside = mkdtempSync(join(tmpdir(), 'p15s5-out-'))
})
afterEach(() => {
  rmSync(ws, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

describe('GAP1 P15-R1 S5 — 워크스페이스 밖 경로 file_changed 억제 (RED)', () => {
  it('밖 절대경로(plan 파일 모델) Write 성공 → file_changed 미방출', () => {
    const t = new FileChangeTracker(ws)
    const planPath = join(outside, 'you-are-in-plan.md')
    t.record('id-out1', 'Write', { file_path: planPath })
    writeFileSync(planPath, '# Plan\n')
    const events = t.resolve('id-out1', true)
    expect(events).toEqual([])
  })

  it('`..` 상대 탈출 경로 Edit 성공 → file_changed 미방출 (탈출 형태 무관 동일 판정)', () => {
    const t = new FileChangeTracker(ws)
    const escapePath = join(outside, 'escaped.txt')
    writeFileSync(escapePath, 'before\n')
    const rel = join('..', outside.split(/[\\/]/).pop() as string, 'escaped.txt')
    t.record('id-out2', 'Edit', { file_path: rel })
    writeFileSync(escapePath, 'after\n')
    const events = t.resolve('id-out2', true)
    expect(events).toEqual([])
  })

  it('대조군(GREEN 유지): 워크스페이스 안 경로는 기존 그대로 방출 — 과잉 필터 금지', () => {
    const t = new FileChangeTracker(ws)
    const insidePath = join(ws, 'src.ts')
    t.record('id-in1', 'Write', { file_path: insidePath })
    writeFileSync(insidePath, 'const a = 1\n')
    const events = t.resolve('id-in1', true)
    expect(events.length).toBe(1)
    expect(events[0].type).toBe('file_changed')
    expect((events[0] as { path: string }).path).toBe('src.ts')
  })

  it('대조군(GREEN 유지): workspaceRoot 미지정 tracker는 기존 거동(rawPath 방출) 유지', () => {
    const t = new FileChangeTracker(undefined)
    const anyPath = join(outside, 'no-root.txt')
    t.record('id-nr1', 'Write', { file_path: anyPath })
    writeFileSync(anyPath, 'x\n')
    const events = t.resolve('id-nr1', true)
    expect(events.length).toBe(1)
    expect((events[0] as { path: string }).path).toBe(anyPath)
  })
})
