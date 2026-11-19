// M09 G2 — 자식 프로세스 한 번 돌리기. 실물 포트(명령·git·gh)가 같이 쓴다. Node 내장 spawn만 쓴다.
// 던지지 않는다 — 실행 파일이 없거나(ENOENT) 시간 제한을 넘어도 0이 아닌 code로 돌려준다(부르는 쪽이 판정한다).
// 시간 제한을 넘으면 프로세스 트리째 죽이고(Windows는 taskkill /T /F, 그 밖은 프로세스 그룹) 그 자리에서 끝낸다 —
// 셸만 죽이면 손자 프로세스가 파이프를 붙들어 close가 오지 않는다.
// 표준 입력은 input을 쓰고 바로 닫는다(입력을 기다리는 명령이 매달리지 않게).
import { spawn } from 'node:child_process'

export interface ProcessResult { code: number; stdout: string; stderr: string; timedOut: boolean }
export interface RunProcessOptions {
  cwd: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  input?: string
  shell?: boolean
}

export const TIMEOUT_EXIT = 124
const MAX_OUTPUT = 16 * 1024 * 1024
const IS_WINDOWS = process.platform === 'win32'

function killTree(pid: number | undefined): void {
  if (pid === undefined) return
  try {
    if (IS_WINDOWS) {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => undefined)
    } else {
      process.kill(-pid, 'SIGKILL')
    }
  } catch {
    // 이미 끝났다
  }
}

export function runProcess(file: string, args: readonly string[], opts: RunProcessOptions): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let timer: NodeJS.Timeout | undefined
    const finish = (r: Omit<ProcessResult, 'stdout' | 'stderr'> & { extra?: string }): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      const err = r.extra ? `${stderr}${stderr && !stderr.endsWith('\n') ? '\n' : ''}${r.extra}` : stderr
      resolve({ code: r.code, timedOut: r.timedOut, stdout, stderr: err })
    }
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(file, [...args], {
        cwd: opts.cwd,
        env: opts.env ?? process.env,
        shell: opts.shell ?? false,
        windowsHide: true,
        detached: !IS_WINDOWS,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (e) {
      finish({ code: -1, timedOut: false, extra: `실행하지 못했다 — ${(e as Error).message}` })
      return
    }
    child.stdout?.setEncoding('utf8').on('data', (d: string) => { if (stdout.length < MAX_OUTPUT) stdout += d })
    child.stderr?.setEncoding('utf8').on('data', (d: string) => { if (stderr.length < MAX_OUTPUT) stderr += d })
    child.on('error', (e) => finish({ code: -1, timedOut: false, extra: `실행하지 못했다 — ${e.message}` }))
    child.on('close', (code, signal) => finish({ code: code ?? (signal ? 128 : 1), timedOut: false }))
    child.stdin?.on('error', () => undefined)
    child.stdin?.end(opts.input ?? '')
    if (opts.timeoutMs !== undefined && opts.timeoutMs > 0) {
      timer = setTimeout(() => {
        killTree(child.pid)
        finish({ code: TIMEOUT_EXIT, timedOut: true, extra: `시간 제한 ${opts.timeoutMs}ms를 넘어 프로세스 트리를 멈췄다` })
      }, opts.timeoutMs)
    }
  })
}
