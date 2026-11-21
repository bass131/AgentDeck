// gh 설치 확인 — 자격은 앱 토큰(GH_TOKEN)이 맡으므로 `gh auth`는 묻지 않는다.
import { execFile } from 'node:child_process'
import { GH_CHECK_TIMEOUT_MS, type GhCheckResult } from '@shared/16_Onboarding/onboarding'

type GhRunOutcome =
  | { kind: 'exited'; code: number; stdout: string }
  | { kind: 'missing' }
  | { kind: 'timeout' }
export type GhRun = (timeoutMs: number) => Promise<GhRunOutcome>

const VERSION_RE = /gh version (\d+\.\d+\.\d+[\w.-]*)/
// execFile의 시간 제한이 프로세스를 못 끊어도 이만큼 뒤에는 돌아온다
const RACE_SLACK_MS = 1000

const runGhVersion: GhRun = (timeoutMs) =>
  new Promise((resolve) => {
    execFile(
      'gh',
      ['--version'],
      { timeout: timeoutMs, windowsHide: true, env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' } },
      (err, stdout) => {
        if (!err) return resolve({ kind: 'exited', code: 0, stdout: String(stdout) })
        const e = err as { code?: unknown; killed?: boolean }
        if (e.code === 'ENOENT') return resolve({ kind: 'missing' })
        if (e.killed === true) return resolve({ kind: 'timeout' })
        resolve({ kind: 'exited', code: typeof e.code === 'number' ? e.code : -1, stdout: String(stdout ?? '') })
      },
    )
  })

export async function checkGh(run: GhRun = runGhVersion, timeoutMs = GH_CHECK_TIMEOUT_MS): Promise<GhCheckResult> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<GhRunOutcome>((resolve) => {
    timer = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs + RACE_SLACK_MS)
  })
  let out: GhRunOutcome
  try {
    out = await Promise.race([run(timeoutMs), late])
  } catch {
    return { state: 'absent' }
  } finally {
    clearTimeout(timer)
  }
  if (out.kind === 'timeout') return { state: 'timeout' }
  if (out.kind === 'missing' || out.code !== 0) return { state: 'absent' }
  return { state: 'present', version: VERSION_RE.exec(out.stdout)?.[1] ?? null }
}
