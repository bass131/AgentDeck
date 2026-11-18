// M09 G2 — 실물 gh 포트의 실행 층. gh CLI를 작업 저장소 cwd에서 부르고, 해석은 ghParse.ts의 순수 함수가 한다.
// 실행기 자신의 gh라 일반 환경(자격 있음)으로 돈다. 질의·업데이트 알림은 끈다.
// getPr는 「그런 PR이 없다」만 null이고, 네트워크·권한 오류는 던진다(실행기는 CI 읽기 오류를 기다림으로 센다).
// G2 재검수 중요 B — gh는 작업 저장소의 git 설정(remote.<이름>.gh-resolved)으로 기본 저장소를 고른다(실측: 그 키에
// octocat/Hello-World를 넣으면 gh pr list가 그 저장소를 읽었다). 그래서 모든 호출에 열 때 정한 -R HOST/OWNER/REPO를 하위 명령
// 바로 뒤에 넣는다(`gh pr view -R h/o/r 1`). gh-resolved 키 자체도 설정 대조가 본다(configGuard).
// 실측(gh 2.96.0, 2026-11-19): AgentDeck 작업 폴더에서 `gh pr list -R github.com/octocat/Hello-World`가 그 저장소를 읽고,
// `gh pr view -R github.com/<소유자>/AgentDeck 93`이 그 PR을 읽었다. pr create -R은 PR을 실제로 만들어야 재므로 실측하지 않았다.
import type { CommandResult, GhPort } from '../ports'
import { runProcess } from './exec'
import { parseCiStatus, parsePr, pickLatestPr, prNumberFromUrl, REPO_SLUG } from './ghParse'

export type GhExec = (args: string[], input?: string) => Promise<CommandResult>

export interface GhExecOptions {
  cwd: string
  // 모든 호출에 -R로 고정하는 저장소(HOST/OWNER/REPO, ghParse.repoSlugOf). 꼴이 아니면 만들지 않는다.
  repo: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  // 호출 직전의 git 설정 대조(configGuard.ts) — gh는 작업 저장소에서 git을 부를 수 있다. 던지면 gh를 부르지 않는다.
  // gh 자신이 git 설정을 쓰는지는 실측하지 않았다 — 쓰면 대조가 멈춘다(안전 쪽).
  guard?: { assert(): Promise<void> }
  // 프로세스 실행(시험이 gh 인자를 본다). 기본은 runProcess.
  run?: typeof runProcess
}

export function createGhExec(opts: GhExecOptions): GhExec {
  if (!REPO_SLUG.test(opts.repo)) throw new Error(`gh 저장소 ${JSON.stringify(opts.repo)}가 HOST/OWNER/REPO 꼴이 아니다`)
  const env = { ...(opts.env ?? process.env), GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', NO_COLOR: '1', GIT_NO_REPLACE_OBJECTS: '1' }
  const run = opts.run ?? runProcess
  return async (args, input) => {
    await opts.guard?.assert()
    // 하위 명령(`pr view`) 바로 뒤 — 실행기가 부르는 gh는 모두 두 낱말 하위 명령이다
    const pinned = [...args.slice(0, 2), '-R', opts.repo, ...args.slice(2)]
    const r = await run('gh', pinned, { cwd: opts.cwd, env, input, timeoutMs: opts.timeoutMs ?? 60_000 })
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
