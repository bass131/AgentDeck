// 프로젝트 헌장·Taste 확정의 PR 길 — 가짜 git·gh 포트로 프로덕션 openCharterPr를 돈다.
// 고정하는 것: 원격 기본 머리에서 가름 → 쓰기 → 커밋 → push → PR → 원래 브랜치로의 순서.
// 실행기가 돌고 있거나 작업 트리가 더러우면 아무 브랜치도 만들지 않고 이유를 돌려준다. 가른 뒤의 실패도 원래 브랜치로 돌아온다.
import { describe, expect, it } from 'vitest'
import { charterBranchName, openCharterPr, type CharterGit } from '@main/13_Taste/charterPr'
import { FakeGh, FakeGit } from '../00_Helpers/loopFakes'

const NOW = new Date('2026-11-21T01:30:05.123Z')
const BRANCH = 'agentdeck/charter-20261121T013005'

interface Rig { git: FakeGit; gh: FakeGh; order: string[]; recorded: CharterGit }

function rig(): Rig {
  const git = new FakeGit()
  git.local.set('feat/work', ['m0', 'w1'])
  git.current = 'feat/work'
  const gh = new FakeGh(git)
  const order: string[] = []
  const log = <A extends unknown[], R>(name: string, fn: (...a: A) => Promise<R>) => async (...a: A): Promise<R> => {
    order.push([name, ...a.filter((x) => typeof x === 'string' && !/^c\d{39}$/.test(x))].join(' '))
    return fn(...a)
  }
  const recorded: CharterGit = {
    hasChanges: log('hasChanges', () => git.hasChanges()),
    currentBranch: log('currentBranch', () => git.currentBranch()),
    syncToRemote: log('sync', (b: string) => git.syncToRemote(b)),
    headSha: log('headSha', (r: string) => git.headSha(r)),
    remoteSha: log('remoteSha', (b: string) => git.remoteSha(b)),
    branchExists: log('branchExists', (n: string) => git.branchExists(n)),
    createBranch: log('createBranch', (n: string, f: string) => git.createBranch(n, f)),
    checkout: log('checkout', (n: string) => git.checkout(n)),
    commitAll: log('commit', (m: string) => git.commitAll(m)),
    push: log('push', (b: string, s?: string) => git.push(b, s)),
  }
  return { git, gh, order, recorded }
}

function request(r: Rig, over: { busy?: string | null; write?: () => Promise<void> } = {}) {
  return {
    git: r.recorded,
    gh: { createPr: async (q: { head: string; base: string; title: string; body: string }) => { r.order.push(`createPr ${q.head} ${q.base}`); return r.gh.createPr(q) } },
    base: 'master',
    now: NOW,
    executorBusy: async () => { r.order.push('busy?'); return over.busy ?? null },
    write: over.write ?? (async () => { r.order.push('write'); r.git.dirty = true }),
    title: 'docs(agentdeck): 프로젝트 헌장 확정',
    body: '사람이 확정한 문서',
  }
}

describe('프로젝트 문서 확정의 PR 길', () => {
  it('브랜치 이름은 agentdeck/charter-<짧은 시각>이다', () => {
    expect(charterBranchName(NOW)).toBe(BRANCH)
  })

  it('원격 기본 머리에서 가름 → 쓰기 → 커밋 → push → PR → 원래 브랜치로', async () => {
    const r = rig()
    const out = await openCharterPr(request(r))
    expect(out).toEqual({ ok: true, pr: 100, branch: BRANCH })
    expect(r.order).toEqual([
      'busy?', 'hasChanges', 'currentBranch',
      'sync master', 'headSha master', 'remoteSha master', `branchExists ${BRANCH}`,
      `createBranch ${BRANCH} master`, `checkout ${BRANCH}`,
      'write', 'hasChanges', 'commit docs(agentdeck): 프로젝트 헌장 확정', `push ${BRANCH}`, `createPr ${BRANCH} master`,
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
    r.git.dirty = true
    const out = await openCharterPr(request(r))
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toContain('커밋하지 않은 변경')
    expect(r.order).toEqual(['busy?', 'hasChanges'])
    expect(r.git.local.has(BRANCH)).toBe(false)
  })

  it('분리된 HEAD, 로컬 기본 브랜치가 원격 머리와 다른 경우에도 가르지 않는다', async () => {
    const detached = rig()
    detached.git.detached = true
    const a = await openCharterPr(request(detached))
    expect(a.ok).toBe(false)
    if (!a.ok) expect(a.reason).toContain('분리된 HEAD')
    const ahead = rig()
    ahead.git.local.set('master', ['m0', 'm1'])
    const b = await openCharterPr(request(ahead))
    expect(b.ok).toBe(false)
    if (!b.ok) expect(b.reason).toContain('원격 머리와 다르다')
    expect(ahead.order.some((l) => l.startsWith('createBranch'))).toBe(false)
  })

  it('쓰기가 거절되거나 바뀐 것이 없으면 커밋하지 않고 원래 브랜치로 돌아온다', async () => {
    const refused = rig()
    const a = await openCharterPr(request(refused, { write: async () => { throw new Error('docs/agentdeck/헌장.md에 문제가 있어 덮어쓰지 않는다') } }))
    expect(a.ok).toBe(false)
    if (!a.ok) expect(a.reason).toContain('덮어쓰지 않는다')
    expect(refused.order.at(-1)).toBe('checkout feat/work')
    expect(refused.order.some((l) => l.startsWith('commit'))).toBe(false)
    const same = rig()
    const b = await openCharterPr(request(same, { write: async () => {} }))
    expect(b.ok).toBe(false)
    if (!b.ok) expect(b.reason).toContain('바뀐 것이 없다')
    expect(same.order.at(-1)).toBe('checkout feat/work')
    expect(same.gh.prs).toEqual([])
  })

  it('push가 실패해도 원래 브랜치로 돌아오고, 커밋이 남은 로컬 브랜치를 알린다', async () => {
    const r = rig()
    const req = request(r)
    const out = await openCharterPr({ ...req, git: { ...req.git, push: async () => { throw new Error('remote rejected') } } })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.reason).toContain('remote rejected')
      expect(out.reason).toContain(BRANCH)
    }
    expect(r.git.current).toBe('feat/work')
    expect(r.gh.prs).toEqual([])
  })
})
