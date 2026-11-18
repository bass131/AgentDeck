// M09 G2 실행 상태의 앱 쪽 다이제스트 — 파일 저장소(작업 저장소 밖), 키·정규 해시, 그리고 실행기가 다르면 멈추는 것.
// 멈춤은 blocked가 아니라 사람을 부르는 꼴(needs-user)이고 사유는 「상태 파일이 실행기 밖에서 바뀌었다」다. 불일치 때는 아무것도 쓰지 않는다.
// 다이제스트는 새로 시작할 때만 만든다 — 상태 파일은 있는데 다이제스트가 없거나, 다이제스트는 있는데 상태 파일이 없으면 멈춘다.
// 다이제스트 파일 쓰기는 fs 포트와 같은 임시 파일 뒤 이름 바꾸기(재시도 포함)다.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createFileDigestStore, repoKeyOf, stateDigest } from '@main/05_Loop/digestStore'
import { createLoopRunner, type LoopRunner } from '@main/05_Loop/loopRunner'
import type { RunState } from '@main/05_Loop/runState'
import { DOCS } from '@main/05_Loop/survivalDocs'
import { loaded, makeRig, runLoop, type Rig } from '../00_Helpers/loopFakes'

const CWD = 'C:/work/practice'
const TAMPERED = '상태 파일이 실행기 밖에서 바뀌었다'
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-g2-digest-'))
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('파일 다이제스트 저장소와 키', () => {
  it('없으면 null, 쓰면 읽힌다, 키가 sha256 꼴이 아니면 거부한다', async () => {
    const store = createFileDigestStore(path.join(dir, 'digests'))
    const key = repoKeyOf(CWD)
    expect(await store.read(key)).toBeNull()
    await store.write(key, 'a'.repeat(64))
    expect(await store.read(key)).toBe('a'.repeat(64))
    await expect(store.write('../escape', 'x')).rejects.toThrow()
    await store.write(key, 'b'.repeat(64))
    expect(await store.read(key)).toBe('b'.repeat(64))
    // 임시 파일 뒤 이름 바꾸기라 찌꺼기가 남지 않는다
    expect(fs.readdirSync(path.join(dir, 'digests'))).toEqual([`${key}.sha256`])
  })

  it('위조 래치 — 없으면 null, 걸면 사유가 읽히고 다이제스트와 따로 산다', async () => {
    const store = createFileDigestStore(path.join(dir, 'latch'))
    const key = repoKeyOf('C:/work/latch')
    expect(await store.readLatch(key)).toBeNull()
    await store.writeLatch(key, `${TAMPERED} — 앱에 적은 다이제스트와 다르다`)
    expect(await store.readLatch(key)).toContain(TAMPERED)
    expect(await store.read(key)).toBeNull()
    await expect(store.writeLatch('../escape', 'x')).rejects.toThrow()
    // 래치 파일 경로를 알려 준다(사유 문구에 싣는다 — G2 재검수 사소)
    expect(store.latchPath?.(key)).toBe(path.join(dir, 'latch', `${key}.latch`))
    expect(fs.existsSync(store.latchPath?.(key) as string)).toBe(true)
  })

  // M09 G4 — 사람의 「확인하고 풀기」(loopDriver)만 부른다. 없는 것을 지워도 오류가 아니다.
  it('래치 지우기와 다이제스트 지우기는 그 파일만 지운다', async () => {
    const store = createFileDigestStore(path.join(dir, 'clear'))
    const key = repoKeyOf('C:/work/clear')
    await store.clearLatch(key)
    await store.remove(key)
    await store.write(key, 'c'.repeat(64))
    await store.writeLatch(key, TAMPERED)
    await store.clearLatch(key)
    expect(await store.readLatch(key)).toBeNull()
    expect(await store.read(key)).toBe('c'.repeat(64))
    await store.remove(key)
    expect(await store.read(key)).toBeNull()
    await expect(store.clearLatch('../escape')).rejects.toThrow()
  })

  it('래치 사유 문구에 래치 파일 경로가 실린다', async () => {
    const { template, hash } = loaded()
    const rig = makeRig()
    rig.ports.digest.latchPath = (key) => `C:/appdata/loop/digests/${key}.latch`
    const runner = createLoopRunner({ template, hash, ports: rig.ports, cwd: CWD, base: 'master' })
    expect((await runner.start('M1')).kind).toBe('ok')
    rig.fs.files.set(DOCS.runState, '{}')
    const out = await runner.step()
    expect(out.kind === 'needs-user' && out.reason).toContain(`C:/appdata/loop/digests/${repoKeyOf(CWD)}.latch`)
  })

  it('저장소 키는 경로 표기 차이로 갈리지 않는다', () => {
    expect(repoKeyOf('C:/work/practice/')).toBe(repoKeyOf(CWD))
    if (process.platform === 'win32') expect(repoKeyOf('c:\\Work\\Practice')).toBe(repoKeyOf(CWD))
    expect(repoKeyOf('C:/work/other')).not.toBe(repoKeyOf(CWD))
  })

  it('정규 해시는 들여쓰기·키 순서와 무관하고 값이 바뀌면 바뀐다', () => {
    expect(stateDigest(JSON.parse('{"b":1,"a":[1,2]}'))).toBe(stateDigest(JSON.parse('{\n  "a": [1, 2],\n  "b": 1\n}')))
    expect(stateDigest({ a: [1, 2], b: 2 })).not.toBe(stateDigest({ a: [1, 2], b: 1 }))
  })
})

interface Ctx { rig: Rig; runner: LoopRunner }
async function started(): Promise<Ctx> {
  const { template, hash } = loaded()
  const rig = makeRig()
  const runner = createLoopRunner({ template, hash, ports: rig.ports, cwd: CWD, base: 'master' })
  expect((await runner.start('M1')).kind).toBe('ok')
  return { rig, runner }
}
const stateText = (rig: Rig): string => rig.fs.files.get(DOCS.runState) as string
const callCounts = (rig: Rig): number[] => [rig.session.calls.length, rig.git.calls.length, rig.gh.calls.length, rig.commands.calls.length]

describe('실행기는 다이제스트가 다르면 멈춘다', () => {
  it('실행기가 쓸 때마다 다이제스트를 적는다 — 저장본과 같다', async () => {
    const { rig, runner } = await started()
    await runLoop(runner, rig, { until: 'G1/implement' })
    expect(rig.digest.digests.get(repoKeyOf(CWD))).toBe(stateDigest(JSON.parse(stateText(rig))))
  })

  it('들여쓰기만 바꾼 상태 파일은 같은 값이라 멈추지 않는다', async () => {
    const { rig, runner } = await started()
    rig.fs.files.set(DOCS.runState, JSON.stringify(JSON.parse(stateText(rig))))
    expect((await runner.load()).kind).toBe('ok')
  })

  it('밖에서 고친 상태 파일 — load·step·submit 모두 사람을 부르고 포트를 부르지 않으며 아무것도 쓰지 않는다', async () => {
    const { rig, runner } = await started()
    await runLoop(runner, rig, { until: 'G1/checks' })
    const forged = JSON.parse(stateText(rig)) as RunState
    forged.cursor = { node: 'merge', goal: 0 }
    const forgedText = `${JSON.stringify(forged, null, 2)}\n`
    rig.fs.files.set(DOCS.runState, forgedText)
    const digestBefore = rig.digest.digests.get(repoKeyOf(CWD))
    const verificationBefore = rig.fs.files.get(DOCS.verification)
    const calls = callCounts(rig)
    const load = await runner.load()
    expect(load).toMatchObject({ kind: 'needs-user' })
    expect(load.kind === 'needs-user' && load.reason).toContain(TAMPERED)
    const step = await runner.step()
    expect(step.kind).toBe('needs-user')
    expect(step.kind === 'needs-user' && step.reason).toContain(TAMPERED)
    expect((await runner.submit({ node: 'merge', judge: 'human', verdict: 'pass', evidence: '통과' })).kind).toBe('needs-user')
    expect((await runner.start('M1')).kind).not.toBe('ok')
    expect(callCounts(rig)).toEqual(calls)
    expect(stateText(rig)).toBe(forgedText)
    expect(rig.fs.files.get(DOCS.verification)).toBe(verificationBefore)
    expect(rig.digest.digests.get(repoKeyOf(CWD))).toBe(digestBefore)
  })

  // G2 검수 중요 6 — 키 없는 해시라 세션이 짝을 맞출 수 있다. 한 번 본 불일치는 래치로 남겨, 짝이 다시 맞아도 멈춘다.
  it('위조 래치 — 한 번 불일치를 보면 상태 파일을 되돌려도, 실행기를 새로 만들어도 멈춘다', async () => {
    const { rig, runner } = await started()
    await runLoop(runner, rig, { until: 'G1/checks' })
    const original = stateText(rig)
    const forged = JSON.parse(original) as RunState
    forged.cursor = { node: 'merge', goal: 0 }
    rig.fs.files.set(DOCS.runState, JSON.stringify(forged))
    expect((await runner.step()).kind).toBe('needs-user')
    rig.fs.files.set(DOCS.runState, original)
    const again = await runner.step()
    expect(again.kind === 'needs-user' && again.reason).toContain('래치')
    expect((await runner.load()).kind).toBe('needs-user')
    expect(rig.digest.latches.get(repoKeyOf(CWD))).toContain(TAMPERED)
    const { template, hash } = loaded()
    const fresh = createLoopRunner({ template, hash, ports: rig.ports, cwd: CWD, base: 'master' })
    expect((await fresh.load()).kind).toBe('needs-user')
    expect((await fresh.step()).kind).toBe('needs-user')
    expect((await fresh.start('M1')).kind).toBe('needs-user')
  })

  it('JSON으로 읽히지 않게 고쳐도 같은 멈춤이다', async () => {
    const { rig, runner } = await started()
    rig.fs.files.set(DOCS.runState, '{ 깨진')
    const r = await runner.load()
    expect(r.kind === 'needs-user' && r.reason).toContain(TAMPERED)
  })

  it('작업 노드 세션이 그 노드 동안 상태 파일을 고치면 그 step이 멈추고 고친 파일을 덮어쓰지 않는다', async () => {
    const { rig, runner } = await started()
    await runLoop(runner, rig, { until: 'G1/implement' })
    let forgedText = ''
    rig.session.onWork = async (req) => {
      if (req.node.id !== 'implement') return
      const s = JSON.parse(stateText(rig)) as RunState
      s.cursor = { node: 'goal-pr', goal: 0 }
      forgedText = `${JSON.stringify(s, null, 2)}\n`
      rig.fs.files.set(DOCS.runState, forgedText)
    }
    const out = await runner.step()
    expect(out.kind).toBe('needs-user')
    expect(stateText(rig)).toBe(forgedText)
    expect((await runner.load()).kind).toBe('needs-user')
  })

  it('다이제스트 없이 상태 파일만 있으면 멈춘다 — 다이제스트는 새로 시작할 때만 만든다', async () => {
    const { rig, runner } = await started()
    rig.digest.digests.clear()
    const r = await runner.load()
    expect(r.kind === 'needs-user' && r.reason).toContain(TAMPERED)
    expect((await runner.step()).kind).toBe('needs-user')
    expect((await runner.start('M1')).kind).not.toBe('ok')
    expect(rig.digest.digests.size).toBe(0)
  })

  it('다이제스트는 있는데 상태 파일이 없으면 멈춘다 — 파일을 지우고 새로 시작해 FAIL 계수를 리셋하는 길을 닫는다', async () => {
    const { rig, runner } = await started()
    rig.fs.files.delete(DOCS.runState)
    const r = await runner.load()
    expect(r.kind === 'needs-user' && r.reason).toContain(TAMPERED)
    const again = await runner.start('M1')
    expect(again.kind).toBe('needs-user')
    expect(rig.fs.files.has(DOCS.runState)).toBe(false)
  })
})
