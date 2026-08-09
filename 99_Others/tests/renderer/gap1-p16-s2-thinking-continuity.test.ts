import { describe, it, expect } from 'vitest'
import type { ThreadItem } from '../../../02_Source/renderer/src/store/threadTypes'

const CONTINUITY_MODULE: string = '../../../02_Source/renderer/src/store/continuity'

type ContinuityModule = {
  isThinkingContinuous: (thread: ThreadItem[], index: number, options?: { ignoreToolgroups?: boolean }) => boolean
}

async function loadIsContinuous(): Promise<ContinuityModule['isThinkingContinuous']> {
  const mod = (await import(CONTINUITY_MODULE)) as ContinuityModule
  return mod.isThinkingContinuous
}

const thinking = (id: string): ThreadItem => ({ kind: 'thinking', id, text: '사고 전문' })
const assistant = (id: string): ThreadItem => ({ kind: 'msg', id, role: 'assistant', text: '답변' })
const userMsg = (id: string): ThreadItem => ({ kind: 'msg', id, role: 'user', text: '질문' })
const toolgroup = (id: string): ThreadItem => ({ kind: 'toolgroup', id, tools: [] })
const notice = (id: string): ThreadItem => ({ kind: 'notice', id, text: '알림' })

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
