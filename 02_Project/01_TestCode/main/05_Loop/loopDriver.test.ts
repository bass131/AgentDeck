// M09 G4 구동자 — 저장소마다 실행기 하나를 끝까지 돌리고 상태를 push한다. 실 git(임시 작업 저장소 + bare 원격) + 가짜 gh +
// 가짜 백엔드(작업 세션과 검수 세션을 실행 입력의 readOnly 잠금으로 가른다). 이 저장소의 원격에는 닿지 않는다.
// 고정하는 것: 브레인스토밍(메인 노드)의 질문 카드가 상태에 실리고 화면의 답이 세션으로 간다, 스펙 승인은 사람이 본 해시로만 받는다,
// goal 둘(G1 강 — 검수 세션, G2 약)을 지나 마일스톤 PR에서 사람의 병합을 기다린다, 새 구동자로 다시 열면 이어 가고 병합을 보면 끝낸다,
// 자동 모드 허용 노드가 꺼져 있으면 시작 전에 멈춘다, 위조 래치는 사람이 본 token으로만 풀리고 설정 차이는 그 목록만 받는다.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { controlsForRun, setControlEnabled } from '@main/04_Claude/permission/controlsStore'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentBackend, AgentRun, AgentRunInput, RunResponse } from '@main/03_Agent/AgentBackend'
import { autoModeReasonOf, createLoopDriver, type LoopDriver } from '@main/05_Loop/loopDriver'
import { DOCS } from '@main/05_Loop/survivalDocs'
import type { AgentEvent } from '@shared/agentEvents'
import type { LoopStatus } from '@shared/ipcContract'
import { BareGh } from '../00_Helpers/bareGh'
import { findRawNode, loaded, variantText } from '../00_Helpers/loopFakes'
import { makeTempRepos, type TempRepos } from '../00_Helpers/tempGit'

const SLOW = { timeout: 300_000 }
const OK_CMD = 'node -e "process.exit(0)"'
const TEMPLATE = loaded(variantText((raw) => {
  for (const id of ['checks', 'regression']) (findRawNode(raw, id).rule as { commands: string[] }).commands = [OK_CMD]
}))

interface Rec { starts: AgentRunInput[]; reviews: string[] }

// 노드는 프롬프트(템플릿 지시)로 가른다. 브레인스토밍은 질문 카드 하나를 내고 답을 받은 뒤 스펙을 쓴다.
function fakeBackend(): { backend: AgentBackend; rec: Rec } {
  const rec: Rec = { starts: [], reviews: [] }
  const backend: AgentBackend = {
    id: 'claude-code',
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    listSupportedCommands: () => [],
    start(req): AgentRun {
      rec.starts.push(req)
      const root = req.workspaceRoot as string
      const prompt = req.messages[0].content as string
      const write = (rel: string, text: string): void => {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
        fs.writeFileSync(path.join(root, rel), text)
      }
      let answer: (r: RunResponse) => void = () => {}
      const answered = new Promise<RunResponse>((r) => { answer = r })
      let stop: () => void = () => {}
      const stopped = new Promise<void>((r) => { stop = r })
      return {
        events: (async function* (): AsyncGenerator<AgentEvent> {
          if (req.loopLock?.readOnly) {
            rec.reviews.push(prompt)
            yield { type: 'text', delta: '완료조건을 채웠다.\nVERDICT: pass', messageId: 'r1' }
            yield { type: 'done' }
            return
          }
          if (prompt.startsWith('사람과 다음 마일스톤')) {
            yield { type: 'text', delta: '무엇을 만들까?', messageId: 'b1' }
            yield { type: 'question_request', requestId: 'q-brainstorm', questions: [{ question: '범위는?', options: [{ label: '덧셈' }] }] }
            const r = await Promise.race([answered, stopped.then(() => null)])
            if (r === null) return
            write(DOCS.milestoneSpec, `# M1 스펙\n\n만들 것: ${JSON.stringify(r)}\n`)
            yield { type: 'done' }
            return
          }
          if (prompt.startsWith('승인된 마일스톤 스펙을 goal로')) {
            write('.agentdeck/goals/G1.md', '# 덧셈\n\n만들 것: src/add.ts\n')
            write('.agentdeck/goals/G2.md', '# 뺄셈\n\n만들 것: src/sub.ts\n')
          } else if (prompt.includes('.agentdeck/goals/G1.md')) {
            write('src/add.ts', Array.from({ length: 80 }, (_, i) => `export const a${i} = ${i}`).join('\n') + '\n')
          } else if (prompt.includes('.agentdeck/goals/G2.md')) {
            write('src/sub.ts', 'export const sub = 1\n')
          }
          yield { type: 'done' }
        })(),
        abort() { stop() },
        interrupt() {},
        push() {},
        respond(id, r) { if (id === 'q-brainstorm') answer(r) },
      }
    },
  }
  return { backend, rec }
}

let repos: TempRepos
let gh: BareGh
let appData: string
const drivers: LoopDriver[] = []
let pushed: LoopStatus[] = []

function driver(over: { autoModeCheck?: () => string | null } = {}): { d: LoopDriver; rec: Rec } {
  const { backend, rec } = fakeBackend()
  const d = createLoopDriver({
    appDataDir: appData, backend, ciRetryMs: 20, humanPollMs: 20,
    openExtras: { gh, template: TEMPLATE, executorEnv: repos.env, commandTimeoutMs: 60_000 },
    onState: (s) => { pushed.push(s) },
    ...over,
  })
  drivers.push(d)
  return { d, rec }
}

async function until(pred: (s: LoopStatus) => boolean, what: string, ms = 120_000): Promise<LoopStatus> {
  const t0 = Date.now()
  for (;;) {
    const hit = [...pushed].reverse().find(pred)
    if (hit && pred(pushed[pushed.length - 1])) return hit
    if (Date.now() - t0 > ms) throw new Error(`${what}에 닿지 않았다 — 마지막 상태: ${JSON.stringify(pushed.at(-1))}`)
    await new Promise((r) => setTimeout(r, 20))
  }
}

beforeEach(() => {
  repos = makeTempRepos('agentdeck-g4-driver-')
  gh = new BareGh(repos)
  appData = path.join(repos.root, 'appdata')
  pushed = []
})
afterEach(async () => {
  for (const d of drivers.splice(0)) await d.closeAll()
  repos.cleanup()
})

describe('구동자 — 마일스톤 하나를 사람과 함께 끝까지 (M09 G4)', () => {
  it('질문 카드 → 스펙 승인(해시) → goal 둘(G1 검수) → 마일스톤 PR 대기, 새 구동자로 이어 가 병합을 보고 끝낸다', SLOW, async () => {
    const { d, rec } = driver()
    const CWD = repos.work
    expect((await d.open({ cwd: CWD })).phase).toBe('not-started')
    await d.start(CWD, 'M1')
    const asked = await until((s) => s.cards.length === 1, '브레인스토밍 질문 카드')
    expect(asked.cards[0]).toMatchObject({ kind: 'question', requestId: 'q-brainstorm', node: 'brainstorm', goal: null, text: '무엇을 만들까?' })
    expect(asked.sessionActive).toBe(true)
    expect(d.answerCard(CWD, 'nope', { kind: 'question', answers: null })).toBe(false)
    // 카드 종류와 다른 꼴의 답(질문 카드에 허용)은 세션으로 넘기지 않는다
    expect(d.answerCard(CWD, 'q-brainstorm', { kind: 'permission', behavior: 'allow' })).toBe(false)
    expect(d.answerCard(CWD, 'q-brainstorm', { kind: 'question', answers: [['덧셈']] })).toBe(true)

    const approval = await until((s) => s.phase === 'waiting-human' && s.approval !== null, '스펙 승인')
    expect(approval.cards).toEqual([])
    expect(approval.approval?.spec).toContain('덧셈')
    const sha = approval.approval?.sha256 as string
    expect(sha).toMatch(/^[0-9a-f]{64}$/)
    // 해시가 없거나 틀리면 받지 않는다 — 화면이 본 스펙에 묶인다
    expect((await d.decide({ cwd: CWD, verdict: 'pass', evidence: '봤다' })).ok).toBe(false)
    expect((await d.decide({ cwd: CWD, verdict: 'pass', evidence: '봤다', specSha256: 'f'.repeat(64) })).ok).toBe(false)
    expect((await d.decide({ cwd: CWD, verdict: 'pass', evidence: '봤다', specSha256: sha, expectNode: 'milestone-branch' })).ok).toBe(false)
    // 첫 goal PR의 CI는 두 번 「도는 중」 — 구동자가 간격을 두고 다시 본다(waiting-ci를 push한다)
    gh.ciPending = 2
    expect((await d.decide({ cwd: CWD, verdict: 'pass', evidence: '범위에 동의한다', specSha256: sha, expectNode: 'spec-approval' })).ok).toBe(true)

    const waiting = await until((s) => s.phase === 'waiting-human' && s.milestonePr !== null, '마일스톤 PR 병합 대기', 240_000)
    expect(waiting.goals.map((g) => [g.id, g.grade, g.status])).toEqual([['G1', 'strong', 'done'], ['G2', 'weak', 'done']])
    expect(waiting.base).toBe('master')
    expect(gh.ciPending).toBe(0)
    expect(pushed.some((s) => s.phase === 'waiting-ci' && s.node === 'G1/ci')).toBe(true)
    expect(gh.ciPolls).toBeGreaterThanOrEqual(4)
    // 검수 세션은 G1(강)에서 한 번 — 입력은 goal 문서와 diff, 읽기 전용 잠금
    expect(rec.reviews).toHaveLength(1)
    expect(rec.reviews[0]).toContain('src/add.ts')
    expect(rec.starts.filter((s) => s.loopLock?.readOnly)).toHaveLength(1)
    // goal PR 본문에 그 goal의 검증 줄이 실린다
    expect(gh.bodies.get('goal/M1-G1')).toMatch(/review\(model\)/)
    // 마일스톤 병합 게이트는 사람 판정으로 넘기지 않는다
    expect((await d.decide({ cwd: CWD, verdict: 'pass', evidence: '끝' })).ok).toBe(false)

    // 앱을 다시 켠 것 — 구동자를 닫고 새로 만들어 연다. 같은 노드에서 이어 가고, 사람이 병합하면 끝낸다.
    await d.closeAll()
    pushed = []
    const again = driver().d
    const reopened = await again.open({ cwd: CWD })
    expect(reopened.phase).toBe('waiting-human')
    expect(reopened.milestonePr).toBe(waiting.milestonePr)
    gh.mergeByHuman(waiting.milestonePr as number)
    expect((await until((s) => s.phase === 'done', '마일스톤 끝')).phase).toBe('done')
  })
})

describe('자동 모드 허용 노드 판독 (M09 G4)', () => {
  it('컨트롤을 못 읽거나 노드가 꺼져 있으면 사유, 켜져 있으면 null', () => {
    expect(autoModeReasonOf({ ok: false, status: 'error', message: '읽지 못했다' })).toContain('읽지 못했다')
    expect(autoModeReasonOf({ ok: true, nodes: [] })).toContain('mode-auto-bypass-allow')
    expect(autoModeReasonOf({ ok: true, nodes: [{ id: 'mode-auto-bypass-allow' } as never] })).toBeNull()
  })

  it('실물 컨트롤 저장소(controlsForRun)에서 — 처음엔 켜져 있어 null, 컨트롤 화면의 끄기 경로로 끄면 사유', () => {
    const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-g4-controls-'))
    try {
      expect(autoModeReasonOf(controlsForRun(ud))).toBeNull()
      expect(setControlEnabled(ud, 'mode-auto-bypass-allow', false).ok).toBe(true)
      expect(autoModeReasonOf(controlsForRun(ud))).toContain('mode-auto-bypass-allow')
    } finally {
      fs.rmSync(ud, { recursive: true, force: true })
    }
  })
})

describe('구동자 — 멈추는 곳 (M09 G4)', () => {
  it('앱 「자동」 모드 허용 노드가 꺼져 있으면 시작·이어 가기 전에 사유와 함께 멈추고 세션을 열지 않는다', SLOW, async () => {
    let off = true
    const { d, rec } = driver({ autoModeCheck: () => (off ? '컨트롤 노드 mode-auto-bypass-allow가 꺼져 있다' : null) })
    await d.open({ cwd: repos.work })
    const s = await d.start(repos.work, 'M1')
    expect(s.phase).toBe('blocked')
    expect(s.reason).toContain('mode-auto-bypass-allow')
    expect(rec.starts).toEqual([])
    // 시작 전에 멈췄다 — 실행 상태를 만들지 않았다
    expect(fs.existsSync(path.join(repos.work, DOCS.runState))).toBe(false)
    off = false
    await d.start(repos.work, 'M1')
    await until((x) => x.cards.length === 1, '켜면 시작한다')
    expect(rec.starts).toHaveLength(1)
    // 이어 가기 전에도 본다 — 돌던 세션은 닫기로 취소돼 멈춤(FAIL 아님)이 되고, 꺼진 채 이어 가기를 누르면 받지 않는다
    off = true
    await d.closeAll()
    const again = driver({ autoModeCheck: () => (off ? '컨트롤 노드 mode-auto-bypass-allow가 꺼져 있다' : null) })
    const reopened = await again.d.open({ cwd: repos.work })
    expect(reopened.phase).toBe('halted')
    expect(reopened.failCount).toBe(0)
    expect(reopened.reason).toContain('취소')
    const resume = await again.d.decide({ cwd: repos.work, verdict: 'pass', evidence: '다시 돌린다' })
    expect(resume.ok).toBe(false)
    expect(resume.reason).toContain('mode-auto-bypass-allow')
    expect(again.rec.starts).toEqual([])
  })

  it('상태 파일을 밖에서 고치면 래치가 걸리고, 사람이 본 token으로만 풀린다 — 설정 변경 래치는 그 키를 새 기준선으로 받는다', SLOW, async () => {
    const { d } = driver()
    const CWD = repos.work
    await d.open({ cwd: CWD })
    await d.start(CWD, 'M1')
    await until((s) => s.cards.length === 1, '질문 카드')
    d.answerCard(CWD, 'q-brainstorm', { kind: 'question', answers: [['덧셈']] })
    await until((s) => s.phase === 'waiting-human' && s.approval !== null, '스펙 승인')

    // 상태 위조 — 실행기 밖에서 run-state.json의 값을 고친다
    const file = path.join(repos.work, DOCS.runState)
    // 스키마에는 맞는 위조(갈래 시작점 바꿔치기) — 다이제스트만 어긋난다
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { milestoneBase: string | null }
    raw.milestoneBase = 'a'.repeat(40)
    fs.writeFileSync(file, JSON.stringify(raw, null, 2))
    const latched = await d.open({ cwd: CWD })
    expect(latched.phase).toBe('latched')
    expect(latched.latch?.reason).toContain('상태 파일')
    expect(latched.latch?.state).toContain('M1')
    expect((await d.releaseLatch(CWD, '0'.repeat(64))).ok).toBe(false)
    const released = await d.releaseLatch(CWD, latched.latch?.token as string)
    expect(released.ok).toBe(true)
    expect(released.status.phase).toBe('waiting-human')
    expect(released.status.latch).toBeNull()

    // 설정 변경 — 열린 실행기의 다음 단계가 바뀐 키를 보고 래치를 건다
    repos.git(['config', 'user.name', 'Someone Else'])
    const sha = released.status.approval?.sha256 as string
    await d.decide({ cwd: CWD, verdict: 'pass', evidence: '봤다', specSha256: sha })
    const tripped = await until((s) => s.phase === 'latched', '설정 래치')
    expect(tripped.latch?.changed).toContain('user.name')
    const ok = await d.releaseLatch(CWD, tripped.latch?.token as string)
    expect(ok.ok).toBe(true)
    expect(ok.status.phase).not.toBe('latched')
  })
})
