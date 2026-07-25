/**
 * gap1-p16-s1-hook-badge-derive.test.ts — GAP1 P16 계열① 훅 배지 파생 (TDD RED)
 *
 * 목표(영호 육안 피드백 2026-07-15 ②): 훅이 도구를 차단하거나 진행을 막은 "턴"의
 * assistant 메시지에 빨간 배지가 붙어야 한다. 이 배지 판정을 **순수 함수로 분리**해
 * 결정론으로 못박는다(렌더 컴포넌트는 이 함수 결과 Set을 그대로 소비).
 *
 * ── 확정 계약(renderer가 이 시그니처로 구현) ──────────────────────────────────────
 *   파일:   02.Source/renderer/src/store/hookBadge.ts   (신규 — 현재 부재)
 *   export: deriveHookTurnBadges(thread: ThreadItem[]): Set<string>
 *   반환:   배지를 붙일 assistant msg id 집합(Set<string>). 렌더는 badges.has(msg.id)로 판정.
 *
 * ── 결합 규칙(결정론 단정 — plan-auditor 🟡 필수) ─────────────────────────────────
 *   [훅 차단 아이템 술어]
 *     item.kind==='permission-denied' && item.decisionReasonType==='hook'
 *     또는
 *     item.kind==='informational' && (item.level==='warning' || item.preventContinuation===true)
 *
 *   [귀속 규칙 — 결정론]
 *     각 훅 차단 아이템 index i에 대해:
 *       1) 턴 경계 확정: start = i 이하에서 가장 가까운 role==='user' msg의 index(없으면 0),
 *          end = i 초과에서 가장 가까운 role==='user' msg의 index(없으면 thread.length, 배타).
 *       2) 같은 턴 [i+1, end) 구간을 앞으로 훑어 **최근접 후속** assistant msg를 찾으면 그 id에 귀속.
 *       3) 후속 assistant 부재 시 [start, i) 구간을 뒤로 훑어 **최근접 선행** assistant msg에 귀속.
 *       4) 턴 안에 assistant가 하나도 없으면 그 아이템은 배지 기여 없음(무시).
 *
 * ── 현재 RED 이유 ─────────────────────────────────────────────────────────────────
 *   hookBadge.ts 자체가 아직 없다. 각 테스트는 런타임 동적 import로 모듈을 불러오므로
 *   파일 부재 → import 거부(reject) → 테스트 개별 FAIL(RED). 구현되면 GREEN 전이.
 *   (변수 지정자 동적 import: TS는 Promise<any>로 취급해 "Cannot find module" 타입오류 0 —
 *    tsconfig.web가 이 테스트를 포함하므로 typecheck-green 유지가 필요. p05 RED 관례 계승.)
 *
 * 결정론: 순수 함수(fs/네트워크/타이머/랜덤 0). 고정 픽스처만.
 */
import { describe, it, expect } from 'vitest'
import type { ThreadItem } from '../../../02.Source/renderer/src/store/threadTypes'

// 변수 지정자 → TS는 동적(any) 취급(모듈 부재 타입오류 회피). 런타임엔 상대경로 해석.
const HOOK_BADGE_MODULE: string = '../../../02.Source/renderer/src/store/hookBadge'

type HookBadgeModule = {
  deriveHookTurnBadges: (thread: ThreadItem[]) => Set<string>
}

/** 확정 계약 로드(파일 부재면 reject → RED). */
async function loadDerive(): Promise<HookBadgeModule['deriveHookTurnBadges']> {
  const mod = (await import(HOOK_BADGE_MODULE)) as HookBadgeModule
  return mod.deriveHookTurnBadges
}

// ── 픽스처 헬퍼(고정, 결정론) ─────────────────────────────────────────────────────
const user = (id: string, text = '질문'): ThreadItem => ({ kind: 'msg', id, role: 'user', text })
const assistant = (id: string, text = '답변'): ThreadItem => ({ kind: 'msg', id, role: 'assistant', text })
const toolgroup = (id: string): ThreadItem => ({ kind: 'toolgroup', id, tools: [] })
const denyHook = (id: string): ThreadItem => ({ kind: 'permission-denied', id, toolName: 'Bash', decisionReasonType: 'hook', decisionReason: 'PreToolUse 훅 차단' })
const denyRule = (id: string): ThreadItem => ({ kind: 'permission-denied', id, toolName: 'Bash', decisionReasonType: 'rule', decisionReason: 'deny 규칙' })
const infoWarn = (id: string): ThreadItem => ({ kind: 'informational', id, content: '훅 경고', level: 'warning' })
const infoPrevent = (id: string): ThreadItem => ({ kind: 'informational', id, content: 'Stop 훅이 계속 거부', level: 'notice', preventContinuation: true })
const infoPlain = (id: string): ThreadItem => ({ kind: 'informational', id, content: '일반 정보', level: 'info' })

// ── (a) hook deny 있는 턴 → 해당 assistant에 배지 ─────────────────────────────────
describe('gap1-p16 계열① — 훅 차단 아이템 → 턴 assistant 배지', () => {
  it('(a) permission-denied(decisionReasonType=hook)가 있는 턴의 선행 assistant에 배지', async () => {
    const derive = await loadDerive()
    const thread: ThreadItem[] = [user('u1'), assistant('a1'), denyHook('pd1')]
    const badges = derive(thread)
    // 후속 assistant 부재(pd1이 턴 끝) → 최근접 선행 a1에 귀속.
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

// ── (c) 무해당: 배지 없음 ─────────────────────────────────────────────────────────
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

// ── 귀속 규칙: 최근접 후속 / 선행 폴백 / 무 assistant ───────────────────────────────
describe('gap1-p16 계열① — 귀속 규칙 결정론(최근접 후속 · 선행 폴백)', () => {
  it('후속 assistant 우선: deny(hook)가 두 assistant 앞이면 최근접 후속(첫째)에만 귀속', async () => {
    const derive = await loadDerive()
    const thread: ThreadItem[] = [user('u1'), denyHook('pd1'), assistant('a1'), assistant('a2')]
    const badges = derive(thread)
    // 최근접 후속 a1에만 — a2 아님.
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
      user('u1'), assistant('a1'),      // 턴1(무 차단)
      user('u2'), denyHook('pd1'),      // 턴2: 후속 assistant 부재 + 턴 내 선행 assistant 부재 → 무귀속
    ]
    const badges = derive(thread)
    // 턴2엔 assistant가 없다 → a1(이전 턴)으로 새면 안 됨.
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
