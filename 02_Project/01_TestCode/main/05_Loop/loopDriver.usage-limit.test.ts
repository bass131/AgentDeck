import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentBackend, AgentRun, AgentRunInput } from '@main/03_Agent/AgentBackend'
import { loopPathReason } from '@main/04_Claude/permission/loopLock'
import { createFileDigestStore, repoKeyOf, stateDigest } from '@main/05_Loop/digestStore'
import { limitInjectFileOf } from '@main/05_Loop/limitInjection'
import { createLoopDriver, recheckOnResume, type LoopDriver } from '@main/05_Loop/loopDriver'
import { createLoopNotifier } from '@main/05_Loop/loopNotifier'
import type { MainActions } from '@main/05_Loop/mainChat'
import { createRunState, type RunState } from '@main/05_Loop/runState'
import { DOCS, runStateText } from '@main/05_Loop/survivalDocs'
import type { AgentEvent } from '@shared/agentEvents'
import type { LoopStatus } from '@shared/ipcContract'
import { BareGh } from '../00_Helpers/bareGh'
import { drive, findRawNode, loaded, variantText } from '../00_Helpers/loopFakes'
import { makeTempRepos, type TempRepos } from '../00_Helpers/tempGit'

const SLOW = { timeout: 300_000 }
const OK_CMD = 'node -e "process.exit(0)"'
const TEMPLATE = loaded(variantText((raw) => {
  for (const id of ['checks', 'regression']) (findRawNode(raw, id).rule as { commands: string[] }).commands = [OK_CMD]
}))
const START = Date.parse('2026-11-21T09:00:00Z')
const HOUR = 3_600_000
const DECOMPOSE = '승인된 마일스톤 스펙을 goal로'

// 분해 노드만 쓴다. limits에 남은 사건 묶음이 있으면 분해 세션 하나가 그것을 먼저 내고 끝나기를 기다린다
function fakeBackend(limits: AgentEvent[][]): { backend: AgentBackend; starts: AgentRunInput[] } {
  const starts: AgentRunInput[] = []
  const backend: AgentBackend = {
    id: 'claude-code',
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    listSupportedCommands: () => [],
    start(req): AgentRun {
      starts.push(req)
      const root = req.workspaceRoot as string
      const prompt = String(req.messages[0].content)
      let stop: () => void = () => {}
      const stopped = new Promise<void>((r) => { stop = r })
      const limit = prompt.startsWith(DECOMPOSE) ? limits.shift() : undefined
      return {
        events: (async function* (): AsyncGenerator<AgentEvent> {
          yield { type: 'session', sessionId: `S${starts.length}` }
          if (req.loopLock?.readOnly) {
            yield { type: 'text', delta: '완료조건을 채웠다.\nVERDICT: pass' }
            yield { type: 'done' }
            return
          }
          if (limit) {
            for (const e of limit) yield e
            await stopped
            return
          }
          if (prompt.startsWith(DECOMPOSE)) {
            fs.mkdirSync(path.join(root, DOCS.goalsDir), { recursive: true })
            fs.writeFileSync(path.join(root, DOCS.goalsDir, 'G1.md'), '# 덧셈\n\n만들 것: src/add.ts\n')
          }
          yield { type: 'done' }
        })(),
        abort() { stop() },
        interrupt() {},
        push() {},
        respond() {},
      }
    },
  }
  return { backend, starts }
}

let repos: TempRepos
let gh: BareGh
let appData: string
let pushed: LoopStatus[] = []
const clock = { ms: START }
const drivers: LoopDriver[] = []

interface Rig { d: LoopDriver; starts: AgentRunInput[]; actions: () => MainActions }
function driver(limits: AgentEvent[][] = [], over: { limitPollMs?: number; onState?: (s: LoopStatus) => void; limitInjectFile?: string } = {}): Rig {
  const { backend, starts } = fakeBackend(limits)
  let actions: MainActions | null = null
  const d = createLoopDriver({
    appDataDir: appData, backend, ciRetryMs: 20, humanPollMs: 20, limitPollMs: over.limitPollMs ?? 3_600_000,
    openExtras: {
      gh, template: TEMPLATE, executorEnv: repos.env, commandTimeoutMs: 60_000, clock: { now: () => new Date(clock.ms).toISOString() },
      ...(over.limitInjectFile ? { limitInjectFile: over.limitInjectFile } : {}),
    },
    onState: over.onState ?? ((s) => { pushed.push(s) }),
    mainTools: async (a) => { actions = a; return null },
  })
  drivers.push(d)
  return { d, starts, actions: () => actions as MainActions }
}

async function until(pred: (s: LoopStatus) => boolean, what: string, ms = 120_000): Promise<LoopStatus> {
  const t0 = Date.now()
  for (;;) {
    const last = pushed.at(-1)
    if (last && pred(last)) return last
    if (Date.now() - t0 > ms) throw new Error(`${what}에 닿지 않았다 — 마지막 상태: ${JSON.stringify(pushed.at(-1))}`)
    await new Promise((r) => setTimeout(r, 20))
  }
}
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
// 분해 뒤에도 실행이 이어지므로 화면이 아니라 디스크의 상태(분해가 남긴 goal)를 본다
async function decomposePassed(ms = 120_000): Promise<void> {
  const t0 = Date.now()
  const passed = (): boolean => { try { return onDisk().goals.length > 0 } catch { return false } }
  while (!passed()) {
    if (Date.now() - t0 > ms) throw new Error(`분해 통과에 닿지 않았다 — 마지막 상태: ${JSON.stringify(pushed.at(-1))}`)
    await sleep(20)
  }
}
const stateFile = (): string => path.join(repos.work, DOCS.runState)
const onDisk = (): RunState => JSON.parse(fs.readFileSync(stateFile(), 'utf8')) as RunState
const decomposeRuns = (r: Rig): number => r.starts.filter((s) => String(s.messages[0].content).startsWith(DECOMPOSE)).length
const rejected = (resetsAtMs: number): AgentEvent[] => [{ type: 'rate_limit', status: 'rejected', rateLimitType: 'five_hour', resetsAt: Math.floor(resetsAtMs / 1000) }]

// 승인까지 끝난 실행을 디스크에 둔다 — 다음 노드는 milestone-branch(실물 git), 그다음이 분해 세션이다
async function plantApproved(): Promise<void> {
  const made = createRunState(TEMPLATE.template, TEMPLATE.hash, 'M1', 'master')
  if (!made.ok) throw new Error(made.reason)
  const state = drive(TEMPLATE.template, made.state, { until: 'milestone-branch' }).state
  const text = runStateText(state)
  const key = repoKeyOf(fs.realpathSync.native(repos.work))
  const store = createFileDigestStore(path.join(appData, 'digests'))
  fs.mkdirSync(path.join(repos.work, DOCS.dir), { recursive: true })
  fs.writeFileSync(stateFile(), text)
  fs.writeFileSync(path.join(repos.work, DOCS.milestoneSpec), '# M1 스펙\n\n만들 것: 덧셈\n')
  await store.writeCopy(key, text)
  await store.write(key, stateDigest(JSON.parse(text)))
}

async function limitedRig(limits: AgentEvent[][], over: { limitPollMs?: number } = {}): Promise<Rig> {
  await plantApproved()
  const rig = driver(limits, over)
  await rig.d.open({ cwd: repos.work })
  await until((s) => s.phase === 'limit', '사용량 한도 멈춤')
  return rig
}

beforeEach(() => {
  repos = makeTempRepos('agentdeck-g4-limit-')
  gh = new BareGh(repos)
  appData = path.join(repos.root, 'appdata')
  pushed = []
  clock.ms = START
})
afterEach(async () => {
  for (const d of drivers.splice(0)) await d.closeAll()
  repos.cleanup()
})

describe('한도 멈춤의 화면과 알림', () => {
  it('거부를 받은 분해 세션은 한도 멈춤으로 보인다 — 사유·풀리는 시각·사용률(모름), 「나중」 알림이고 Windows 알림은 없다', SLOW, async () => {
    await plantApproved()
    const shown: string[] = []
    const notifier = createLoopNotifier({ appDataDir: path.join(appData, 'alerts'), notify: { show: (n) => { shown.push(n.body) } } })
    const rig = driver([rejected(START + HOUR)], { onState: (s) => { pushed.push(s); void notifier.observe(s) } })
    await rig.d.open({ cwd: repos.work })
    const s = await until((x) => x.phase === 'limit', '사용량 한도 멈춤')
    expect(s.node).toBe('decompose')
    expect(s.limit).toEqual({
      reason: 'rejected', window: 'five_hour', resetsAt: new Date(START + HOUR).toISOString(),
      resumeAt: new Date(START + HOUR + 120_000).toISOString(), utilization: null, human: false,
    })
    expect(s.reason).toContain('사용률 모름')
    await sleep(200)
    expect(notifier.list()).toEqual([expect.objectContaining({ phase: 'limit', level: 'later', node: 'decompose' })])
    expect(shown).toEqual([])
    const events = rig.d.mainRead(repos.work).items.flatMap((i) => (i.kind === 'event' ? [i.event.kind] : []))
    expect(events).toContain('usage-limit')
    expect(onDisk()).toMatchObject({ status: 'usage-limit', failCount: 0 })
    expect(fs.readFileSync(path.join(repos.work, DOCS.verification), 'utf8')).toMatch(/\n사용량 한도 멈춤: 사용량 한도\(거부, five_hour 창\)/)
  })

  it('「지금 이어 가기」는 줄 없이 같은 노드를 다시 돌린다 — 화면이 본 노드가 아니면 받지 않는다', SLOW, async () => {
    const rig = await limitedRig([rejected(START + HOUR)])
    const lines = onDisk().lines.length
    expect((await rig.d.decide({ cwd: repos.work, verdict: 'pass', evidence: '이어 간다', expectNode: 'G1/implement' })).ok).toBe(false)
    expect((await rig.d.decide({ cwd: repos.work, verdict: 'fail', evidence: '이어 간다', expectNode: 'decompose' })).ok).toBe(false)
    expect((await rig.d.decide({ cwd: repos.work, verdict: 'pass', evidence: '이어 간다', expectNode: 'decompose' })).ok).toBe(true)
    await decomposePassed()
    expect(decomposeRuns(rig)).toBe(2)
    const after = onDisk()
    expect(after.lines.slice(lines).map((l) => l.marker)).not.toContain('USER-INPUT')
    expect(after.usageLimit).toBeUndefined()
  })
})

describe('자동 이어 가기 — 벽시계와 깨어남', () => {
  it('시계가 건너뛰면 다음 점검에서 이어 간다 — 긴 타이머 하나에 기대지 않는다', SLOW, async () => {
    const rig = await limitedRig([rejected(START + HOUR)], { limitPollMs: 30 })
    await sleep(200)
    expect(pushed.at(-1)?.phase).toBe('limit')
    clock.ms = START + 5 * HOUR
    await decomposePassed()
    expect(decomposeRuns(rig)).toBe(2)
    const events = rig.d.mainRead(repos.work).items.flatMap((i) => (i.kind === 'event' ? [i.event.kind] : []))
    expect(events).toContain('limit-resumed')
  })

  it('잠에서 깨어나면(powerMonitor resume) 바로 다시 본다', SLOW, async () => {
    const rig = await limitedRig([rejected(START + HOUR)])
    clock.ms = START + 2 * HOUR
    await sleep(200)
    expect(pushed.at(-1)?.phase).toBe('limit')
    const handlers: (() => void)[] = []
    recheckOnResume({ on: (_ev, fn) => { handlers.push(fn) } }, rig.d)
    for (const h of handlers) h()
    await decomposePassed()
  })

  it('풀리는 시각을 모르면 시각이 아무리 지나도 스스로 이어 가지 않는다', SLOW, async () => {
    const rig = await limitedRig([[{ type: 'rate_limit_error' }]], { limitPollMs: 30 })
    expect(pushed.at(-1)?.limit).toMatchObject({ reason: 'error', resetsAt: null, resumeAt: null })
    clock.ms = START + 100 * HOUR
    rig.d.recheck()
    await sleep(300)
    expect(pushed.at(-1)?.phase).toBe('limit')
    expect(decomposeRuns(rig)).toBe(1)
  })

  // 점검은 recheck로만 돌린다 — 뒤에서 도는 점검이 깃발을 올리는 순간과 겹치지 않게
  it('일시 정지 깃발과 위조 래치를 넘지 않는다', SLOW, async () => {
    const rig = await limitedRig([rejected(START + HOUR)])
    // 메인 도구(깃발)는 메인 대화의 턴이 열릴 때 생긴다
    rig.d.mainSend(repos.work, '잠깐 멈춰 둬')
    for (let i = 0; i < 250 && rig.d.mainRead(repos.work).busy; i++) await sleep(20)
    await rig.actions().pause()
    await sleep(100)
    clock.ms = START + 2 * HOUR
    rig.d.recheck()
    await sleep(300)
    expect(pushed.at(-1)).toMatchObject({ phase: 'limit', paused: true })
    expect(onDisk().status).toBe('usage-limit')
    const tampered = { ...onDisk(), haltReason: '밖에서 고친 사유' }
    fs.writeFileSync(stateFile(), runStateText(tampered))
    await rig.actions().resume()
    await until((s) => s.phase === 'latched', '위조 래치')
    await sleep(300)
    expect(onDisk()).toMatchObject({ status: 'usage-limit', haltReason: '밖에서 고친 사유' })
    expect(decomposeRuns(rig)).toBe(1)
  })
})

describe('주입 자리 — goal 5 실주행이 켜는 길', () => {
  it('openExtras.limitInjectFile이 있으면 앱 영역 주입 파일의 거부가 실물 세션 사건처럼 한도 멈춤을 만든다. 그 파일은 노드 세션이 쓸 수 없는 곳이다', SLOW, async () => {
    await plantApproved()
    const file = limitInjectFileOf({ AGENTDECK_E2E_RATE_LIMIT: '1' }, appData) as string
    expect(loopPathReason(file, { repoRoot: repos.work, appLoopDir: appData })).not.toBeNull()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({
      session: 'work', promptIncludes: DECOMPOSE,
      messages: [{ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', resetsAt: Math.floor((START + HOUR) / 1000) } }],
    }))
    const rig = driver([], { limitInjectFile: file })
    await rig.d.open({ cwd: repos.work })
    const s = await until((x) => x.phase === 'limit', '주입한 한도 멈춤')
    expect(s.limit).toMatchObject({ reason: 'rejected', window: 'five_hour' })
    expect(fs.existsSync(file)).toBe(false)
  })
})

describe('재기동 — 디스크의 한도 멈춤에서 다시 연다', () => {
  it('앱 종료(closeAll) 뒤 새 구동자의 부팅 다시 열기(reopenLast)가 시각이 지난 한도 멈춤을 이어 간다', SLOW, async () => {
    const first = await limitedRig([rejected(START + HOUR)])
    await first.d.closeAll()
    expect(onDisk().status).toBe('usage-limit')
    clock.ms = START + 2 * HOUR
    pushed = []
    const second = driver()
    await second.d.reopenLast()
    await decomposePassed()
    expect(decomposeRuns(second)).toBe(1)
  })

  it('시각 전에 재기동하면 한도 멈춤으로 다시 열리고, 시각이 지난 뒤에 이어 간다', SLOW, async () => {
    const first = await limitedRig([rejected(START + HOUR)])
    await first.d.closeAll()
    clock.ms = START + HOUR / 2
    pushed = []
    const second = driver()
    await second.d.reopenLast()
    await until((s) => s.phase === 'limit', '다시 연 한도 멈춤')
    await sleep(200)
    expect(second.starts).toHaveLength(0)
    expect(onDisk().status).toBe('usage-limit')
    clock.ms = START + 2 * HOUR
    second.d.recheck()
    await decomposePassed()
    expect(decomposeRuns(second)).toBe(1)
  })

  it('사람이 닫은 실행기는 부팅 때 다시 열지 않는다 — 한도 멈춤은 디스크에 그대로다', SLOW, async () => {
    const first = await limitedRig([rejected(START + HOUR)])
    await first.d.close(repos.work)
    clock.ms = START + 2 * HOUR
    pushed = []
    const second = driver()
    await second.d.reopenLast()
    await sleep(300)
    expect(second.d.status(repos.work).phase).toBe('closed')
    expect(second.starts).toHaveLength(0)
    expect(onDisk().status).toBe('usage-limit')
  })
})
