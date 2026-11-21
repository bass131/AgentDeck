// 구동자 — 저장소마다 실행기 하나를 끝까지 돌리고 상태를 push한다. 실 git(임시 작업 저장소 + bare 원격) + 가짜 gh +
// 가짜 백엔드(작업 세션과 검수 세션을 실행 입력의 readOnly 잠금으로 가른다). 이 저장소의 원격에는 닿지 않는다.
// 고정하는 것: 브레인스토밍(메인 노드)의 질문 카드가 상태에 실리고 화면의 답이 세션으로 간다, 스펙 승인은 사람이 본 해시로만 받는다,
// goal 둘(G1 강 — 검수 세션, G2 약)을 지나 마일스톤 PR에서 사람의 병합을 기다린다, 새 구동자로 다시 열면 이어 가고 병합을 보면 끝낸다,
// 자동 모드 허용 노드가 꺼져 있으면 시작 전에 멈춘다, 위조 래치는 사람이 본 token으로만 풀리고 설정 차이는 그 목록만 받는다.
// 카드 차례는 구동자 전역에서 단조 증가한다(닫았다 열어도, 새 구동자여도 겹치지 않는다), 풀기 중 상태 파일이 바뀌어
// 거부되면 새 token의 래치가 다시 뜬다. 구동 오류는 메인 대화 기록에 예외 사건(error)으로도 남는다(모델 턴 없이).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { controlsForRun, setControlEnabled } from '@main/04_Claude/permission/controlsStore'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentBackend, AgentRun, AgentRunInput, RunResponse } from '@main/03_Agent/AgentBackend'
import { createFileDigestStore, repoKeyOf, stateDigest } from '@main/05_Loop/digestStore'
import { autoModeReasonOf, contextText, createLoopDriver, stateSummary, type LoopDriver } from '@main/05_Loop/loopDriver'
import { FAIL_LIMIT, createRunState, type RunState } from '@main/05_Loop/runState'
import { createLoopNotifier } from '@main/05_Loop/loopNotifier'
import { openLoop } from '@main/05_Loop/openLoop'
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
      // 메인 대화는 턴마다 마지막 글만 보낸다(resume). SDK처럼 세션 id를 먼저 알린다
      const last = String(req.messages.at(-1)?.content ?? '')
      return {
        events: (async function* (): AsyncGenerator<AgentEvent> {
          yield { type: 'session', sessionId: req.resumeSessionId ?? `S${rec.starts.length}` }
          if (req.loopLock?.readOnly) {
            rec.reviews.push(prompt)
            yield { type: 'text', delta: '완료조건을 채웠다.\nVERDICT: pass', messageId: 'r1' }
            yield { type: 'done' }
            return
          }
          // 다시 물은 카드의 답(앱을 다시 연 뒤)은 사용자 턴으로 온다
          if (last.startsWith('[다시 물은 질문의 답]')) {
            write(DOCS.milestoneSpec, `# M1 스펙\n\n만들 것: ${last}\n`)
            yield { type: 'done' }
            return
          }
          // 브레인스토밍 여는 턴(시작 지시) 또는 같은 세션의 반려 턴
          if (prompt.startsWith('사람과 다음 마일스톤') || last.startsWith('[스펙 반려]')) {
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

function driver(over: { autoModeCheck?: () => string | null; onState?: (s: LoopStatus) => void } = {}): { d: LoopDriver; rec: Rec } {
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
    // 메인 대화의 카드는 상태에도 실리지만 inChat 표시가 붙는다(답하는 곳은 메인 대화 화면 한 곳)
    expect(asked.cards[0]).toMatchObject({ kind: 'question', node: 'brainstorm', goal: null, text: '무엇을 만들까?', inChat: true })
    const cardId = asked.cards[0].requestId
    // 화면의 카드 id는 세션 차례가 붙은 구동자의 id다 — 세션의 원래 id(q-brainstorm)로는 답하지 못한다
    expect(cardId).not.toBe('q-brainstorm')
    expect(asked.sessionActive).toBe(true)
    expect(d.answerCard(CWD, 'nope', { kind: 'question', answers: null })).toBe(false)
    expect(d.answerCard(CWD, 'q-brainstorm', { kind: 'question', answers: [['덧셈']] })).toBe(false)
    // 카드 종류와 다른 꼴의 답(질문 카드에 허용)은 세션으로 넘기지 않는다
    expect(d.answerCard(CWD, cardId, { kind: 'permission', behavior: 'allow' })).toBe(false)
    expect(d.answerCard(CWD, cardId, { kind: 'question', answers: [['덧셈']] })).toBe(true)

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
    // 사건 줄은 모델 없이 기록에 남고, 메인은 경계(goal 병합 둘·마일스톤 PR)에서만 말한다(노드 시작·통과로는 말하지 않는다)
    for (let i = 0; i < 250 && d.mainRead(CWD).busy; i++) await new Promise((r) => setTimeout(r, 20))
    const kinds = d.mainRead(CWD).items.flatMap((i) => (i.kind === 'event' ? [i.event.kind] : []))
    expect(kinds.filter((k) => k === 'goal-merged')).toHaveLength(2)
    expect(kinds).toEqual(expect.arrayContaining(['node-start', 'node-end', 'spec-approved', 'milestone-pr']))
    const told = rec.starts.map((s) => String(s.messages.at(-1)?.content)).filter((p) => p.startsWith('[실행기 사건]'))
    expect(told.length).toBeGreaterThanOrEqual(1)
    for (const p of told) {
      for (const line of p.split('\n').filter((l) => l.startsWith('- '))) expect(line).toMatch(/목표를 병합했다|마일스톤 PR을 열었다/)
    }
    expect(told.join('\n').match(/목표를 병합했다/g)).toHaveLength(2)
    // 사람이 읽는 사건 문장은 한글이다(PR·이름은 그대로)
    const texts = d.mainRead(CWD).items.flatMap((i) => (i.kind === 'event' ? [i.event.text] : []))
    // 노드 id(goal-branch·goal-pr)와 브랜치(goal/…)는 이름이라 남는다 — 낱말 goal·FAIL·Backlog가 없다
    for (const t of texts) expect(t, t).not.toMatch(/(?<![\w/-])goal(?![\w/-])|\bFAIL\b|Backlog/i)
    expect(told.join('\n')).toContain('마일스톤 PR을 열었다')

    // 앱을 다시 켠 것 — 구동자를 닫고 새로 만들어 연다. 같은 노드에서 이어 가고, 사람이 병합하면 끝낸다.
    await d.closeAll()
    pushed = []
    const again = driver().d
    const reopened = await again.open({ cwd: CWD })
    expect(reopened.phase).toBe('waiting-human')
    expect(reopened.milestonePr).toBe(waiting.milestonePr)
    gh.mergeByHuman(waiting.milestonePr as number)
    expect((await until((s) => s.phase === 'done', '마일스톤 끝')).phase).toBe('done')
    // 이 구동자에서 끝난 실행은 「끝남」이고, 다시 열면 시작 전과 안내 한 줄이다(시작하면 보관한다)
    await again.closeAll()
    pushed = []
    const later = await driver().d.open({ cwd: CWD })
    expect(later.phase).toBe('not-started')
    expect(later.reason).toBeNull()
    expect(later.notice).toBe('끝난 실행(M1) — 새 마일스톤을 시작하면 보관해요')
  })
})

// 세션마다 권한 조정자가 같은 id(ask-1 꼴)를 다시 쓴다. 구동자가 화면에 보내는 카드 id에 세션 차례를 붙여,
// 스펙 반려 뒤 새 브레인스토밍 세션의 첫 질문이 화면에서 답할 수 있게 보이고 옛 id로 온 늦은 답은 거부된다.
describe('카드 id는 세션 차례에 묶인다 (M09 G4 검수 I2)', () => {
  it('스펙 반려 → 새 세션의 같은 원래 id 질문은 새 카드 id로 보이고, 옛 카드 id의 늦은 답은 거부된다', SLOW, async () => {
    const { d } = driver()
    const CWD = repos.work
    await d.open({ cwd: CWD })
    await d.start(CWD, 'M1')
    const first = (await until((s) => s.cards.length === 1, '첫 질문')).cards[0].requestId
    expect(d.answerCard(CWD, first, { kind: 'question', answers: [['덧셈']] })).toBe(true)
    const approval = await until((s) => s.phase === 'waiting-human' && s.approval !== null, '스펙 승인')
    const rejected = await d.decide({ cwd: CWD, verdict: 'fail', evidence: '범위를 다시 이야기한다', specSha256: approval.approval?.sha256 as string })
    expect(rejected.ok).toBe(true)
    const again = await until((s) => s.cards.length === 1 && s.cards[0].requestId !== first, '두 번째 세션의 질문')
    const second = again.cards[0].requestId
    expect(second).not.toBe(first)
    expect(again.cards[0].text).toBe('무엇을 만들까?')
    // 옛 세션의 카드 id로 온 늦은 답은 새 세션에 붙지 않는다
    expect(d.answerCard(CWD, first, { kind: 'question', answers: [['뺄셈']] })).toBe(false)
    expect(d.answerCard(CWD, second, { kind: 'question', answers: [['곱셈']] })).toBe(true)
    const next = await until((s) => s.phase === 'waiting-human' && s.approval !== null, '두 번째 스펙 승인')
    expect(next.approval?.spec).toContain('곱셈')
  })
})

// 차례는 저장소 항목마다가 아니라 구동자 전역에서 단조 증가하고, 시작값에 구동자마다 무작위 접두를 섞는다.
// 루프를 닫으면 항목이 지워지므로, 항목마다 0부터 세면 다시 연 뒤 새 세션의 첫 카드가 옛 카드와 같은 id(s1-…)가 된다.
// 브레인스토밍은 메인 대화가 소유한다. 닫기는 멈춤(halted)이 아니다 — 다시 열면 같은 방문이고, 꺼질 때 남은 질문 카드는
// 같은 id로 다시 묻는다(restored). 새로 뜨는 카드의 차례는 여전히 구동자 전역에서 이어지고 새 구동자의 접두는 다르다.
describe('카드 차례는 구동자 전역에서 단조 증가한다 (M09 G4 확인 검수, M10 G2)', () => {
  it('루프를 닫았다 열면 같은 브레인스토밍이고 남은 카드를 다시 묻는다 — 새 카드 id는 구동자 전역 차례로 이어지고 새 구동자에서도 겹치지 않는다', SLOW, async () => {
    const { d } = driver()
    const CWD = repos.work
    await d.open({ cwd: CWD })
    await d.start(CWD, 'M1')
    const first = (await until((s) => s.cards.length === 1, '첫 질문')).cards[0].requestId
    // 카드 id 꼴은 `s<구동자 접두>.<차례>-<원래 id>`다
    expect(first).toMatch(/^s[0-9a-f]{8}\.\d+-q-brainstorm$/)
    await d.close(CWD)
    pushed = []
    const reopened = await d.open({ cwd: CWD })
    expect(reopened.phase).toBe('running')
    expect(reopened.failCount).toBe(0)
    const restored = (await until((s) => s.cards.length === 1, '다시 묻는 카드')).cards[0]
    expect(restored).toMatchObject({ requestId: first, restored: true, kind: 'question' })
    expect(d.answerCard(CWD, first, { kind: 'question', answers: [['덧셈']] })).toBe(true)
    const approval = await until((s) => s.phase === 'waiting-human' && s.approval !== null, '다시 물은 답 뒤 스펙 승인')
    expect(approval.approval?.spec).toContain('덧셈')
    // 반려 → 같은 세션의 반려 턴이 새 카드를 낸다. 차례는 같은 구동자 안에서 이어진다
    expect((await d.decide({ cwd: CWD, verdict: 'fail', evidence: '다시', specSha256: approval.approval?.sha256 as string })).ok).toBe(true)
    const second = (await until((s) => s.cards.length === 1 && s.cards[0].requestId !== first, '반려 뒤 질문')).cards[0].requestId
    expect(second.split('-')[0].split('.')[0]).toBe(first.split('-')[0].split('.')[0])
    expect(Number(second.split('-')[0].split('.')[1])).toBeGreaterThan(Number(first.split('-')[0].split('.')[1]))
    expect(d.answerCard(CWD, first, { kind: 'question', answers: [['덧셈']] })).toBe(false)
    // 앱을 다시 켠 것 — 남은 카드는 같은 id로 다시 묻고, 그 뒤 새 카드의 접두는 앞 구동자와 다르다
    await d.closeAll()
    pushed = []
    const again = driver().d
    await again.open({ cwd: CWD })
    expect((await until((s) => s.cards.length === 1, '새 구동자의 다시 묻는 카드')).cards[0].requestId).toBe(second)
    // 반려 뒤 방문은 스펙이 바뀌어야 끝난다 — 앞과 다른 답을 준다
    expect(again.answerCard(CWD, second, { kind: 'question', answers: [['곱셈']] })).toBe(true)
    const next = await until((s) => s.phase === 'waiting-human' && s.approval !== null, '새 구동자의 스펙 승인')
    expect((await again.decide({ cwd: CWD, verdict: 'fail', evidence: '한 번 더', specSha256: next.approval?.sha256 as string })).ok).toBe(true)
    const third = (await until((s) => s.cards.length === 1 && s.cards[0].requestId !== second, '새 구동자의 새 질문')).cards[0].requestId
    expect(third.split('-')[0].split('.')[0]).not.toBe(first.split('-')[0].split('.')[0])
    expect(new Set([first, second, third]).size).toBe(3)
  })
})

// 래치 카드의 상태 요약(사람이 본다)과 메인 에이전트의 실행 상태 요약은 사건 문장과 같은 어휘(목표·실패)다
describe('상태 요약의 어휘 (M10 G5 검수 4)', () => {
  const state = (): RunState => {
    const s = createRunState(TEMPLATE.template, TEMPLATE.hash, 'M1', 'main')
    if (!s.ok) throw new Error(s.reason)
    const fail = (sentence: string): RunState['lines'][number] => ({ marker: 'FAIL', at: '2026-11-20T00:00:00Z', node: 'brainstorm', goal: null, by: 'executor', judge: 'rule', sentence })
    return {
      ...s.state, status: 'needs-user', haltReason: '멈춤', failCount: 2,
      goals: [{ id: 'G1', title: 'a', status: 'active', grade: null, baseSha: null, pr: null, pushedSha: null, ciSha: null, mergedSha: null }],
      lines: [fail('스펙이 없다'), fail('npm test 실패')],
    }
  }

  it('래치 카드의 요약은 상태 값을 한글 낱말로, 실패 수를 「실패 N」으로 보인다 — 저장 형식은 그대로다', () => {
    const text = JSON.stringify(state())
    const sum = stateSummary(text) ?? ''
    expect(sum).toContain('사람 판정 대기')
    expect(sum).toContain('실패 2')
    expect(sum).not.toMatch(/needs-user|\bFAIL\b/)
    expect(JSON.parse(text).status).toBe('needs-user')
  })

  it('메인 에이전트의 실행 상태 요약에는 목표·실패 어휘만 있다 — goal·FAIL이 섞이지 않는다', () => {
    const ctx = contextText(state(), 'brainstorm')
    expect(ctx).toContain('실패 2')
    expect(ctx).toContain('목표: G1')
    expect(ctx).toContain('- 실패 brainstorm: npm test 실패')
    expect(ctx).not.toMatch(/(?<![\w/-])goal(?![\w/-])|\bFAIL\b/)
  })
})

describe('자동 모드 허용 노드 판독 (M09 G4)', () => {
  it('컨트롤을 못 읽거나 노드가 꺼져 있으면 사유, 켜져 있으면 null', () => {
    expect(autoModeReasonOf({ ok: false, status: 'error', message: '읽지 못했다' })).toContain('읽지 못했다')
    expect(autoModeReasonOf({ ok: true, nodes: [] })).toContain('mode-auto-bypass-allow')
    // 진행 불가에서 빠져나가는 길은 화면의 「다시 열기」다(이어 가기 버튼은 멈춤에만 있다)
    expect(autoModeReasonOf({ ok: true, nodes: [] })).toContain('「다시 열기」')
    expect(autoModeReasonOf({ ok: false, status: 'error', message: '읽지 못했다' })).toContain('「다시 열기」')
    expect(autoModeReasonOf({ ok: true, nodes: [{ id: 'mode-auto-bypass-allow' } as never] })).toBeNull()
    // 화면에 보이는 사유는 한글 어휘다
    expect(autoModeReasonOf({ ok: true, nodes: [] })).toContain('실패가 쌓인다')
    expect(autoModeReasonOf({ ok: true, nodes: [] })).not.toMatch(/\bFAIL\b/)
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
    // 다시 열 때도 본다 — 닫기는 브레인스토밍을 멈춤으로 만들지 않고(FAIL 아님), 꺼진 채면 구동 전에 사유와 함께 멈춘다
    off = true
    await d.closeAll()
    const again = driver({ autoModeCheck: () => (off ? '컨트롤 노드 mode-auto-bypass-allow가 꺼져 있다' : null) })
    await again.d.open({ cwd: repos.work })
    const reopened = await until((x) => x.phase === 'blocked', '다시 연 뒤 자동 모드 사유')
    expect(reopened.failCount).toBe(0)
    expect(reopened.reason).toContain('mode-auto-bypass-allow')
    // 실행은 멈추지 않았다(브레인스토밍 running) — 이어 가기는 사람 판정 노드가 아니라서 거부된다. 멈춘 실행(needs-user)의
    // 이어 가기가 자동 모드 사유로 거부되는 것은 loopDriver.main-chat.test.ts 「멈춘 실행의 이어 가기는 자동 모드 …」가 고정한다
    const resume = await again.d.decide({ cwd: repos.work, verdict: 'pass', evidence: '다시 돌린다' })
    expect(resume.ok).toBe(false)
    expect(resume.reason).toContain('사람 판정을 받지 않는다')
    expect(again.rec.starts).toEqual([])
  })

  it('상태 파일을 밖에서 고치면 래치가 걸리고, 사람이 본 token으로만 풀린다 — 설정 변경 래치는 그 키를 새 기준선으로 받는다', SLOW, async () => {
    const { d } = driver()
    const CWD = repos.work
    await d.open({ cwd: CWD })
    await d.start(CWD, 'M1')
    const card = (await until((s) => s.cards.length === 1, '질문 카드')).cards[0].requestId
    d.answerCard(CWD, card, { kind: 'question', answers: [['덧셈']] })
    await until((s) => s.phase === 'waiting-human' && s.approval !== null, '스펙 승인')

    // 상태 위조 — 실행기 밖에서 run-state.json의 값을 고친다
    const file = path.join(repos.work, DOCS.runState)
    const legit = fs.readFileSync(file, 'utf8')
    // 스키마에는 맞는 위조(갈래 시작점 바꿔치기) — 다이제스트만 어긋난다
    const raw = JSON.parse(legit) as { milestoneBase: string | null }
    raw.milestoneBase = 'a'.repeat(40)
    fs.writeFileSync(file, JSON.stringify(raw, null, 2))
    const latched = await d.open({ cwd: CWD })
    expect(latched.phase).toBe('latched')
    expect(latched.latch?.reason).toContain('상태 파일')
    expect(latched.latch?.state).toContain('M1')
    // 풀면 실행기가 마지막으로 쓴 사본으로 되돌린다는 것을 보인다
    expect(latched.latch?.restore).toContain('M1')
    expect((await d.releaseLatch(CWD, '0'.repeat(64))).ok).toBe(false)
    const released = await d.releaseLatch(CWD, latched.latch?.token as string)
    expect(released.ok).toBe(true)
    expect(released.status.phase).toBe('waiting-human')
    expect(released.status.latch).toBeNull()
    // 위조본을 받지 않는다. 상태 파일은 실행기가 마지막으로 쓴 사본으로 되돌아갔다
    expect((JSON.parse(fs.readFileSync(file, 'utf8')) as { milestoneBase: string | null }).milestoneBase).toBeNull()
    expect(fs.readFileSync(file, 'utf8')).toBe(legit)

    // 설정 변경 — 열린 실행기의 다음 단계가 바뀐 키를 보고 래치를 건다
    repos.git(['config', 'user.name', 'Someone Else'])
    const sha = released.status.approval?.sha256 as string
    await d.decide({ cwd: CWD, verdict: 'pass', evidence: '봤다', specSha256: sha })
    const tripped = await until((s) => s.phase === 'latched', '설정 래치')
    expect(tripped.latch?.changed.some((c) => c.startsWith('user.name:') && c.includes('Someone Else'))).toBe(true)
    const ok = await d.releaseLatch(CWD, tripped.latch?.token as string)
    expect(ok.ok).toBe(true)
    expect(ok.status.phase).not.toBe('latched')
  })

  // 설정 사유 래치가 상태 위조를 가리지 않는다. 설정 래치가 걸린 동안 상태 파일도 고쳤으면 풀 때 사본으로 되돌린다
  it('설정 래치가 걸린 뒤 상태 파일도 고쳤으면, 풀 때 상태 위조로 보고 사본으로 되돌린다', SLOW, async () => {
    const { d } = driver()
    const CWD = repos.work
    await d.open({ cwd: CWD })
    await d.start(CWD, 'M1')
    const card = (await until((s) => s.cards.length === 1, '질문 카드')).cards[0].requestId
    d.answerCard(CWD, card, { kind: 'question', answers: [['덧셈']] })
    const approval = await until((s) => s.phase === 'waiting-human' && s.approval !== null, '스펙 승인')
    const file = path.join(repos.work, DOCS.runState)
    repos.git(['config', 'user.name', 'Someone Else'])
    await d.decide({ cwd: CWD, verdict: 'pass', evidence: '봤다', specSha256: approval.approval?.sha256 as string })
    const tripped = await until((s) => s.phase === 'latched', '설정 래치')
    expect(tripped.latch?.reason).toContain('설정')
    const legit = fs.readFileSync(file, 'utf8')
    const raw = JSON.parse(legit) as { milestoneBase: string | null }
    raw.milestoneBase = 'b'.repeat(40)
    fs.writeFileSync(file, JSON.stringify(raw, null, 2))
    // 화면이 본 뒤 상태 파일이 바뀌면 그 token으로는 풀지 않는다
    expect((await d.releaseLatch(CWD, tripped.latch?.token as string)).ok).toBe(false)
    const seen = await until((s) => s.phase === 'latched', '다시 본 래치')
    const ok = await d.releaseLatch(CWD, seen.latch?.token as string)
    expect(ok.ok).toBe(true)
    expect(fs.readFileSync(file, 'utf8')).toBe(legit)
  })

  // 앱 종료가 상태 파일 쓰기와 다이제스트 쓰기 사이에 끼면 다음 열기에서 래치가 걸린다. 사본은 상태 파일보다 먼저 쓰므로
  // 사본으로 되돌리면 그 상태 파일과 같은 내용이 되고, 다이제스트가 맞춰져 이어 간다.
  it('상태 파일과 다이제스트 사이에서 꺼진 꼴은 사본으로 되돌리면 같은 내용이 되고 이어 간다', SLOW, async () => {
    const { d } = driver()
    const CWD = repos.work
    await d.open({ cwd: CWD })
    await d.start(CWD, 'M1')
    await until((s) => s.cards.length === 1, '질문 카드')
    await d.closeAll()
    pushed = []
    // 실행기가 마지막으로 쓴 상태(닫기는 브레인스토밍을 멈추지 않는다)의 다음 쓰기를 흉내 낸다 — 사본과 상태 파일은 새것,
    // 다이제스트는 옛것. 다음 쓰기는 사람이 멈춘 실행(needs-user)이라고 둔다
    const file = path.join(repos.work, DOCS.runState)
    const next = JSON.parse(fs.readFileSync(file, 'utf8')) as { haltReason: string | null; status: string }
    next.status = 'needs-user'
    next.haltReason = '닫기 뒤 (다음 쓰기)'
    const text = `${JSON.stringify(next, null, 2)}\n`
    const copy = path.join(appData, 'digests', `${repoKeyOf(fs.realpathSync.native(repos.work))}.state.json`)
    expect(fs.existsSync(copy)).toBe(true)
    fs.writeFileSync(copy, text)
    fs.writeFileSync(file, text)
    const again = driver().d
    const latched = await again.open({ cwd: CWD })
    expect(latched.phase).toBe('latched')
    const ok = await again.releaseLatch(CWD, latched.latch?.token as string)
    expect(ok.ok).toBe(true)
    expect(fs.readFileSync(file, 'utf8')).toBe(text)
    expect(ok.status.phase).toBe('halted')
    expect(ok.status.reason).toContain('다음 쓰기')
  })

  it('사본이 없으면 상태 위조 래치를 풀지 않는다', SLOW, async () => {
    const { d } = driver()
    const CWD = repos.work
    await d.open({ cwd: CWD })
    await d.start(CWD, 'M1')
    await until((s) => s.cards.length === 1, '질문 카드')
    await d.closeAll()
    pushed = []
    fs.rmSync(path.join(appData, 'digests', `${repoKeyOf(fs.realpathSync.native(repos.work))}.state.json`))
    const file = path.join(repos.work, DOCS.runState)
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { milestoneBase: string | null }
    raw.milestoneBase = 'c'.repeat(40)
    fs.writeFileSync(file, JSON.stringify(raw))
    const again = driver().d
    const latched = await again.open({ cwd: CWD })
    expect(latched.phase).toBe('latched')
    // 화면이 본 token은 바로 다음 계산과 같다(동시에 돈 계산끼리 사유가 흔들리지 않는다)
    expect((await again.open({ cwd: CWD })).latch?.token).toBe(latched.latch?.token)
    const r = await again.releaseLatch(CWD, latched.latch?.token as string)
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('사본')
    expect(r.status.phase).toBe('latched')
    // 사본이 스키마에 맞지 않아도 풀지 않는다 — 닫기 전에 본다(열린 실행기는 그대로)
    const copyFile = path.join(appData, 'digests', `${repoKeyOf(fs.realpathSync.native(repos.work))}.state.json`)
    fs.writeFileSync(copyFile, '{"broken":')
    const seen = (await again.open({ cwd: CWD })).latch
    const bad = await again.releaseLatch(CWD, seen?.token as string)
    expect(bad.ok).toBe(false)
    expect(bad.reason).toContain('사본')
    expect(bad.status.phase).toBe('latched')
  })

  // 열기·풀기가 기다리는 동안 닫으면, 새로 연 실행기를 닫고 잠금을 푼다(고아 실행기가 잠금을 쥐지 않는다)
  it('열기 도중 닫으면 새로 연 실행기를 닫는다 — 다시 열면 열린다', SLOW, async () => {
    const { d } = driver()
    const CWD = repos.work
    const opening = d.open({ cwd: CWD })
    await d.close(CWD)
    await opening
    const reopened = await d.open({ cwd: CWD })
    expect(reopened.phase).toBe('not-started')
  })

  it('풀기 도중 닫으면 새로 연 실행기를 닫는다 — 다시 열면 열린다', SLOW, async () => {
    let gate: Promise<void> | null = null
    let entered: () => void = () => {}
    const inside = new Promise<void>((r) => { entered = r })
    let releaseGate: () => void = () => {}
    const { backend } = fakeBackend()
    const d = createLoopDriver({
      appDataDir: appData, backend, ciRetryMs: 20, humanPollMs: 20,
      openExtras: { gh, template: TEMPLATE, executorEnv: repos.env, commandTimeoutMs: 60_000 },
      onState: (s) => { pushed.push(s) },
      openLoopImpl: async (o) => {
        const r = await openLoop(o)
        if (gate) { entered(); await gate }
        return r
      },
    })
    drivers.push(d)
    const CWD = repos.work
    await d.open({ cwd: CWD })
    repos.git(['config', 'user.name', 'Someone Else'])
    await d.start(CWD, 'M1')
    const tripped = await until((s) => s.phase === 'latched', '설정 래치')
    gate = new Promise<void>((r) => { releaseGate = r })
    const releasing = d.releaseLatch(CWD, tripped.latch?.token as string)
    await Promise.race([inside, releasing])
    await d.close(CWD)
    releaseGate()
    expect((await releasing).ok).toBe(false)
    gate = null
    const reopened = await d.open({ cwd: CWD })
    expect(reopened.phase).not.toBe('open-failed')
  })

  // 풀기가 실행기를 닫은 뒤 다시 읽은 상태 파일이 화면이 본 것과 달라 거부되면, 그 상태 그대로 새 token의 래치를 보인다
  // (래치 카드 없이 open-failed만 남지 않는다). 사람이 다시 보고 그 token으로 풀면 사본으로 되돌리고 이어 간다.
  it('풀기 중 상태 파일이 바뀌어 거부되면 새 token의 래치 카드가 다시 뜨고, 그 token으로 풀린다', SLOW, async () => {
    let tamper: (() => void) | null = null
    const { backend } = fakeBackend()
    const d = createLoopDriver({
      appDataDir: appData, backend, ciRetryMs: 20, humanPollMs: 20,
      openExtras: { gh, template: TEMPLATE, executorEnv: repos.env, commandTimeoutMs: 60_000 },
      onState: (s) => { pushed.push(s) },
      openLoopImpl: async (o) => {
        const r = await openLoop(o)
        if (r.ok) {
          const close = r.loop.close.bind(r.loop)
          r.loop.close = async () => {
            await close()
            const t = tamper
            tamper = null
            t?.()
          }
        }
        return r
      },
    })
    drivers.push(d)
    const CWD = repos.work
    await d.open({ cwd: CWD })
    repos.git(['config', 'user.name', 'Someone Else'])
    await d.start(CWD, 'M1')
    const tripped = await until((s) => s.phase === 'latched', '설정 래치')
    const file = path.join(repos.work, DOCS.runState)
    const legit = fs.readFileSync(file, 'utf8')
    tamper = () => {
      const raw = JSON.parse(legit) as { milestoneBase: string | null }
      raw.milestoneBase = 'e'.repeat(40)
      fs.writeFileSync(file, JSON.stringify(raw, null, 2))
    }
    const refused = await d.releaseLatch(CWD, tripped.latch?.token as string)
    expect(refused.ok).toBe(false)
    expect(refused.reason).toContain('상태 파일이 바뀌어')
    // 실행기는 닫힌 채(열기 실패 단계)지만 래치 카드가 함께 실린다 — 화면이 그 카드를 보인다
    expect(refused.status.phase).toBe('open-failed')
    expect(refused.status.latch).not.toBeNull()
    expect(refused.status.latch?.token).not.toBe(tripped.latch?.token)
    expect(refused.status.latch?.changed).toEqual(tripped.latch?.changed)
    const ok = await d.releaseLatch(CWD, refused.status.latch?.token as string)
    expect(ok.ok).toBe(true)
    expect(ok.status.latch).toBeNull()
    expect(fs.readFileSync(file, 'utf8')).toBe(legit)
  })

  // 다시 연 뒤 상태를 사본으로 되돌리는 동안 닫아도 새 실행기를 닫는다(잠금이 남지 않는다)
  it('풀기의 되돌리기 도중 닫으면 새로 연 실행기를 닫는다 — 다시 열면 래치가 그대로 보인다', SLOW, async () => {
    let gate: Promise<void> | null = null
    let entered: () => void = () => {}
    const inside = new Promise<void>((r) => { entered = r })
    let releaseGate: () => void = () => {}
    const { backend } = fakeBackend()
    const d = createLoopDriver({
      appDataDir: appData, backend, ciRetryMs: 20, humanPollMs: 20,
      openExtras: { gh, template: TEMPLATE, executorEnv: repos.env, commandTimeoutMs: 60_000 },
      onState: (s) => { pushed.push(s) },
      openLoopImpl: async (o) => {
        const r = await openLoop(o)
        if (r.ok) {
          const digest = r.loop.digest
          r.loop.digest = {
            ...digest,
            writeCopy: async (key, text) => {
              if (gate) { entered(); await gate }
              return digest.writeCopy(key, text)
            },
          }
        }
        return r
      },
    })
    drivers.push(d)
    const CWD = repos.work
    await d.open({ cwd: CWD })
    await d.start(CWD, 'M1')
    await until((s) => s.cards.length === 1, '질문 카드')
    await d.close(CWD)
    const file = path.join(repos.work, DOCS.runState)
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { milestoneBase: string | null }
    raw.milestoneBase = 'd'.repeat(40)
    fs.writeFileSync(file, JSON.stringify(raw))
    pushed = []
    const latched = await d.open({ cwd: CWD })
    expect(latched.phase).toBe('latched')
    gate = new Promise<void>((r) => { releaseGate = r })
    const releasing = d.releaseLatch(CWD, latched.latch?.token as string)
    // 풀기가 되돌리기에 닿기 전에 거부되면 기다리지 않고 바로 실패로 본다
    await Promise.race([inside, releasing])
    await d.close(CWD)
    releaseGate()
    expect((await releasing).ok).toBe(false)
    gate = null
    const reopened = await d.open({ cwd: CWD })
    expect(reopened.phase).toBe('latched')
  })
})

// 구동 오류 같은 알림(note)은 단계가 바뀌면 지운다(오래 남아 다른 단계의 사유처럼 보이지 않게)
describe('알림은 단계가 바뀌면 지운다 (M09 G4 검수 사소 6)', () => {
  it('알림은 그 단계 동안만 보이고, 단계가 바뀐 상태에는 남지 않는다', SLOW, async () => {
    // 첫 step 한 번만 깨지게 한다 — 구동 오류 알림이 running 단계에 뜬다
    let broke = false
    const { backend, rec } = fakeBackend()
    const d = createLoopDriver({
      appDataDir: appData, backend, ciRetryMs: 20, humanPollMs: 20,
      openExtras: { gh, template: TEMPLATE, executorEnv: repos.env, commandTimeoutMs: 60_000 },
      onState: (s) => { pushed.push(s) },
      openLoopImpl: async (o) => {
        const r = await openLoop(o)
        if (r.ok) {
          const step = r.loop.runner.step.bind(r.loop.runner)
          r.loop.runner.step = async () => {
            if (!broke) { broke = true; throw new Error('한 번 깨진 단계') }
            return step()
          }
        }
        return r
      },
    })
    drivers.push(d)
    const CWD = repos.work
    await d.open({ cwd: CWD })
    await d.start(CWD, 'M1')
    const noted = await until((s) => s.reason?.includes('한 번 깨진 단계') === true, '구동 오류 알림')
    expect(noted.phase).toBe('running')
    // 구동 오류는 메인 대화 기록에 예외 사건(error)으로도 남는다. 모델 턴은 열지 않는다
    const errors = d.mainRead(CWD).items.flatMap((i) => (i.kind === 'event' && i.event.kind === 'error' ? [i.event.text] : []))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('한 번 깨진 단계')
    expect(rec.starts.some((s) => String(s.messages.at(-1)?.content).includes('한 번 깨진 단계'))).toBe(false)
    // 같은 단계에서는 알림이 남는다 — 다시 열면 구동을 다시 걸어 질문 카드가 뜬다(단계는 그대로 running)
    await d.open({ cwd: CWD })
    const carded = await until((s) => s.cards.length === 1, '질문 카드')
    expect(carded.phase).toBe('running')
    expect(carded.reason).toContain('한 번 깨진 단계')
    d.answerCard(CWD, carded.cards[0].requestId, { kind: 'question', answers: [['덧셈']] })
    const waiting = await until((s) => s.phase === 'waiting-human' && s.approval !== null, '스펙 승인')
    expect(waiting.reason).toBeNull()
  })
})

// 그래프 읽기는 실행기를 열지 않아도 답한다(원격 없는 저장소처럼 열기가 실패한 폴더도). 열 때 쓰는 템플릿과 같은 것을 쓴다
describe('구동자 그래프 읽기 (M10 G5)', () => {
  it('열지 않은 폴더에도 실행기가 쓸 템플릿(시험이 끼운 것, 없으면 번들)의 그래프를 준다', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-graph-'))
    try {
      const custom = createLoopDriver({ appDataDir: tmp, openExtras: { template: TEMPLATE } })
      const r = custom.graph(path.join(tmp, 'nowhere'))
      expect(r.ok).toBe(true)
      if (r.ok) expect([r.graph.nodes.find((n) => n.id === 'checks')?.commands, r.graph.failLimit]).toEqual([[OK_CMD], FAIL_LIMIT])
      const bundled = createLoopDriver({ appDataDir: tmp }).graph(tmp)
      expect(bundled.ok && bundled.graph.nodes.find((n) => n.id === 'checks')?.commands).toEqual(['npm run build', 'npm test'])
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})

// 자동 모드가 꺼진 채 다시 열면, 여는 쪽의 상태 계산과 구동(kick)의 읽기가 경쟁해도 running 한 장이 끼지 않는다.
// running이 끼면 알림기가 열쇠를 지워 같은 blocked를 또 알린다
// 끝난 실행이 있는 폴더(옛 템플릿 해시 포함)를 열면 시작 전과 안내 한 줄이고, 새 마일스톤을 시작하면 보관하고 새 실행을 연다
describe('두 번째 마일스톤 (M10 G6)', () => {
  async function plant(status: 'done' | 'running'): Promise<string> {
    const made = createRunState(TEMPLATE.template, 'a'.repeat(64), 'M01', 'master')
    if (!made.ok) throw new Error(made.reason)
    const state = status === 'done' ? drive(TEMPLATE.template, made.state).state : made.state
    expect(state.status).toBe(status)
    const text = runStateText(state)
    const key = repoKeyOf(fs.realpathSync.native(repos.work))
    const store = createFileDigestStore(path.join(appData, 'digests'))
    fs.mkdirSync(path.join(repos.work, DOCS.goalsDir), { recursive: true })
    fs.writeFileSync(path.join(repos.work, DOCS.runState), text)
    fs.writeFileSync(path.join(repos.work, DOCS.milestoneSpec), '# M01 스펙\n')
    fs.writeFileSync(path.join(repos.work, DOCS.goalsDir, 'G1.md'), '# 첫 목표\n')
    await store.writeCopy(key, text)
    await store.write(key, stateDigest(JSON.parse(text)))
    return text
  }

  it('옛 해시의 끝난 실행은 시작 전과 안내 한 줄이고 알리지 않는다 — 시작하면 보관하고 새 실행을 연다', SLOW, async () => {
    const text = await plant('done')
    const shown: string[] = []
    const notifier = createLoopNotifier({ appDataDir: path.join(appData, 'loop'), notify: { show: (n) => { shown.push(n.body) } } })
    const { d } = driver({ onState: (s) => { pushed.push(s); void notifier.observe(s) } })
    const opened = await d.open({ cwd: repos.work })
    expect(opened.phase).toBe('not-started')
    // 안내는 사람을 부르는 사유(reason)가 아니라 강조 없는 안내 칸이다
    expect(opened.reason).toBeNull()
    expect(opened.notice).toBe('끝난 실행(M01) — 새 마일스톤을 시작하면 보관해요')
    expect(opened.milestoneId).toBeNull()
    // 현황판·그래프가 끝난 실행을 지금 실행으로 그리지 않는다
    expect([opened.node, opened.goals, opened.recentLines]).toEqual([null, [], []])
    await new Promise((res) => setTimeout(res, 200))
    expect(shown).toEqual([])
    const started = await d.start(repos.work, 'M02')
    expect(started.phase).not.toBe('blocked')
    expect(started.milestoneId).toBe('M02')
    expect(started.reason).toBeNull()
    const archive = path.join(repos.work, '.agentdeck', 'archive', 'M01')
    expect(fs.readFileSync(path.join(archive, 'run-state.json'), 'utf8')).toBe(text)
    expect(fs.readFileSync(path.join(archive, 'milestone-spec.md'), 'utf8')).toBe('# M01 스펙\n')
    expect(fs.readFileSync(path.join(archive, 'goals', 'G1.md'), 'utf8')).toBe('# 첫 목표\n')
    expect(fs.readdirSync(path.join(repos.work, DOCS.goalsDir))).toEqual([])
    expect((JSON.parse(fs.readFileSync(path.join(repos.work, DOCS.runState), 'utf8')) as RunState).milestoneId).toBe('M02')
    const asked = await until((s) => s.cards.length === 1, '새 실행의 브레인스토밍 질문')
    expect(asked.milestoneId).toBe('M02')
  })

  // 보관 도중 꺼짐 — persist 순서(옮기기 → 사본 → 상태 파일 → 다이제스트)의 두 틈을 저장소에 그대로 놓는다.
  // 위조 래치로 뜨는 것은 그대로다. 사람이 풀고 시작하면 새 실행 M02 하나로 수렴해야 한다
  async function crashMidArchive(copyWritten: boolean): Promise<{ archive: string; old: string }> {
    const old = await plant('done')
    const archive = path.join(repos.work, '.agentdeck', 'archive', 'M01')
    fs.mkdirSync(path.join(archive, 'goals'), { recursive: true })
    fs.renameSync(path.join(repos.work, DOCS.goalsDir, 'G1.md'), path.join(archive, 'goals', 'G1.md'))
    fs.renameSync(path.join(repos.work, DOCS.milestoneSpec), path.join(archive, 'milestone-spec.md'))
    fs.renameSync(path.join(repos.work, DOCS.runState), path.join(archive, 'run-state.json'))
    if (copyWritten) {
      const made = createRunState(TEMPLATE.template, TEMPLATE.hash, 'M02', 'master')
      if (!made.ok) throw new Error(made.reason)
      await createFileDigestStore(path.join(appData, 'digests')).writeCopy(repoKeyOf(fs.realpathSync.native(repos.work)), runStateText(made.state))
    }
    return { archive, old }
  }

  async function reopenRelease(): Promise<{ d: LoopDriver; released: LoopStatus }> {
    const { d } = driver()
    const opened = await d.open({ cwd: repos.work })
    expect(opened.phase).toBe('latched')
    expect(opened.reason).toContain('상태 파일이 없다')
    const r = await d.releaseLatch(repos.work, opened.latch?.token as string)
    expect(r.ok).toBe(true)
    return { d, released: r.status }
  }

  const stateNow = (): RunState => JSON.parse(fs.readFileSync(path.join(repos.work, DOCS.runState), 'utf8')) as RunState

  it('상태 파일을 옮긴 뒤 새 상태를 쓰기 전에 꺼지면, 다시 열기 → 래치 → 풀기 → 시작이 새 실행으로 수렴한다', SLOW, async () => {
    const { archive, old } = await crashMidArchive(false)
    const { d, released } = await reopenRelease()
    // 풀기는 옛 사본(끝난 M01)을 되돌린다 — 다시 끝난 실행의 안내다
    expect(released.phase).toBe('not-started')
    expect(released.notice).toBe('끝난 실행(M01) — 새 마일스톤을 시작하면 보관해요')
    expect(fs.readFileSync(path.join(repos.work, DOCS.runState), 'utf8')).toBe(old)
    const started = await d.start(repos.work, 'M02')
    expect(started.phase).not.toBe('latched')
    expect(started.milestoneId).toBe('M02')
    expect(stateNow().milestoneId).toBe('M02')
    // 먼저 옮긴 보관본은 그대로이고, 되돌린 상태 파일은 시각 꼬리 자리에 따로 보관된다
    expect(fs.readFileSync(path.join(archive, 'run-state.json'), 'utf8')).toBe(old)
    expect(fs.readFileSync(path.join(archive, 'milestone-spec.md'), 'utf8')).toBe('# M01 스펙\n')
    const dirs = fs.readdirSync(path.dirname(archive)).sort()
    expect(dirs).toHaveLength(2)
    expect(dirs[0]).toBe('M01')
    expect(fs.readFileSync(path.join(path.dirname(archive), dirs[1], 'run-state.json'), 'utf8')).toBe(old)
    expect((await until((s) => s.cards.length === 1, '새 실행의 브레인스토밍 질문')).milestoneId).toBe('M02')
  })

  it('사본을 쓴 뒤 상태 파일을 쓰기 전에 꺼지면, 풀기가 새 실행을 되돌리고 이어지는 시작은 거부된다 — 새 실행 M02 하나로 수렴한다', SLOW, async () => {
    const { archive, old } = await crashMidArchive(true)
    const { d, released } = await reopenRelease()
    expect(released.milestoneId).toBe('M02')
    expect(released.phase).not.toBe('latched')
    expect(stateNow().milestoneId).toBe('M02')
    const started = await d.start(repos.work, 'M02')
    expect(started.reason).toContain('실행 상태가 이미 있다')
    expect(stateNow().milestoneId).toBe('M02')
    expect(fs.readdirSync(path.dirname(archive))).toEqual(['M01'])
    expect(fs.readFileSync(path.join(archive, 'run-state.json'), 'utf8')).toBe(old)
    expect((await until((s) => s.cards.length === 1, '새 실행의 브레인스토밍 질문')).milestoneId).toBe('M02')
  })

  it('옛 해시의 끝나지 않은 실행은 그대로 막히고 시작해도 옮기지 않는다', SLOW, async () => {
    await plant('running')
    const { d } = driver()
    const opened = await d.open({ cwd: repos.work })
    expect(opened.phase).toBe('blocked')
    expect(opened.reason).toContain('템플릿 해시')
    await d.start(repos.work, 'M02')
    expect(fs.existsSync(path.join(repos.work, '.agentdeck', 'archive'))).toBe(false)
    expect(fs.existsSync(path.join(repos.work, DOCS.milestoneSpec))).toBe(true)
  })
})

describe('자동 모드 꺼짐을 다시 열기 — 알림은 한 번 (M10 G5 검수 1)', () => {
  it('구동의 첫 읽기가 늦어도 상태는 처음부터 blocked이고, 다시 열기를 거듭해도 Windows 알림은 한 번이다', SLOW, async () => {
    const first = driver()
    await first.d.open({ cwd: repos.work })
    await first.d.start(repos.work, 'M1')
    await until((x) => x.cards.length === 1, '질문 카드')
    await first.d.closeAll()
    const shown: string[] = []
    const notifier = createLoopNotifier({ appDataDir: path.join(appData, 'loop'), notify: { show: (n) => { shown.push(n.body) } } })
    const phases: string[] = []
    for (let round = 0; round < 3; round++) {
      const { backend } = fakeBackend()
      const d = createLoopDriver({
        appDataDir: appData, backend, ciRetryMs: 20, humanPollMs: 20,
        openExtras: { gh, template: TEMPLATE, executorEnv: repos.env, commandTimeoutMs: 60_000 },
        autoModeCheck: () => '컨트롤 노드 mode-auto-bypass-allow가 꺼져 있다',
        // 구동(kick)의 첫 읽기를 늦춰 여는 쪽의 상태 계산이 먼저 끝나게 한다
        openLoopImpl: async (o) => {
          const r = await openLoop(o)
          if (!r.ok) return r
          const { runner } = r.loop
          let loads = 0
          const load: typeof runner.load = async () => {
            if (loads++ === 0) await new Promise((res) => setTimeout(res, 300))
            return runner.load()
          }
          return { ...r, loop: { ...r.loop, runner: { ...runner, load } } }
        },
        onState: (s) => { phases.push(s.phase); void notifier.observe(s) },
      })
      drivers.push(d)
      const s = await d.open({ cwd: repos.work })
      expect(s.phase, `${round}회째 열기`).toBe('blocked')
      await new Promise((res) => setTimeout(res, 500))
      await d.closeAll()
    }
    expect(phases).not.toContain('running')
    expect(shown).toHaveLength(1)
  })
})

describe('작업 폴더 목록 (M11 G4)', () => {
  it('[M11-G4 M10-16] 열린 루프의 작업 폴더만 읽고, 그 밖으로 나가는 경로와 닫힌 폴더는 목록이 없다', SLOW, async () => {
    const d = driver().d
    expect(await d.listDir(repos.work, '')).toEqual({ ok: false, entries: [] })
    await d.open({ cwd: repos.work })
    const top = await d.listDir(repos.work, '')
    expect(top.ok).toBe(true)
    expect(top.entries.map((e) => e.name)).toContain('README.md')
    expect(await d.listDir(repos.work, '..')).toEqual({ ok: false, entries: [] })
    expect(await d.listDir(repos.work, path.dirname(repos.work))).toEqual({ ok: false, entries: [] })
    await d.close(repos.work)
    expect(await d.listDir(repos.work, '')).toEqual({ ok: false, entries: [] })
  })
})

describe('재기동 뒤 다시 열기 (M11 G4)', () => {
  it('[M11-G4 M09-10] 앱을 끌 때 열려 있던 루프는 새 구동자의 reopenLast로 다시 열린다', SLOW, async () => {
    const first = driver().d
    expect((await first.open({ cwd: repos.work })).phase).toBe('not-started')
    await first.closeAll()
    expect(JSON.parse(fs.readFileSync(path.join(appData, 'open.json'), 'utf8'))).toEqual({ folders: [repos.work] })
    const next = driver().d
    expect(next.status(repos.work).phase).toBe('closed')
    pushed = []
    await next.reopenLast()
    // 상태는 구동(kick)이 끝날 때 push로 온다 — 화면이 받는 것과 같은 길로 본다
    expect(await until((s) => s.cwd === repos.work && s.phase === 'not-started', '다시 연 루프')).toMatchObject({ reason: null })
  })

  it('[M11-G4 M09-10] 사람이 닫은 루프는 reopenLast로 열리지 않는다', SLOW, async () => {
    const first = driver().d
    await first.open({ cwd: repos.work })
    await first.close(repos.work)
    await first.closeAll()
    expect(JSON.parse(fs.readFileSync(path.join(appData, 'open.json'), 'utf8'))).toEqual({ folders: [] })
    const next = driver().d
    await next.reopenLast()
    expect(next.status(repos.work).phase).toBe('closed')
  })

  it('[M11-G4 M09-10] 부팅의 다시 열기와 화면의 열기가 겹쳐도 실행기는 하나만 연다', SLOW, async () => {
    const first = driver().d
    await first.open({ cwd: repos.work })
    await first.closeAll()
    let opened = 0
    const { backend } = fakeBackend()
    const next = createLoopDriver({
      appDataDir: appData, backend, ciRetryMs: 20, humanPollMs: 20,
      openExtras: { gh, template: TEMPLATE, executorEnv: repos.env, commandTimeoutMs: 60_000 },
      openLoopImpl: async (o) => { opened++; return openLoop(o) },
    })
    drivers.push(next)
    const [, shown] = await Promise.all([next.reopenLast(), next.open({ cwd: repos.work })])
    expect(shown.phase).toBe('not-started')
    expect(opened).toBe(1)
    await next.closeAll()
    expect(JSON.parse(fs.readFileSync(path.join(appData, 'open.json'), 'utf8'))).toEqual({ folders: [repos.work] })
  })

  it('[M11-G4 M09-10] 다시 열기가 줄을 서 있는 동안 사람이 닫은 루프는 다시 열지 않는다', SLOW, async () => {
    const first = driver().d
    await first.open({ cwd: repos.work })
    await first.closeAll()
    let opened = 0
    let release!: () => void
    const gate = new Promise<void>((res) => { release = res })
    const { backend } = fakeBackend()
    const next = createLoopDriver({
      appDataDir: appData, backend, ciRetryMs: 20, humanPollMs: 20,
      openExtras: { gh, template: TEMPLATE, executorEnv: repos.env, commandTimeoutMs: 60_000 },
      openLoopImpl: async (o) => { if (opened++ === 0) await gate; return openLoop(o) },
    })
    drivers.push(next)
    const shown = next.open({ cwd: repos.work })
    const reopened = next.reopenLast()
    await new Promise((res) => setTimeout(res, 50))
    const closed = next.close(repos.work)
    release()
    await Promise.all([shown, reopened, closed])
    await next.closeAll()
    expect(opened).toBe(1)
    expect(next.status(repos.work).phase).toBe('closed')
    expect(JSON.parse(fs.readFileSync(path.join(appData, 'open.json'), 'utf8'))).toEqual({ folders: [] })
  })

  it('[M11-G4 M09-10] 열기에 실패한 폴더는 다시 열 목록에 남기지 않는다', SLOW, async () => {
    const { backend } = fakeBackend()
    const d = createLoopDriver({
      appDataDir: appData, backend, ciRetryMs: 20, humanPollMs: 20,
      openExtras: { gh, template: TEMPLATE, executorEnv: repos.env, commandTimeoutMs: 60_000 },
      openLoopImpl: async () => ({ ok: false, reason: '시험 — 열지 못한다' }),
    })
    drivers.push(d)
    expect((await d.open({ cwd: repos.work })).phase).toBe('open-failed')
    await d.closeAll()
    const stored = fs.existsSync(path.join(appData, 'open.json')) ? JSON.parse(fs.readFileSync(path.join(appData, 'open.json'), 'utf8')) : { folders: [] }
    expect(stored).toEqual({ folders: [] })
  })
})
