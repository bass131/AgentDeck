// M09 G2 실 git 통합 — openLoop(실물 GitPort·FsPort·CommandPort·다이제스트·잠금) + 가짜 gh(bare 원격을 읽어 병합을 흉내) + 가짜 세션.
// 임시 폴더(AgentDeck 저장소 밖)의 작업 저장소와 bare 원격으로 goal 하나가 브랜치 가르기→커밋·push→PR→CI→로컬 --no-ff 병합→push,
// 그리고 마일스톤 PR과 사람 병합까지 간다. 「실행은 됐는데 저장 전에 꺼짐」 뒤 실행기를 새로 만들어도 이미 된 일을 다시 하지 않고,
// 상태 파일을 밖에서 고치면 멈추며, 저장소당 실행기는 하나다.
// 재검수 반영: 실물 gh는 origin에서 정한 저장소로 고정하고(-R), PR 머리를 git replace로 바꿔치기해도 원격 병합 트리는 CI 머리의 트리다.
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentBackend, AgentRun, AgentRunInput } from '@main/03_Agent/AgentBackend'
import type { AgentEvent } from '@shared/agentEvents'
import type { CiStatus } from '@main/05_Loop/executor'
import { TAMPERED_REASON, type LoadResult } from '@main/05_Loop/loopRunner'
import { openLoop, type OpenedLoop } from '@main/05_Loop/openLoop'
import type { GhPort, PrInfo, PrState, ReviewPort, SessionPort, WorkRequest } from '@main/05_Loop/ports'
import { DOCS } from '@main/05_Loop/survivalDocs'
import { labelOf, loaded, variantText, findRawNode } from '../00_Helpers/loopFakes'
import { makeTempRepos, type TempRepos } from '../00_Helpers/tempGit'

const SLOW = { timeout: 180_000 }
// 검사 명령은 실물 명령 포트로 돈다 — 자격 없는 환경(가짜 GH_TOKEN)으로 돌았는지를 명령 자체가 본다.
const ENV_PROBE = 'node -e "process.exit(process.env.GH_TOKEN === \'agentdeck-no-credential\' ? 0 : 7)"'
const probeCommands = (raw: Parameters<Parameters<typeof variantText>[0]>[0], id: string): void => {
  (findRawNode(raw, id).rule as { commands: string[] }).commands = [ENV_PROBE]
}
const TEMPLATE = loaded(variantText((raw) => {
  probeCommands(raw, 'checks')
  probeCommands(raw, 'regression')
}))

interface BarePr { number: number; head: string; base: string; state: PrState; mergedHead: string | null; mergeCommit: string | null }

// GitHub 흉내 — 원격(bare)의 브랜치를 읽는다. 원격 base가 PR 머리를 품으면 병합됨으로 닫는다(GitHub가 하는 일).
class BareGh implements GhPort {
  readonly calls: string[] = []
  readonly prs: BarePr[] = []
  constructor(private readonly repos: TempRepos) {}
  tip(branch: string): string | null {
    try { return this.repos.bare(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]) || null } catch { return null }
  }
  private contains(base: string, sha: string): boolean {
    try { this.repos.bare(['merge-base', '--is-ancestor', sha, base]); return true } catch { return false }
  }
  private view(pr: BarePr): PrInfo {
    const head = pr.mergedHead ?? this.tip(pr.head) ?? ''
    const base = this.tip(pr.base)
    if (pr.state === 'open' && head && base && this.contains(base, head)) {
      pr.state = 'merged'
      pr.mergedHead = head
      pr.mergeCommit = base
    }
    return { number: pr.number, state: pr.state, headSha: head, mergeCommitSha: pr.mergeCommit }
  }
  async findPr(head: string, base: string): Promise<PrInfo | null> {
    this.calls.push(`findPr ${head}`)
    const pr = [...this.prs].reverse().find((p) => p.head === head && p.base === base)
    return pr ? this.view(pr) : null
  }
  async getPr(number: number): Promise<PrInfo | null> {
    const pr = this.prs.find((p) => p.number === number)
    return pr ? this.view(pr) : null
  }
  async createPr(req: { head: string; base: string }): Promise<PrInfo> {
    this.calls.push(`createPr ${req.head} ${req.base}`)
    if (!this.tip(req.head)) throw new Error(`원격에 ${req.head}가 없다`)
    const pr: BarePr = { number: this.prs.length + 1, head: req.head, base: req.base, state: 'open', mergedHead: null, mergeCommit: null }
    this.prs.push(pr)
    return this.view(pr)
  }
  async ciStatus(number: number): Promise<CiStatus> {
    const pr = this.prs.find((p) => p.number === number)
    return { state: 'success', headSha: (pr && this.tip(pr.head)) ?? '', summary: 'hard-gates SUCCESS' }
  }
  // 사람이 GitHub에서 마일스톤 PR을 병합한 것 — 원격 base를 PR 머리로 옮긴다(fast-forward).
  mergeByHuman(number: number): void {
    const pr = this.prs.find((p) => p.number === number)
    const head = pr && this.tip(pr.head)
    if (!pr || !head) throw new Error(`병합할 PR ${number}이 없다`)
    this.repos.bare(['update-ref', `refs/heads/${pr.base}`, head])
  }
}

class Session implements SessionPort {
  readonly calls: string[] = []
  constructor(private readonly root: string) {}
  async runWork(req: WorkRequest): Promise<{ ok: boolean; summary: string }> {
    this.calls.push(req.goal ? `${req.goal.id}/${req.node.id}` : req.node.id)
    const write = (rel: string, text: string): void => {
      fs.mkdirSync(path.dirname(path.join(this.root, rel)), { recursive: true })
      fs.writeFileSync(path.join(this.root, rel), text)
    }
    if (req.node.produces === 'goals') write('.agentdeck/goals/G1.md', '# 첫 goal\n\n범위: src/feature.ts 하나\n')
    if (req.node.id === 'implement') write('src/feature.ts', 'export const feature = 1\n')
    return { ok: true, summary: '끝' }
  }
}
const review: ReviewPort = { review: async () => ({ verdict: 'pass', evidence: '검수 통과' }) }

let repos: TempRepos
let gh: BareGh
let session: Session
let appData: string
const opened: OpenedLoop[] = []

async function open(): Promise<OpenedLoop> {
  const r = await openLoop({
    cwd: repos.work, appDataDir: appData, session, review, gh, template: TEMPLATE,
    executorEnv: repos.env, commandTimeoutMs: 60_000,
  })
  if (!r.ok) throw new Error(`openLoop 실패: ${r.reason}`)
  opened.push(r.loop)
  return r.loop
}
async function close(loop: OpenedLoop): Promise<void> {
  await loop.close()
  opened.splice(opened.indexOf(loop), 1)
}

// 저장본을 읽어 현재 노드를 돌고, 사람 게이트는 사람 판정으로, 마일스톤 병합은 사람의 GitHub 병합으로 답한다.
async function drive(loop: OpenedLoop, until?: string): Promise<LoadResult> {
  for (let i = 0; i < 100; i++) {
    const r = await loop.runner.load()
    if (r.kind !== 'ok') return r
    const label = labelOf(r.next)
    if (r.next.kind === 'done' || r.next.kind === 'needs-user' || label === until) return r
    const out = await loop.runner.step()
    if (out.kind === 'waiting' && out.on === 'human' && r.next.kind === 'gate') {
      if (r.next.node.watch && r.state.milestonePr !== null) gh.mergeByHuman(r.state.milestonePr)
      else await loop.runner.submit({ node: r.next.node.id, judge: 'human', verdict: 'pass', evidence: '사람이 승인했다' })
      continue
    }
    if (out.kind === 'waiting' || out.kind === 'blocked' || out.kind === 'needs-user' || out.kind === 'halted' || out.kind === 'failed') {
      throw new Error(`${label}에서 멈췄다: ${JSON.stringify(out.kind === 'blocked' || out.kind === 'needs-user' ? out.reason : out.kind === 'waiting' ? out.on : out.state.haltReason ?? out.verdict?.evidence)}`)
    }
  }
  throw new Error('100단계 안에 끝나지 않았다')
}

// 「실행은 됐는데 상태 저장 전에 꺼짐」 — 작업 저장소의 생존 문서와 앱 영역의 다이제스트를 그 전으로 되돌린다.
function snapshot(): () => void {
  const files = [path.join(repos.work, DOCS.runState), path.join(repos.work, DOCS.verification), ...fs.readdirSync(path.join(appData, 'digests')).map((f) => path.join(appData, 'digests', f))]
  const saved = files.map((f) => [f, fs.readFileSync(f)] as const)
  return () => { for (const [f, b] of saved) fs.writeFileSync(f, b) }
}

beforeEach(() => {
  repos = makeTempRepos('agentdeck-g2-loop-')
  gh = new BareGh(repos)
  session = new Session(repos.work)
  appData = path.join(repos.root, 'appdata')
})
afterEach(async () => {
  for (const l of [...opened]) await close(l)
  repos.cleanup()
})

describe('openLoop — 실 git으로 goal 하나를 끝까지', () => {
  it('브랜치 가르기→커밋 push→PR→CI→로컬 --no-ff 병합→push, 그리고 마일스톤 PR과 사람 병합까지 간다', SLOW, async () => {
    // 작업 저장소의 훅(세션이 쓸 수 있는 코드)은 자격 있는 실행기 git에서 돌지 않는다 — 돌면 checkout·merge·commit이 막힌다
    for (const hook of ['post-checkout', 'post-merge', 'post-commit', 'pre-commit', 'pre-push']) {
      fs.writeFileSync(path.join(repos.work, '.git/hooks', hook), '#!/bin/sh\necho hook-ran >&2\nexit 1\n', { mode: 0o755 })
    }
    const loop = await open()
    // 실행기 git이 쓰는 빈 훅 폴더는 앱 영역에 있고, 자식 환경(세션이 읽을 수 있는 값)에는 앱 영역 경로가 하나도 없다
    expect(Object.values(loop.childEnv.env).filter((v) => typeof v === 'string' && v.toLowerCase().includes(appData.toLowerCase()))).toEqual([])
    expect((await loop.runner.start('M1')).kind).toBe('ok')
    const end = await drive(loop)
    expect(end.kind === 'ok' && end.state.status).toBe('done')
    if (end.kind !== 'ok') return
    const goal = end.state.goals[0]
    // 원격의 마일스톤 브랜치 머리는 goal 머리를 두 번째 부모로 둔 병합 커밋이다
    const tip = gh.tip('milestone/M1') as string
    expect(repos.bare(['log', '-1', '--format=%P', tip]).split(' ')).toEqual([expect.any(String), gh.tip('goal/M1-G1')])
    expect(repos.bare(['log', '-1', '--format=%s', tip])).toBe('Merge PR #1: G1 첫 goal')
    expect(goal).toMatchObject({ pr: 1, grade: 'weak', mergedSha: tip, ciSha: gh.tip('goal/M1-G1') })
    expect(gh.calls.filter((c) => c.startsWith('createPr'))).toEqual(['createPr goal/M1-G1 milestone/M1', 'createPr milestone/M1 master'])
    expect(gh.tip('master')).toBe(tip)
    // goal 커밋에는 구현만 실리고 .agentdeck/(상태·goal 문서)는 어느 브랜치에도 없다
    expect(repos.bare(['ls-tree', '-r', '--name-only', tip]).split('\n').sort()).toEqual(['README.md', 'src/feature.ts'])
    expect(repos.git(['status', '--porcelain'])).toBe('')
    expect(fs.readFileSync(path.join(repos.work, '.git/info/exclude'), 'utf8')).toContain('.agentdeck/')
    // 검사 명령은 자격 없는 환경으로 돌았다(그렇지 않으면 exit 7로 FAIL)
    expect(end.state.lines.filter((l) => l.marker === 'FAIL')).toEqual([])
    expect(session.calls).toEqual(['brainstorm', 'decompose', 'G1/implement'])
  })
})

describe('openLoop — 재개는 이미 된 일을 다시 하지 않는다', () => {
  it('PR을 연 뒤·병합한 뒤 저장 전에 꺼지고 실행기를 새로 만들어도, 커밋·PR·병합을 다시 하지 않는다', SLOW, async () => {
    let loop = await open()
    await loop.runner.start('M1')
    await drive(loop, 'G1/goal-pr')
    let restore = snapshot()
    expect((await loop.runner.step()).kind).toBe('advanced')
    restore()
    await close(loop)
    loop = await open()
    const resumed = await loop.runner.load()
    expect(resumed.kind === 'ok' && labelOf(resumed.next)).toBe('G1/goal-pr')
    const again = await loop.runner.step()
    expect(again.kind === 'advanced' && again.verdict?.evidence).toContain('이미 열려')
    expect(gh.calls.filter((c) => c.startsWith('createPr'))).toHaveLength(1)
    expect(repos.bare(['rev-list', '--count', 'refs/heads/milestone/M1..refs/heads/goal/M1-G1'])).toBe('1')

    await drive(loop, 'G1/merge')
    restore = snapshot()
    expect((await loop.runner.step()).kind).toBe('advanced')
    const mergedTip = gh.tip('milestone/M1')
    restore()
    await close(loop)
    loop = await open()
    const merge = await loop.runner.step()
    expect(merge.kind === 'advanced' && merge.verdict?.evidence).toContain('이미 병합')
    expect(gh.tip('milestone/M1')).toBe(mergedTip)
    expect(repos.bare(['rev-list', '--merges', '--count', 'refs/heads/master..refs/heads/milestone/M1'])).toBe('1')
    expect(labelOf((await drive(loop, 'regression') as Extract<LoadResult, { kind: 'ok' }>).next)).toBe('regression')
  })
})

describe('openLoop — 위조 방어와 저장소당 하나', () => {
  it('상태 파일을 밖에서 고치면 멈추고, 실행기를 새로 열어도 멈춘 채다', SLOW, async () => {
    let loop = await open()
    await loop.runner.start('M1')
    await drive(loop, 'G1/implement')
    const file = path.join(repos.work, DOCS.runState)
    const forged = JSON.parse(fs.readFileSync(file, 'utf8'))
    forged.cursor = { node: 'merge', goal: 0 }
    fs.writeFileSync(file, `${JSON.stringify(forged, null, 2)}\n`)
    const r = await loop.runner.load()
    expect(r.kind === 'needs-user' && r.reason).toContain(TAMPERED_REASON)
    expect((await loop.runner.step()).kind).toBe('needs-user')
    await close(loop)
    loop = await open()
    expect((await loop.runner.load()).kind).toBe('needs-user')
    expect(session.calls).toEqual(['brainstorm', 'decompose'])
  })

  it('같은 저장소에 두 번째 실행기를 열면 거부하고, 닫으면 다시 열린다 — exclude 줄은 한 번만', SLOW, async () => {
    const first = await open()
    const second = await openLoop({ cwd: path.join(repos.work, '.'), appDataDir: appData, session, review, gh, template: TEMPLATE, executorEnv: repos.env })
    expect(second.ok).toBe(false)
    expect(!second.ok && second.reason).toContain('이미')
    await close(first)
    await open()
    const lines = fs.readFileSync(path.join(repos.work, '.git/info/exclude'), 'utf8').split(/\r?\n/)
    expect(lines.filter((l) => l.trim() === '.agentdeck/')).toHaveLength(1)
  })

  it('git 저장소가 아니면 열지 않는다', async () => {
    const plain = path.join(repos.root, 'plain')
    fs.mkdirSync(plain)
    const r = await openLoop({ cwd: plain, appDataDir: appData, session, review, gh, template: TEMPLATE, executorEnv: repos.env })
    expect(r.ok).toBe(false)
  })
})

// M09 G2 2차분 — 세션 포트 대신 백엔드를 주면 실물 작업 노드 세션 포트(workSession.ts)를 붙인다.
interface BackendRec { starts: AgentRunInput[]; aborts: number }
function recordingBackend(mode: 'done' | 'hang'): { backend: AgentBackend; rec: BackendRec } {
  const rec: BackendRec = { starts: [], aborts: 0 }
  const backend: AgentBackend = {
    id: 'claude-code',
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    listSupportedCommands: () => [],
    start(req): AgentRun {
      rec.starts.push(req)
      let release: () => void = () => {}
      const aborted = new Promise<void>((r) => { release = r })
      return {
        events: (async function* () {
          if (mode === 'hang') { await aborted; return }
          yield { type: 'done' } as AgentEvent
        })(),
        abort() { rec.aborts++; release() },
        interrupt() {},
        push() {},
        respond() {},
      }
    },
  }
  return { backend, rec }
}

async function openWithBackend(backend: AgentBackend): Promise<OpenedLoop> {
  const r = await openLoop({ cwd: repos.work, appDataDir: appData, backend, review, gh, template: TEMPLATE, executorEnv: repos.env })
  if (!r.ok) throw new Error(`openLoop 실패: ${r.reason}`)
  opened.push(r.loop)
  return r.loop
}

// 첫 작업 노드까지 간다 — 사람 게이트는 사람 판정으로 넘긴다. 작업 노드의 step 약속을 감싸 돌려준다(async가 펴지 않게).
async function stepToFirstWork(loop: OpenedLoop): Promise<{ pending: Promise<unknown> }> {
  expect((await loop.runner.start('M1')).kind).toBe('ok')
  for (let i = 0; i < 10; i++) {
    const r = await loop.runner.load()
    if (r.kind !== 'ok') throw new Error(`load ${r.kind}`)
    if (r.next.kind === 'work') return { pending: loop.runner.step() }
    const out = await loop.runner.step()
    if (out.kind === 'waiting' && out.on === 'human' && r.next.kind === 'gate') {
      await loop.runner.submit({ node: r.next.node.id, judge: 'human', verdict: 'pass', evidence: '사람이 승인했다' })
    }
  }
  throw new Error('작업 노드에 닿지 않았다')
}

describe('openLoop — 실물 작업 노드 세션 포트 (M09 G2)', () => {
  it('세션 포트도 백엔드도 없으면 열지 않고 잠금도 남기지 않는다', async () => {
    const r = await openLoop({ cwd: repos.work, appDataDir: appData, review, gh, template: TEMPLATE, executorEnv: repos.env })
    expect(r).toMatchObject({ ok: false })
    await open()
  })

  it('백엔드를 주면 작업 노드 세션을 작업 저장소 cwd·자격 없는 환경·자동 모드·루프 잠금(앱 영역)으로 연다', SLOW, async () => {
    const { backend, rec } = recordingBackend('done')
    const loop = await openWithBackend(backend)
    await (await stepToFirstWork(loop)).pending
    expect(rec.starts).toHaveLength(1)
    const req = rec.starts[0]
    expect(req.workspaceRoot).toBe(loop.root)
    expect(req.env).toBe(loop.childEnv.env)
    expect(req.env?.GH_TOKEN).toBe('agentdeck-no-credential')
    expect(req.mode).toBe('auto')
    expect(req.loopLock).toEqual({ repoRoot: loop.root, appLoopDir: appData })
  })

  it('실행기를 닫으면 돌고 있는 작업 노드 세션을 멈추고, 그 노드는 통과로 가지 않는다', SLOW, async () => {
    const { backend, rec } = recordingBackend('hang')
    const loop = await openWithBackend(backend)
    const { pending } = await stepToFirstWork(loop)
    for (let i = 0; i < 100 && rec.starts.length === 0; i++) await new Promise((r) => setTimeout(r, 10))
    expect(rec.starts).toHaveLength(1)
    let settled = false
    void pending.then(() => { settled = true })
    await close(loop)
    // 닫기는 세션을 멈춘 뒤 진행 중인 step(직렬화 줄)이 끝나기를 기다리고, 그다음에 잠금을 푼다(G2 검수 사소)
    expect(settled).toBe(true)
    const out = (await pending) as { kind: string; verdict?: { verdict: string; evidence: string } | null }
    expect(rec.aborts).toBeGreaterThanOrEqual(1)
    // 그 step은 세션의 ok:false를 불통과 판정으로 바꿔 상태와 검증 기록에 남긴다 — 잠금을 풀기 전의 저장이다
    expect(out.kind).toBe('failed')
    expect(out.verdict?.evidence).toContain('취소됐다')
    expect(fs.readFileSync(path.join(repos.work, DOCS.verification), 'utf8')).toContain('취소됐다')
    expect(fs.readdirSync(path.join(appData, 'locks'))).toEqual([])
  })
})

describe('openLoop — 검수 반영 (M09 G2)', () => {
  it('실물 gh인데 필수 검사 이름이 없으면 열지 않고 잠금도 남기지 않는다', async () => {
    const r = await openLoop({ cwd: repos.work, appDataDir: appData, session, review, template: TEMPLATE, executorEnv: repos.env })
    expect(r).toMatchObject({ ok: false })
    expect(!r.ok && r.reason).toContain('requiredChecks')
    await open()
  })

  it('작업 노드가 로컬 git 설정에 filter를 심으면 실행기는 그 git을 돌리지 않고 멈추며, 다시 열어도 열리지 않는다', SLOW, async () => {
    const marker = path.join(repos.root, 'filter-ran')
    const planting: SessionPort = {
      runWork: async (req) => {
        const res = await session.runWork(req)
        if (req.node.id === 'implement') {
          repos.git(['config', 'filter.x.clean', `sh -c 'echo ran > "${marker.replace(/\\/g, '/')}"; cat'`])
          fs.writeFileSync(path.join(repos.work, '.gitattributes'), '* filter=x\n')
        }
        return res
      },
    }
    const r = await openLoop({ cwd: repos.work, appDataDir: appData, session: planting, review, gh, template: TEMPLATE, executorEnv: repos.env })
    if (!r.ok) throw new Error(r.reason)
    opened.push(r.loop)
    await r.loop.runner.start('M1')
    await drive(r.loop, 'G1/implement')
    const out = await r.loop.runner.step()
    expect(out.kind).toBe('needs-user')
    expect(out.kind === 'needs-user' && out.reason).toContain('filter.x.clean')
    // 다음 노드(검사·등급의 diffStat, goal PR의 commitAll)도 돌지 않는다
    expect((await r.loop.runner.step()).kind).toBe('needs-user')
    expect(fs.existsSync(marker)).toBe(false)
    await close(r.loop)
    const again = await openLoop({ cwd: repos.work, appDataDir: appData, session, review, gh, template: TEMPLATE, executorEnv: repos.env })
    expect(again.ok).toBe(false)
    expect(!again.ok && again.reason).toContain('filter.x.clean')
  })
})

describe('openLoop — 재검수 반영 (M09 G2)', () => {
  // 중요 B — 실물 gh는 열 때 origin 주소에서 정한 HOST/OWNER/REPO로 모든 호출을 고정한다(-R)
  it('실물 gh는 origin 주소에서 gh 저장소를 정한다 — 정하지 못하면(로컬 경로) 열지 않고 잠금도 남기지 않는다', async () => {
    const bad = await openLoop({ cwd: repos.work, appDataDir: appData, session, review, template: TEMPLATE, executorEnv: repos.env, requiredChecks: ['hard-gates'] })
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.reason).toContain('origin')
    expect(fs.readdirSync(path.join(appData, 'locks'))).toEqual([])
    // 열지 못한 실행은 설정 스냅숏을 남기지 않는다 — origin을 고친 뒤의 다시 열기가 「설정이 바뀌었다」로 막히지 않게
    expect(fs.existsSync(path.join(appData, 'git-config'))).toBe(false)
    repos.git(['remote', 'set-url', 'origin', 'https://github.com/acme/widgets.git'])
    const good = await openLoop({ cwd: repos.work, appDataDir: appData, session, review, template: TEMPLATE, executorEnv: repos.env, requiredChecks: ['hard-gates'] })
    if (!good.ok) throw new Error(good.reason)
    opened.push(good.loop)
    expect(good.loop.ghRepo).toBe('github.com/acme/widgets')
    await close(good.loop)
    // 부르는 쪽이 gh 포트를 주면 저장소 고정은 그 포트의 몫이다(시험의 가짜 gh)
    expect((await open()).ghRepo).toBeNull()
  })

  // 차단 A — goal 병합 직전에 작업 노드가 PR 머리(CI를 통과한 커밋)를 `git replace`로 악성 커밋에 바꿔치기한다
  it('PR 머리를 git replace로 바꿔치기해도 원격 마일스톤의 병합 트리는 CI 머리의 트리다', SLOW, async () => {
    const loop = await open()
    await loop.runner.start('M1')
    await drive(loop, 'G1/merge')
    const ci = gh.tip('goal/M1-G1') as string
    const ciTree = repos.bare(['rev-parse', `${ci}^{tree}`])
    // 작업 트리를 건드리지 않고 악성 트리(CI 머리 트리 + evil.txt)와 같은 부모의 커밋을 만든다
    const blob = repos.git(['hash-object', '-w', '--stdin'], repos.work, 'evil\n')
    const listing = `${repos.git(['ls-tree', ci])}\n100644 blob ${blob}\tevil.txt\n`
    const evilTree = repos.git(['mktree'], repos.work, listing)
    const parent = repos.git(['rev-parse', `${ci}^`])
    const evil = repos.git(['commit-tree', evilTree, '-p', parent, '-m', 'G1'])
    repos.git(['replace', ci, evil])
    // 비교군 — 교체 객체를 따르는 git은 CI 머리의 트리를 악성 트리로 읽는다
    expect(repos.git(['rev-parse', `${ci}^{tree}`])).toBe(evilTree)
    const out = await loop.runner.step()
    expect(out.kind).toBe('advanced')
    const tip = gh.tip('milestone/M1') as string
    expect(repos.bare(['rev-parse', `${tip}^2`])).toBe(ci)
    expect(repos.bare(['rev-parse', `${tip}^2^{tree}`])).toBe(ciTree)
    expect(repos.bare(['ls-tree', '-r', '--name-only', tip]).split('\n')).not.toContain('evil.txt')
  })
})
