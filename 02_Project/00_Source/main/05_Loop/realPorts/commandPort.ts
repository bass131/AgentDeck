// 템플릿이 적은 검사 명령을 셸로 돌린다.
// 환경은 부르는 쪽이 주는 자격 없는 환경(childEnv)이다 — 검사 명령이 원격을 만지지 못하게(ports.ts 계약).
// 시간 제한을 넘으면 0이 아닌 code와 「시간 제한」 사유가 stderr 끝줄로 온다(실행기는 그 끝줄을 FAIL 증거로 쓴다).
import type { CommandPort } from '../ports'
import { runProcess } from './exec'

interface CommandPortOptions {
  env: NodeJS.ProcessEnv
  timeoutMs: number
}

export function createCommandPort(opts: CommandPortOptions): CommandPort {
  return {
    async run(cmd, cwd) {
      const r = await runProcess(cmd, [], { cwd, env: opts.env, timeoutMs: opts.timeoutMs, shell: true })
      return { code: r.code, stdout: r.stdout, stderr: r.stderr }
    },
  }
}
