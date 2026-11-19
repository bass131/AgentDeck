// M10 G2 구동자와 메인 대화 — 실 git(임시 작업 저장소 + bare 원격) + 가짜 gh + 대본 백엔드로 프로덕션 createLoopDriver를 돈다.
// 고정하는 것:
//   - 브레인스토밍은 메인 대화의 여러 턴이다. 턴이 스펙 없이 끝나면 FAIL이 아니라 사람 기다림(mainWaiting)이고 검증 줄이 늘지 않는다.
//     사람의 말이 같은 세션으로 가고(resume), 스펙이 바뀌면 승인 카드가 뜬다. 쓰기 창은 브레인스토밍 동안만 열린다.
//   - 메인의 「멈춤」은 구동자의 일시 정지 깃발이다 — 실행 상태·검증 기록을 바꾸지 않고, 지금 노드가 끝나면 다음 노드로 가지 않는다.
//     「이어 가기」는 깃발만 내린다. 스펙 승인 게이트는 여전히 사람의 판정(decide)으로만 지난다. 메인 동작은 USER-INPUT 줄을 쓰지 않는다.
//   - 사건 줄(스펙 승인·깃발 올림 flag-raised·깃발 내림 flag-lowered·Backlog)은 모델 없이 대화 기록에 남는다 — 깃발 사건은 사람이 멈춘
//     실행을 이어 간 사건(resumed)과 이름이 다르다(G2 독립 검수). 세션 사건은 꼬리표(key main·kind main·SDK 세션 id)와 함께 나간다.
//   - 멈춘 실행(needs-user)의 사람 이어 가기도 앱 「자동」 모드 허용 노드가 꺼져 있으면 받지 않는다(G2 독립 검수).
//   - 새 메인 대화는 지난 장을 보관한다. 닫힌 저장소의 대화는 앱 영역 파일에서 읽힌다(root null). 열리지 않은 저장소에는 보내지 못한다.
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentBackend, AgentRun, AgentRunInput } from '@main/03_Agent/AgentBackend'
import { createLoopDriver, type LoopDriver } from '@main/05_Loop/loopDriver'
import type { MainActions } from '@main/05_Loop/mainChat'
import { BACKLOG_PATH } from '@main/05_Loop/mainChatTools'
import { DOCS } from '@main/05_Loop/survivalDocs'
import type { AgentEvent } from '@shared/agentEvents'
import type { LoopSessionEventPayload, LoopStatus, MainChatView } from '@shared/13_Loop/loop'
import { BareGh } from '../00_Helpers/bareGh'
import { findRawNode, loaded, variantText } from '../00_Helpers/loopFakes'
import { makeTempRepos, type TempRepos } from '../00_Helpers/tempGit'

const SLOW = { timeout: 300_000 }
const OK_CMD = 'node -e "process.exit(0)"'
const TEMPLATE = loaded(variantText((raw) => {
  for (const id of ['checks', 'regression']) (findRawNode(raw, id).rule as { commands: string[] }).commands = [OK_CMD]
}))

// 브레인스토밍 여는 턴은 글로 묻고 끝낸다(스펙 없음). 사람이 「덧셈」을 말하면 결정 대장과 스펙을 쓴다.
// hangMain: 사람 글에 「오래」가 있으면 메인 턴이 멈출 때까지 돈다(M10 G3 — 취소 대상 시험)
function chatBackend(opts: { hangDecompose?: boolean; hangMain?: boolean } = {}): { backend: AgentBackend; starts: AgentRunInput[] } {
  const starts: AgentRunInput[] = []
  let seq = 0
  const backend: AgentBackend = {
    id: 'claude-code',
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    listSupportedCommands: () => [],
    start(req): AgentRun {
      starts.push(req)
      const root = req.workspaceRoot as string
      const prompt = String(req.messages.at(-1)?.content ?? '')
      const write = (rel: string, text: string): void => {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
        fs.writeFileSync(path.join(root, rel), text)
      }
      let stop: () => void = () => {}
      const stopped = new Promise<void>((r) => { stop = r })
      return {
        events: (async function* (): AsyncGenerator<AgentEvent> {
          yield { type: 'session', sessionId: req.resumeSessionId ?? `S${++seq}` }
          if (opts.hangDecompose && prompt.startsWith('승인된 마일스톤 스펙을 goal로')) { await stopped; return }
          if (opts.hangMain && prompt.includes('오래')) { await stopped; return }
          if (req.loopLock?.readOnly) {
            yield { type: 'text', delta: '완료조건을 채웠다.\nVERDICT: pass', messageId: 'r1' }
          } else if (prompt.startsWith('사람과 다음 마일스톤')) {
            yield { type: 'text', delta: '범위는 무엇으로 할까?', messageId: 'b1' }
          } else if (prompt.includes('덧셈')) {
            write(DOCS.decisions, '# 결정 대장\n- [USER] 덧셈으로 한다\n')
            write(DOCS.milestoneSpec, '# M1 스펙\n\n만들 것: 덧셈\n')
            yield { type: 'text', delta: '초안을 썼다', messageId: 'b2' }
          } else if (prompt.startsWith('승인된 마일스톤 스펙을 goal로')) {
            write('.agentdeck/goals/G1.md', '# 덧셈\n\n만들 것: src/add.ts\n')
          } else if (prompt.includes('.agentdeck/goals/G1.md')) {
            write('src/add.ts', 'export const add = 1\n')
          } else {
            yield { type: 'text', delta: '알았다', messageId: 'x' }
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
const drivers: LoopDriver[] = []
let pushed: LoopStatus[] = []
let views: MainChatView[] = []
let tagged: LoopSessionEventPayload[] = []

interface Rig { d: LoopDriver; starts: AgentRunInput[]; actions: () => MainActions }
function driver(over: { hangDecompose?: boolean; hangMain?: boolean; autoModeCheck?: () => string | null } = {}): Rig {
  const { backend, starts } = chatBackend(over)
  let actions: MainActions | null = null
  const d = createLoopDriver({
    appDataDir: appData, backend, ciRetryMs: 20, humanPollMs: 20,
    ...(over.autoModeCheck ? { autoModeCheck: over.autoModeCheck } : {}),
    openExtras: { gh, template: TEMPLATE, executorEnv: repos.env, commandTimeoutMs: 60_000 },
    onState: (s) => { pushed.push(s) },
    onMainState: (v) => { views.push(v) },
    onSessionEvent: (p) => { tagged.push(p) },
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
const runState = (): { lines: { marker: string }[]; failCount: number } => JSON.parse(fs.readFileSync(path.join(repos.work, DOCS.runState), 'utf8'))
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function toApproval(rig: Rig): Promise<LoopStatus> {
  const CWD = repos.work
  await rig.d.open({ cwd: CWD })
  await rig.d.start(CWD, 'M1')
  await until((s) => s.mainWaiting, '브레인스토밍 사람 기다림')
  expect(rig.d.mainSend(CWD, '덧셈으로 하자').ok).toBe(true)
  return until((s) => s.phase === 'waiting-human' && s.approval !== null, '스펙 승인')
}

// 스펙을 승인하고 goal 나누기 세션(멈춰 있는 작업자 노드)을 화면에서 취소한다 — 취소는 FAIL이 아니라 멈춤(needs-user)이다
async function toHalted(rig: Rig): Promise<LoopStatus> {
  const CWD = repos.work
  const approval = await toApproval(rig)
  expect((await rig.d.decide({ cwd: CWD, verdict: 'pass', evidence: '봤다', specSha256: approval.approval?.sha256 as string })).ok).toBe(true)
  await until((s) => s.node === 'decompose' && s.sessionActive, 'goal 나누기 세션')
  // 상태는 세션을 열기 직전에 push된다 — 세션이 열릴 때까지 다시 누른다
  let cancelled = false
  for (let i = 0; i < 200 && !cancelled; i++) { cancelled = rig.d.cancelSession(CWD, 'worker'); if (!cancelled) await sleep(20) }
  expect(cancelled).toBe(true)
  return until((s) => s.phase === 'halted', '멈춤')
}

beforeEach(() => {
  repos = makeTempRepos('agentdeck-g2-main-')
  gh = new BareGh(repos)
  appData = path.join(repos.root, 'appdata')
  pushed = []
  views = []
  tagged = []
})
afterEach(async () => {
  for (const d of drivers.splice(0)) await d.closeAll()
  repos.cleanup()
})

describe('브레인스토밍은 메인 대화의 여러 턴이다 (M10 G2)', () => {
  it('스펙 없이 끝난 턴은 FAIL이 아니라 사람 기다림이고, 사람 말 뒤 스펙이 바뀌면 승인 카드가 뜬다', SLOW, async () => {
    const rig = driver()
    const CWD = repos.work
    await rig.d.open({ cwd: CWD })
    await rig.d.start(CWD, 'M1')
    const waiting = await until((s) => s.mainWaiting, '사람 기다림')
    expect(waiting).toMatchObject({ phase: 'running', node: 'brainstorm', failCount: 0, mainBusy: false })
    expect(runState().lines).toEqual([])
    const canWrite = rig.starts[0].loopLock?.mainChat?.canWrite as () => Promise<boolean>
    expect(await canWrite()).toBe(true)
    // 기다리는 동안 턴이 저절로 돌지 않는다
    await sleep(150)
    expect(rig.starts).toHaveLength(1)
    expect(rig.d.mainRead(CWD).waitingUser).toBe(true)

    expect(rig.d.mainSend(CWD, '덧셈으로 하자').ok).toBe(true)
    const approval = await until((s) => s.phase === 'waiting-human' && s.approval !== null, '스펙 승인')
    expect(approval.approval?.spec).toContain('덧셈')
    expect(approval.failCount).toBe(0)
    expect(rig.starts[1].resumeSessionId).toBe('S1')
    expect(rig.starts[1].systemPrompt).toContain('사람 판정은 사람만 한다')
    expect(await canWrite()).toBe(false)
    const view = rig.d.mainRead(CWD)
    expect(view.items.filter((i) => i.kind === 'assistant').map((i) => i.kind === 'assistant' && i.text)).toEqual(['범위는 무엇으로 할까?', '초안을 썼다'])
    expect(view.items.find((i) => i.kind === 'user')).toMatchObject({ text: '덧셈으로 하자', state: 'sent' })
    expect(view.brainstorming).toBe(false)
    expect(views.length).toBeGreaterThan(0)
    // 세션 사건 꼬리표 — 메인 대화는 key main, SDK 세션 id
    const main = tagged.filter((p) => p.session.kind === 'main')
    expect(main.length).toBeGreaterThan(0)
    expect(main.every((p) => p.session.key === 'main' && p.session.sessionId === 'S1' && p.cwd === CWD)).toBe(true)
  })
})

describe('멈춤은 일시 정지 깃발이다 (M10 G2)', () => {
  it('실행 상태·검증 기록을 바꾸지 않고, 이어 가기는 깃발만 내린다 — 스펙 승인은 사람 판정으로만 지난다', SLOW, async () => {
    const rig = driver()
    const CWD = repos.work
    const approval = await toApproval(rig)
    const stateFile = path.join(repos.work, DOCS.runState)
    const before = fs.readFileSync(stateFile, 'utf8')
    const verification = fs.readFileSync(path.join(repos.work, DOCS.verification), 'utf8')

    await rig.actions().pause()
    expect((await until((s) => s.paused, '멈춤 깃발')).phase).toBe('waiting-human')
    // 이어 가기는 깃발만 내린다 — 승인 게이트를 지나지 않는다
    await rig.actions().resume()
    const resumed = await until((s) => !s.paused, '깃발 내림')
    expect(resumed.phase).toBe('waiting-human')
    expect(resumed.approval).not.toBeNull()
    expect(fs.readFileSync(stateFile, 'utf8')).toBe(before)
    expect(fs.readFileSync(path.join(repos.work, DOCS.verification), 'utf8')).toBe(verification)

    // 멈춘 채 사람이 승인하면 판정은 받지만 다음 노드로 가지 않는다
    await rig.actions().pause()
    await until((s) => s.paused, '다시 멈춤')
    const ok = await rig.d.decide({ cwd: CWD, verdict: 'pass', evidence: '범위에 동의한다', specSha256: approval.approval?.sha256 as string })
    expect(ok.ok).toBe(true)
    await sleep(200)
    const held = rig.d.status(CWD)
    expect(held.node).toBe('milestone-branch')
    expect(held.paused).toBe(true)
    const lines = runState().lines
    await rig.actions().resume()
    await until((s) => s.node !== 'milestone-branch' && !s.paused, '이어 감')
    // 메인 동작(멈춤·이어 가기)은 USER-INPUT 줄을 쓰지 않는다 — 사람 승인 한 줄만 늘었다
    expect(lines.filter((l) => l.marker === 'USER-INPUT')).toHaveLength(0)
    expect(runState().lines.filter((l) => l.marker === 'USER-INPUT')).toHaveLength(0)
    const kinds = rig.d.mainRead(CWD).items.flatMap((i) => (i.kind === 'event' ? [i.event.kind] : []))
    // G2 독립 검수 — 메인의 깃발 사건은 사람이 멈춘 실행을 이어 간 사건(resumed)과 이름이 다르다
    expect(kinds).toEqual(expect.arrayContaining(['flag-raised', 'flag-lowered', 'spec-approved']))
    expect(kinds).not.toContain('resumed')
  })

  it('Backlog 한 줄은 실행기 코드가 .agentdeck/backlog.md에 붙이고 사건으로 남는다', SLOW, async () => {
    const rig = driver()
    const CWD = repos.work
    await rig.d.open({ cwd: CWD })
    await rig.d.start(CWD, 'M1')
    await until((s) => s.mainWaiting, '사람 기다림')
    expect(await rig.actions().appendBacklog('설정 화면 정리')).toContain('적었다')
    expect(await rig.actions().appendBacklog('두\n줄')).not.toContain('적었다')
    expect(fs.readFileSync(path.join(repos.work, BACKLOG_PATH), 'utf8')).toBe('# Backlog\n- 설정 화면 정리\n')
    expect(rig.d.mainRead(CWD).items.some((i) => i.kind === 'event' && i.event.kind === 'backlog')).toBe(true)
    expect(runState().lines).toEqual([])
  })
})

describe('멈춤·래치 동안 메인은 아무것도 풀지 못한다 (M10 G2)', () => {
  it('상태 파일을 밖에서 고쳐 래치가 걸리면 쓰기 창이 닫히고, 이어 가기는 상태 파일을 바꾸지 않는다', SLOW, async () => {
    const rig = driver()
    const CWD = repos.work
    await rig.d.open({ cwd: CWD })
    await rig.d.start(CWD, 'M1')
    await until((s) => s.mainWaiting, '사람 기다림')
    const canWrite = rig.starts[0].loopLock?.mainChat?.canWrite as () => Promise<boolean>
    expect(await canWrite()).toBe(true)
    const file = path.join(repos.work, DOCS.runState)
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { milestoneBase: string | null }
    raw.milestoneBase = 'd'.repeat(40)
    const forged = JSON.stringify(raw, null, 2)
    fs.writeFileSync(file, forged)
    expect(await canWrite()).toBe(false)
    expect((await rig.d.open({ cwd: CWD })).phase).toBe('latched')
    await rig.actions().pause()
    await rig.actions().resume()
    await sleep(100)
    expect(rig.d.status(CWD).phase).toBe('latched')
    expect(fs.readFileSync(file, 'utf8')).toBe(forged)
    // 래치 사건은 구동(kick)이 load에서 본 뒤 남긴다 — 전체 시험이 함께 돌 때는 늦을 수 있어 기다린다
    const latchedEvent = (): boolean => rig.d.mainRead(CWD).items.some((i) => i.kind === 'event' && i.event.kind === 'latched')
    for (let i = 0; i < 250 && !latchedEvent(); i++) await sleep(20)
    expect(latchedEvent()).toBe(true)
  })

  it('멈춘 실행(needs-user)에서 이어 가기 도구는 깃발만 내린다 — 실행은 사람의 이어 가기를 기다리고, 멈춤은 경계 턴으로 알린다', SLOW, async () => {
    const rig = driver({ hangDecompose: true })
    const CWD = repos.work
    // 화면의 취소 — 메인 대화가 쉬고 있으면 작업 세션을 멈춘다(취소는 FAIL이 아니라 멈춤)
    const halted = await toHalted(rig)
    expect(halted.failCount).toBe(0)
    const file = path.join(repos.work, DOCS.runState)
    const before = fs.readFileSync(file, 'utf8')
    await rig.actions().pause()
    await rig.actions().resume()
    await sleep(150)
    expect(rig.d.status(CWD).phase).toBe('halted')
    expect(fs.readFileSync(file, 'utf8')).toBe(before)
    expect(rig.d.mainRead(CWD).items.some((i) => i.kind === 'event' && i.event.kind === 'halt')).toBe(true)
    for (let i = 0; i < 200 && !rig.starts.some((s) => String(s.messages.at(-1)?.content).startsWith('[실행기 사건]')); i++) await sleep(20)
    const told = rig.starts.map((s) => String(s.messages.at(-1)?.content)).filter((p) => p.startsWith('[실행기 사건]'))
    expect(told).toHaveLength(1)
    expect(told[0]).toContain('멈췄다')
  })

  // G2 독립 검수 — 사람의 이어 가기(decide의 멈춘 실행 갈래)도 앱 「자동」 모드 허용 노드를 본다. 꺼진 채 받으면 작업자 노드가 거부돼 FAIL이 쌓인다
  it('멈춘 실행의 이어 가기는 자동 모드 허용 노드가 꺼져 있으면 받지 않는다 — 실행 상태는 그대로다', SLOW, async () => {
    let off = false
    const rig = driver({ hangDecompose: true, autoModeCheck: () => (off ? '컨트롤 노드 mode-auto-bypass-allow가 꺼져 있다' : null) })
    const CWD = repos.work
    await toHalted(rig)
    const file = path.join(repos.work, DOCS.runState)
    const before = fs.readFileSync(file, 'utf8')
    off = true
    const resume = await rig.d.decide({ cwd: CWD, verdict: 'pass', evidence: '다시 돌린다' })
    expect(resume.ok).toBe(false)
    expect(resume.reason).toContain('mode-auto-bypass-allow')
    expect(fs.readFileSync(file, 'utf8')).toBe(before)
    expect((JSON.parse(before) as { status: string }).status).toBe('needs-user')
  })
})

describe('새로 시작한 실행은 새 방문이다 (M10 G2)', () => {
  it('실행 상태를 지우고 같은 마일스톤 id로 다시 시작하면 방문 키가 같아도 여는 턴을 다시 보낸다', SLOW, async () => {
    const rig = driver()
    const CWD = repos.work
    await rig.d.open({ cwd: CWD })
    await rig.d.start(CWD, 'M1')
    await until((s) => s.mainWaiting, '첫 실행의 사람 기다림')
    await rig.d.close(CWD)
    fs.rmSync(path.join(repos.work, DOCS.runState))
    fs.rmSync(path.join(appData, 'digests'), { recursive: true, force: true })
    pushed = []
    expect((await rig.d.open({ cwd: CWD })).phase).toBe('not-started')
    const opening = (): number => rig.starts.filter((s) => String(s.messages.at(-1)?.content).startsWith('사람과 다음 마일스톤')).length
    expect(opening()).toBe(1)
    await rig.d.start(CWD, 'M1')
    for (let i = 0; i < 250 && opening() < 2; i++) await sleep(20)
    expect(opening()).toBe(2)
    await until((s) => s.mainWaiting, '다시 시작한 실행의 사람 기다림')
    expect(runState().lines).toEqual([])
  })
})

describe('메인 대화의 IPC 몫 (M10 G2)', () => {
  it('열리지 않은 저장소에는 보내지 못하고, 새 메인 대화는 지난 장을 보관하며, 닫은 뒤에도 기록이 읽힌다', SLOW, async () => {
    const rig = driver()
    const CWD = repos.work
    const closed = rig.d.mainSend(CWD, '안녕')
    expect(closed.ok).toBe(false)
    expect((await rig.d.mainNew(CWD)).ok).toBe(false)
    await rig.d.open({ cwd: CWD })
    await rig.d.start(CWD, 'M1')
    await until((s) => s.mainWaiting, '사람 기다림')
    expect(rig.d.mainSend(CWD, '   ').ok).toBe(false)
    const fresh = await rig.d.mainNew(CWD)
    expect(fresh.ok).toBe(true)
    expect(fs.readdirSync(path.join(appData, 'main-archive'))).toHaveLength(1)
    for (let i = 0; i < 500; i++) {
      const v = rig.d.mainRead(CWD)
      if (v.sessionId === 'S2' && !v.busy && v.waitingUser) break
      await sleep(20)
    }
    expect(rig.starts.at(-1)?.resumeSessionId).toBeUndefined()
    expect(String(rig.starts.at(-1)?.messages.at(-1)?.content).startsWith('사람과 다음 마일스톤')).toBe(true)
    await rig.d.close(CWD)
    const after = rig.d.mainRead(CWD)
    expect(after.root).toBeNull()
    expect(after.sessionId).toBe('S2')
    expect(after.items.some((i) => i.kind === 'assistant')).toBe(true)
  })
})

// M10 G3 — 화면의 판정 경계(main 쪽). 사람이 깃발을 내리는 길(lowerFlag)과 대상을 고른 취소(cancelSession(cwd, target)).
// 둘 다 판정이 아니다 — USER-INPUT 줄을 만들지 않고, 깃발 내리기와 메인 턴 취소는 실행 상태·검증 기록을 바꾸지 않는다.
// 작업 세션 취소의 멈춤(needs-user)은 실행기의 기존 판정(M09 G4 — 취소는 FAIL이 아니라 stop)이다.
const userInputs = (): number => runState().lines.filter((l) => l.marker === 'USER-INPUT').length
const eventsOf = (rig: Rig): { kind: string; text: string }[] =>
  rig.d.mainRead(repos.work).items.flatMap((i) => (i.kind === 'event' ? [{ kind: i.event.kind, text: i.event.text }] : []))

describe('사람의 깃발 내리기 (M10 G3)', () => {
  it('스펙 승인을 기다리는 동안 내리면 깃발만 내린다 — 상태·검증 파일이 그대로고 승인 카드는 남으며, 사건은 resumed가 아니라 flag-lowered다', SLOW, async () => {
    const rig = driver()
    const CWD = repos.work
    expect(rig.d.lowerFlag(CWD).ok).toBe(false)
    await toApproval(rig)
    const stateFile = path.join(repos.work, DOCS.runState)
    const before = fs.readFileSync(stateFile, 'utf8')
    const verification = fs.readFileSync(path.join(repos.work, DOCS.verification), 'utf8')
    const verdict = rig.d.status(CWD).lastVerdict
    // 깃발이 없으면 내릴 것이 없다
    const none = rig.d.lowerFlag(CWD)
    expect(none.ok).toBe(false)
    expect(none.reason).toContain('깃발')
    await rig.actions().pause()
    await until((s) => s.paused, '깃발 올림')
    const r = rig.d.lowerFlag(CWD)
    expect(r.ok).toBe(true)
    expect(r.view.paused).toBe(false)
    const lowered = await until((s) => !s.paused, '사람이 깃발을 내림')
    expect(lowered.phase).toBe('waiting-human')
    expect(lowered.approval).not.toBeNull()
    expect(lowered.lastVerdict).toEqual(verdict)
    expect(fs.readFileSync(stateFile, 'utf8')).toBe(before)
    expect(fs.readFileSync(path.join(repos.work, DOCS.verification), 'utf8')).toBe(verification)
    expect(userInputs()).toBe(0)
    const ev = eventsOf(rig)
    expect(ev.map((e) => e.kind)).not.toContain('resumed')
    const human = ev.filter((e) => e.kind === 'flag-lowered')
    expect(human).toHaveLength(1)
    expect(human[0].text).toContain('사람')
  })

  it('멈춘 실행(needs-user)에서 내려도 실행은 사람의 이어 가기(decide)를 기다린다 — 상태 파일이 그대로다', SLOW, async () => {
    const rig = driver({ hangDecompose: true })
    const CWD = repos.work
    await toHalted(rig)
    const file = path.join(repos.work, DOCS.runState)
    const before = fs.readFileSync(file, 'utf8')
    await rig.actions().pause()
    expect(rig.d.lowerFlag(CWD).ok).toBe(true)
    await sleep(150)
    expect(rig.d.status(CWD).phase).toBe('halted')
    expect(rig.d.status(CWD).paused).toBe(false)
    expect(fs.readFileSync(file, 'utf8')).toBe(before)
    expect(userInputs()).toBe(0)
  })
})

describe('대상을 고른 취소 (M10 G3, Backlog 12)', () => {
  it('메인 턴 취소는 메인 턴만 멈춘다 — 작업 세션으로 넘어가지 않고 실행 상태가 그대로다. 작업 세션 취소는 메인 턴을 멈추지 않는다', SLOW, async () => {
    const rig = driver({ hangMain: true })
    const CWD = repos.work
    await rig.d.open({ cwd: CWD })
    await rig.d.start(CWD, 'M1')
    await until((s) => s.mainWaiting, '사람 기다림')
    // 돌던 메인 턴이 없으면 메인 취소는 거짓이다
    expect(rig.d.cancelSession(CWD, 'main')).toBe(false)
    expect(rig.d.mainSend(CWD, '오래 생각해 줘').ok).toBe(true)
    await until((s) => s.mainBusy, '메인 턴이 돈다')
    const file = path.join(repos.work, DOCS.runState)
    const before = fs.readFileSync(file, 'utf8')
    // 브레인스토밍의 작업 세션은 메인 대화다 — 작업 세션 취소는 메인 턴을 멈추지 않는다
    rig.d.cancelSession(CWD, 'worker')
    await sleep(100)
    expect(rig.d.mainRead(CWD).busy).toBe(true)
    expect(rig.d.cancelSession(CWD, 'main')).toBe(true)
    const done = await until((s) => !s.mainBusy, '메인 턴이 멈춤')
    expect(done).toMatchObject({ phase: 'running', node: 'brainstorm', failCount: 0 })
    expect(fs.readFileSync(file, 'utf8')).toBe(before)
    expect(runState().lines).toEqual([])
    expect(rig.d.mainRead(CWD).items.some((i) => i.kind === 'notice' && i.text.includes('멈췄다'))).toBe(true)
  })

  it('작업 세션이 돌고 메인 턴도 돌 때 — 작업 취소는 작업 세션만 멈추고(FAIL 아님, USER-INPUT 없음) 메인 턴은 계속 돈다', SLOW, async () => {
    const rig = driver({ hangDecompose: true, hangMain: true })
    const CWD = repos.work
    const approval = await toApproval(rig)
    expect((await rig.d.decide({ cwd: CWD, verdict: 'pass', evidence: '봤다', specSha256: approval.approval?.sha256 as string })).ok).toBe(true)
    await until((s) => s.node === 'decompose' && s.sessionActive, 'goal 나누기 세션')
    // 메인 턴이 없을 때 메인 취소는 작업 세션으로 넘어가지 않는다
    expect(rig.d.cancelSession(CWD, 'main')).toBe(false)
    await sleep(100)
    expect(rig.d.status(CWD).phase).toBe('running')
    const lines = runState().lines.length
    expect(rig.d.mainSend(CWD, '오래 걸리는 질문이야').ok).toBe(true)
    await until((s) => s.mainBusy, '메인 턴이 돈다')
    let cancelled = false
    for (let i = 0; i < 200 && !cancelled; i++) { cancelled = rig.d.cancelSession(CWD, 'worker'); if (!cancelled) await sleep(20) }
    expect(cancelled).toBe(true)
    const halted = await until((s) => s.phase === 'halted', '작업 세션 취소의 멈춤')
    expect(halted.failCount).toBe(0)
    expect(rig.d.mainRead(CWD).busy).toBe(true)
    expect(userInputs()).toBe(0)
    expect(runState().lines.slice(lines).filter((l) => l.marker === 'FAIL')).toEqual([])
    expect(rig.d.cancelSession(CWD, 'main')).toBe(true)
    await until((s) => !s.mainBusy, '메인 턴이 멈춤')
  })
})
