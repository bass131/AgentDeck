// M09 G2 실물 명령 포트 — 셸로 템플릿 명령을 돌리고, 주입한 환경·cwd·시간 제한을 지킨다.
// 시간 제한을 넘으면 셸만이 아니라 손자 프로세스까지 트리째 죽이고 스스로 끝난다(Windows에서 셸만 죽이면 자식 node가 남는다).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createCommandPort } from '@main/05_Loop/realPorts/commandPort'
import { runProcess } from '@main/05_Loop/realPorts/exec'

const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-g2-cmd-')))
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }) })

const alive = (pid: number): boolean => {
  try { process.kill(pid, 0); return true } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM' }
}

describe('실물 명령 포트', () => {
  it('주입한 cwd와 환경으로 돌고 종료 코드·출력을 돌려준다', async () => {
    const port = createCommandPort({ env: { ...process.env, LOOP_PROBE: 'probe-value' }, timeoutMs: 30_000 })
    const r = await port.run('node -e "process.stdout.write(process.cwd() + \'|\' + process.env.LOOP_PROBE)"', dir)
    expect(r.code).toBe(0)
    expect(r.stdout.split('|')).toEqual([dir, 'probe-value'])
    const fail = await port.run('node -e "console.error(\'boom\'); process.exit(3)"', dir)
    expect(fail.code).toBe(3)
    expect(fail.stderr).toContain('boom')
  })

  it('표준 입력을 닫아 입력을 기다리는 명령이 매달리지 않는다', async () => {
    const port = createCommandPort({ env: process.env, timeoutMs: 20_000 })
    const r = await port.run('node -e "process.stdin.resume(); process.stdin.on(\'end\', () => process.exit(0))"', dir)
    expect(r.code).toBe(0)
  })

  it('시간 제한을 넘으면 손자 프로세스까지 죽이고 실패로 끝난다', async () => {
    const port = createCommandPort({ env: process.env, timeoutMs: 1_500 })
    const started = Date.now()
    const r = await port.run('node -e "console.log(process.pid); setInterval(() => {}, 1000)"', dir)
    expect(Date.now() - started).toBeLessThan(15_000)
    expect(r.code).not.toBe(0)
    expect(r.stderr).toContain('시간 제한')
    const pid = Number(r.stdout.trim().split(/\s+/)[0])
    expect(Number.isInteger(pid) && pid > 0).toBe(true)
    let gone = false
    for (let i = 0; i < 50 && !gone; i++) {
      gone = !alive(pid)
      if (!gone) await new Promise((res) => setTimeout(res, 100))
    }
    expect(gone).toBe(true)
  })

  it('없는 실행 파일은 던지지 않고 실패 결과로 돌려준다', async () => {
    const r = await runProcess('agentdeck-no-such-binary', [], { cwd: dir })
    expect(r.code).not.toBe(0)
    expect(r.stderr.length).toBeGreaterThan(0)
  })
})
