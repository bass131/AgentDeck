// 실 git(임시 작업 저장소 + bare 원격) + 가짜 gh + 대본 백엔드로 프로덕션 createLoopDriver를 돈다.
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentBackend, AgentRun, AgentRunInput } from '@main/03_Agent/AgentBackend'
import { createLoopDriver, type LoopDriver } from '@main/05_Loop/loopDriver'
import type { MainActions } from '@main/05_Loop/mainChat'
import { DOCS } from '@main/05_Loop/survivalDocs'
import { globalTastePath } from '@main/13_Taste/tasteStore'
import type { AgentEvent } from '@shared/agentEvents'
import type { LoopCard, LoopStatus } from '@shared/13_Loop/loop'
import { BareGh } from '../00_Helpers/bareGh'
import { loaded } from '../00_Helpers/loopFakes'
import { makeTempRepos, type TempRepos } from '../00_Helpers/tempGit'

const SLOW = { timeout: 120_000 }
const CHARTER = { doc: 'charter' as const, charter: { goal: ['에이전트가 마일스톤을 끝까지 맡는다.'], nonGoals: ['- 클라우드 동기화'] } }
const ITEMS = [{ id: 'T1', title: '정보 밀도', fields: [{ name: '원칙', text: '한 화면에 카드 여섯 장 이상' }] }]

function quietBackend(): { backend: AgentBackend; starts: AgentRunInput[] } {
  const starts: AgentRunInput[] = []
  const backend: AgentBackend = {
    id: 'claude-code',
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    listSupportedCommands: () => [],
    start(req): AgentRun {
      starts.push(req)
      return {
        events: (async function* (): AsyncGenerator<AgentEvent> {
          yield { type: 'session', sessionId: req.resumeSessionId ?? `S${starts.length}` }
          yield { type: 'text', delta: '물어볼게', messageId: `m${starts.length}` }
          yield { type: 'done' }
        })(),
        abort() {}, interrupt() {}, push() {}, respond() {},
      }
    },
  }
  return { backend, starts }
}

let repos: TempRepos
let gh: BareGh
let appData: string
let tasteDir: string
const drivers: LoopDriver[] = []
let pushed: LoopStatus[] = []

interface Rig { d: LoopDriver; starts: AgentRunInput[]; actions: () => MainActions }
function driver(): Rig {
  const { backend, starts } = quietBackend()
  let actions: MainActions | null = null
  const d = createLoopDriver({
    appDataDir: appData, tasteDataDir: tasteDir, backend, ciRetryMs: 20, humanPollMs: 20,
    openExtras: { gh, template: loaded(), executorEnv: repos.env, commandTimeoutMs: 60_000 },
    onState: (s) => { pushed.push(s) },
    mainTools: async (a) => { actions = a; return null },
  })
  drivers.push(d)
  return { d, starts, actions: () => actions as MainActions }
}
async function opened(): Promise<Rig> {
  const rig = driver()
  await rig.d.open({ cwd: repos.work })
  rig.d.mainSend(repos.work, '안녕')
  for (let i = 0; i < 500 && rig.starts.length === 0; i++) await sleep(10)
  return rig
}
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const tasteCards = (rig: Rig): Extract<LoopCard, { kind: 'taste' }>[] =>
  rig.d.mainRead(repos.work).cards.filter((c): c is Extract<LoopCard, { kind: 'taste' }> => c.kind === 'taste')
async function settled(rig: Rig, id: string): Promise<Extract<LoopCard, { kind: 'taste' }> | undefined> {
  for (let i = 0; i < 3000; i++) {
    const c = tasteCards(rig).find((x) => x.requestId === id)
    if (c === undefined || c.confirming !== true) return c
    await sleep(10)
  }
  throw new Error('확정이 끝나지 않았다')
}
const branch = (): string => repos.git(['symbolic-ref', '--short', 'HEAD'])
const remoteBranches = (): string[] => repos.bare(['for-each-ref', '--format=%(refname:short)', 'refs/heads/']).split('\n').filter((x) => x !== '')

beforeEach(() => {
  repos = makeTempRepos('agentdeck-taste-doc-')
  gh = new BareGh(repos)
  appData = path.join(repos.root, 'appdata', 'loop')
  tasteDir = path.join(repos.root, 'appdata')
  fs.mkdirSync(tasteDir, { recursive: true })
  pushed = []
})
afterEach(async () => {
  for (const d of drivers.splice(0)) await d.closeAll()
  repos.cleanup()
})

describe('구동자의 문서 초안 길', () => {
  it('검사를 통과한 초안만 카드가 되고, 전역 Taste 확정은 앱 데이터 폴더에 쓴다', SLOW, async () => {
    const rig = await opened()
    expect(await rig.actions().proposeTasteDoc({ doc: 'global-taste', items: [{ id: 'T1', title: '빈', fields: [] }] })).toMatch(/^제안하지 않았다/)
    expect(tasteCards(rig)).toEqual([])
    expect(await rig.actions().proposeTasteDoc({ doc: 'global-taste', items: ITEMS })).toContain('승인 카드')
    const [card] = tasteCards(rig)
    for (let i = 0; i < 500 && !rig.d.status(repos.work).cards.some((c) => c.requestId === card.requestId); i++) await sleep(10)
    expect(rig.d.status(repos.work).cards.find((c) => c.requestId === card.requestId)).toMatchObject({ kind: 'taste', inChat: true })
    expect(rig.d.answerCard(repos.work, 'taste-없음', { kind: 'taste', decision: 'confirm' })).toBe(false)
    expect(rig.d.answerCard(path.join(repos.root, 'nowhere'), card.requestId, { kind: 'taste', decision: 'confirm' })).toBe(false)
    expect(rig.d.answerCard(repos.work, card.requestId, { kind: 'taste', decision: 'confirm' })).toBe(true)
    expect(await settled(rig, card.requestId)).toBeUndefined()
    expect(fs.readFileSync(globalTastePath(tasteDir), 'utf8')).toBe(card.preview)
    await rig.d.close(repos.work)
    expect(await rig.actions().proposeTasteDoc({ doc: 'global-taste', items: ITEMS })).toBe('메인 대화가 닫혔다')
  })

  it('프로젝트 헌장 확정은 기본 브랜치로 가는 PR이 되고 원래 브랜치로 돌아온다', SLOW, async () => {
    repos.git(['checkout', '--quiet', '-b', 'feat/side'])
    const rig = await opened()
    expect(rig.d.mainRead(repos.work).tastePr).toBeUndefined()
    await rig.actions().proposeTasteDoc(CHARTER)
    const [card] = tasteCards(rig)
    expect(rig.d.answerCard(repos.work, card.requestId, { kind: 'taste', decision: 'confirm' })).toBe(true)
    expect(await settled(rig, card.requestId)).toBeUndefined()
    const made = remoteBranches().filter((b) => b.startsWith('agentdeck/charter-'))
    expect(made).toHaveLength(1)
    expect(gh.calls).toContain(`createPr ${made[0]} master`)
    expect(repos.bare(['show', `${made[0]}:docs/agentdeck/헌장.md`]) + '\n').toBe(card.preview)
    expect(repos.bare(['rev-parse', `${made[0]}~1`])).toBe(repos.bare(['rev-parse', 'master']))
    expect(branch()).toBe('feat/side')
    expect(fs.existsSync(path.join(repos.work, 'docs', 'agentdeck', '헌장.md'))).toBe(false)
    const notice = rig.d.mainRead(repos.work).items.filter((i) => i.kind === 'notice').at(-1)
    expect(notice).toMatchObject({ text: expect.stringContaining('PR #1') })
    expect(repos.bare(['show', '-z', '--name-only', '--format=', made[0]]).split('\0').filter((x) => x.trim() !== '')).toEqual(['docs/agentdeck/헌장.md'])
    expect(rig.d.mainRead(repos.work).tastePr).toEqual({ pr: 1, branch: made[0], doc: 'charter', text: card.preview })
    // 그 PR이 열려 있는 동안의 다음 확정은 두 번째 PR을 열지 않는다
    await rig.actions().proposeTasteDoc({ doc: 'charter', charter: { goal: ['고친 목표다.'], nonGoals: null } })
    const [next] = tasteCards(rig)
    rig.d.answerCard(repos.work, next.requestId, { kind: 'taste', decision: 'confirm' })
    expect((await settled(rig, next.requestId))?.refused).toContain('PR #1')
    expect(gh.prs).toHaveLength(1)
    expect(branch()).toBe('feat/side')
  })

  it('기본 브랜치에서 갈라 옮기자 지금 브랜치에서만 무시되던 파일이 드러나면 커밋·push하지 않고 그 파일을 그대로 둔다', SLOW, async () => {
    repos.git(['checkout', '--quiet', '-b', 'feat/side'])
    fs.writeFileSync(path.join(repos.work, '.gitignore'), '.env\ndist/\n')
    repos.git(['add', '.gitignore'])
    repos.git(['commit', '--quiet', '-m', 'ignore'])
    fs.writeFileSync(path.join(repos.work, '.env'), 'TOKEN=secret\n')
    fs.mkdirSync(path.join(repos.work, 'dist'))
    fs.writeFileSync(path.join(repos.work, 'dist', 'app.js'), 'x\n')
    const rig = await opened()
    await rig.actions().proposeTasteDoc(CHARTER)
    const [card] = tasteCards(rig)
    rig.d.answerCard(repos.work, card.requestId, { kind: 'taste', decision: 'confirm' })
    const after = await settled(rig, card.requestId)
    expect(after?.refused).toContain('.env')
    expect(remoteBranches()).toEqual(['master'])
    expect(gh.prs).toEqual([])
    expect(branch()).toBe('feat/side')
    expect(fs.readFileSync(path.join(repos.work, '.env'), 'utf8')).toBe('TOKEN=secret\n')
    expect(fs.existsSync(path.join(repos.work, 'docs', 'agentdeck', '헌장.md'))).toBe(false)
    const local = repos.git(['for-each-ref', '--format=%(refname:short)', 'refs/heads/agentdeck/'])
    for (const b of local.split('\n').filter((x) => x !== '')) {
      expect(repos.git(['ls-tree', '-r', '--name-only', b])).not.toContain('.env')
    }
  })

  it('실행을 시작하는 중에 온 확정은 쓰지 않는다', SLOW, async () => {
    const rig = await opened()
    await rig.actions().proposeTasteDoc(CHARTER)
    const [card] = tasteCards(rig)
    const starting = rig.d.start(repos.work, 'M1')
    rig.d.answerCard(repos.work, card.requestId, { kind: 'taste', decision: 'confirm' })
    expect((await settled(rig, card.requestId))?.refused).toContain('시작하는 중')
    expect((await starting).reason ?? '').not.toContain('문서를 확정하는 중')
    expect(fs.existsSync(path.join(repos.work, DOCS.runState))).toBe(true)
    expect(remoteBranches().some((b) => b.startsWith('agentdeck/charter-'))).toBe(false)
  })

  it('작업 트리가 더러우면 쓰지 않고 이유를 카드와 대화에 남긴다', SLOW, async () => {
    const rig = await opened()
    fs.writeFileSync(path.join(repos.work, 'scratch.txt'), '정리 안 한 글\n')
    await rig.actions().proposeTasteDoc(CHARTER)
    const [card] = tasteCards(rig)
    rig.d.answerCard(repos.work, card.requestId, { kind: 'taste', decision: 'confirm' })
    const after = await settled(rig, card.requestId)
    expect(after?.refused).toContain('커밋하지 않은 변경')
    expect(rig.d.mainRead(repos.work).tastePr).toBeUndefined()
    expect(remoteBranches()).toEqual(['master'])
    expect(branch()).toBe('master')
    expect(rig.d.mainRead(repos.work).items.filter((i) => i.kind === 'notice').at(-1)).toMatchObject({ text: expect.stringContaining('커밋하지 않은 변경') })
  })

  it('프로젝트 문서를 확정하는 동안에는 실행을 시작하지 않는다', SLOW, async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => { release = r })
    const createPr = gh.createPr.bind(gh)
    gh.createPr = async (req) => { await gate; return createPr(req) }
    const rig = await opened()
    await rig.actions().proposeTasteDoc(CHARTER)
    const [card] = tasteCards(rig)
    rig.d.answerCard(repos.work, card.requestId, { kind: 'taste', decision: 'confirm' })
    for (let i = 0; i < 1000 && !gh.calls.length; i++) {
      if (remoteBranches().some((b) => b.startsWith('agentdeck/charter-'))) break
      await sleep(10)
    }
    const s = await rig.d.start(repos.work, 'M1')
    expect(s.phase).toBe('not-started')
    expect(s.reason).toContain('문서를 확정하는 중')
    expect(fs.existsSync(path.join(repos.work, DOCS.runState))).toBe(false)
    release()
    expect(await settled(rig, card.requestId)).toBeUndefined()
    expect(branch()).toBe('master')
  })

  it('실행 중인 마일스톤이 있으면 쓰지 않는다', SLOW, async () => {
    const rig = await opened()
    await rig.d.start(repos.work, 'M1')
    for (let i = 0; i < 1000 && !(pushed.at(-1)?.mainWaiting ?? false); i++) await sleep(20)
    await rig.actions().proposeTasteDoc(CHARTER)
    const [card] = tasteCards(rig)
    rig.d.answerCard(repos.work, card.requestId, { kind: 'taste', decision: 'confirm' })
    const after = await settled(rig, card.requestId)
    expect(after?.refused).toContain('실행 중인 마일스톤')
    expect(remoteBranches().some((b) => b.startsWith('agentdeck/charter-'))).toBe(false)
  })

  it('「문답 열기」는 지금 문서와 꼴 규칙을 실은 여는 턴을 보내고, 대화에는 짧은 한 줄이 남는다', SLOW, async () => {
    const rig = await opened()
    const before = rig.starts.length
    const r = await rig.d.tasteOpen(repos.work, 'project')
    expect(r.ok).toBe(true)
    for (let i = 0; i < 500 && rig.starts.length === before; i++) await sleep(10)
    const prompt = String(rig.starts.at(-1)?.messages.at(-1)?.content ?? '')
    expect(prompt).toContain('[헌장·Taste 문답]')
    expect(prompt).toContain('### 프로젝트 헌장\n\n(없음)')
    expect(prompt).toContain('## 판정할 수 있는 꼴')
    expect(rig.d.mainRead(repos.work).items.filter((i) => i.kind === 'user').at(-1)).toMatchObject({ text: '프로젝트 헌장·Taste 문답을 열었다' })
    fs.mkdirSync(path.dirname(globalTastePath(tasteDir)), { recursive: true })
    fs.writeFileSync(globalTastePath(tasteDir), '# 전역 Taste\n\n## T1 밀도\n- 원칙: 높게\n')
    const n = rig.starts.length
    expect((await rig.d.tasteOpen(repos.work, 'global')).ok).toBe(true)
    for (let i = 0; i < 500 && rig.starts.length === n; i++) await sleep(10)
    expect(String(rig.starts.at(-1)?.messages.at(-1)?.content ?? '')).toContain('## T1 밀도\n- 원칙: 높게')
    expect((await driver().d.tasteOpen(path.join(repos.root, 'nowhere'), 'global')).ok).toBe(false)
  })
})
