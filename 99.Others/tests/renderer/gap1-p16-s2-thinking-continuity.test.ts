/**
 * gap1-p16-s2-thinking-continuity.test.ts — GAP1 P16 계열② 사고↔답변 연속성 (TDD RED)
 *
 * 목표(영호 육안 피드백 2026-07-15 ①): 사고 중 인디케이터(실시간 토큰)와 그 턴의 답변
 * 버블이 분리돼 보이는 문제를 저위험 인접 연출로 봉합한다(DOM 대재구조 지양, Phase 확정 (B)안).
 * "thinking 다음에 assistant가 인접하는가"를 **순수 함수로 분리**해 결정론으로 못박는다 —
 * 렌더는 이 판정이 true인 thinking/assistant 쌍에 연결 시각(gap 축소·연결 레일)을 적용.
 *
 * ── 확정 계약(renderer가 이 시그니처로 구현) ──────────────────────────────────────
 *   파일:   02.Source/renderer/src/store/continuity.ts   (신규 — 현재 부재)
 *   export: isThinkingContinuous(
 *             thread: ThreadItem[],
 *             index: number,
 *             options?: { ignoreToolgroups?: boolean }
 *           ): boolean
 *   의미:   thread[index]가 kind:'thinking'일 때, 그 사고 아이템과 **다음 assistant msg**가
 *           시각적으로 인접하는지(연속 연출 대상인지) 판정. index가 thinking이 아니면 false.
 *
 * ── 결정론 규칙 ───────────────────────────────────────────────────────────────────
 *   1) thread[index]가 kind:'thinking'이 아니면 즉시 false.
 *   2) j = index+1부터 앞으로 스캔하되:
 *        - options.ignoreToolgroups===true 이고 thread[j].kind==='toolgroup'이면 건너뛴다(스킵).
 *          (근거: 멀티 패널 PanelView는 toolgroup을 렌더하지 않으므로(:244-253) 데이터상
 *           사이 toolgroup은 화면엔 안 보인다 → 여전히 인접 = 연속. 단일챗은 toolgroup을
 *           렌더하므로 기본값 false에서 toolgroup이 인접을 끊는다.)
 *        - 그 외 kind면 스킵하지 않고 멈춘다.
 *   3) 멈춘 위치 thread[j]가 존재하고 kind:'msg' && role:'assistant'이면 true, 아니면 false.
 *
 *   → "사이 toolgroup 허용/불허"가 options.ignoreToolgroups로 명시 분기(양 케이스 단정).
 *     toolgroup 이외의 사이 삽입(notice 등)은 두 모드 모두 인접을 끊는다.
 *
 * ── 현재 RED 이유 ─────────────────────────────────────────────────────────────────
 *   continuity.ts 자체가 아직 없다. 런타임 동적 import → 파일 부재 → reject → 개별 FAIL(RED).
 *   (변수 지정자 동적 import로 typecheck-green 유지 — 계열① 동일 관례.)
 *
 * 결정론: 순수 함수. 고정 픽스처만.
 */
import { describe, it, expect } from 'vitest'
import type { ThreadItem } from '../../../02.Source/renderer/src/store/threadTypes'

const CONTINUITY_MODULE: string = '../../../02.Source/renderer/src/store/continuity'

type ContinuityModule = {
  isThinkingContinuous: (thread: ThreadItem[], index: number, options?: { ignoreToolgroups?: boolean }) => boolean
}

async function loadIsContinuous(): Promise<ContinuityModule['isThinkingContinuous']> {
  const mod = (await import(CONTINUITY_MODULE)) as ContinuityModule
  return mod.isThinkingContinuous
}

// ── 픽스처 헬퍼(고정) ─────────────────────────────────────────────────────────────
const thinking = (id: string): ThreadItem => ({ kind: 'thinking', id, text: '사고 전문' })
const assistant = (id: string): ThreadItem => ({ kind: 'msg', id, role: 'assistant', text: '답변' })
const userMsg = (id: string): ThreadItem => ({ kind: 'msg', id, role: 'user', text: '질문' })
const toolgroup = (id: string): ThreadItem => ({ kind: 'toolgroup', id, tools: [] })
const notice = (id: string): ThreadItem => ({ kind: 'notice', id, text: '알림' })

// ── 단일챗 기본(ignoreToolgroups 미지정) ──────────────────────────────────────────
describe('gap1-p16 계열② — 단일챗 기본: 직접 인접만 연속', () => {
  it('thinking 바로 다음이 assistant msg → true(연속)', async () => {
    const isContinuous = await loadIsContinuous()
    const thread: ThreadItem[] = [userMsg('u1'), thinking('t1'), assistant('a1')]
    expect(isContinuous(thread, 1)).toBe(true)
  })

  it('thinking → toolgroup → assistant (기본) → false(사이 toolgroup이 인접 끊음 · 단일챗은 렌더됨)', async () => {
    const isContinuous = await loadIsContinuous()
    const thread: ThreadItem[] = [thinking('t1'), toolgroup('tg1'), assistant('a1')]
    expect(isContinuous(thread, 0)).toBe(false)
  })

  it('thinking → notice → assistant (기본) → false(toolgroup 이외 사이 삽입도 끊음)', async () => {
    const isContinuous = await loadIsContinuous()
    const thread: ThreadItem[] = [thinking('t1'), notice('n1'), assistant('a1')]
    expect(isContinuous(thread, 0)).toBe(false)
  })
})

// ── 멀티 패널(ignoreToolgroups=true): 사이 toolgroup 허용 ──────────────────────────
describe('gap1-p16 계열② — 패널 모드: 사이 toolgroup은 스킵(허용)', () => {
  it('thinking → toolgroup → assistant, ignoreToolgroups=true → true(toolgroup 비표시 = 인접)', async () => {
    const isContinuous = await loadIsContinuous()
    const thread: ThreadItem[] = [thinking('t1'), toolgroup('tg1'), assistant('a1')]
    expect(isContinuous(thread, 0, { ignoreToolgroups: true })).toBe(true)
  })

  it('thinking → toolgroup → toolgroup → assistant, ignoreToolgroups=true → true(연속 스킵)', async () => {
    const isContinuous = await loadIsContinuous()
    const thread: ThreadItem[] = [thinking('t1'), toolgroup('tg1'), toolgroup('tg2'), assistant('a1')]
    expect(isContinuous(thread, 0, { ignoreToolgroups: true })).toBe(true)
  })

  it('thinking → notice → assistant, ignoreToolgroups=true → false(notice는 스킵 대상 아님)', async () => {
    const isContinuous = await loadIsContinuous()
    const thread: ThreadItem[] = [thinking('t1'), notice('n1'), assistant('a1')]
    expect(isContinuous(thread, 0, { ignoreToolgroups: true })).toBe(false)
  })
})

// ── 경계 케이스 ───────────────────────────────────────────────────────────────────
describe('gap1-p16 계열② — 경계 케이스', () => {
  it('thinking이 마지막 아이템(후속 없음) → false', async () => {
    const isContinuous = await loadIsContinuous()
    const thread: ThreadItem[] = [userMsg('u1'), thinking('t1')]
    expect(isContinuous(thread, 1)).toBe(false)
  })

  it('index가 thinking을 가리키지 않으면(예: assistant) → false', async () => {
    const isContinuous = await loadIsContinuous()
    const thread: ThreadItem[] = [thinking('t1'), assistant('a1')]
    expect(isContinuous(thread, 1)).toBe(false)
  })

  it('thinking 다음이 user msg면 → false(assistant 아님)', async () => {
    const isContinuous = await loadIsContinuous()
    const thread: ThreadItem[] = [thinking('t1'), userMsg('u2')]
    expect(isContinuous(thread, 0)).toBe(false)
  })
})
