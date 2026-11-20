// M10 G6 — 두 번째 마일스톤 준비. 끝난 실행(status done, 다이제스트·스키마 정상)은 열 때 템플릿 해시가 달라도 막히지 않고,
// 새 마일스톤을 시작하면 그 실행의 생존 문서를 `.agentdeck/archive/<옛 마일스톤>/`으로 옮긴 뒤 새 실행을 연다.
// 끝나지 않은 실행·위조 상태·래치는 그대로 막힌다. 보관 중 실패하면 옮긴 것을 되돌리고 거부한다.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { repoKeyOf, stateDigest } from '@main/05_Loop/digestStore'
import { ARCHIVE_DIR, createLoopRunner, finishedNotice, type LoopRunner } from '@main/05_Loop/loopRunner'
import { createFsPort } from '@main/05_Loop/realPorts/fsPort'
import type { RunState } from '@main/05_Loop/runState'
import { DOCS, readGoalSeeds } from '@main/05_Loop/survivalDocs'
import { loaded, makeRig, runLoop, variantText, type Rig } from '../00_Helpers/loopFakes'

const CWD = 'C:/work/practice'
const KEY = repoKeyOf(CWD)
const ARCHIVE = '.agentdeck/archive/M01'
// G5처럼 노드 제목만 바뀐 템플릿 — 해시가 다르다
const RETITLED = variantText((raw) => { raw.nodes[0].title = '바뀐 브레인스토밍' })

function runnerOf(rig: Rig, text?: string): LoopRunner {
  const { template, hash } = loaded(text)
  return createLoopRunner({ template, hash, ports: rig.ports, cwd: CWD, base: 'master' })
}

async function finished(): Promise<{ rig: Rig; runner: LoopRunner; state: RunState }> {
  const rig = makeRig()
  const runner = runnerOf(rig)
  expect((await runner.start('M01')).kind).toBe('ok')
  const run = await runLoop(runner, rig)
  expect(run.state.status).toBe('done')
  await rig.fs.write('.agentdeck/backlog.md', '- 다음에 할 일\n')
  return { rig, runner, state: run.state }
}

async function unfinished(): Promise<{ rig: Rig; runner: LoopRunner }> {
  const rig = makeRig()
  const runner = runnerOf(rig)
  expect((await runner.start('M01')).kind).toBe('ok')
  await runLoop(runner, rig, { until: 'G1/checks' })
  return { rig, runner }
}

const snapshot = (rig: Rig): Map<string, string> => new Map(rig.fs.files)

describe('끝난 실행은 열 때 막히지 않는다 (M10 G6)', () => {
  it('같은 해시와 다른 해시 모두 끝난 실행으로 읽힌다 — 안내 문구는 옛 마일스톤을 적는다', async () => {
    const { rig, runner } = await finished()
    const same = await runner.load()
    expect(same.kind === 'ok' && same.state.status).toBe('done')
    const other = await runnerOf(rig, RETITLED).load()
    expect(other.kind).toBe('ok')
    expect(other.kind === 'ok' && other.next.kind).toBe('done')
    expect(rig.digest.latches.size).toBe(0)
    // 끝난 실행을 이어 가는 길은 없다 — 상태를 쓰지 않는다
    const text = rig.fs.files.get(DOCS.runState)
    expect((await runner.step()).kind).toBe('done')
    expect(rig.fs.files.get(DOCS.runState)).toBe(text)
    expect(finishedNotice('M01')).toBe('끝난 실행(M01) — 새 마일스톤을 시작하면 보관해요')
  })

  it('끝나지 않은 실행의 다른 해시는 그대로 blocked다', async () => {
    const { rig } = await unfinished()
    const other = await runnerOf(rig, RETITLED).load()
    expect(other.kind).toBe('blocked')
    expect(other.kind === 'blocked' && other.reason).toContain('템플릿 해시')
  })
})

describe('새 마일스톤을 시작하면 끝난 실행을 보관한다 (M10 G6)', () => {
  it('생존 문서를 보관 자리로 옮기고 새 실행을 연다 — 보관본은 지금 실행으로 읽히지 않는다', async () => {
    const { rig } = await finished()
    const before = snapshot(rig)
    const oldDigest = rig.digest.digests.get(KEY)
    // 앱이 G5 템플릿으로 바뀐 뒤의 시작이다
    const runner = runnerOf(rig, RETITLED)
    const r = await runner.start('M02')
    expect(r.kind).toBe('ok')
    expect(r.kind === 'ok' && r.state.milestoneId).toBe('M02')
    const moved: [string, string][] = [
      [DOCS.runState, `${ARCHIVE}/run-state.json`],
      [DOCS.milestoneSpec, `${ARCHIVE}/milestone-spec.md`],
      [DOCS.decisions, `${ARCHIVE}/decisions.md`],
      [DOCS.verification, `${ARCHIVE}/verification.md`],
      ['.agentdeck/goals/G1.md', `${ARCHIVE}/goals/G1.md`],
      ['.agentdeck/goals/G2.md', `${ARCHIVE}/goals/G2.md`],
    ]
    for (const [from, to] of moved) expect(rig.fs.files.get(to), to).toBe(before.get(from))
    expect(rig.fs.files.get('.agentdeck/backlog.md')).toBe('- 다음에 할 일\n')
    // 지금 자리에는 새 실행만 있다
    expect(rig.fs.files.has(DOCS.milestoneSpec)).toBe(false)
    expect(rig.fs.files.has(DOCS.decisions)).toBe(false)
    expect(await rig.fs.list(DOCS.goalsDir)).toEqual([])
    expect((await readGoalSeeds(rig.fs)).ok).toBe(false)
    expect((await runner.specView()).text).toBeNull()
    expect(rig.fs.files.get(DOCS.verification)).toContain('검증 기록 — M02')
    const now = JSON.parse(rig.fs.files.get(DOCS.runState) as string) as RunState
    expect(rig.digest.digests.get(KEY)).toBe(stateDigest(now))
    expect(rig.digest.digests.get(KEY)).not.toBe(oldDigest)
    // 다이제스트와 사본은 앱 영역에 저장소마다 하나다 — 새 실행의 것으로 바뀐다
    expect(rig.digest.copies.get(KEY)).toBe(rig.fs.files.get(DOCS.runState))
    const load = await runner.load()
    expect(load.kind === 'ok' && [load.state.milestoneId, load.state.status, load.state.lines.length]).toEqual(['M02', 'running', 0])
    expect(load.kind === 'ok' && load.next.kind === 'work' && load.next.node.id).toBe('brainstorm')
    expect(rig.digest.latches.size).toBe(0)
  })

  it('끝나지 않은 실행이 있으면 같은 해시든 다른 해시든 거부하고 아무것도 옮기지 않는다', async () => {
    const { rig, runner } = await unfinished()
    const before = snapshot(rig)
    for (const r of [runner, runnerOf(rig, RETITLED)]) {
      const out = await r.start('M02')
      expect(out.kind).toBe('blocked')
      expect(out.kind === 'blocked' && out.reason).toContain('실행 상태가 이미 있다')
    }
    expect(rig.fs.moves).toEqual([])
    expect(snapshot(rig)).toEqual(before)
  })

  it('위조된 done(다이제스트 불일치)은 보관하지 않고 래치를 건다', async () => {
    const { rig, runner } = await unfinished()
    const forged = JSON.parse(rig.fs.files.get(DOCS.runState) as string) as RunState
    forged.status = 'done'
    rig.fs.files.set(DOCS.runState, `${JSON.stringify(forged, null, 2)}\n`)
    const before = snapshot(rig)
    const load = await runner.load()
    expect(load.kind).toBe('needs-user')
    const out = await runner.start('M02')
    expect(out.kind).toBe('needs-user')
    expect(rig.digest.latches.get(KEY)).toContain('상태 파일이 실행기 밖에서 바뀌었다')
    expect(rig.fs.moves).toEqual([])
    expect(snapshot(rig)).toEqual(before)
    // 새 실행기여도 래치가 남아 보관하지 않는다
    expect((await runnerOf(rig, RETITLED).start('M02')).kind).toBe('needs-user')
    expect(rig.fs.moves).toEqual([])
  })

  it('래치가 걸려 있으면 진짜 끝난 실행이어도 보관하지 않는다', async () => {
    const { rig, runner } = await finished()
    rig.digest.latches.set(KEY, '앞서 본 불일치')
    expect((await runner.start('M02')).kind).toBe('needs-user')
    expect(rig.fs.moves).toEqual([])
  })

  it('새 마일스톤 id가 꼴이 아니면 아무것도 옮기지 않는다', async () => {
    const { rig, runner } = await finished()
    const before = snapshot(rig)
    const out = await runner.start('M 02')
    expect(out.kind).toBe('blocked')
    expect(rig.fs.moves).toEqual([])
    expect(snapshot(rig)).toEqual(before)
  })

  it('같은 이름의 보관 자리가 있으면 시각 꼬리를 붙이고, 그것도 있으면 번호를 더 붙인다 — 있던 보관본은 그대로다', async () => {
    const { rig } = await finished()
    const oldState = rig.fs.files.get(DOCS.runState)
    await rig.fs.write(`${ARCHIVE}/run-state.json`, '앞 보관본')
    await rig.fs.write(`${ARCHIVE}-20261120093000/run-state.json`, '둘째 보관본')
    const runner = createLoopRunner({
      ...loaded(), ports: { ...rig.ports, clock: { now: () => '2026-11-20T09:30:00+09:00' } }, cwd: CWD, base: 'master',
    })
    expect((await runner.start('M02')).kind).toBe('ok')
    expect(rig.fs.files.get(`${ARCHIVE}/run-state.json`)).toBe('앞 보관본')
    expect(rig.fs.files.get(`${ARCHIVE}-20261120093000/run-state.json`)).toBe('둘째 보관본')
    expect(rig.fs.files.get(`${ARCHIVE}-20261120093000-2/run-state.json`)).toBe(oldState)
    expect(rig.fs.files.has(`${ARCHIVE}-20261120093000-2/goals/G1.md`)).toBe(true)
    expect(rig.fs.moves.every((m) => m.includes(`${ARCHIVE}-20261120093000-2/`))).toBe(true)
  })

  it('옮기는 도중 실패하면 옮긴 것을 되돌리고 거부한다 — 끝난 실행이 그대로 남는다', async () => {
    const { rig, runner } = await finished()
    const before = snapshot(rig)
    const digest = rig.digest.digests.get(KEY)
    rig.fs.failMove = (from) => from === DOCS.runState
    const out = await runner.start('M02')
    expect(out.kind).toBe('blocked')
    expect(out.kind === 'blocked' && out.reason).toContain('끝난 실행(M01)을 보관하지 못해')
    expect(rig.fs.moves.length).toBeGreaterThan(0)
    expect(snapshot(rig)).toEqual(before)
    expect(rig.digest.digests.get(KEY)).toBe(digest)
    expect(rig.digest.latches.size).toBe(0)
    const load = await runner.load()
    expect(load.kind === 'ok' && [load.state.milestoneId, load.state.status]).toEqual(['M01', 'done'])
    // 고친 뒤에는 보관하고 시작한다
    rig.fs.failMove = null
    expect((await runner.start('M02')).kind).toBe('ok')
  })

  it('실물 fs에서 실패 뒤 되돌려 빈 보관 폴더가 남아도, 다시 시작하면 같은 이름 자리에 보관한다', async () => {
    const { rig } = await finished()
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-g6-archive-'))
    try {
      for (const [rel, text] of rig.fs.files) {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
        fs.writeFileSync(path.join(root, rel), text)
      }
      const real = createFsPort(root)
      let fail = true
      const move = real.move
      real.move = async (from, to) => {
        if (fail && from === DOCS.runState) throw new Error('시험: 잠긴 파일')
        await move(from, to)
      }
      const runner = createLoopRunner({ ...loaded(), ports: { ...rig.ports, fs: real }, cwd: CWD, base: 'master' })
      expect((await runner.start('M02')).kind).toBe('blocked')
      expect(fs.readFileSync(path.join(root, DOCS.runState), 'utf8')).toBe(rig.fs.files.get(DOCS.runState))
      fail = false
      expect((await runner.start('M02')).kind).toBe('ok')
      expect(fs.readdirSync(path.join(root, ARCHIVE_DIR))).toEqual(['M01'])
      expect(fs.existsSync(path.join(root, ARCHIVE, 'run-state.json'))).toBe(true)
      expect(fs.readdirSync(path.join(root, ARCHIVE, 'goals')).sort()).toEqual(['G1.md', 'G2.md'])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('옮긴 뒤 새 상태를 쓰지 못하면 보관을 되돌리고 사본도 옛것으로 둔다', async () => {
    const { rig, runner } = await finished()
    const before = snapshot(rig)
    const copy = rig.digest.copies.get(KEY)
    const write = rig.fs.write.bind(rig.fs)
    rig.fs.write = async (rel, text) => {
      if (rel === DOCS.runState) throw new Error('디스크가 찼다')
      await write(rel, text)
    }
    const out = await runner.start('M02')
    expect(out.kind).toBe('blocked')
    expect(out.kind === 'blocked' && out.reason).toContain('디스크가 찼다')
    expect(snapshot(rig)).toEqual(before)
    expect(rig.digest.copies.get(KEY)).toBe(copy)
    expect(rig.digest.latches.size).toBe(0)
  })

  it('보관하는 동안 읽는 쪽(load)은 래치를 걸지 않고 새 실행을 본다', async () => {
    const { rig, runner } = await finished()
    const move = rig.fs.move.bind(rig.fs)
    let during: ReturnType<LoopRunner['load']> | null = null
    rig.fs.move = async (from, to) => {
      await move(from, to)
      if (from !== DOCS.runState) return
      // 상태 파일은 옮겼고 다이제스트는 아직 옛것인 틈
      during = runner.load()
      await new Promise((r) => setTimeout(r, 0))
    }
    expect((await runner.start('M02')).kind).toBe('ok')
    expect(during).not.toBeNull()
    const seen = await (during as unknown as ReturnType<LoopRunner['load']>)
    expect(seen.kind === 'ok' && seen.state.milestoneId).toBe('M02')
    expect(rig.digest.latches.size).toBe(0)
    expect((await runner.load()).kind).toBe('ok')
  })
})
