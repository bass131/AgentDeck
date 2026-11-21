// 가짜 git·gh 포트로 프로덕션 openCharterPr를 돈다.
import { describe, expect, it } from 'vitest'
import { charterBranchName, openCharterPr, type CharterGit } from '@main/13_Taste/charterPr'
import { FakeGh, FakeGit } from '../00_Helpers/loopFakes'

const NOW = new Date('2026-11-21T01:30:05.123Z')
const BRANCH = 'agentdeck/charter-20261121T013005'
const DOC = 'docs/agentdeck/헌장.md'

interface Rig { git: FakeGit; gh: FakeGh; order: string[]; changed: string[]; onCheckout: Map<string, string[]>; recorded: CharterGit }

function rig(): Rig {
  const git = new FakeGit()
  git.local.set('feat/work', ['m0', 'w1'])
  git.current = 'feat/work'
  const gh = new FakeGh(git)
  const order: string[] = []
  const changed: string[] = []
  // 그 브랜치로 옮기면 드러나는 경로(다른 브랜치에서만 무시되던 파일)
  const onCheckout = new Map<string, string[]>()
  const log = <A extends unknown[], R>(name: string, fn: (...a: A) => Promise<R>) => async (...a: A): Promise<R> => {
    order.push([name, ...a.filter((x) => typeof x === 'string' && !/^c\d{39}$/.test(x))].join(' '))
    return fn(...a)
  }
  const recorded: CharterGit = {
    changedPaths: log('changedPaths', async () => [...changed]),
    currentBranch: log('currentBranch', () => git.currentBranch()),
    syncToRemote: log('sync', (b: string) => git.syncToRemote(b)),
    headSha: log('headSha', (r: string) => git.headSha(r)),
    remoteSha: log('remoteSha', (b: string) => git.remoteSha(b)),
    branchExists: log('branchExists', (n: string) => git.branchExists(n)),
    createBranch: log('createBranch', (n: string, f: string) => git.createBranch(n, f)),
    checkout: log('checkout', async (n: string) => {
      await git.checkout(n)
      changed.splice(0, changed.length, ...(onCheckout.get(n) ?? []))
    }),
    commitPaths: log('commit', async (paths: string[], m: string) => {
      order.push(`  paths ${paths.join(',')}`)
      const sha = await git.commitAll(m)
      for (const p of paths) changed.splice(changed.indexOf(p), 1)
      return sha
    }),
    discardPaths: log('discard', async (paths: string[]) => {
      order.push(`  paths ${paths.join(',')}`)
      for (const p of paths) if (changed.includes(p)) changed.splice(changed.indexOf(p), 1)
    }),
    push: log('push', (b: string, s?: string) => git.push(b, s)),
  }
  return { git, gh, order, changed, onCheckout, recorded }
}

function request(r: Rig, over: { busy?: string | null; write?: () => Promise<void>; cuts?: string[] } = {}) {
  return {
    git: r.recorded,
    gh: { createPr: async (q: { head: string; base: string; title: string; body: string }) => { r.order.push(`createPr ${q.head} ${q.base}`); return r.gh.createPr(q) } },
    base: 'master',
    now: NOW,
    paths: [DOC],
    executorBusy: async () => { r.order.push('busy?'); return over.busy ?? null },
    write: over.write ?? (async () => { r.order.push('write'); r.changed.push(DOC) }),
    onCut: (c: { original: string; branch: string }) => { r.order.push(`cut ${c.original} ${c.branch}`); over.cuts?.push(c.branch) },
    title: 'docs(agentdeck): 프로젝트 헌장 확정',
    body: '사람이 확정한 문서',
  }
}
const reasonOf = (out: Awaited<ReturnType<typeof openCharterPr>>): string => (out.ok ? '' : out.reason)

describe('프로젝트 문서 확정의 PR 길', () => {
  it('브랜치 이름은 agentdeck/charter-<짧은 시각>이다', () => {
    expect(charterBranchName(NOW)).toBe(BRANCH)
  })

  it('원격 기본 머리에서 가름 → 쓰기 → 문서 경로만 커밋 → push → PR → 원래 브랜치로', async () => {
    const r = rig()
    const out = await openCharterPr(request(r))
    expect(out).toEqual({ ok: true, pr: 100, branch: BRANCH })
    expect(r.order).toEqual([
      'busy?', 'changedPaths', 'currentBranch',
      'sync master', 'headSha master', 'remoteSha master', `branchExists ${BRANCH}`,
      `createBranch ${BRANCH} master`, `cut feat/work ${BRANCH}`, `checkout ${BRANCH}`, 'changedPaths',
      'write', 'changedPaths', 'commit docs(agentdeck): 프로젝트 헌장 확정', `  paths ${DOC}`, `push ${BRANCH}`, `createPr ${BRANCH} master`,
      'checkout feat/work',
    ])
    expect(r.git.current).toBe('feat/work')
    expect(r.git.remote.get(BRANCH)?.slice(0, 1)).toEqual(['m0'])
    expect(r.git.remote.get(BRANCH)).toHaveLength(2)
    expect(r.gh.prs.map((p) => `${p.head}→${p.base}`)).toEqual([`${BRANCH}→master`])
  })

  it('실행기가 돌고 있으면 git을 만지지 않고 이유를 돌려준다', async () => {
    const r = rig()
    const out = await openCharterPr(request(r, { busy: '실행 중인 마일스톤이 있다' }))
    expect(out).toEqual({ ok: false, reason: '실행 중인 마일스톤이 있다' })
    expect(r.order).toEqual(['busy?'])
  })

  it('작업 트리가 더러우면 브랜치를 만들지 않고 이유를 돌려준다', async () => {
    const r = rig()
    r.changed.push('src/a.ts')
    const out = await openCharterPr(request(r))
    expect(reasonOf(out)).toContain('커밋하지 않은 변경')
    expect(r.order).toEqual(['busy?', 'changedPaths'])
    expect(r.git.local.has(BRANCH)).toBe(false)
  })

  it('분리된 HEAD, 확정 브랜치 위, 로컬 기본 브랜치가 원격 머리와 다른 경우에도 가르지 않는다', async () => {
    const detached = rig()
    detached.git.detached = true
    expect(reasonOf(await openCharterPr(request(detached)))).toContain('분리된 HEAD')
    const onCharter = rig()
    onCharter.git.local.set('agentdeck/charter-20261120T000000', ['m0', 'x1'])
    onCharter.git.current = 'agentdeck/charter-20261120T000000'
    expect(reasonOf(await openCharterPr(request(onCharter)))).toContain('확정 브랜치')
    expect(onCharter.order.some((l) => l.startsWith('createBranch'))).toBe(false)
    const ahead = rig()
    ahead.git.local.set('master', ['m0', 'm1'])
    expect(reasonOf(await openCharterPr(request(ahead)))).toContain('원격 머리와 다르다')
    expect(ahead.order.some((l) => l.startsWith('createBranch'))).toBe(false)
  })

  it('갈라 옮긴 뒤 문서 밖의 경로가 드러나면(그 브랜치에서만 무시되던 파일) 쓰지 않고 돌아온다', async () => {
    const r = rig()
    r.onCheckout.set(BRANCH, ['.env', 'dist/app.js'])
    const out = await openCharterPr(request(r))
    expect(reasonOf(out)).toContain('.env')
    expect(r.order).not.toContain('write')
    expect(r.order.some((l) => l.startsWith('commit'))).toBe(false)
    expect(r.order.at(-1)).toBe('checkout feat/work')
    expect(r.git.remote.has(BRANCH)).toBe(false)
  })

  it('쓰기가 문서 밖을 바꾸면 문서를 되돌리고 커밋하지 않는다', async () => {
    const r = rig()
    const out = await openCharterPr(request(r, { write: async () => { r.changed.push(DOC, 'src/other.ts') } }))
    expect(reasonOf(out)).toContain('src/other.ts')
    expect(r.order.some((l) => l.startsWith('commit'))).toBe(false)
    expect(r.order.slice(-3)).toEqual(['discard', `  paths ${DOC}`, 'checkout feat/work'])
  })

  it('쓰기가 거절되거나 바뀐 것이 없으면 커밋하지 않고 원래 브랜치로 돌아온다', async () => {
    const refused = rig()
    const a = await openCharterPr(request(refused, { write: async () => { throw new Error('docs/agentdeck/헌장.md에 문제가 있어 덮어쓰지 않는다') } }))
    expect(reasonOf(a)).toContain('덮어쓰지 않는다')
    expect(refused.order.slice(-3)).toEqual(['discard', `  paths ${DOC}`, 'checkout feat/work'])
    expect(refused.order.some((l) => l.startsWith('commit'))).toBe(false)
    const same = rig()
    const b = await openCharterPr(request(same, { write: async () => {} }))
    expect(reasonOf(b)).toContain('바뀐 것이 없다')
    expect(same.order.at(-1)).toBe('checkout feat/work')
    expect(same.gh.prs).toEqual([])
  })

  it('쓴 뒤 커밋이 실패하면 쓴 문서를 되돌린 다음 원래 브랜치로 돌아온다 — 사람의 브랜치에 문서가 따라가지 않는다', async () => {
    const r = rig()
    const req = request(r)
    const out = await openCharterPr({ ...req, git: { ...req.git, commitPaths: async () => { r.order.push('commit!'); throw new Error('index.lock이 있다') } } })
    expect(reasonOf(out)).toContain('index.lock')
    expect(r.order.slice(-4)).toEqual(['commit!', 'discard', `  paths ${DOC}`, 'checkout feat/work'])
    expect(r.changed).toEqual([])
    expect(r.git.current).toBe('feat/work')
  })

  it('push나 PR 생성이 실패해도 원래 브랜치로 돌아오고, 커밋이 남은 브랜치를 알린다', async () => {
    const r = rig()
    const req = request(r)
    const out = await openCharterPr({ ...req, git: { ...req.git, push: async () => { throw new Error('remote rejected') } } })
    expect(reasonOf(out)).toContain('remote rejected')
    expect(reasonOf(out)).toContain(BRANCH)
    expect(r.git.current).toBe('feat/work')
    expect(r.gh.prs).toEqual([])
    const p = rig()
    const preq = request(p)
    const noPr = await openCharterPr({ ...preq, gh: { createPr: async () => { throw new Error('HTTP 403') } } })
    expect(reasonOf(noPr)).toContain('HTTP 403')
    expect(reasonOf(noPr)).toContain(`원격 ${BRANCH}`)
    expect(p.git.current).toBe('feat/work')
  })
})
