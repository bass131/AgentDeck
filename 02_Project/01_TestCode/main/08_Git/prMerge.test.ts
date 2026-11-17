// M07 G8 PR 서비스 — 주입한 gh 실행기로 PR 읽기, 버튼 활성 판정, 비동기 병합 API 호출과 응답 해석을 고정한다.
// 실제 병합 API는 부르지 않는다(goal 「하지 않을 것」). 응답 모양은 github/docs pulls.json(merge-async)과
// `gh api -i` 실측(첫 줄 `HTTP/2.0 404 Not Found`, 빈 줄 뒤 본문, 실패면 exit 1)을 따른다.
import { describe, it, expect } from 'vitest'
import {
  createPrService,
  mergeEligibility,
  parseGithubRepo,
  parsePrUrl,
  type GhResult,
} from '@main/08_Git/prMerge'
import type { PrView } from '@shared/ipcContract'

const SHA = 'f4e0ff3812cde4caf1585a73ac77d3f9836bc2dd'
const OTHER = '0123456789abcdef0123456789abcdef01234567'
const CWD = 'C:\\Dev\\AgentDeck'

const ok = (body: unknown): GhResult => ({ code: 0, stdout: JSON.stringify(body), stderr: '' })
const http = (status: number, body: unknown): GhResult => ({
  code: status >= 200 && status < 300 ? 0 : 1,
  stdout: `HTTP/2.0 ${status} X\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(body)}`,
  stderr: status >= 300 ? `gh: ${String((body as { message?: string }).message ?? 'err')} (HTTP ${status})` : '',
})
const fail = (status: number, message: string): GhResult => ({
  code: 1,
  stdout: JSON.stringify({ message, status: String(status) }),
  stderr: `gh: ${message} (HTTP ${status})`,
})

interface Fake {
  calls: string[][]
  routes: [RegExp, GhResult | GhResult[]][]
}

function fakeGh(f: Fake) {
  return async (args: string[]): Promise<GhResult> => {
    f.calls.push(args)
    const joined = args.join(' ')
    for (const [re, res] of f.routes) {
      if (re.test(joined)) return Array.isArray(res) ? (res.length > 1 ? res.shift()! : res[0]) : res
    }
    throw new Error('예상 밖 gh 호출: ' + joined)
  }
}

const prBody = (over: Record<string, unknown> = {}) => ({
  number: 12,
  title: 'G8 병합 버튼',
  html_url: 'https://github.com/bass131/AgentDeck/pull/12',
  state: 'open',
  draft: false,
  merged: false,
  mergeable: true,
  base: { ref: 'master' },
  head: { ref: 'feat/x', sha: SHA },
  ...over,
})

function setup(opts: {
  pr?: Record<string, unknown>
  protection?: GhResult
  runs?: { name: string; status: string; conclusion: string | null }[]
  statuses?: { context: string; state: string }[]
  extra?: [RegExp, GhResult | GhResult[]][]
  origin?: string | null
  pollTimeoutMs?: number
}) {
  const f: Fake = {
    calls: [],
    routes: [
      ...(opts.extra ?? []),
      [/^api repos\/bass131\/AgentDeck\/pulls\/12$/, ok(prBody(opts.pr))],
      [/protection\/required_status_checks$/, opts.protection ?? ok({ contexts: ['hard-gates'] })],
      [/check-runs/, ok({ total_count: 1, check_runs: opts.runs ?? [{ name: 'hard-gates', status: 'completed', conclusion: 'success' }] })],
      [/\/status$/, ok({ state: 'pending', statuses: opts.statuses ?? [] })],
    ],
  }
  let clock = 0
  const sleeps: number[] = []
  const svc = createPrService({
    gh: fakeGh(f),
    originUrl: async () => (opts.origin === undefined ? 'https://github.com/bass131/AgentDeck.git' : opts.origin),
    sleep: async (ms) => { sleeps.push(ms); clock += ms },
    now: () => clock,
    pollIntervalMs: 2000,
    pollTimeoutMs: opts.pollTimeoutMs ?? 90_000,
  })
  return { f, svc, sleeps }
}

describe('origin과 PR URL 해석', () => {
  it('https·ssh·자격 증명이 낀 origin에서 owner/repo를 읽는다', () => {
    expect(parseGithubRepo('https://github.com/bass131/AgentDeck.git')).toEqual({ owner: 'bass131', repo: 'AgentDeck' })
    expect(parseGithubRepo('https://github.com/bass131/AgentDeck')).toEqual({ owner: 'bass131', repo: 'AgentDeck' })
    expect(parseGithubRepo('https://x:tok@github.com/bass131/AgentDeck.git')).toEqual({ owner: 'bass131', repo: 'AgentDeck' })
    expect(parseGithubRepo('git@github.com:bass131/AgentDeck.git')).toEqual({ owner: 'bass131', repo: 'AgentDeck' })
    expect(parseGithubRepo('ssh://git@github.com/bass131/AgentDeck.git')).toEqual({ owner: 'bass131', repo: 'AgentDeck' })
    expect(parseGithubRepo('https://gitlab.com/bass131/AgentDeck.git')).toBeNull()
    expect(parseGithubRepo('https://github.com.evil.io/bass131/AgentDeck.git')).toBeNull()
  })

  it('PR URL에서 저장소와 번호를 읽는다', () => {
    expect(parsePrUrl('https://github.com/bass131/AgentDeck/pull/74')).toEqual({ owner: 'bass131', repo: 'AgentDeck', number: 74 })
    expect(parsePrUrl('https://github.com/bass131/AgentDeck/issues/74')).toBeNull()
  })
})

describe('PR 읽기', () => {
  it('main이 GitHub에서 읽은 값으로 카드 값을 만든다', async () => {
    const { svc, f } = setup({})
    const r = await svc.readPr(CWD, { number: 12 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.pr).toMatchObject({ number: 12, title: 'G8 병합 버튼', baseRef: 'master', headRef: 'feat/x', headSha: SHA, protected: true, canMerge: true })
    expect(r.pr.checks).toEqual([{ name: 'hard-gates', result: 'success' }])
    // 검사 결과는 보인 머리 SHA로 읽는다
    expect(f.calls.some((a) => a.join(' ').includes(`commits/${SHA}/check-runs`))).toBe(true)
  })

  it('다른 저장소 PR URL은 불러오지 않는다 (gh를 부르지 않는다)', async () => {
    const { svc, f } = setup({})
    const r = await svc.readPr(CWD, { url: 'https://github.com/someone/Other/pull/12' })
    expect(r).toMatchObject({ ok: false, otherRepo: true })
    expect(f.calls).toHaveLength(0)
  })

  it('같은 저장소 URL은 대소문자를 가리지 않고 번호로 불러온다', async () => {
    const { svc } = setup({})
    const r = await svc.readPr(CWD, { url: 'https://github.com/BASS131/agentdeck/pull/12' })
    expect(r.ok).toBe(true)
  })

  it('origin이 GitHub가 아니면 오류다', async () => {
    const { svc, f } = setup({ origin: 'https://gitlab.com/a/b.git' })
    expect((await svc.readPr(CWD, { number: 12 })).ok).toBe(false)
    expect(f.calls).toHaveLength(0)
  })

  it('번호가 양의 정수가 아니면 gh를 부르지 않는다', async () => {
    const { svc, f } = setup({})
    for (const n of [0, -1, 1.5, NaN]) expect((await svc.readPr(CWD, { number: n })).ok).toBe(false)
    expect(f.calls).toHaveLength(0)
  })

  it('보호가 없다는 404(Branch not protected)는 필수 검사 없음으로 읽고 메모를 단다', async () => {
    const { svc } = setup({ protection: fail(404, 'Branch not protected') })
    const r = await svc.readPr(CWD, { number: 12 })
    if (!r.ok) throw new Error('읽기 실패')
    expect(r.pr).toMatchObject({ protected: false, checks: [], canMerge: true })
    expect(r.pr.notes.join(' ')).toMatch(/보호/)
  })

  it('보호 읽기의 다른 실패(권한 없는 404 포함)는 닫힌 실패다 — 버튼이 꺼진다', async () => {
    for (const p of [fail(404, 'Not Found'), fail(403, 'Resource not accessible'), { code: 1, stdout: '', stderr: 'network' }]) {
      const { svc } = setup({ protection: p })
      const r = await svc.readPr(CWD, { number: 12 })
      if (!r.ok) throw new Error('읽기 실패')
      expect(r.pr.requiredError).toBeTruthy()
      expect(r.pr.canMerge).toBe(false)
    }
  })

  it('검사 결과: check run 성공·대기·실패·없음, 상태(status) 성공', async () => {
    const cases: [Parameters<typeof setup>[0], string][] = [
      [{ runs: [{ name: 'hard-gates', status: 'in_progress', conclusion: null }] }, 'pending'],
      [{ runs: [{ name: 'hard-gates', status: 'completed', conclusion: 'failure' }] }, 'failure'],
      [{ runs: [{ name: 'other', status: 'completed', conclusion: 'success' }] }, 'missing'],
      [{ runs: [], statuses: [{ context: 'hard-gates', state: 'success' }] }, 'success'],
      [{ runs: [], statuses: [{ context: 'hard-gates', state: 'pending' }] }, 'pending'],
      [{ runs: [{ name: 'hard-gates', status: 'completed', conclusion: 'failure' }, { name: 'hard-gates', status: 'completed', conclusion: 'success' }] }, 'success'],
      [{ runs: [{ name: 'hard-gates', status: 'queued', conclusion: null }, { name: 'hard-gates', status: 'completed', conclusion: 'failure' }] }, 'failure'],
    ]
    for (const [o, want] of cases) {
      const { svc } = setup(o)
      const r = await svc.readPr(CWD, { number: 12 })
      if (!r.ok) throw new Error('읽기 실패')
      expect(r.pr.checks[0].result, JSON.stringify(o)).toBe(want)
    }
  })

  it('PR 자체를 읽지 못하면 상태 번호가 든 오류다', async () => {
    const { svc } = setup({ extra: [[/^api repos\/bass131\/AgentDeck\/pulls\/12$/, fail(404, 'Not Found')]] })
    const r = await svc.readPr(CWD, { number: 12 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/404/)
  })
})

describe('버튼 활성 판정 mergeEligibility', () => {
  const view = (over: Partial<PrView> = {}): PrView => ({
    owner: 'o', repo: 'r', number: 1, title: 't', url: 'u', state: 'open', draft: false, merged: false, mergeable: true,
    baseRef: 'master', headRef: 'x', headSha: SHA, protected: true, checks: [{ name: 'hard-gates', result: 'success' }],
    canMerge: false, reasons: [], notes: [], ...over,
  })
  it('열림·초안 아님·병합 안 됨·충돌 없음·필수 검사 전부 성공이면 켜진다', () => {
    expect(mergeEligibility(view())).toMatchObject({ canMerge: true, reasons: [] })
    expect(mergeEligibility(view({ mergeable: null })).canMerge).toBe(true)
  })
  it.each([
    ['닫힘', { state: 'closed' as const }],
    ['초안', { draft: true }],
    ['병합됨', { merged: true, state: 'closed' as const }],
    ['충돌', { mergeable: false }],
    ['검사 대기', { checks: [{ name: 'hard-gates', result: 'pending' as const }] }],
    ['검사 실패', { checks: [{ name: 'hard-gates', result: 'failure' as const }] }],
    ['검사 없음', { checks: [{ name: 'hard-gates', result: 'missing' as const }] }],
    ['필수 검사 읽기 실패', { requiredError: '403' }],
    ['검사 결과 읽기 실패', { checksError: 'x' }],
  ])('%s이면 꺼지고 사유가 보인다', (_n, over) => {
    const e = mergeEligibility(view(over))
    expect(e.canMerge).toBe(false)
    expect(e.reasons.length).toBeGreaterThan(0)
  })
  it('보호 없는 base는 켜지되 메모가 붙는다', () => {
    const e = mergeEligibility(view({ protected: false, checks: [] }))
    expect(e.canMerge).toBe(true)
    expect(e.notes.length).toBeGreaterThan(0)
  })
})

describe('비동기 병합 API 호출', () => {
  const MERGE = /pulls\/12\/merge-async(?: |$)/
  const POLL = /pulls\/12\/merge-async\/uuid-1$/
  const pending = (sha = SHA) => http(202, { status: 'pending', details: { message: 'queued', uuid: 'uuid-1', merge_method: 'merge', merge_action: 'direct_merge', expected_head_sha: sha } })

  async function readThen(o: Parameters<typeof setup>[0]) {
    const s = setup(o)
    const r = await s.svc.readPr(CWD, { number: 12 })
    expect(r.ok).toBe(true)
    return s
  }

  it('보인 SHA·merge_method=merge·direct_merge·bypass_rules=false를 PUT으로 싣고, 202→pending→merged를 기다린다', async () => {
    const { svc, f, sleeps } = await readThen({
      extra: [
        [MERGE, pending()],
        [POLL, [http(200, { status: 'pending', details: { message: 'wait' } }), http(200, { status: 'merged', details: { message: 'ok', sha: OTHER } })]],
      ],
    })
    const r = await svc.mergePr(CWD, 12, SHA)
    expect(r).toMatchObject({ status: 'merged', mergeSha: OTHER })
    const put = f.calls.find((a) => MERGE.test(a.join(' ')))!
    expect(put).toEqual([
      'api', '-i', '-X', 'PUT', 'repos/bass131/AgentDeck/pulls/12/merge-async',
      '-f', `sha=${SHA}`, '-f', 'merge_method=merge', '-f', 'merge_action=direct_merge', '-F', 'bypass_rules=false',
    ])
    expect(f.calls.filter((a) => POLL.test(a.join(' ')))).toHaveLength(2)
    expect(sleeps.every((ms) => ms === 2000)).toBe(true)
  })

  it('202 뒤 failed면 서버 사유를 보인다', async () => {
    const { svc } = await readThen({
      extra: [[MERGE, pending()], [POLL, http(200, { status: 'failed', details: { message: 'Merge conflict: the pull request could not be merged.' } })]],
    })
    expect(await svc.mergePr(CWD, 12, SHA)).toMatchObject({ status: 'failed', message: expect.stringMatching(/Merge conflict/) })
  })

  it('202의 expected_head_sha가 보낸 SHA와 다르면 오류로 본다 (조회하지 않는다)', async () => {
    const { svc, f } = await readThen({ extra: [[MERGE, pending(OTHER)]] })
    expect((await svc.mergePr(CWD, 12, SHA)).status).toBe('failed')
    expect(f.calls.some((a) => POLL.test(a.join(' ')))).toBe(false)
  })

  it('200 이미 병합됨·병합 큐', async () => {
    const a = await readThen({ extra: [[MERGE, http(200, { status: 'merged', details: { message: 'already', sha: OTHER } })]] })
    expect(await a.svc.mergePr(CWD, 12, SHA)).toMatchObject({ status: 'merged', mergeSha: OTHER })
    const b = await readThen({ extra: [[MERGE, http(200, { status: 'enqueued', details: { message: 'queued' } })]] })
    expect((await b.svc.mergePr(CWD, 12, SHA)).status).toBe('enqueued')
  })

  it('400은 병합할 수 없는 상태라는 거부 사유다', async () => {
    const { svc } = await readThen({ extra: [[MERGE, http(400, { message: 'Pull request is closed' })]] })
    const r = await svc.mergePr(CWD, 12, SHA)
    expect(r.status).toBe('refused')
    expect(r.message).toMatch(/병합할 수 없는 상태/)
  })

  it('409 — 대기 중인 요청의 SHA가 같으면 그 uuid를 조회하고, 다르면 거부한다', async () => {
    const same = await readThen({
      extra: [
        [MERGE, http(409, { status: 'pending', details: { uuid: 'uuid-1', merge_method: 'merge', expected_head_sha: SHA } })],
        [POLL, http(200, { status: 'merged', details: { sha: OTHER } })],
      ],
    })
    expect(await same.svc.mergePr(CWD, 12, SHA)).toMatchObject({ status: 'merged', mergeSha: OTHER })
    const diff = await readThen({ extra: [[MERGE, http(409, { status: 'pending', details: { uuid: 'uuid-2', expected_head_sha: OTHER } })]] })
    const r = await diff.svc.mergePr(CWD, 12, SHA)
    expect(r.status).toBe('refused')
    expect(r.message).toMatch(/이미/)
    expect(diff.f.calls.some((a) => a.join(' ').includes('uuid-2'))).toBe(false)
  })

  it('403·404·422는 각각의 사유로 보인다', async () => {
    for (const [code, re] of [[403, /권한/], [404, /찾지 못/], [422, /검증/]] as const) {
      const { svc } = await readThen({ extra: [[MERGE, http(code, { message: 'x' })]] })
      const r = await svc.mergePr(CWD, 12, SHA)
      expect(r.status).toBe('refused')
      expect(r.message).toMatch(re)
    }
  })

  it('조회 상한을 넘기면 시간 초과 결과다', async () => {
    const { svc } = await readThen({
      pollTimeoutMs: 10_000,
      extra: [[MERGE, pending()], [POLL, http(200, { status: 'pending', details: {} })]],
    })
    const r = await svc.mergePr(CWD, 12, SHA)
    expect(r.status).toBe('timeout')
    expect(r.message).toMatch(/다시 읽기/)
  })

  it('조회가 404(결과 만료)면 실패다', async () => {
    const { svc } = await readThen({ extra: [[MERGE, pending()], [POLL, http(404, { message: 'Not Found' })]] })
    expect((await svc.mergePr(CWD, 12, SHA)).status).toBe('failed')
  })

  it('읽어 보인 적 없는 SHA, 다른 SHA, 잘못된 SHA는 gh를 부르지 않고 거부한다', async () => {
    const fresh = setup({})
    expect((await fresh.svc.mergePr(CWD, 12, SHA)).status).toBe('refused')
    expect(fresh.f.calls).toHaveLength(0)

    const { svc, f } = await readThen({})
    const before = f.calls.length
    expect((await svc.mergePr(CWD, 12, OTHER)).status).toBe('refused')
    expect((await svc.mergePr(CWD, 12, 'abc')).status).toBe('refused')
    expect((await svc.mergePr(CWD, 13, SHA)).status).toBe('refused')
    expect(f.calls.length).toBe(before)
  })

  it('마지막으로 읽은 PR이 병합 조건을 채우지 못했으면 main도 거부한다', async () => {
    const { svc, f } = await readThen({ runs: [{ name: 'hard-gates', status: 'in_progress', conclusion: null }] })
    const before = f.calls.length
    const r = await svc.mergePr(CWD, 12, SHA)
    expect(r.status).toBe('refused')
    expect(f.calls.length).toBe(before)
  })

  it('한 번 보낸 SHA는 다시 쓰지 못한다 — 다시 읽어야 한다', async () => {
    const { svc, f } = await readThen({ extra: [[MERGE, http(400, { message: 'closed' })]] })
    await svc.mergePr(CWD, 12, SHA)
    const before = f.calls.length
    expect((await svc.mergePr(CWD, 12, SHA)).status).toBe('refused')
    expect(f.calls.length).toBe(before)
  })
})
