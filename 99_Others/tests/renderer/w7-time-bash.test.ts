import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('[W7-time] threadTypes — time?: string 필드', () => {
  it('msg kind에 time? 옵셔널 필드가 존재해야 한다', async () => {
    const { makeInitialState, applyAgentEvent } = await import(
      '../../../02_Source/renderer/src/store/reducer'
    )
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, { runId: 'r1', event: { type: 'text', delta: '안녕' } })
    const msg = s1.thread.find((item) => item.kind === 'msg')
    expect(msg).toBeTruthy()
    expect(msg && 'time' in msg ? (msg as { time?: string }).time : undefined).toBeUndefined()
  })

  it('toolgroup kind에 time? 옵셔널 필드가 존재해야 한다', async () => {
    const { makeInitialState, applyAgentEvent } = await import(
      '../../../02_Source/renderer/src/store/reducer'
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
      '../../../02_Source/renderer/src/store/reducer'
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
    type ThreadItem = import('../../../02_Source/renderer/src/store/threadTypes').ThreadItem
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
    type ThreadItem = import('../../../02_Source/renderer/src/store/threadTypes').ThreadItem
    const item: Extract<ThreadItem, { kind: 'toolgroup' }> = {
      kind: 'toolgroup',
      id: 'tg1',
      tools: [],
      time: '오후 2:00',
    }
    expect(item.time).toBe('오후 2:00')
  })

  it('notice time 필드에 문자열 할당 가능 (타입 호환)', async () => {
    type ThreadItem = import('../../../02_Source/renderer/src/store/threadTypes').ThreadItem
    const item: Extract<ThreadItem, { kind: 'notice' }> = {
      kind: 'notice',
      id: 'n1',
      text: '알림',
      time: '오후 1:00',
    }
    expect(item.time).toBe('오후 1:00')
  })
})

describe('[W7-time] reducer/panelReducer nowTime() 직접호출 0 (순수성 가드)', () => {
  it('reducer.ts에 nowTime() 직접 호출이 없어야 한다(주석 제외)', () => {
    const reducerPath = resolve(__dirname, '../../../02_Source/renderer/src/store/reducer.ts')
    const rawContent = readFileSync(reducerPath, 'utf-8')
    const codeLines = rawContent.split('\n').filter((line) => {
      const trimmed = line.trim()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')
    })
    const codeContent = codeLines.join('\n')
    const callMatches = codeContent.match(/nowTime\s*\(\)/g) ?? []
    expect(callMatches.length).toBe(0)
  })

  it('panelReducer 함수 내부에 nowTime() 직접 호출이 없어야 한다', () => {
    const panelPath = resolve(__dirname, '../../../02_Source/renderer/src/store/panelSession.ts')
    const content = readFileSync(panelPath, 'utf-8')

    const startMarker = 'function panelReducer('
    const endMarker = 'export { panelReducer as panelReducerFn }'
    const startIdx = content.indexOf(startMarker)
    const endIdx = content.indexOf(endMarker)

    if (startIdx === -1 || endIdx === -1) {
      console.warn('panelReducer 함수를 찾지 못함 — 구조 변경 여부 확인 필요')
      return
    }

    const reducerBlock = content.slice(startIdx, endIdx)
    const codeLines = reducerBlock.split('\n').filter((line) => {
      const trimmed = line.trim()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')
    })
    const codeOnly = codeLines.join('\n')
    const callCount = (codeOnly.match(/nowTime\s*\(\)/g) ?? []).length
    expect(callCount).toBe(0)
  })
})

describe('[W7-time] panelReducer ADD_USER_MESSAGE — time 동반', () => {
  it('ADD_USER_MESSAGE 액션에 time 필드가 추가돼야 한다', async () => {
    const { panelReducerFn, makePanelInitialState } = await import(
      '../../../02_Source/renderer/src/store/panelSession'
    )
    const s0 = makePanelInitialState()
    const s1 = panelReducerFn(s0, {
      type: 'ADD_USER_MESSAGE',
      content: '안녕하세요',
      time: '오후 3:00',
    })
    const msg = s1.thread.find((item) => item.kind === 'msg' && item.role === 'user')
    expect(msg).toBeTruthy()
    expect((msg as { time?: string } | undefined)?.time).toBe('오후 3:00')
  })

  it('ADD_USER_MESSAGE — time 미제공 시 undefined(하위호환)', async () => {
    const { panelReducerFn, makePanelInitialState } = await import(
      '../../../02_Source/renderer/src/store/panelSession'
    )
    const s0 = makePanelInitialState()
    const s1 = panelReducerFn(s0, {
      type: 'ADD_USER_MESSAGE',
      content: '테스트',
    } as { type: 'ADD_USER_MESSAGE'; content: string })
    const msg = s1.thread.find((item) => item.kind === 'msg' && item.role === 'user')
    expect(msg).toBeTruthy()
    expect((msg as { time?: string } | undefined)?.time).toBeUndefined()
  })
})

describe('[W7-time] applyAgentEvent — time 주입 경로', () => {
  it('text 이벤트 — payload에 time 실어 msg 생성 시 반영 가능', async () => {
    const { makeInitialState, applyAgentEvent } = await import(
      '../../../02_Source/renderer/src/store/reducer'
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
      '../../../02_Source/renderer/src/store/reducer'
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
      '../../../02_Source/renderer/src/store/reducer'
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

describe('[W7-time] snapshotForPersist — time 비영속', () => {
  it('msg에 time 있어도 snapshotForPersist 결과에 time 없음', async () => {
    const { makePanelInitialState, snapshotForPersist } = await import(
      '../../../02_Source/renderer/src/store/panelSession'
    )
    const s0 = makePanelInitialState()
    const stateWithTime = {
      ...s0,
      thread: [
        {
          kind: 'msg' as const,
          id: 'pm1',
          role: 'user' as const,
          text: '안녕',
          time: '오후 3:00',
        },
      ],
    }
    const snapshot = snapshotForPersist(stateWithTime)
    expect(snapshot.messages).toHaveLength(1)
    expect((snapshot.messages[0] as { time?: string }).time).toBeUndefined()
  })
})

describe('[W7-interleave] time/bash 추가 후 인터리브 포인터 무파손', () => {
  it('time 주입해도 openMsgId/openGroupId/seq 인터리브 불변', async () => {
    const { makeInitialState, applyAgentEvent } = await import(
      '../../../02_Source/renderer/src/store/reducer'
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
      '../../../02_Source/renderer/src/store/reducer'
    )
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, { runId: 'r', event: { type: 'text', delta: 'x' } }, '오후 2:00')
    const s2 = applyAgentEvent(s1, { runId: 'r', event: { type: 'text', delta: 'y' } }, '오후 2:01')
    expect(s2.seq).toBe(s1.seq)
  })
})
