import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'

describe('[W7-time] threadTypes — time?: string 필드', () => {
  it('msg kind에 time? 옵셔널 필드가 존재해야 한다', async () => {
    const { makeInitialState, applyAgentEvent } = await import(
      '@renderer/05_Conversation/state/reducer'
    )
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, { runId: 'r1', event: { type: 'text', delta: '안녕' } })
    const msg = s1.thread.find((item) => item.kind === 'msg')
    expect(msg).toBeTruthy()
    expect(msg && 'time' in msg ? (msg as { time?: string }).time : undefined).toBeUndefined()
  })

  it('toolgroup kind에 time? 옵셔널 필드가 존재해야 한다', async () => {
    const { makeInitialState, applyAgentEvent } = await import(
      '@renderer/05_Conversation/state/reducer'
    )
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, {
      runId: 'r1',
      event: { type: 'tool_call', id: 'tc1', name: 'Bash', input: { command: 'ls' } },
    })
    const tg = s1.thread.find((item) => item.kind === 'toolgroup')
    expect(tg).toBeTruthy()
    expect(tg && 'time' in tg ? (tg as { time?: string }).time : undefined).toBeUndefined()
  })

  it('notice kind에 time? 옵셔널 필드가 존재해야 한다', async () => {
    const { makeInitialState, applyAgentEvent } = await import(
      '@renderer/05_Conversation/state/reducer'
    )
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, {
      runId: 'r1',
      event: {
        type: 'model-fallback',
        text: '폴백',
        fromModel: 'claude-fable-5',
        toModel: 'claude-opus-4-8',
        retractMessageId: null,
      },
    })
    const notice = s1.thread.find((item) => item.kind === 'notice')
    expect(notice).toBeTruthy()
    expect(notice && 'time' in notice ? (notice as { time?: string }).time : undefined).toBeUndefined()
  })

  it('msg time 필드에 문자열 할당 가능 (타입 호환)', async () => {
    type ThreadItem = import('@renderer/05_Conversation/state/threadTypes').ThreadItem
    const item: Extract<ThreadItem, { kind: 'msg' }> = {
      kind: 'msg',
      id: 'x1',
      role: 'user',
      text: '테스트',
      time: '오후 3:00',
    }
    expect(item.time).toBe('오후 3:00')
  })

  it('toolgroup time 필드에 문자열 할당 가능 (타입 호환)', async () => {
    type ThreadItem = import('@renderer/05_Conversation/state/threadTypes').ThreadItem
    const item: Extract<ThreadItem, { kind: 'toolgroup' }> = {
      kind: 'toolgroup',
      id: 'tg1',
      tools: [],
      time: '오후 2:00',
    }
    expect(item.time).toBe('오후 2:00')
  })

  it('notice time 필드에 문자열 할당 가능 (타입 호환)', async () => {
    type ThreadItem = import('@renderer/05_Conversation/state/threadTypes').ThreadItem
    const item: Extract<ThreadItem, { kind: 'notice' }> = {
      kind: 'notice',
      id: 'n1',
      text: '알림',
      time: '오후 1:00',
    }
    expect(item.time).toBe('오후 1:00')
  })
})

describe('[W7-time] reducer nowTime() 직접호출 0 (순수성 가드)', () => {
  it('reducer.ts와 쪼갠 reducer/*.ts에 시계 호출(nowTime…())이 없어야 한다(주석 제외)', () => {
    const stateDir = resolve(__dirname, '../../../../02_Project/00_Source/renderer/src/05_Conversation/state')
    const files = ['reducer.ts', ...readdirSync(resolve(stateDir, 'reducer')).map((f) => `reducer/${f}`)]
    expect(files.length).toBeGreaterThan(1)
    for (const rel of files) {
      const codeContent = readFileSync(resolve(stateDir, rel), 'utf-8').split('\n').filter((line) => {
        const trimmed = line.trim()
        return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')
      }).join('\n')
      expect(codeContent.match(/nowTime\w*\s*\(\)/g) ?? [], rel).toEqual([])
    }
  })

  it('공용 실행 reducer(runReducer.ts)에 시계 호출이 없어야 한다(주석 제외) — 시각은 액션에 실려 온다', () => {
    const runReducerPath = resolve(__dirname, '../../../../02_Project/00_Source/renderer/src/03_Agent/state/runReducer.ts')
    const rawContent = readFileSync(runReducerPath, 'utf-8')
    const codeOnly = rawContent.split('\n').filter((line) => {
      const trimmed = line.trim()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')
    }).join('\n')
    expect(codeOnly).toContain('export function runReducer')
    expect(codeOnly.match(/nowTime\w*\s*\(\)/g) ?? []).toEqual([])
    expect(codeOnly.match(/Date\.now\s*\(\)/g) ?? []).toEqual([])
  })
})

describe('[W7-time] applyAgentEvent — time 주입 경로', () => {
  it('text 이벤트 — payload에 time 실어 msg 생성 시 반영 가능', async () => {
    const { makeInitialState, applyAgentEvent } = await import(
      '@renderer/05_Conversation/state/reducer'
    )
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, {
      runId: 'r1',
      event: { type: 'text', delta: '안녕' },
    } as Parameters<typeof applyAgentEvent>[1], '오후 4:00')
    const msg = s1.thread.find((item) => item.kind === 'msg' && item.role === 'assistant')
    expect(msg).toBeTruthy()
    expect((msg as { time?: string } | undefined)?.time).toBe('오후 4:00')
  })

  it('model-fallback 이벤트 — notice에 time 주입 가능', async () => {
    const { makeInitialState, applyAgentEvent } = await import(
      '@renderer/05_Conversation/state/reducer'
    )
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, {
      runId: 'r1',
      event: {
        type: 'model-fallback',
        text: '폴백',
        fromModel: 'claude-fable-5',
        toModel: 'claude-opus-4-8',
        retractMessageId: null,
      },
    } as Parameters<typeof applyAgentEvent>[1], '오후 5:00')
    const notice = s1.thread.find((item) => item.kind === 'notice')
    expect(notice).toBeTruthy()
    expect((notice as { time?: string } | undefined)?.time).toBe('오후 5:00')
  })

  it('tool_call 이벤트 — toolgroup에 time 주입 가능', async () => {
    const { makeInitialState, applyAgentEvent } = await import(
      '@renderer/05_Conversation/state/reducer'
    )
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, {
      runId: 'r1',
      event: { type: 'tool_call', id: 'tc1', name: 'Bash', input: { command: 'ls' } },
    } as Parameters<typeof applyAgentEvent>[1], '오후 6:00')
    const tg = s1.thread.find((item) => item.kind === 'toolgroup')
    expect(tg).toBeTruthy()
    expect((tg as { time?: string } | undefined)?.time).toBe('오후 6:00')
  })
})

describe('[W7-interleave] time/bash 추가 후 인터리브 포인터 무파손', () => {
  it('time 주입해도 openMsgId/openGroupId/seq 인터리브 불변', async () => {
    const { makeInitialState, applyAgentEvent } = await import(
      '@renderer/05_Conversation/state/reducer'
    )
    let s = makeInitialState()
    s = applyAgentEvent(s, { runId: 'r', event: { type: 'text', delta: 'A' } }, '오후 1:00')
    const afterText1OpenMsgId = s.openMsgId
    expect(afterText1OpenMsgId).not.toBeNull()
    expect(s.openGroupId).toBeNull()

    s = applyAgentEvent(s, { runId: 'r', event: { type: 'tool_call', id: 'tc1', name: 'Bash', input: {} } }, '오후 1:01')
    expect(s.openMsgId).toBeNull()
    expect(s.openGroupId).not.toBeNull()

    s = applyAgentEvent(s, { runId: 'r', event: { type: 'text', delta: 'B' } }, '오후 1:02')
    expect(s.openGroupId).toBeNull()
    expect(s.openMsgId).not.toBeNull()

    expect(s.thread.filter((i) => i.kind === 'msg')).toHaveLength(2)
    expect(s.thread.filter((i) => i.kind === 'toolgroup')).toHaveLength(1)
  })

  it('time 주입이 seq 카운터에 영향 없음', async () => {
    const { makeInitialState, applyAgentEvent } = await import(
      '@renderer/05_Conversation/state/reducer'
    )
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, { runId: 'r', event: { type: 'text', delta: 'x' } }, '오후 2:00')
    const s2 = applyAgentEvent(s1, { runId: 'r', event: { type: 'text', delta: 'y' } }, '오후 2:01')
    expect(s2.seq).toBe(s1.seq)
  })
})
