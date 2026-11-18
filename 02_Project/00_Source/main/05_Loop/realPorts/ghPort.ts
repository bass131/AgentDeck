// M09 G2 — 실물 gh 포트의 실행 층. gh CLI를 작업 저장소 cwd에서 부르고, 해석은 ghParse.ts의 순수 함수가 한다.
// 실행기 자신의 gh라 일반 환경(자격 있음)으로 돈다. 질의·업데이트 알림은 끈다.
// getPr는 「그런 PR이 없다」만 null이고, 네트워크·권한 오류는 던진다(실행기는 CI 읽기 오류를 기다림으로 센다).
import type { CommandResult, GhPort } from '../ports'
import { runProcess } from './exec'
import { parseCiStatus, parsePr, pickLatestPr, prNumberFromUrl } from './ghParse'

export type GhExec = (args: string[], input?: string) => Promise<CommandResult>

export interface GhExecOptions { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }

export function createGhExec(opts: GhExecOptions): GhExec {
  const env = { ...(opts.env ?? process.env), GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', NO_COLOR: '1' }
  return async (args, input) => {
    const r = await runProcess('gh', args, { cwd: opts.cwd, env, input, timeoutMs: opts.timeoutMs ?? 60_000 })
    return { code: r.code, stdout: r.stdout, stderr: r.stderr }
  }
}

export interface GhPortOptions {
  // 이 이름의 검사만 CI 판정에 쓴다(예: hard-gates). 비우면 머리의 검사 전부.
  requiredChecks?: string[]
}

const PR_FIELDS = 'number,state,headRefOid,mergeCommit'
const NOT_FOUND = /Could not resolve to a PullRequest|no pull requests? found/i

function fail(what: string, r: CommandResult): Error {
  const msg = (r.stderr.trim() || r.stdout.trim() || `exit ${r.code}`).split(/\r?\n/).slice(-2).join(' ')
  return new Error(`gh ${what} 실패 — ${msg}`)
}

function json(what: string, text: string): unknown {
  try { return JSON.parse(text) } catch { throw new Error(`gh ${what}의 출력을 JSON으로 읽지 못했다`) }
}

export function createGhPort(exec: GhExec, opts: GhPortOptions = {}): GhPort {
  async function getPr(number: number) {
    const r = await exec(['pr', 'view', String(number), '--json', PR_FIELDS])
    if (r.code !== 0) {
      if (NOT_FOUND.test(r.stderr)) return null
      throw fail('pr view', r)
    }
    return parsePr(json('pr view', r.stdout))
  }
  return {
    async findPr(head, base) {
      const r = await exec(['pr', 'list', '--head', head, '--base', base, '--state', 'all', '--limit', '100', '--json', `${PR_FIELDS},createdAt`])
      if (r.code !== 0) throw fail('pr list', r)
      return pickLatestPr(json('pr list', r.stdout))
    },
    getPr,
    async createPr(req) {
      const r = await exec(['pr', 'create', '--head', req.head, '--base', req.base, '--title', req.title, '--body-file', '-'], req.body)
      if (r.code !== 0) throw fail('pr create', r)
      const number = prNumberFromUrl(r.stdout)
      if (number === null) throw new Error('gh pr create의 출력에서 PR 번호를 읽지 못했다')
      const pr = await getPr(number)
      if (!pr) throw new Error(`만든 PR ${number}을 다시 읽지 못했다`)
      return pr
    },
    async ciStatus(number) {
      const r = await exec(['pr', 'view', String(number), '--json', 'headRefOid,statusCheckRollup'])
      if (r.code !== 0) throw fail('pr view', r)
      return parseCiStatus(json('pr view', r.stdout), opts.requiredChecks)
    },
  }
}
