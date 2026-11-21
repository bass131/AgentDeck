// 메인 대화의 문서 초안 카드 — 대본 백엔드와 임시 폴더로 프로덕션 openMainChat을 돈다. 확정 쓰기는 실제 Taste 저장소다.
// 고정하는 것:
//   - 제안은 쓰기 검사를 미리 돌린다. 통과하면 쓰지 않고 승인 카드(원문 미리보기)를 띄우고, 걸리면 문제를 결과로 돌려주고 카드가 없다.
//   - 확정은 앱이 쓴다(전역 Taste는 앱 데이터 폴더). 같은 카드는 한 번만 확정되고, 쓰지 않은 확정은 이유와 함께 카드가 남는다.
//   - 반려는 사람의 이유 한 줄과 함께 다음 턴으로 메인에게 간다. 카드는 재기동 뒤에도 남고 그대로 확정된다.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { repoKeyOf } from '@main/05_Loop/digestStore'
import { openMainChat, type MainChat, type MainChatDeps } from '@main/05_Loop/mainChat'
import { mainChatPath } from '@main/05_Loop/mainChatStore'
import { createFsPort } from '@main/05_Loop/realPorts/fsPort'
import { tasteCheck } from '@main/13_Taste/tasteDialog'
import { globalTastePath, writeTasteDraft } from '@main/13_Taste/tasteStore'
import type { LoopCard } from '@shared/13_Loop/loop'
import type { TasteDraft } from '@shared/14_Taste/taste'
import { serializeTaste, type TasteItem } from '@shared/14_Taste/tasteDoc'
import { scriptedBackend, textOnly, type ScriptedBackend } from '../00_Helpers/mainChatFakes'

const ITEMS: TasteItem[] = [{ id: 'T1', title: '정보 밀도', fields: [{ name: '원칙', text: '한 화면에 카드 여섯 장 이상' }] }]
const GLOBAL: TasteDraft = { doc: 'global-taste', items: ITEMS }

let tmp: string
let root: string
let app: string
let ud: string
let confirms: TasteDraft[]
let refuse: string | null
const chats: MainChat[] = []

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-taste-draft-'))
  root = path.join(tmp, 'repo')
  app = path.join(tmp, 'app', 'loop')
  ud = path.join(tmp, 'ud')
  fs.mkdirSync(root, { recursive: true })
  fs.mkdirSync(ud, { recursive: true })
  confirms = []
  refuse = null
})
afterEach(async () => {
  for (const c of chats.splice(0)) await c.close()
  fs.rmSync(tmp, { recursive: true, force: true })
})

function open(fake: ScriptedBackend, over: Partial<MainChatDeps> = {}): MainChat {
  const dirs = { userDataDir: ud, root }
  const chat = openMainChat({
    root, appDataDir: app, env: { PATH: process.env.PATH }, backend: fake.backend, fs: createFsPort(root),
    canWrite: async () => false,
    actions: { pause: async () => '', resume: async () => '', appendBacklog: async () => '', proposeTasteDoc: async () => '' },
    context: async () => '실행 상태: 아직 시작하지 않았다',
    nextTurnId: (() => { let n = 0; return () => `t.${++n}` })(),
    buildTools: async () => null,
    taste: {
      check: (d) => tasteCheck(d, dirs),
      confirm: async (d) => {
        confirms.push(d)
        if (refuse !== null) return { ok: false, reason: refuse }
        return { ok: true, summary: await writeTasteDraft(d, dirs) }
      },
    },
    ...over,
  })
  chats.push(chat)
  return chat
}
const tasteCards = (chat: MainChat): Extract<LoopCard, { kind: 'taste' }>[] =>
  chat.view(root).cards.filter((c): c is Extract<LoopCard, { kind: 'taste' }> => c.kind === 'taste')
async function closeAll(): Promise<void> { for (const c of chats.splice(0)) await c.close() }

describe('보이는 글과 보내는 글이 다른 턴', () => {
  it('prompt를 주면 세션에는 그 글이 가고 대화 기록에는 짧은 글이 남는다', async () => {
    const fake = scriptedBackend(textOnly('물어볼게'))
    const chat = open(fake)
    expect(chat.send('전역 Taste 문답을 열었다', { prompt: '[Taste 문답] 긴 여는 글' }).ok).toBe(true)
    await chat.idle()
    expect(fake.prompts).toHaveLength(1)
    expect(fake.prompts[0].endsWith('---\n\n[Taste 문답] 긴 여는 글')).toBe(true)
    expect(chat.view(root).items[0]).toMatchObject({ kind: 'user', text: '전역 Taste 문답을 열었다', state: 'sent' })
  })
})

describe('문서 초안의 제안', () => {
  it('검사를 통과한 초안은 쓰지 않고 원문 미리보기 카드로 뜬다', async () => {
    const chat = open(scriptedBackend(textOnly('')))
    const said = await chat.proposeTasteDoc(GLOBAL)
    expect(said).toContain('승인 카드')
    const [card] = tasteCards(chat)
    expect(card).toMatchObject({ kind: 'taste', node: 'main', goal: null, draft: GLOBAL, preview: serializeTaste({ scope: 'global', items: ITEMS }) })
    expect(fs.existsSync(globalTastePath(ud))).toBe(false)
  })

  it('검사에 걸린 초안은 문제를 결과로 돌려주고 카드를 띄우지 않는다', async () => {
    const chat = open(scriptedBackend(textOnly('')))
    const said = await chat.proposeTasteDoc({ doc: 'global-taste', items: [{ id: 'T1', title: '빈 항목', fields: [] }] })
    expect(said).toMatch(/^제안하지 않았다/)
    expect(said).toContain('T1에 칸이 하나도 없다')
    fs.mkdirSync(path.join(root, 'docs', 'agentdeck'), { recursive: true })
    fs.writeFileSync(path.join(root, 'docs', 'agentdeck', '헌장.md'), '# 프로젝트 헌장\n\n## 소개\n사람이 쓴 글\n')
    const existing = await chat.proposeTasteDoc({ doc: 'charter', charter: { goal: ['끝까지 맡는다.'], nonGoals: null } })
    expect(existing).toContain('덮어쓰지 않는다')
    expect(existing).toContain('모르는 절')
    expect(tasteCards(chat)).toEqual([])
  })

  it('같은 문서의 새 제안은 앞 카드를 갈음하고, 다른 문서의 카드는 그대로 둔다', async () => {
    const chat = open(scriptedBackend(textOnly('')))
    await chat.proposeTasteDoc(GLOBAL)
    await chat.proposeTasteDoc({ doc: 'charter', charter: { goal: ['끝까지 맡는다.'], nonGoals: null } })
    const next: TasteDraft = { doc: 'global-taste', items: [...ITEMS, { id: 'T2', title: '말투', fields: [{ name: '금지', text: '존댓말' }] }] }
    await chat.proposeTasteDoc(next)
    expect(tasteCards(chat).map((c) => c.draft)).toEqual([{ doc: 'charter', charter: { goal: ['끝까지 맡는다.'], nonGoals: null } }, next])
  })
})

describe('문서 초안 카드의 확정과 반려', () => {
  it('확정하면 앱이 전역 Taste를 앱 데이터 폴더에 쓰고 카드가 빠진다', async () => {
    const chat = open(scriptedBackend(textOnly('')))
    await chat.proposeTasteDoc(GLOBAL)
    const [card] = tasteCards(chat)
    expect(chat.answerCard(card.requestId, { kind: 'taste', decision: 'confirm' })).toBe(true)
    await chat.idle()
    expect(fs.readFileSync(globalTastePath(ud), 'utf8')).toBe(card.preview)
    expect(tasteCards(chat)).toEqual([])
    expect(chat.view(root).items.at(-1)).toMatchObject({ kind: 'notice', text: expect.stringContaining('전역 Taste 초안을 확정했다') })
  })

  it('같은 카드는 두 번 확정되지 않는다 — 쓰는 동안에도, 쓴 뒤에도', async () => {
    const chat = open(scriptedBackend(textOnly('')))
    await chat.proposeTasteDoc(GLOBAL)
    const [card] = tasteCards(chat)
    expect(chat.answerCard(card.requestId, { kind: 'taste', decision: 'confirm' })).toBe(true)
    expect(tasteCards(chat)[0]?.confirming).toBe(true)
    expect(chat.answerCard(card.requestId, { kind: 'taste', decision: 'confirm' })).toBe(false)
    expect(chat.answerCard(card.requestId, { kind: 'taste', decision: 'reject', reason: '늦은 반려' })).toBe(false)
    await chat.idle()
    expect(chat.answerCard(card.requestId, { kind: 'taste', decision: 'confirm' })).toBe(false)
    expect(confirms).toHaveLength(1)
  })

  it('초안 카드에 질문·권한의 답은 받지 않고, 모르는 카드의 확정도 받지 않는다', async () => {
    const chat = open(scriptedBackend(textOnly('')))
    await chat.proposeTasteDoc(GLOBAL)
    const [card] = tasteCards(chat)
    expect(chat.answerCard(card.requestId, { kind: 'question', answers: [['예']] })).toBe(false)
    expect(chat.answerCard(card.requestId, { kind: 'permission', behavior: 'allow' })).toBe(false)
    expect(chat.answerCard('taste-없음', { kind: 'taste', decision: 'confirm' })).toBe(false)
    expect(tasteCards(chat)).toHaveLength(1)
    expect(confirms).toEqual([])
  })

  it('쓰지 않은 확정은 이유를 카드와 대화에 남기고, 카드는 다시 확정할 수 있다', async () => {
    const chat = open(scriptedBackend(textOnly('')))
    await chat.proposeTasteDoc(GLOBAL)
    const [card] = tasteCards(chat)
    refuse = '작업 트리가 깨끗하지 않다'
    chat.answerCard(card.requestId, { kind: 'taste', decision: 'confirm' })
    await chat.idle()
    expect(tasteCards(chat)[0]).toMatchObject({ requestId: card.requestId, confirming: false, refused: '작업 트리가 깨끗하지 않다' })
    expect(chat.view(root).items.at(-1)).toMatchObject({ kind: 'notice', text: expect.stringContaining('작업 트리가 깨끗하지 않다') })
    refuse = null
    expect(chat.answerCard(card.requestId, { kind: 'taste', decision: 'confirm' })).toBe(true)
    await chat.idle()
    expect(tasteCards(chat)).toEqual([])
    expect(confirms).toHaveLength(2)
  })

  it('반려는 이유 한 줄과 함께 다음 턴으로 메인에게 가고, 쓰지 않는다', async () => {
    const fake = scriptedBackend(textOnly('고쳐 볼게'))
    const chat = open(fake)
    await chat.proposeTasteDoc(GLOBAL)
    const [card] = tasteCards(chat)
    expect(chat.answerCard(card.requestId, { kind: 'taste', decision: 'reject', reason: '   ' })).toBe(false)
    expect(chat.answerCard(card.requestId, { kind: 'taste', decision: 'reject', reason: '금지 칸이 없다' })).toBe(true)
    await chat.idle()
    expect(fake.prompts).toHaveLength(1)
    expect(fake.prompts[0]).toContain('[문서 반려]')
    expect(fake.prompts[0]).toContain('전역 Taste')
    expect(fake.prompts[0]).toContain('금지 칸이 없다')
    expect(fake.prompts[0]).toContain('propose_taste_doc')
    expect(tasteCards(chat)).toEqual([])
    expect(confirms).toEqual([])
    expect(fs.existsSync(globalTastePath(ud))).toBe(false)
  })

  it('새 메인 대화는 초안 카드를 새 장으로 옮긴다', async () => {
    const chat = open(scriptedBackend(textOnly('')))
    await chat.proposeTasteDoc(GLOBAL)
    const [card] = tasteCards(chat)
    expect((await chat.newChat()).ok).toBe(true)
    expect(tasteCards(chat).map((c) => c.requestId)).toEqual([card.requestId])
    expect(chat.answerCard(card.requestId, { kind: 'taste', decision: 'confirm' })).toBe(true)
    await chat.idle()
    expect(fs.readFileSync(globalTastePath(ud), 'utf8')).toBe(card.preview)
  })

  it('카드는 재기동 뒤에도 남고 그대로 확정된다', async () => {
    const first = open(scriptedBackend(textOnly('')))
    await first.proposeTasteDoc(GLOBAL)
    const [card] = tasteCards(first)
    await closeAll()
    const again = open(scriptedBackend(textOnly('')))
    const [back] = tasteCards(again)
    expect(back).toMatchObject({ requestId: card.requestId, draft: GLOBAL, preview: card.preview })
    expect(again.answerCard(card.requestId, { kind: 'taste', decision: 'confirm' })).toBe(true)
    await again.idle()
    expect(fs.readFileSync(globalTastePath(ud), 'utf8')).toBe(card.preview)
  })

  it('쓰는 중에 꺼진 카드는 다시 열면 확정 중이 아니고, 결과를 확인하라는 이유가 붙는다', async () => {
    let release: () => void = () => {}
    const first = open(scriptedBackend(textOnly('')), {
      taste: {
        check: (d) => tasteCheck(d, { userDataDir: ud, root }),
        confirm: () => new Promise((r) => { release = () => r({ ok: true, summary: '' }) }),
      },
    })
    await first.proposeTasteDoc(GLOBAL)
    const [card] = tasteCards(first)
    first.answerCard(card.requestId, { kind: 'taste', decision: 'confirm' })
    const file = mainChatPath(app, repoKeyOf(root))
    let mid = ''
    for (let i = 0; i < 100 && !mid.includes('"confirming": true'); i++) {
      await new Promise((r) => setTimeout(r, 10))
      try { mid = fs.readFileSync(file, 'utf8') } catch { mid = '' }
    }
    expect(mid).toContain('"confirming": true')
    release()
    await closeAll()
    // 쓰는 중에 프로세스가 죽은 꼴 — 그때의 저장본으로 다시 연다
    fs.writeFileSync(file, mid)
    const again = open(scriptedBackend(textOnly('')))
    const [back] = tasteCards(again)
    expect(back.confirming).toBe(false)
    expect(back.refused).toContain('확인')
  })
})
