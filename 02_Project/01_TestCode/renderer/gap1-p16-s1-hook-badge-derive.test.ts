import { describe, it, expect } from 'vitest'
import type { ThreadItem } from '../../../02_Project/00_Source/renderer/src/store/threadTypes'

const HOOK_BADGE_MODULE: string = '../../../02_Project/00_Source/renderer/src/store/hookBadge'

type HookBadgeModule = {
  deriveHookTurnBadges: (thread: ThreadItem[]) => Set<string>
}

async function loadDerive(): Promise<HookBadgeModule['deriveHookTurnBadges']> {
  const mod = (await import(HOOK_BADGE_MODULE)) as HookBadgeModule
  return mod.deriveHookTurnBadges
}

const user = (id: string, text = '질문'): ThreadItem => ({ kind: 'msg', id, role: 'user', text })
const assistant = (id: string, text = '답변'): ThreadItem => ({ kind: 'msg', id, role: 'assistant', text })
const toolgroup = (id: string): ThreadItem => ({ kind: 'toolgroup', id, tools: [] })
const denyHook = (id: string): ThreadItem => ({ kind: 'permission-denied', id, toolName: 'Bash', decisionReasonType: 'hook', decisionReason: 'PreToolUse 훅 차단' })
const denyRule = (id: string): ThreadItem => ({ kind: 'permission-denied', id, toolName: 'Bash', decisionReasonType: 'rule', decisionReason: 'deny 규칙' })
const infoWarn = (id: string): ThreadItem => ({ kind: 'informational', id, content: '훅 경고', level: 'warning' })
const infoPrevent = (id: string): ThreadItem => ({ kind: 'informational', id, content: 'Stop 훅이 계속 거부', level: 'notice', preventContinuation: true })
const infoPlain = (id: string): ThreadItem => ({ kind: 'informational', id, content: '일반 정보', level: 'info' })

describe('gap1-p16 계열① — 훅 차단 아이템 → 턴 assistant 배지', () => {
  it('(a) permission-denied(decisionReasonType=hook)가 있는 턴의 선행 assistant에 배지', async () => {
    const derive = await loadDerive()
    const thread: ThreadItem[] = [user('u1'), assistant('a1'), denyHook('pd1')]
    const badges = derive(thread)
    expect(badges.has('a1')).toBe(true)
    expect(badges.size).toBe(1)
  })

  it('(b) informational(level=warning) → 턴 assistant에 배지', async () => {
    const derive = await loadDerive()
    const thread: ThreadItem[] = [user('u1'), assistant('a1'), infoWarn('inf1')]
    const badges = derive(thread)
    expect(badges.has('a1')).toBe(true)
  })

  it("(b') informational(preventContinuation=true, level=notice) → 배지 (level 무관, preventContinuation 우선)", async () => {
    const derive = await loadDerive()
    const thread: ThreadItem[] = [user('u1'), assistant('a1'), infoPrevent('inf1')]
    const badges = derive(thread)
    expect(badges.has('a1')).toBe(true)
  })
})

describe('gap1-p16 계열① — 무해당 아이템은 배지 없음', () => {
  it('(c) informational(level=info) → 차단 아님 → 배지 없음(빈 집합)', async () => {
    const derive = await loadDerive()
    const thread: ThreadItem[] = [user('u1'), assistant('a1'), infoPlain('inf1')]
    const badges = derive(thread)
    expect(badges.size).toBe(0)
  })

  it("(c') permission-denied(decisionReasonType=rule, hook 아님) → 배지 없음", async () => {
    const derive = await loadDerive()
    const thread: ThreadItem[] = [user('u1'), assistant('a1'), denyRule('pd1')]
    const badges = derive(thread)
    expect(badges.size).toBe(0)
  })
})

describe('gap1-p16 계열① — 귀속 규칙 결정론(최근접 후속 · 선행 폴백)', () => {
  it('후속 assistant 우선: deny(hook)가 두 assistant 앞이면 최근접 후속(첫째)에만 귀속', async () => {
    const derive = await loadDerive()
    const thread: ThreadItem[] = [user('u1'), denyHook('pd1'), assistant('a1'), assistant('a2')]
    const badges = derive(thread)
    expect(badges.has('a1')).toBe(true)
    expect(badges.has('a2')).toBe(false)
    expect(badges.size).toBe(1)
  })

  it('선행 폴백: 후속 assistant 부재(턴 끝) 시 최근접 선행 assistant에 귀속', async () => {
    const derive = await loadDerive()
    const thread: ThreadItem[] = [user('u1'), assistant('a1'), toolgroup('tg1'), infoWarn('inf1')]
    const badges = derive(thread)
    expect(badges.has('a1')).toBe(true)
    expect(badges.size).toBe(1)
  })

  it('턴 경계 존중: 이전 턴 assistant로 새지 않는다(다음 user 이후 아이템은 별개 턴)', async () => {
    const derive = await loadDerive()
    const thread: ThreadItem[] = [
      user('u1'), assistant('a1'),
      user('u2'), denyHook('pd1'),
    ]
    const badges = derive(thread)
    expect(badges.has('a1')).toBe(false)
    expect(badges.size).toBe(0)
  })

  it('turn 내 assistant 전무 → 배지 없음(무귀속)', async () => {
    const derive = await loadDerive()
    const thread: ThreadItem[] = [user('u1'), denyHook('pd1')]
    const badges = derive(thread)
    expect(badges.size).toBe(0)
  })
})
