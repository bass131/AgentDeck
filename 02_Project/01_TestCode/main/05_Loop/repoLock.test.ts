// M09 G2 저장소당 실행기 하나 — 앱 영역의 잠금 파일. 같은 저장소에 두 번째 실행기를 만들면 거부한다.
// 죽은 잠금: 잠금 파일의 pid가 죽은 프로세스면 넘겨받는다. 살아 있는 다른 프로세스면 거부하고 pid와 파일 경로를 알린다.
// 읽히지 않는 잠금 파일은 막 쓰는 중일 수 있어 잠시(5초) 거부하고, 그보다 오래됐으면 넘겨받는다.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { acquireRepoLock } from '@main/05_Loop/repoLock'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-g2-lock-'))
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }) })
let n = 0
const key = (): string => (++n).toString(16).padStart(64, '0')
const lockFile = (k: string): string => path.join(dir, `${k}.lock`)

function child(): Promise<{ pid: number; stop: () => Promise<void> }> {
  const p = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true })
  return new Promise((resolve) => p.once('spawn', () => resolve({
    pid: p.pid as number,
    stop: () => new Promise<void>((res) => { p.once('exit', () => res()); p.kill() }),
  })))
}

describe('저장소 잠금', () => {
  it('같은 저장소의 두 번째 잠금을 거부하고, 풀면 다시 잡힌다', async () => {
    const k = key()
    const first = await acquireRepoLock(dir, k, { cwd: 'C:/work/a' })
    expect(first.ok).toBe(true)
    const second = await acquireRepoLock(dir, k, { cwd: 'C:/work/a' })
    expect(second.ok).toBe(false)
    expect(!second.ok && second.reason).toContain('이미')
    expect((await acquireRepoLock(dir, key(), { cwd: 'C:/work/b' })).ok).toBe(true)
    if (first.ok) await first.lock.release()
    expect(fs.existsSync(lockFile(k))).toBe(false)
    const third = await acquireRepoLock(dir, k, { cwd: 'C:/work/a' })
    expect(third.ok).toBe(true)
    if (third.ok) await third.lock.release()
  })

  it('살아 있는 다른 프로세스의 잠금은 거부하고 pid와 파일을 알린다', async () => {
    const k = key()
    const other = await child()
    fs.writeFileSync(lockFile(k), JSON.stringify({ pid: other.pid, token: 'other', cwd: 'C:/work/c', at: new Date().toISOString() }))
    const r = await acquireRepoLock(dir, k, { cwd: 'C:/work/c' })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toContain(String(other.pid))
    expect(!r.ok && r.reason).toContain(lockFile(k))
    await other.stop()
  })

  it('죽은 프로세스의 잠금은 넘겨받는다', async () => {
    const k = key()
    const dead = await child()
    await dead.stop()
    fs.writeFileSync(lockFile(k), JSON.stringify({ pid: dead.pid, token: 'dead', cwd: 'C:/work/d', at: new Date().toISOString() }))
    const r = await acquireRepoLock(dir, k, { cwd: 'C:/work/d' })
    expect(r.ok).toBe(true)
    expect(JSON.parse(fs.readFileSync(lockFile(k), 'utf8')).pid).toBe(process.pid)
    if (r.ok) await r.lock.release()
  })

  it('이 프로세스 pid가 적혔지만 이 프로세스가 잡지 않은 잠금(앞 실행의 찌꺼기)은 넘겨받는다', async () => {
    const k = key()
    fs.writeFileSync(lockFile(k), JSON.stringify({ pid: process.pid, token: 'leftover', cwd: 'C:/work/e', at: new Date().toISOString() }))
    const r = await acquireRepoLock(dir, k, { cwd: 'C:/work/e' })
    expect(r.ok).toBe(true)
    if (r.ok) await r.lock.release()
  })

  it('읽히지 않는 잠금 파일은 막 쓰는 중일 수 있어 거부하고, 오래됐으면 넘겨받는다', async () => {
    const k = key()
    fs.writeFileSync(lockFile(k), '')
    expect((await acquireRepoLock(dir, k, { cwd: 'C:/work/f' })).ok).toBe(false)
    const old = new Date(Date.now() - 60_000)
    fs.utimesSync(lockFile(k), old, old)
    const r = await acquireRepoLock(dir, k, { cwd: 'C:/work/f' })
    expect(r.ok).toBe(true)
    if (r.ok) await r.lock.release()
  })

  it('release는 자기 잠금만 지운다 — 남이 넘겨받은 파일은 그대로 둔다', async () => {
    const k = key()
    const r = await acquireRepoLock(dir, k, { cwd: 'C:/work/g' })
    expect(r.ok).toBe(true)
    const foreign = JSON.stringify({ pid: process.pid + 1, token: 'foreign', cwd: 'C:/work/g', at: new Date().toISOString() })
    fs.writeFileSync(lockFile(k), foreign)
    if (r.ok) await r.lock.release()
    expect(fs.readFileSync(lockFile(k), 'utf8')).toBe(foreign)
  })
})
