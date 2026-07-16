/**
 * gap1-p15-r1-s5-filechange-containment.test.ts — GAP1 P15 라운드1 시드 S5 RED.
 *
 * 결함(라운드 0 시드 — dogfood 관찰 A): FileChangeTracker(fileChangeTracker.ts)가
 * Write/Edit 성공 시 **워크스페이스 컨테인먼트 필터 없이** file_changed를 무조건
 * emit한다. 워크스페이스 밖 절대경로(예: plan 모드가 `~/.claude/plans/*.md`에 쓰는
 * 계획 파일)는 record()의 상대화 실패 분기(rel.startsWith('..') → emitPath=rawPath,
 * :96-99)로 절대경로 그대로 이벤트에 실려 — 변경 파일 인디케이터에 워크스페이스와
 * 무관한 파일이 뜨는 소음이 된다.
 *
 * 스카우트 확정: tracker는 생성자에서 workspaceRoot를 이미 주입받는다(:48-50) —
 * 루트 주입 신설 불필요, **shared 계약 변경 0**으로 봉합 가능(어댑터 내부 필터만).
 *
 * 기대 스펙(interface-of-record — 봉합은 agent-backend Worker):
 *   - workspaceRoot가 있는 tracker: 워크스페이스 **밖** 경로(절대경로 이탈·`..` 상대
 *     탈출 모두)는 resolve(ok=true)여도 file_changed 미방출([]).
 *   - 워크스페이스 **안** 경로는 기존 그대로 방출(대조군 — 과잉 필터 금지).
 *   - workspaceRoot 미지정(undefined) tracker: 컨테인먼트 판정 불가 — 기존 거동
 *     유지(rawPath로 방출, 대조군). 과잉 봉합으로 이 경로까지 죽이면 안 된다.
 *
 * TDD 상태: RED 2건(밖 절대경로·`..` 탈출) + 대조군 GREEN 2건(안 경로·루트 미지정).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileChangeTracker } from '../../../02.Source/main/01_agents/fileChangeTracker'

let ws: string // 워크스페이스 루트
let outside: string // 워크스페이스 밖(형제 temp 디렉토리)

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
    // 현행: rawPath(절대경로)로 file_changed 1건 방출 → RED. 봉합: [].
    expect(events).toEqual([])
  })

  it('`..` 상대 탈출 경로 Edit 성공 → file_changed 미방출 (탈출 형태 무관 동일 판정)', () => {
    const t = new FileChangeTracker(ws)
    const escapePath = join(outside, 'escaped.txt')
    writeFileSync(escapePath, 'before\n')
    // ws 기준 상대 `..` 탈출 — join(root, rawPath)가 outside로 해석되는 형태.
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
