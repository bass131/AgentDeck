// PR 서비스 (M07 G8) — PR 카드의 값을 GitHub에서 직접 읽고, 사람이 누른 병합 버튼으로 비동기 병합 API를 부른다.
// gh 실행기는 주입받는다(단위 테스트가 400·409·검사 미통과 같은 응답을 고정한다).
//
// 근거(github/docs `src/rest/data/fpt-2022-11-28/pulls.json`, 2026-11-18 읽음):
//   PUT .../pulls/{n}/merge-async — 202 접수(pending, uuid·expected_head_sha), 200 이미 병합됨·병합 큐,
//   400 병합할 수 없는 상태(보호 규칙은 이 단계에서 보지 않는다), 409 이미 대기 중인 요청(그 uuid와 옵션을 돌려준다).
//   GET .../pulls/{n}/merge-async/{uuid} — 지금 결과(pending·merged·failed·enqueued), 24시간 뒤 404.
// `gh api -i` 실측: 첫 줄 `HTTP/2.0 404 Not Found`, 머리글 뒤 빈 줄 다음이 본문, HTTP 오류면 exit 1.
// `-i` 없이 실패하면 stdout에 오류 본문 JSON, stderr에 `gh: <message> (HTTP 404)`가 온다.
// 필수 검사 실측(이 저장소): 보호 API `checks: [{context:"hard-gates", app_id:15368}]`, check run `app.id: 15368`.
import { execFile } from 'node:child_process'
import type { PrCheckResult, PrMergeResponse, PrReadResponse, PrView } from '../../shared/ipcContract'
import { maskCredentials } from './git'

export interface GhResult {
  code: number
  stdout: string
  stderr: string
}

export type GhRunner = (args: string[], cwd: string) => Promise<GhResult>

export interface PrServiceDeps {
  gh: GhRunner
  // 작업 폴더의 `git remote get-url origin`. 없으면 null
  originUrl: (cwd: string) => Promise<string | null>
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  pollIntervalMs?: number
  pollTimeoutMs?: number
}

export interface RepoRef {
  owner: string
  repo: string
}

// ── 저장소·URL 해석 ──
export function parseGithubRepo(url: string): RepoRef | null {
  const s = url.trim()
  const m =
    /^(?:https?:\/\/(?:[^@/\s]+@)?github\.com(?::\d+)?\/|ssh:\/\/(?:[^@/\s]+@)?github\.com(?::\d+)?\/|[^@/\s]+@github\.com:)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(s)
  if (!m) return null
  return { owner: m[1], repo: m[2] }
}

export function parsePrUrl(url: string): (RepoRef & { number: number }) | null {
  const m = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/?#]|$)/i.exec(url.trim())
  if (!m) return null
  return { owner: m[1], repo: m[2], number: Number(m[3]) }
}

const sameRepo = (a: RepoRef, b: RepoRef): boolean =>
  a.owner.toLowerCase() === b.owner.toLowerCase() && a.repo.toLowerCase() === b.repo.toLowerCase()

const isPrNumber = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0
const isSha = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{40}$/i.test(s)

// ── 응답 해석 ──
interface Parsed {
  status: number | null
  body: unknown
  message: string
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function messageOf(body: unknown): string {
  const m = body && typeof body === 'object' ? (body as Record<string, unknown>)['message'] : undefined
  return typeof m === 'string' ? m : ''
}

// `-i` 없는 호출 — 성공이면 200, 실패면 stderr의 `(HTTP n)` 또는 본문의 status 칸
function parsePlain(r: GhResult): Parsed {
  const body = parseJson(r.stdout)
  if (r.code === 0) return { status: 200, body, message: '' }
  const fromErr = /\(HTTP (\d{3})\)/.exec(r.stderr)
  const fromBody = body && typeof body === 'object' ? Number((body as Record<string, unknown>)['status']) : NaN
  const status = fromErr ? Number(fromErr[1]) : Number.isFinite(fromBody) ? fromBody : null
  return { status, body, message: messageOf(body) || r.stderr.trim() }
}

// `-i` 호출 — 첫 줄의 상태 번호와 빈 줄 뒤 본문
function parseIncluded(r: GhResult): Parsed {
  const head = /^HTTP\/[\d.]+ (\d{3})/.exec(r.stdout)
  if (!head) return { status: null, body: null, message: r.stderr.trim() || 'gh 응답을 읽지 못했어요' }
  const sep = /\r?\n\r?\n/.exec(r.stdout)
  const body = sep ? parseJson(r.stdout.slice(sep.index + sep[0].length)) : null
  return { status: Number(head[1]), body, message: messageOf(body) }
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

// ── 버튼 활성 판정 ──
const CHECK_TEXT: Record<PrCheckResult, string> = { success: '성공', pending: '대기 중', failure: '실패', missing: '결과 없음' }

export function mergeEligibility(pr: PrView): { canMerge: boolean; reasons: string[]; notes: string[] } {
  const reasons: string[] = []
  const notes: string[] = []
  if (pr.merged) reasons.push('이미 병합된 PR이에요')
  else if (pr.state !== 'open') reasons.push('닫힌 PR이에요')
  if (pr.draft) reasons.push('초안 PR이에요')
  if (pr.mergeable === false) reasons.push('base와 충돌해 병합할 수 없어요')
  if (pr.requiredError) reasons.push(`필수 검사 목록을 읽지 못했어요 — ${pr.requiredError}`)
  if (pr.checksError) reasons.push(`검사 결과를 읽지 못했어요 — ${pr.checksError}`)
  for (const c of pr.checks) {
    if (c.result !== 'success') reasons.push(`필수 검사 ${c.name}: ${CHECK_TEXT[c.result]}`)
  }
  if (!pr.protected && !pr.requiredError) notes.push(`${pr.baseRef} 브랜치에 보호가 없어 필수 검사가 없어요`)
  else if (pr.protected && !pr.requiredError && pr.checks.length === 0) notes.push(`${pr.baseRef} 브랜치 보호에 필수 검사가 없어요`)
  return { canMerge: reasons.length === 0, reasons, notes }
}

// 필수 검사 하나 — appId가 null이면 어느 앱이든(그리고 commit status도) 받는다. 보호 API의 -1(아무 앱)도 null로 읽는다.
interface Required {
  name: string
  appId: number | null
}

interface Run {
  name: string
  status: string
  conclusion: string
  appId: number | null
}

// 보호 API 본문에서 필수 검사를 읽는다. 목록 모양이 이상하면 null(닫힌 실패).
// `checks`(context·app_id)를 우선하고, `contexts`에만 있는 이름은 앱 제한 없이 더한다.
function requiredOf(body: unknown): Required[] | null {
  const b = rec(body)
  const checks = b['checks']
  const contexts = b['contexts']
  if (checks !== undefined && !Array.isArray(checks)) return null
  if (contexts !== undefined && !Array.isArray(contexts)) return null
  if (checks === undefined && contexts === undefined) return null
  const out: Required[] = []
  for (const c of (checks as unknown[] | undefined) ?? []) {
    const name = str(rec(c)['context'])
    if (!name) return null
    const app = rec(c)['app_id']
    out.push({ name, appId: typeof app === 'number' && app !== -1 ? app : null })
  }
  for (const c of (contexts as unknown[] | undefined) ?? []) {
    if (typeof c !== 'string') return null
    if (!out.some((r) => r.name === c)) out.push({ name: c, appId: null })
  }
  return out
}

// 한 필수 검사의 결과 — 여럿이 맞으면 닫힌 쪽으로: 실패 > 대기 > 성공 > 없음 (독립 검수 중요 2).
// 앱이 정해진 검사는 그 앱의 check run만 보고, 같은 이름의 commit status는 보지 않는다(다른 주체가 같은 이름을 쓸 수 있다).
function checkResult(req: Required, runs: Run[], statuses: { context: string; state: string }[]): PrCheckResult {
  const seen = new Set<PrCheckResult>()
  for (const r of runs) {
    if (r.name !== req.name) continue
    if (req.appId !== null && r.appId !== req.appId) continue
    if (r.status !== 'completed') seen.add('pending')
    else seen.add(r.conclusion === 'success' ? 'success' : 'failure')
  }
  if (req.appId === null) {
    for (const s of statuses) {
      if (s.context !== req.name) continue
      seen.add(s.state === 'success' ? 'success' : s.state === 'pending' ? 'pending' : 'failure')
    }
  }
  for (const want of ['failure', 'pending', 'success'] as const) if (seen.has(want)) return want
  return 'missing'
}

// 409가 돌려준 대기 요청을 이어받아도 되는가 — 우리가 보낼 것과 같은 SHA·옵션일 때만. 다른 칸 이름을 돌려준다.
function pendingMismatch(p: Record<string, unknown>): string[] {
  const bad: string[] = []
  if (p['bypass_rules'] === true) bad.push('bypass_rules')
  if (p['merge_method'] !== undefined && p['merge_method'] !== 'merge') bad.push('merge_method')
  if (p['merge_action'] !== undefined && p['merge_action'] !== 'direct_merge') bad.push('merge_action')
  return bad
}

const UNKNOWN: PrMergeResponse = { status: 'unknown', message: '결과 모름 — 다시 읽기로 확인하세요' }

// ── 서비스 ──
export function createPrService(deps: PrServiceDeps) {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const now = deps.now ?? (() => Date.now())
  const interval = deps.pollIntervalMs ?? 2000
  const cap = deps.pollTimeoutMs ?? 90_000
  // main이 마지막으로 읽어 돌려준 머리 SHA·base와 그때의 판정 — (저장소, 번호)마다
  const shown = new Map<string, { sha: string; baseRef: string; canMerge: boolean }>()
  // 세대 — 병합이 SHA를 쓰면 올린다. 그 전에 시작한 읽기가 늦게 끝나도 SHA를 다시 무장하지 않는다.
  const generation = new Map<string, number>()
  const keyOf = (r: RepoRef, n: number): string => `${r.owner}/${r.repo}#${n}`.toLowerCase()

  async function originRepo(cwd: string): Promise<RepoRef | null> {
    const url = await deps.originUrl(cwd).catch(() => null)
    return url ? parseGithubRepo(url) : null
  }

  async function api(cwd: string, path: string): Promise<Parsed> {
    return parsePlain(await deps.gh(['api', path], cwd))
  }

  async function readPr(cwd: string, req: { number?: number; url?: string }): Promise<PrReadResponse> {
    const repo = await originRepo(cwd)
    if (!repo) return { ok: false, error: '작업 폴더의 origin이 GitHub 저장소가 아니에요' }
    let number = req.number
    if (typeof req.url === 'string') {
      const u = parsePrUrl(req.url)
      if (!u) return { ok: false, error: 'GitHub PR 주소가 아니에요' }
      if (!sameRepo(u, repo)) return { ok: false, error: '다른 저장소 PR — 불러오지 않음', otherRepo: true }
      number = u.number
    }
    if (!isPrNumber(number)) return { ok: false, error: 'PR 번호는 양의 정수여야 해요' }
    const key = keyOf(repo, number)
    const gen = generation.get(key) ?? 0
    const base = `repos/${repo.owner}/${repo.repo}`

    const prRes = await api(cwd, `${base}/pulls/${number}`)
    if (prRes.status !== 200) {
      return { ok: false, error: `PR #${number}을 읽지 못했어요 (HTTP ${prRes.status ?? '?'}) ${maskCredentials(prRes.message)}`.trim() }
    }
    const p = rec(prRes.body)
    const head = rec(p['head'])
    const headSha = str(head['sha'])
    if (!isSha(headSha)) return { ok: false, error: 'PR의 머리 SHA를 읽지 못했어요' }
    const baseRef = str(rec(p['base'])['ref'])
    const view: PrView = {
      owner: repo.owner,
      repo: repo.repo,
      number,
      title: str(p['title']),
      url: str(p['html_url']),
      state: p['state'] === 'open' ? 'open' : 'closed',
      draft: p['draft'] === true,
      merged: p['merged'] === true,
      mergeable: typeof p['mergeable'] === 'boolean' ? p['mergeable'] : null,
      baseRef,
      headRef: str(head['ref']),
      headSha,
      protected: true,
      checks: [],
      canMerge: false,
      reasons: [],
      notes: [],
    }

    // 필수 검사 — 「Branch not protected」 404만 보호 없음, 「Required status checks not enabled」 404는 보호는 있되
    // 필수 검사 없음으로 읽는다. 나머지 실패(권한 없는 토큰의 `Not Found` 포함)와 이상한 목록 모양은 닫힌 실패다.
    const prot = await api(cwd, `${base}/branches/${encodeURIComponent(baseRef)}/protection/required_status_checks`)
    let required: Required[] = []
    if (prot.status === 200) {
      const r = requiredOf(prot.body)
      if (r) required = r
      else view.requiredError = '보호 설정의 필수 검사 목록 모양을 읽지 못했어요'
    } else if (prot.status === 404 && /branch not protected/i.test(prot.message)) {
      view.protected = false
    } else if (prot.status === 404 && /required status checks not enabled/i.test(prot.message)) {
      required = []
    } else {
      view.requiredError = `보호 설정 읽기 실패 (HTTP ${prot.status ?? '?'}) ${maskCredentials(prot.message)}`.trim()
    }

    if (required.length > 0) {
      const [runsRes, statusRes] = await Promise.all([
        api(cwd, `${base}/commits/${headSha}/check-runs?per_page=100`),
        api(cwd, `${base}/commits/${headSha}/status`),
      ])
      if (runsRes.status !== 200 || statusRes.status !== 200) {
        const bad = runsRes.status !== 200 ? runsRes : statusRes
        view.checksError = `HTTP ${bad.status ?? '?'} ${maskCredentials(bad.message)}`.trim()
      }
      const runsRaw = rec(runsRes.body)['check_runs']
      const runs: Run[] = (Array.isArray(runsRaw) ? runsRaw : []).map((r) => {
        const app = rec(rec(r)['app'])['id']
        return {
          name: str(rec(r)['name']),
          status: str(rec(r)['status']),
          conclusion: str(rec(r)['conclusion']),
          appId: typeof app === 'number' ? app : null,
        }
      })
      const stRaw = rec(statusRes.body)['statuses']
      const statuses = (Array.isArray(stRaw) ? stRaw : []).map((s) => ({ context: str(rec(s)['context']), state: str(rec(s)['state']) }))
      view.checks = required.map((req) => ({ name: req.name, result: checkResult(req, runs, statuses) }))
    }

    const e = mergeEligibility(view)
    view.canMerge = e.canMerge
    view.reasons = e.reasons
    view.notes = e.notes
    if ((generation.get(key) ?? 0) === gen) shown.set(key, { sha: headSha, baseRef, canMerge: e.canMerge })
    return { ok: true, pr: view }
  }

  // 대기 중인 병합 요청의 결과를 상한까지 조회한다
  async function poll(cwd: string, path: string): Promise<PrMergeResponse> {
    const deadline = now() + cap
    while (now() < deadline) {
      await sleep(interval)
      const r = parseIncluded(await deps.gh(['api', '-i', path], cwd))
      if (r.status === 404) return { status: 'failed', message: '병합 결과를 찾지 못했어요(만료됐을 수 있어요) — 다시 읽기로 확인하세요' }
      if (r.status !== 200) continue
      const out = finalOf(rec(r.body))
      if (out) return out
    }
    return { status: 'timeout', message: '결과 대기 시간 초과 — 다시 읽기로 확인하세요' }
  }

  // 병합 결과 본문의 최종 상태. pending이면 null(계속 기다린다)
  function finalOf(b: Record<string, unknown>): PrMergeResponse | null {
    const d = rec(b['details'])
    switch (b['status']) {
      case 'merged':
        return { status: 'merged', message: str(d['message']) || '병합했어요', mergeSha: str(d['sha']) || undefined }
      case 'enqueued':
        return { status: 'enqueued', message: str(d['message']) || '병합 큐에 들어감' }
      case 'failed':
        return { status: 'failed', message: str(d['message']) || '병합에 실패했어요' }
      default:
        return null
    }
  }

  async function mergePr(cwd: string, number: number, sha: string): Promise<PrMergeResponse> {
    if (!isPrNumber(number) || !isSha(sha)) return { status: 'refused', message: 'PR 번호나 머리 SHA 꼴이 올바르지 않아요' }
    const repo = await originRepo(cwd)
    if (!repo) return { status: 'refused', message: '작업 폴더의 origin이 GitHub 저장소가 아니에요' }
    const key = keyOf(repo, number)
    const last = shown.get(key)
    if (!last || last.sha.toLowerCase() !== sha.toLowerCase()) {
      return { status: 'refused', message: '화면의 머리 SHA가 마지막으로 읽은 값과 달라요 — 다시 읽은 뒤 병합하세요' }
    }
    if (!last.canMerge) return { status: 'refused', message: '마지막으로 읽은 PR이 병합 조건을 채우지 못했어요 — 다시 읽기로 확인하세요' }
    // 한 번 쓴 SHA는 다시 쓰지 않는다 — 다음 병합은 이 뒤에 시작한 읽기로만 열린다
    shown.delete(key)
    generation.set(key, (generation.get(key) ?? 0) + 1)

    // 보내기 직전에 PR을 한 번 더 읽는다 — 머리 SHA·base·열림·미병합이 화면과 같을 때만 보낸다
    const base = `repos/${repo.owner}/${repo.repo}`
    const now0 = await api(cwd, `${base}/pulls/${number}`)
    if (now0.status !== 200) {
      return { status: 'refused', message: `병합 직전에 PR을 다시 읽지 못했어요 (HTTP ${now0.status ?? '?'}) — 다시 읽어 주세요` }
    }
    const p = rec(now0.body)
    if (
      str(rec(p['head'])['sha']).toLowerCase() !== sha.toLowerCase() ||
      str(rec(p['base'])['ref']) !== last.baseRef ||
      p['state'] !== 'open' ||
      p['merged'] === true
    ) {
      return { status: 'refused', message: 'PR이 바뀌었어요 — 다시 읽어 주세요' }
    }

    const path = `${base}/pulls/${number}/merge-async`
    const r = parseIncluded(
      await deps.gh(
        ['api', '-i', '-X', 'PUT', path, '-f', `sha=${sha}`, '-f', 'merge_method=merge', '-f', 'merge_action=direct_merge', '-F', 'bypass_rules=false'],
        cwd
      )
    )
    // 보낸 뒤 HTTP 상태 없이 끝났다(시간 초과·네트워크) — 서버가 받았는지 알 수 없다
    if (r.status === null) return UNKNOWN
    const b = rec(r.body)
    const d = rec(b['details'])
    const detail = r.message ? ` — ${maskCredentials(r.message)}` : ''
    switch (r.status) {
      case 202: {
        if (str(d['expected_head_sha']).toLowerCase() !== sha.toLowerCase() || !str(d['uuid'])) {
          return { status: 'failed', message: '서버가 받은 머리 SHA가 보낸 값과 달라요 — 다시 읽기로 확인하세요' }
        }
        return poll(cwd, `${path}/${str(d['uuid'])}`)
      }
      case 200:
        return finalOf(b) ?? { status: 'failed', message: '병합 응답을 읽지 못했어요' }
      case 409: {
        const pending = Object.keys(d).length > 0 ? d : b
        if (str(pending['expected_head_sha']).toLowerCase() !== sha.toLowerCase() || !str(pending['uuid'])) {
          return { status: 'refused', message: `이미 다른 머리 SHA로 대기 중인 병합 요청이 있어요${detail}` }
        }
        const bad = pendingMismatch(pending)
        if (bad.length > 0) {
          return { status: 'refused', message: `이미 대기 중인 병합 요청의 옵션이 달라요(${bad.join(', ')}) — GitHub에서 확인하세요` }
        }
        return poll(cwd, `${path}/${str(pending['uuid'])}`)
      }
      case 400:
        return { status: 'refused', message: `PR이 병합할 수 없는 상태예요(닫힘 등)${detail}` }
      case 403:
        return { status: 'refused', message: `병합 권한이 없어요${detail}` }
      case 404:
        return { status: 'refused', message: `PR을 찾지 못했어요${detail}` }
      case 422:
        return { status: 'refused', message: `요청이 검증에 실패했어요${detail}` }
      default:
        return { status: 'failed', message: `병합 요청 실패 (HTTP ${r.status})${detail}` }
    }
  }

  return { readPr, mergePr }
}

// ── 실행 배선 ──
function run(cmd: string, args: string[], cwd: string, timeout: number): Promise<GhResult> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { cwd, timeout, maxBuffer: 16 * 1024 * 1024, windowsHide: true, env: { ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' } },
      (err, stdout, stderr) => {
        const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : -1) : 0
        resolve({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') || (err ? err.message : '') })
      }
    )
  })
}

export const ghRunner: GhRunner = (args, cwd) => run('gh', args, cwd, 60_000)

export async function gitOriginUrl(cwd: string): Promise<string | null> {
  const r = await run('git', ['remote', 'get-url', 'origin'], cwd, 10_000)
  return r.code === 0 ? r.stdout.trim() || null : null
}

let service: ReturnType<typeof createPrService> | null = null
// 앱 하나에 서비스 하나 — 「마지막으로 읽어 보인 SHA」 기억을 IPC 호출 사이에 나눈다.
export function prService(): ReturnType<typeof createPrService> {
  service ??= createPrService({ gh: ghRunner, originUrl: gitOriginUrl })
  return service
}
