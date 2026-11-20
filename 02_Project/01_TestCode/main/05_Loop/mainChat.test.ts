// M10 G2 메인 대화 엔진(05_Loop/mainChat.ts) — 대본 백엔드와 임시 폴더로 프로덕션 모듈을 돈다(실행기 없이, 실행기 쪽 판정은 deps 흉내).
// 고정하는 것:
//   - 저장: `<앱 영역>/<repoKey>.main.json`에 세션 id·대화 기록·사건·대기 카드·브레인스토밍 방문·일시 정지 깃발이 산다(채팅 저장소 밖).
//   - 직렬화: 사용자 턴·시작 턴·사건 턴이 한 줄로 서서 같은 세션을 차례로 이어 쓴다(동시에 둘이 돌지 않는다).
//   - 여러 턴 브레인스토밍: 첫 부름에 시작 턴을 한 번 넣고, 스펙이 그대로인 턴 뒤에는 기다림(사람 기다림), 스펙이 바뀐 턴 뒤에는 통과(방문 처음 해시).
//     반려로 새 방문이 열리면 같은 세션에 반려 사유 턴을 잇는다.
//   - 재개: 다시 열면 저장된 세션 id로 이어 가고 시작 턴을 다시 넣지 않는다(세션을 본 뒤). 세션을 보기 전에 꺼졌으면 시작 턴을 다시 넣는다.
//     꺼질 때 기다리던 질문 카드는 다시 묻고(restored), 답은 사용자 턴으로 간다. 줄 서 있던 사용자 글은 다시 줄을 선다.
//   - 세션 id가 무효면 생존 문서로 새 세션을 연다. 새 메인 대화는 지난 기록을 보관하고 새 세션으로 연다(열린 방문이면 시작 턴).
//   - 쓰기 창: 잠금에 넘기는 canWrite는 방문이 열려 있고 실행기 판정(deps.canWrite)이 참일 때만 참이다.
//   - G2 독립 검수: 세션을 열기 전의 틈(도구 서버를 기다리는 동안)에도 닫기·멈춤이 듣고 세션을 열지 않는다. 세션이 받기 전의 글·사건은
//     저장본 대기열에 남아 다시 열면 한 번 간다(받은 뒤면 다시 보내지 않는다). 새 메인 대화를 여는 동안 들어온 글은 옛 세션을 잇지 않는다.
//     일시적 실패는 세션 id를 지우지 않는다. 칸이 빠진 저장 항목은 버리고 열며, 저장 실패는 알림으로 한 번 남긴다.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentBackend, AgentRun, AgentRunInput } from '@main/03_Agent/AgentBackend'
import { repoKeyOf } from '@main/05_Loop/digestStore'
import { MAIN_CHAT_RULE, openMainChat, readMainChatView, type MainChat, type MainChatDeps } from '@main/05_Loop/mainChat'
import { mainChatPath } from '@main/05_Loop/mainChatStore'
import type { WorkRequest } from '@main/05_Loop/ports'
import { createFsPort } from '@main/05_Loop/realPorts/fsPort'
import { DOCS } from '@main/05_Loop/survivalDocs'
import type { WorkNode } from '@main/05_Loop/template'
import type { AgentEvent } from '@shared/agentEvents'
import type { LoopEventKind } from '@shared/13_Loop/loop'
import { scriptedBackend, textOnly, type Script, type ScriptedBackend } from '../00_Helpers/mainChatFakes'

const NODE: WorkNode = {
  id: 'brainstorm', kind: 'work', title: '브레인스토밍', role: 'main',
  instruction: '사람과 다음 마일스톤의 방향을 이야기한다.', docs: ['milestoneSpec', 'decisions'],
} as WorkNode
const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')

let tmp: string
let root: string
let app: string
const chats: MainChat[] = []
let windowOpen = true
let turnSeq = 0
let turnEnds = 0

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-g2-main-'))
  root = path.join(tmp, 'repo')
  app = path.join(tmp, 'app', 'loop')
  fs.mkdirSync(root, { recursive: true })
  windowOpen = true
  turnEnds = 0
  turnSeq = 0
})
afterEach(async () => {
  for (const c of chats.splice(0)) await c.close()
  fs.rmSync(tmp, { recursive: true, force: true })
})

function open(fake: ScriptedBackend, over: Partial<MainChatDeps> = {}): MainChat {
  const chat = openMainChat({
    root, appDataDir: app, env: { PATH: process.env.PATH }, backend: fake.backend, fs: createFsPort(root),
    canWrite: async () => windowOpen,
    actions: { pause: async () => '멈춤', resume: async () => '이어 감', appendBacklog: async () => '적었다' },
    context: async () => '실행 상태: M1 · brainstorm · running · FAIL 0',
    nextTurnId: () => `t.${++turnSeq}`,
    onTurnEnd: () => { turnEnds++ },
    buildTools: async () => null,
    ...over,
  })
  chats.push(chat)
  return chat
}
const req = (key: string, rejected: string | null = null, spec: string | null = null): WorkRequest => ({
  milestoneId: 'M1', node: NODE, goal: null, docs: { milestoneSpec: spec, decisions: null }, visit: { key, rejected },
})
async function closeAll(): Promise<void> { for (const c of chats.splice(0)) await c.close() }
const fileOf = (): Record<string, unknown> => JSON.parse(fs.readFileSync(mainChatPath(app, repoKeyOf(root)), 'utf8')) as Record<string, unknown>
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
// 저장본 대기열의 글 — 저장은 비동기로 이어지므로 기대한 수가 될 때까지 다시 읽는다(읽는 도중의 빈 파일·없는 파일은 빈 대기열로 본다)
async function storedQueue(n: number): Promise<string[]> {
  let texts: string[] = []
  for (let i = 0; i < 200; i++) {
    try { texts = (fileOf()['queue'] as { text: string }[]).map((q) => q.text) } catch { texts = [] }
    if (texts.length === n) return texts
    await sleep(10)
  }
  return texts
}
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve: (v: T) => void = () => {}
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}
// 세션 사건 없이 오류로 끝나는 세션(일시적 spawn 실패 꼴)
const failingRun = (): AgentRun => ({
  events: (async function* () {
    yield { type: 'error', message: 'spawn EAGAIN' } as const
    yield { type: 'done' } as const
  })(),
  abort() {}, interrupt() {}, push() {}, respond() {},
})

describe('메인 대화 저장 (M10 G2)', () => {
  it('앱 영역의 <repoKey>.main.json에 세션 id·기록이 남고, 다시 읽은 보기에 실린다', async () => {
    const fake = scriptedBackend(textOnly('안녕'))
    const chat = open(fake)
    expect(chat.send('처음').ok).toBe(true)
    await chat.idle()
    const file = fileOf()
    expect(file['sessionId']).toBe('S1')
    expect(path.dirname(mainChatPath(app, repoKeyOf(root)))).toBe(app)
    const view = chat.view(root)
    expect(view.items.map((i) => i.kind)).toEqual(['user', 'assistant'])
    expect(view.items[1]).toMatchObject({ kind: 'assistant', text: '안녕', turn: 'user' })
    await closeAll()
    expect(readMainChatView(app, root).items).toHaveLength(2)
    expect(readMainChatView(app, path.join(tmp, 'nowhere')).items).toEqual([])
  })

  it('메인 대화 규칙은 시스템 프롬프트로 싣고, 잠금은 메인 대화 꼴(앱 안 도구 서버만, 쓰기 창)이다', async () => {
    const fake = scriptedBackend(textOnly('예'))
    const chat = open(fake)
    chat.send('안녕')
    await chat.idle()
    const input = fake.starts[0]
    expect(input.systemPrompt).toBe(MAIN_CHAT_RULE)
    expect(input.mode).toBe('auto')
    expect(input.loopLock?.repoRoot).toBe(root)
    expect(input.loopLock?.appLoopDir).toBe(app)
    expect(input.loopLock?.mainChat?.toolServer).toBe('agentdeck-main')
    expect(input.env).toEqual({ PATH: process.env.PATH })
  })
})

describe('턴 대기열 (M10 G2)', () => {
  it('동시에 들어온 사용자 턴과 사건 턴이 한 줄로 서서 같은 세션을 차례로 이어 쓴다', async () => {
    const fake = scriptedBackend(async function* (t) {
      await new Promise((r) => setTimeout(r, 15))
      yield { type: 'text', delta: `답 ${t.n}` }
      yield { type: 'done' }
    })
    const chat = open(fake)
    chat.send('하나')
    chat.send('둘')
    chat.recordEvent({ kind: 'goal-merged', node: 'merge', goal: 'G1', text: 'G1을 병합했다' }, true)
    chat.send('셋')
    expect(chat.view(root).queued + (chat.busy() ? 1 : 0)).toBe(4)
    await chat.idle()
    expect(fake.maxActive()).toBe(1)
    expect(fake.starts.map((s) => s.resumeSessionId ?? null)).toEqual([null, 'S1', 'S1', 'S1'])
    expect(fake.prompts[0]).toContain('하나')
    expect(fake.prompts[1]).toBe('둘')
    expect(fake.prompts[2]).toContain('[실행기 사건]')
    expect(fake.prompts[2]).toContain('G1을 병합했다')
    expect(fake.prompts[3]).toBe('셋')
    expect(turnEnds).toBe(4)
  })

  it('말하지 않는 사건은 기록에만 남고 턴을 넣지 않는다', async () => {
    const fake = scriptedBackend(textOnly('x'))
    const chat = open(fake)
    chat.recordEvent({ kind: 'node-start', node: 'implement', goal: 'G1', text: 'G1/implement 시작' })
    await chat.idle()
    expect(fake.starts).toEqual([])
    expect(chat.view(root).items).toMatchObject([{ kind: 'event', event: { kind: 'node-start' } }])
  })
})

describe('여러 턴 브레인스토밍 (M10 G2)', () => {
  it('시작 턴을 한 번 넣고, 스펙이 그대로면 기다림·스펙이 바뀌면 방문 처음 해시와 함께 통과한다', async () => {
    let writeSpec = false
    const fake = scriptedBackend(async function* (t) {
      if (writeSpec) t.write(DOCS.milestoneSpec, '# M1 스펙\n')
      yield { type: 'text', delta: writeSpec ? '초안을 썼다' : '범위는 무엇?' }
      yield { type: 'done' }
    })
    fs.mkdirSync(path.join(root, '.agentdeck'))
    fs.writeFileSync(path.join(root, DOCS.milestoneSpec), '# 옛 스펙\n')
    const chat = open(fake)
    const first = await chat.brainstorm(req('M1#0', null, '# 옛 스펙\n'))
    expect(first.waiting).toBe(true)
    await chat.idle()
    expect(fake.starts).toHaveLength(1)
    expect(fake.prompts[0].startsWith(NODE.instruction)).toBe(true)
    expect(fake.prompts[0]).toContain('# 옛 스펙')
    // 스펙이 그대로인 턴 뒤 — FAIL이 아니라 사람 기다림
    const waited = await chat.brainstorm(req('M1#0', null, '# 옛 스펙\n'))
    expect(waited.waiting).toBe(true)
    expect(chat.waitingUser()).toBe(true)
    expect(chat.view(root).brainstorming).toBe(true)
    expect(fake.starts).toHaveLength(1)
    // 사람이 말하고, 그 턴이 스펙을 고친다
    writeSpec = true
    chat.send('덧셈으로 하자')
    expect((await chat.brainstorm(req('M1#0'))).waiting).toBe(true)
    await chat.idle()
    const done = await chat.brainstorm(req('M1#0', null, '# M1 스펙\n'))
    expect(done).toMatchObject({ ok: true, baseline: { specSha256: sha('# 옛 스펙\n') } })
    expect(done.waiting).toBeUndefined()
    expect(chat.waitingUser()).toBe(false)
    expect(chat.view(root).brainstorming).toBe(false)
  })

  it('반려로 새 방문이 열리면 같은 세션에 반려 사유 턴을 잇는다', async () => {
    const fake = scriptedBackend(textOnly('알았다'))
    const chat = open(fake)
    await chat.brainstorm(req('M1#0'))
    await chat.idle()
    await chat.brainstorm(req('M1#1', '사람이 반려했다 — 범위가 넓다'))
    await chat.idle()
    expect(fake.starts).toHaveLength(2)
    expect(fake.starts[1].resumeSessionId).toBe('S1')
    expect(fake.prompts[1]).toContain('범위가 넓다')
    expect(fake.prompts[1].startsWith(NODE.instruction)).toBe(false)
    expect(chat.view(root).items.some((i) => i.kind === 'assistant' && i.turn === 'rejected')).toBe(true)
  })

  it('resetVisit 뒤에는 같은 방문 키여도 여는 턴을 다시 넣는다(새 실행)', async () => {
    const fake = scriptedBackend(textOnly('범위는?'))
    const chat = open(fake)
    await chat.brainstorm(req('M1#0'))
    await chat.idle()
    expect((await chat.brainstorm(req('M1#0'))).waiting).toBe(true)
    await chat.idle()
    expect(fake.starts).toHaveLength(1)
    chat.resetVisit()
    expect(chat.brainstorming()).toBe(false)
    await chat.brainstorm(req('M1#0'))
    await chat.idle()
    expect(fake.starts).toHaveLength(2)
    expect(fake.prompts[1].startsWith(NODE.instruction)).toBe(true)
  })

  it('쓰기 창 — 방문이 열려 있고 실행기 판정이 참일 때만 연다', async () => {
    const fake = scriptedBackend(textOnly('x'))
    const chat = open(fake)
    chat.send('안녕')
    await chat.idle()
    const canWrite = fake.starts[0].loopLock?.mainChat?.canWrite as () => Promise<boolean>
    expect(await canWrite()).toBe(false)
    await chat.brainstorm(req('M1#0'))
    await chat.idle()
    expect(await canWrite()).toBe(true)
    windowOpen = false
    expect(await canWrite()).toBe(false)
    windowOpen = true
    fs.mkdirSync(path.join(root, '.agentdeck'), { recursive: true })
    fs.writeFileSync(path.join(root, DOCS.milestoneSpec), '# 새 스펙\n')
    expect((await chat.brainstorm(req('M1#0'))).ok).toBe(true)
    expect(await canWrite()).toBe(false)
  })
})

describe('재개 (M10 G2)', () => {
  it('다시 열면 저장된 세션 id로 이어 가고, 세션을 본 시작 턴은 다시 넣지 않는다', async () => {
    const fake = scriptedBackend(textOnly('범위는?'))
    await open(fake).brainstorm(req('M1#0'))
    await chats[0].idle()
    await closeAll()
    const again = open(fake)
    expect((await again.brainstorm(req('M1#0'))).waiting).toBe(true)
    await again.idle()
    expect(fake.starts).toHaveLength(1)
    again.send('덧셈')
    await again.idle()
    expect(fake.starts[1].resumeSessionId).toBe('S1')
  })

  it('세션을 보기 전에 꺼졌으면 시작 턴을 다시 넣는다', async () => {
    const hang: Script = async function* (t) {
      if (t.n === 1) { await t.answer('never'); return }
      yield { type: 'done' }
    }
    // 첫 start는 세션 사건 전에 끊긴다 — 대본 백엔드는 세션 사건을 먼저 내므로, 저장본의 시작 상태를 되돌려 흉내 낸다
    const fake = scriptedBackend(hang)
    const chat = open(fake)
    await chat.brainstorm(req('M1#0'))
    await new Promise((r) => setTimeout(r, 30))
    await closeAll()
    const file = fileOf() as { visit: { open: string }; sessionId: string | null }
    file.visit.open = 'queued'
    file.sessionId = null
    fs.writeFileSync(mainChatPath(app, repoKeyOf(root)), JSON.stringify(file))
    const again = open(fake)
    await again.brainstorm(req('M1#0'))
    await again.idle()
    expect(fake.starts).toHaveLength(2)
    expect(fake.prompts[1].startsWith(NODE.instruction)).toBe(false)
    expect(fake.prompts[1]).toContain(NODE.instruction)
  })

  it('꺼질 때 기다리던 질문 카드는 다시 묻고(restored), 그 답은 사용자 턴으로 간다', async () => {
    const fake = scriptedBackend(async function* (t) {
      if (t.n === 1) {
        yield { type: 'text', delta: '범위를 고르자' }
        yield t.question('ask-1', '범위는?')
        const a = await t.answer('ask-1')
        if (a === null) return
      }
      yield { type: 'text', delta: '답을 받았다' }
      yield { type: 'done' }
    })
    const chat = open(fake)
    chat.send('시작')
    for (let i = 0; i < 50 && chat.cards().length === 0; i++) await new Promise((r) => setTimeout(r, 10))
    const [card] = chat.cards()
    expect(card).toMatchObject({ kind: 'question', node: 'main', text: '범위를 고르자', requestId: 'st.1-ask-1' })
    expect(card.restored).toBeUndefined()
    await closeAll()
    const again = open(fake)
    const [restored] = again.cards()
    expect(restored).toMatchObject({ requestId: card.requestId, restored: true, kind: 'question' })
    expect(again.answerCard('nope', { kind: 'question', answers: [['예']] })).toBe(false)
    expect(again.answerCard(restored.requestId, { kind: 'permission', behavior: 'allow' })).toBe(false)
    expect(again.answerCard(restored.requestId, { kind: 'question', answers: [['예']] })).toBe(true)
    await again.idle()
    expect(again.cards()).toEqual([])
    expect(fake.starts.at(-1)?.resumeSessionId).toBe('S1')
    expect(fake.prompts.at(-1)).toContain('범위는?')
    expect(fake.prompts.at(-1)).toContain('예')
    expect(again.view(root).items.some((i) => i.kind === 'assistant' && i.turn === 'card-answer')).toBe(true)
  })

  it('줄 서 있던 사용자 글은 다시 열면 다시 줄을 선다', async () => {
    const fake = scriptedBackend(async function* (t) {
      if (t.n === 1) { await t.answer('never'); return }
      yield { type: 'done' }
    })
    const chat = open(fake)
    chat.send('하나')
    chat.send('둘')
    await new Promise((r) => setTimeout(r, 30))
    await closeAll()
    const again = open(fake)
    await again.idle()
    expect(fake.prompts.at(-1)).toBe('둘')
    expect(again.view(root).items.filter((i) => i.kind === 'user').map((i) => i.kind === 'user' && i.state)).toEqual(['sent', 'sent'])
  })

  it('세션 id가 무효면 생존 문서로 새 세션을 열고 그 id를 남긴다', async () => {
    const fake = scriptedBackend(textOnly('새로 이어 간다'))
    open(fake)
    await closeAll()
    const file = fileOf()
    file['sessionId'] = 'BAD'
    fs.writeFileSync(mainChatPath(app, repoKeyOf(root)), JSON.stringify(file))
    fs.mkdirSync(path.join(root, '.agentdeck'), { recursive: true })
    fs.writeFileSync(path.join(root, DOCS.milestoneSpec), '# 남은 스펙\n')
    const again = open(fake)
    again.send('어디까지 했지?')
    await again.idle()
    expect(fake.starts.map((s) => s.resumeSessionId ?? null)).toEqual(['BAD', null])
    expect(fake.prompts[1]).toContain('생존 문서')
    expect(fake.prompts[1]).toContain('# 남은 스펙')
    expect(fake.prompts[1]).toContain('실행 상태: M1')
    expect(fake.prompts[1]).toContain('어디까지 했지?')
    expect(fileOf()['sessionId']).toBe('S1')
    expect(again.view(root).items.some((i) => i.kind === 'notice' && i.text.includes('새 세션'))).toBe(true)
  })
})

describe('지난 메인 대화 읽기 (M10 G4)', () => {
  it('그 폴더의 보관 장만 최근 것부터 읽고, 깨진 장은 건너뛰며 파일을 건드리지 않는다', async () => {
    const { archiveRecord, blankRecord, listArchives } = await import('@main/05_Loop/mainChatStore')
    const key = repoKeyOf(root)
    expect(await listArchives(app, key)).toEqual([])
    const rec = (text: string) => ({ ...blankRecord(root), items: [{ id: `i-${text}`, at: '2026-11-19T00:00:00Z', kind: 'notice' as const, text }] })
    await archiveRecord(app, key, rec('첫 장'))
    await sleep(5)
    await archiveRecord(app, key, rec('둘째 장'))
    await archiveRecord(app, repoKeyOf(path.join(tmp, 'other')), rec('다른 폴더'))
    const dir = path.join(app, 'main-archive')
    fs.writeFileSync(path.join(dir, `${key}-9999-broken.json`), '{ 깨짐')
    const before = fs.readdirSync(dir).sort()
    const got = await listArchives(app, key)
    expect(got.map((a) => a.items.map((i) => (i.kind === 'notice' ? i.text : '')))).toEqual([['둘째 장'], ['첫 장']])
    expect(got.every((a) => a.id.startsWith(key) && !Number.isNaN(new Date(a.at).getTime()))).toBe(true)
    expect(await listArchives(app, key, 1)).toHaveLength(1)
    expect(fs.readdirSync(dir).sort()).toEqual(before)
  })
})

describe('새 메인 대화와 일시 정지 깃발 (M10 G2)', () => {
  it('새 메인 대화는 지난 기록을 보관하고 새 세션으로 연다 — 열린 방문이면 생존 문서로 시작 턴을 넣는다', async () => {
    const fake = scriptedBackend(textOnly('예'))
    const chat = open(fake)
    await chat.brainstorm(req('M1#0'))
    await chat.idle()
    chat.send('옛 대화')
    await chat.idle()
    expect((await chat.newChat()).ok).toBe(true)
    await chat.idle()
    const archive = path.join(app, 'main-archive')
    const kept = fs.readdirSync(archive)
    expect(kept).toHaveLength(1)
    expect(fs.readFileSync(path.join(archive, kept[0]), 'utf8')).toContain('옛 대화')
    expect(fake.starts.at(-1)?.resumeSessionId).toBeUndefined()
    expect(fake.prompts.at(-1)?.startsWith(NODE.instruction)).toBe(true)
    const items = chat.view(root).items
    expect(items.some((i) => i.kind === 'user')).toBe(false)
    expect(items[0]).toMatchObject({ kind: 'notice' })
    expect(chat.view(root).sessionId).toBe('S2')
  })

  // G4 검수 3·10 — 세션 id는 새 장을 알리지 못한다(null에서 null). 장 표지가 바뀌고, 새 장의 턴이 돌기 전에 알린다
  it('새 메인 대화는 보기의 장 표지를 바꾸고, 새 장의 첫 사건보다 먼저 onNewChat을 부른다', async () => {
    const fake = scriptedBackend(textOnly('예'))
    const seen: string[] = []
    const chat = open(fake, { onNewChat: () => { seen.push('new') }, onEvent: (_t, e) => { seen.push(e.type) } })
    const first = chat.view(root).chapter
    expect(first).not.toBe('')
    expect(chat.view(root).sessionId).toBeNull()
    expect((await chat.newChat()).ok).toBe(true)
    const second = chat.view(root).chapter
    expect(second).not.toBe(first)
    expect(chat.view(root).sessionId).toBeNull()
    expect(seen).toEqual(['new'])
    chat.send('새 장의 첫 말')
    await chat.idle()
    expect(seen[0]).toBe('new')
    expect(seen.length).toBeGreaterThan(1)
    expect(chat.view(root).chapter).toBe(second)
    expect(readMainChatView(app, root).chapter).toBe('')
  })

  it('방문이 없을 때 새 메인 대화의 첫 사용자 턴에도 생존 문서(스펙·실행 상태)를 싣는다', async () => {
    const fake = scriptedBackend(textOnly('예'))
    const chat = open(fake)
    chat.send('옛 이야기')
    await chat.idle()
    fs.mkdirSync(path.join(root, '.agentdeck'), { recursive: true })
    fs.writeFileSync(path.join(root, DOCS.milestoneSpec), '# 지금 스펙\n')
    expect((await chat.newChat()).ok).toBe(true)
    chat.send('이어서 하자')
    await chat.idle()
    expect(fake.starts.at(-1)?.resumeSessionId).toBeUndefined()
    expect(fake.prompts.at(-1)).toContain('생존 문서')
    expect(fake.prompts.at(-1)).toContain('# 지금 스펙')
    expect(fake.prompts.at(-1)).toContain('실행 상태: M1')
    expect(fake.prompts.at(-1)).toContain('이어서 하자')
  })

  it('닫는 중에 실행기가 부르면 취소(멈춤)가 아니라 기다림이다 — 닫기가 브레인스토밍을 멈춤으로 만들지 않는다', async () => {
    const fake = scriptedBackend(textOnly('x'))
    const chat = open(fake)
    const closing = chat.close()
    const r = await chat.brainstorm(req('M1#0'))
    await closing
    expect(r.waiting).toBe(true)
    expect(r.cancelled).toBeUndefined()
  })

  it('앱 안 도구 서버를 만들지 못하면 알림을 남기고 턴은 돈다', async () => {
    const fake = scriptedBackend(textOnly('x'))
    const chat = open(fake, { buildTools: async () => { throw new Error('zod 없음') } })
    chat.send('안녕')
    await chat.idle()
    expect(fake.starts).toHaveLength(1)
    expect(fake.starts[0].loopMcpServers).toBeUndefined()
    expect(chat.view(root).items.some((i) => i.kind === 'notice' && i.text.includes('zod 없음'))).toBe(true)
  })

  it('메인 대화 모듈은 채팅 경로(대화 저장소·실행 관리자·agent.run)를 쓰지 않는다', () => {
    const dir = path.resolve(__dirname, '../../../00_Source/main/05_Loop')
    for (const f of ['mainChat.ts', 'mainChatStore.ts', 'mainChatTools.ts']) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter((l) => /^\s*import\b|\bimport\(/.test(l)).join('\n')
      expect(src).not.toMatch(/ConversationStore|conversationStore|runManager|RunManager|agent\.run|06_Sessions|00_App|01_Ipc/)
    }
  })

  it('일시 정지 깃발은 앱 영역에 남아 다시 열어도 그대로다', async () => {
    const fake = scriptedBackend(textOnly('x'))
    const chat = open(fake)
    expect(chat.paused()).toBe(false)
    chat.setPaused(true)
    await closeAll()
    expect(open(fake).paused()).toBe(true)
  })

  it('세션 사건은 메인 대화 꼬리표(key main, SDK 세션 id)와 함께 나간다', async () => {
    const seen: { key: string; sessionId: string | null; type: string }[] = []
    const fake = scriptedBackend(textOnly('안녕'))
    const chat = open(fake, { onEvent: (tag, e: AgentEvent) => { seen.push({ key: tag.key, sessionId: tag.sessionId, type: e.type }) } })
    chat.send('x')
    await chat.idle()
    expect(seen.map((s) => s.type)).toEqual(['session', 'text', 'done'])
    expect(seen.every((s) => s.key === 'main' && s.sessionId === 'S1')).toBe(true)
  })
})

// G2 독립 검수 — 세션을 열기 전의 틈(생존 문서·도구 서버를 기다리는 동안)과 세션이 받기 전의 글
describe('세션을 열기 전의 틈 (M10 G2 검수)', () => {
  it('도구 서버를 기다리는 동안 닫으면 세션을 열지 않고 닫기가 끝난다(저장소 잠금을 쥔 채 남지 않는다)', async () => {
    const tools = deferred<Record<string, unknown> | null>()
    const fake = scriptedBackend(async function* (t) {
      yield t.question('ask-1')
      await t.answer('ask-1')
    })
    const chat = open(fake, { buildTools: () => tools.promise })
    chat.send('닫힐 글')
    await sleep(20)
    const closing = chat.close()
    tools.resolve(null)
    expect(await Promise.race([closing.then(() => 'closed'), sleep(3000).then(() => 'hung')])).toBe('closed')
    expect(fake.starts).toHaveLength(0)
  })

  // 받기 전의 턴(맨 앞)이 사용자 글인 꼴과 사건 턴인 꼴 — 둘 다 같은 길(storable)이다
  for (const first of ['user', 'event'] as const) {
    it(`세션이 받기 전의 턴(${first === 'user' ? '사용자 글' : '사건 턴'})은 저장본 대기열 맨 앞에 남고, 닫힌 뒤 다시 열면 한 번 간다`, async () => {
      const tools = deferred<Record<string, unknown> | null>()
      const fake = scriptedBackend(textOnly('x'))
      const chat = open(fake, { buildTools: () => tools.promise })
      const say = (): void => { chat.send('틈의 글') }
      const tell = (): void => { chat.recordEvent({ kind: 'halt', node: 'implement', goal: 'G1', text: '실행이 멈췄다' }, true) }
      if (first === 'user') { say(); tell() } else { tell(); say() }
      // 프로세스가 여기서 죽어도 — 세션이 받기 전의 턴은 저장본 대기열에 있다(돌고 있는 턴이 맨 앞)
      const expected = first === 'user' ? ['틈의 글', '실행이 멈췄다'] : ['실행이 멈췄다', '틈의 글']
      expect(await storedQueue(2)).toEqual(expected)
      expect(chat.busy()).toBe(true)
      const closing = chat.close()
      tools.resolve(null)
      expect(await Promise.race([closing.then(() => 'closed'), sleep(3000).then(() => 'hung')])).toBe('closed')
      expect(fake.starts).toHaveLength(0)
      expect(await storedQueue(2)).toEqual(expected)
      chats.splice(0)
      const fake2 = scriptedBackend(textOnly('받았다'))
      const again = open(fake2)
      await again.idle()
      // 새 세션의 첫 턴은 생존 문서(최근 대화 포함)를 싣는다 — 턴의 글은 프롬프트의 끝이다
      expect(fake2.prompts.filter((p) => p.endsWith('틈의 글'))).toHaveLength(1)
      expect(fake2.prompts.filter((p) => p.includes('[실행기 사건]'))).toHaveLength(1)
      expect(fake2.prompts.map((p) => p.endsWith('틈의 글'))).toEqual(first === 'user' ? [true, false] : [false, true])
      expect(again.view(root).items.filter((i) => i.kind === 'user')).toMatchObject([{ text: '틈의 글', state: 'sent' }])
      expect(await storedQueue(0)).toEqual([])
    })
  }

  it('도구 서버를 기다리는 동안의 멈춤(cancel)도 듣는다 — 세션을 열지 않고, 돌던 턴이 없으면 거짓이다', async () => {
    const tools = deferred<Record<string, unknown> | null>()
    const fake = scriptedBackend(textOnly('x'))
    const chat = open(fake, { buildTools: () => tools.promise })
    expect(chat.cancel()).toBe(false)
    chat.send('멈출 글')
    await sleep(20)
    expect(chat.cancel()).toBe(true)
    tools.resolve(null)
    await chat.idle()
    expect(fake.starts).toHaveLength(0)
    expect(chat.cancel()).toBe(false)
    expect(chat.view(root).items.some((i) => i.kind === 'notice' && i.text.includes('멈췄다'))).toBe(true)
  })

  it('세션이 받은 뒤에 닫힌 글은 다시 열어도 다시 보내지 않는다', async () => {
    const fake = scriptedBackend(async function* (t) {
      if (t.n === 1) { await t.answer('never'); return }
      yield { type: 'done' }
    })
    const chat = open(fake)
    chat.send('받은 글')
    for (let i = 0; i < 50 && fake.starts.length === 0; i++) await sleep(5)
    await sleep(20)
    await closeAll()
    expect(fileOf()['queue']).toEqual([])
    const again = open(fake)
    await again.idle()
    expect(fake.prompts.filter((p) => p.includes('받은 글'))).toHaveLength(1)
  })

  it('새 메인 대화를 여는 동안 들어온 글은 옛 세션을 잇지 않고 새 장에서 한 번 간다', async () => {
    const fake = scriptedBackend(textOnly('예'))
    const chat = open(fake)
    chat.send('옛 글')
    await chat.idle()
    expect(chat.view(root).sessionId).toBe('S1')
    const renewing = chat.newChat()
    chat.send('중간 글')
    expect((await renewing).ok).toBe(true)
    await chat.idle()
    expect(fake.starts.slice(1).map((s) => s.resumeSessionId ?? null)).toEqual([null])
    expect(fake.prompts.filter((p) => p.includes('중간 글'))).toHaveLength(1)
    const v = chat.view(root)
    expect(v.sessionId).toBe('S2')
    expect(v.items.filter((i) => i.kind === 'user').map((i) => (i.kind === 'user' ? [i.text, i.state] : null))).toEqual([['중간 글', 'sent']])
  })

  it('세션 사건 없이 끝난 일시적 실패는 저장된 세션 id를 지우지 않는다 — 새 세션 한 번만 더 해 보고 멈춘다', async () => {
    const fake = scriptedBackend(textOnly('예'))
    let failing = false
    const failed: AgentRunInput[] = []
    // 새 세션으로 다시 보내는 동안의 세션 id — 그 사이 꺼져도(저장본) 옛 id가 남아야 한다
    const idDuringRetry: (string | null)[] = []
    const flaky: AgentBackend = {
      ...fake.backend,
      start(req) {
        if (!failing) return fake.backend.start(req)
        failed.push(req)
        if (req.resumeSessionId === undefined) idDuringRetry.push(chat.view(root).sessionId)
        return failingRun()
      },
    }
    const chat = open(fake, { backend: flaky })
    chat.send('하나')
    await chat.idle()
    failing = true
    chat.send('둘')
    await chat.idle()
    expect(failed.map((s) => s.resumeSessionId ?? null)).toEqual(['S1', null])
    expect(idDuringRetry).toEqual(['S1'])
    expect(fileOf()['sessionId']).toBe('S1')
    expect(chat.view(root).items.some((i) => i.kind === 'notice' && i.text.includes('그대로 둔다'))).toBe(true)
    failing = false
    chat.send('셋')
    await chat.idle()
    expect(fake.starts.at(-1)?.resumeSessionId).toBe('S1')
    expect(fake.prompts.at(-1)).toBe('셋')
  })
})

describe('저장본 검사와 저장 실패 (M10 G2 검수)', () => {
  // G3 독립 검수 중요 1 — 모르는 사건 종류(이름이 바뀌기 전 빌드의 paused 꼴, 없는 종류)도 버린다. 화면이 모르는 종류의 모양을 찾다 무너지지 않게
  // 저장본에서 걸러 연다(G2 검수 때는 옛 사건을 기록으로 남겼다 — 그 선택을 뒤집는다)
  it('항목의 칸이 종류에 맞지 않거나 사건 종류를 모르면 버리고 연다 — 생존 문서를 싣는 턴이 깨지지 않는다', async () => {
    fs.mkdirSync(app, { recursive: true })
    const at = new Date().toISOString()
    fs.writeFileSync(mainChatPath(app, repoKeyOf(root)), JSON.stringify({
      version: 1, root, sessionId: null, everSession: true, cards: [], queue: [], visit: null, paused: false,
      items: [
        { id: 'a', at, kind: 'user' },
        { id: 'b', at, kind: 'event' },
        { id: 'c', at, kind: 'assistant', text: 42, turn: 'user' },
        { id: 'd', at, kind: 'notice' },
        { id: 'e', at, kind: 'event', event: { kind: 'paused', node: null, goal: null, text: '옛 사건' } },
        { id: 'f', at, kind: 'user', text: '남은 글', state: 'sent' },
        { id: 'g', at, kind: 'user', text: '상태가 이상한 글', state: 'lost' },
        { id: 'h', at, kind: 'event', event: { kind: 'toString', node: null, goal: null, text: '원형 이름의 사건' } },
        { id: 'i', at, kind: 'event', event: { kind: 'flag-raised', node: null, goal: null, text: '아는 사건' } },
      ],
    }))
    const fake = scriptedBackend(textOnly('예'))
    const chat = open(fake)
    expect(chat.view(root).items.map((i) => i.id)).toEqual(['f', 'i'])
    expect(readMainChatView(app, root).items.map((i) => i.id)).toEqual(['f', 'i'])
    chat.send('이어서')
    await chat.idle()
    expect(fake.starts).toHaveLength(1)
    expect(fake.prompts[0]).toContain('남은 글')
    expect(fake.prompts[0]).toContain('아는 사건')
    expect(fake.prompts[0]).not.toContain('옛 사건')
    expect(fake.prompts[0]).not.toContain('원형 이름의 사건')
  })

  it('아는 사건 종류는 모두 저장본에서 그대로 남는다 — 종류 표가 종류 하나도 빠뜨리지 않는다 (G3 검수)', () => {
    const kinds: LoopEventKind[] = [
      'node-start', 'node-end', 'fail', 'halt', 'error', 'goal-merged', 'milestone-pr', 'spec-approved', 'spec-rejected',
      'flag-raised', 'flag-lowered', 'resumed', 'backlog', 'latched', 'done',
    ]
    fs.mkdirSync(app, { recursive: true })
    const at = new Date().toISOString()
    fs.writeFileSync(mainChatPath(app, repoKeyOf(root)), JSON.stringify({
      version: 1, root, sessionId: null, everSession: false, cards: [], queue: [], visit: null, paused: false,
      items: kinds.map((kind, n) => ({ id: `k${n}`, at, kind: 'event', event: { kind, node: null, goal: null, text: kind } })),
    }))
    const items = readMainChatView(app, root).items
    expect(items.map((i) => (i.kind === 'event' ? i.event.kind : null))).toEqual(kinds)
  })

  it('저장하지 못하면 대화에 알림을 한 번 남긴다 — 실패가 이어져도 알림을 되풀이하지 않는다', async () => {
    // 앱 영역 자리에 파일이 있어 폴더를 만들지 못한다
    fs.mkdirSync(path.dirname(app), { recursive: true })
    fs.writeFileSync(app, '폴더가 아니다')
    const fake = scriptedBackend(textOnly('예'))
    const chat = open(fake)
    chat.send('하나')
    await chat.idle()
    chat.send('둘')
    await chat.idle()
    expect(fake.starts).toHaveLength(2)
    const notes = chat.view(root).items.filter((i) => i.kind === 'notice' && i.text.includes('저장하지 못했다'))
    expect(notes).toHaveLength(1)
  })
})
