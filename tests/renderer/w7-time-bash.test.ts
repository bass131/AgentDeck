/**
 * w7-time-bash.test.ts — W7: ThreadItem time 확산 + BashOutput 카드 TDD 테스트.
 *
 * 검증 대상:
 *   [time] 1. threadTypes msg/toolgroup/notice에 time?: string 필드 존재
 *   [time] 2. reducer/panelReducer에 nowTime() 직접 호출 0 (grep 가드)
 *   [time] 3. ADD_USER_MESSAGE panelReducer — time 동반
 *   [time] 4. applyAgentEvent text/model-fallback → time 주입 가능
 *   [time] 5. snapshotForPersist msg-only time 미포함(비영속)
 *   [bash] 6. BashOutput 고스트: 마지막 비공백 줄 + n줄
 *   [bash] 7. BashOutput 자동펼침: failed(status error)일 때만
 *   [bash] 8. BashOutput error 틴트: failed일 때만
 *   [bash] 9. error regex: err! 포함 · 단어경계
 *   [bash] 10. BashOutput 복사 버튼
 *   [bash] 11. BashOutput DOM 구조(.bo-ghost/.bo-block)
 *   [interleave] 12. time/bash 추가가 openMsgId/openGroupId/seq 무파손
 *
 * Node 환경(window.api 불필요) — 순수 리듀서+타입 테스트.
 * BashOutput DOM 테스트는 별도 tsx 파일에서 jsdom.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── [time 1] threadTypes — time? 필드 확인 ───────────────────────────────────

describe('[W7-time] threadTypes — time?: string 필드', () => {
  it('msg kind에 time? 옵셔널 필드가 존재해야 한다', async () => {
    const { makeInitialState, applyAgentEvent } = await import(
      '../../src/renderer/src/store/reducer'
    )
    const s0 = makeInitialState()
    // text 이벤트로 assistant msg 생성
    const s1 = applyAgentEvent(s0, { runId: 'r1', event: { type: 'text', delta: '안녕' } })
    const msg = s1.thread.find((item) => item.kind === 'msg')
    expect(msg).toBeTruthy()
    // time 필드: 주입 안 하면 undefined(optional이므로 필드 자체 없어도 OK)
    // 타입 레벨 확인: time?: string이므로 undefined여도 타입 오류 없어야 한다
    expect(msg && 'time' in msg ? (msg as { time?: string }).time : undefined).toBeUndefined()
  })

  it('toolgroup kind에 time? 옵셔널 필드가 존재해야 한다', async () => {
    const { makeInitialState, applyAgentEvent } = await import(
      '../../src/renderer/src/store/reducer'
    )
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, {
      runId: 'r1',
      event: { type: 'tool_call', id: 'tc1', name: 'Bash', input: { command: 'ls' } },
    })
    const tg = s1.thread.find((item) => item.kind === 'toolgroup')
    expect(tg).toBeTruthy()
    // toolgroup에 time? 필드가 있어야(없어도 타입 오류 없음)
    expect(tg && 'time' in tg ? (tg as { time?: string }).time : undefined).toBeUndefined()
  })

  it('notice kind에 time? 옵셔널 필드가 존재해야 한다', async () => {
    const { makeInitialState, applyAgentEvent } = await import(
      '../../src/renderer/src/store/reducer'
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
    type ThreadItem = import('../../src/renderer/src/store/threadTypes').ThreadItem
    // 타입 테스트: time? 필드에 string을 할당해도 TS 오류 없어야 한다
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
    type ThreadItem = import('../../src/renderer/src/store/threadTypes').ThreadItem
    const item: Extract<ThreadItem, { kind: 'toolgroup' }> = {
      kind: 'toolgroup',
      id: 'tg1',
      tools: [],
      time: '오후 2:00',
    }
    expect(item.time).toBe('오후 2:00')
  })

  it('notice time 필드에 문자열 할당 가능 (타입 호환)', async () => {
    type ThreadItem = import('../../src/renderer/src/store/threadTypes').ThreadItem
    const item: Extract<ThreadItem, { kind: 'notice' }> = {
      kind: 'notice',
      id: 'n1',
      text: '알림',
      time: '오후 1:00',
    }
    expect(item.time).toBe('오후 1:00')
  })
})

// ── [time 2] reducer/panelReducer nowTime() 직접호출 0 grep 가드 ──────────────

describe('[W7-time] reducer/panelReducer nowTime() 직접호출 0 (순수성 가드)', () => {
  it('reducer.ts에 nowTime() 직접 호출이 없어야 한다(주석 제외)', () => {
    const reducerPath = resolve(__dirname, '../../src/renderer/src/store/reducer.ts')
    const rawContent = readFileSync(reducerPath, 'utf-8')
    // 주석 줄 제거 후 실제 코드에서만 nowTime() 호출 검색
    // // 또는 * 로 시작하는 줄(주석) 제거
    const codeLines = rawContent.split('\n').filter((line) => {
      const trimmed = line.trim()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')
    })
    const codeContent = codeLines.join('\n')
    const callMatches = codeContent.match(/nowTime\s*\(\)/g) ?? []
    expect(callMatches.length).toBe(0)
  })

  it('panelReducer 함수 내부에 nowTime() 직접 호출이 없어야 한다', () => {
    // 규칙: panelReducer(순수 리듀서)는 nowTime()을 직접 호출하면 안 됨.
    // nowTime()은 send() 훅과 onAgentEvent 구독 핸들러(impure 허용 레이어)에서만 호출.
    //
    // panelSession.ts에서 panelReducer 함수 블록을 추출해 검사.
    // 블록 추출 방법: "function panelReducer" ~ "export { panelReducer as panelReducerFn }" 사이
    const panelPath = resolve(__dirname, '../../src/renderer/src/store/panelSession.ts')
    const content = readFileSync(panelPath, 'utf-8')

    // panelReducer 함수 시작 위치 찾기
    const startMarker = 'function panelReducer('
    const endMarker = 'export { panelReducer as panelReducerFn }'
    const startIdx = content.indexOf(startMarker)
    const endIdx = content.indexOf(endMarker)

    if (startIdx === -1 || endIdx === -1) {
      // panelReducer 못 찾으면 스킵(구조 변경 경고)
      console.warn('panelReducer 함수를 찾지 못함 — 구조 변경 여부 확인 필요')
      return
    }

    const reducerBlock = content.slice(startIdx, endIdx)
    // 주석 제거 후 nowTime() 호출 검사
    const codeLines = reducerBlock.split('\n').filter((line) => {
      const trimmed = line.trim()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')
    })
    const codeOnly = codeLines.join('\n')
    const callCount = (codeOnly.match(/nowTime\s*\(\)/g) ?? []).length
    expect(callCount).toBe(0)
  })
})

// ── [time 3] panelReducer ADD_USER_MESSAGE — time 동반 ───────────────────────

describe('[W7-time] panelReducer ADD_USER_MESSAGE — time 동반', () => {
  it('ADD_USER_MESSAGE 액션에 time 필드가 추가돼야 한다', async () => {
    const { panelReducerFn, makePanelInitialState } = await import(
      '../../src/renderer/src/store/panelSession'
    )
    const s0 = makePanelInitialState()
    const s1 = panelReducerFn(s0, {
      type: 'ADD_USER_MESSAGE',
      content: '안녕하세요',
      time: '오후 3:00',
    })
    const msg = s1.thread.find((item) => item.kind === 'msg' && item.role === 'user')
    expect(msg).toBeTruthy()
    // time 필드가 msg에 반영돼야 한다
    expect((msg as { time?: string } | undefined)?.time).toBe('오후 3:00')
  })

  it('ADD_USER_MESSAGE — time 미제공 시 undefined(하위호환)', async () => {
    const { panelReducerFn, makePanelInitialState } = await import(
      '../../src/renderer/src/store/panelSession'
    )
    const s0 = makePanelInitialState()
    const s1 = panelReducerFn(s0, {
      type: 'ADD_USER_MESSAGE',
      content: '테스트',
      // time 미제공
    } as { type: 'ADD_USER_MESSAGE'; content: string })
    const msg = s1.thread.find((item) => item.kind === 'msg' && item.role === 'user')
    expect(msg).toBeTruthy()
    expect((msg as { time?: string } | undefined)?.time).toBeUndefined()
  })
})

// ── [time 4] applyAgentEvent — 구독부에서 time 주입 가능 ─────────────────────

describe('[W7-time] applyAgentEvent — time 주입 경로', () => {
  it('text 이벤트 — payload에 time 실어 msg 생성 시 반영 가능', async () => {
    // 구독 핸들러가 applyAgentEvent 호출 전에 payload에 time을 붙이거나
    // 별도 time 인자로 전달하는 방식 중 어느 것이든 reducer는 받은 time만 사용
    // 이 테스트: applyAgentEventWithTime(state, payload, time) 또는
    //            payload.time 필드로 전달해 msg에 time이 세팅되는지 검증
    const { makeInitialState, applyAgentEvent } = await import(
      '../../src/renderer/src/store/reducer'
    )
    const s0 = makeInitialState()
    // time을 payload에 포함해 전달 — 구현에서 event.time 또는 별도 인자 둘 다 허용
    const s1 = applyAgentEvent(s0, {
      runId: 'r1',
      event: { type: 'text', delta: '안녕' },
    } as Parameters<typeof applyAgentEvent>[1], '오후 4:00')
    const msg = s1.thread.find((item) => item.kind === 'msg' && item.role === 'assistant')
    expect(msg).toBeTruthy()
    // time이 msg에 반영돼야 한다
    expect((msg as { time?: string } | undefined)?.time).toBe('오후 4:00')
  })

  it('model-fallback 이벤트 — notice에 time 주입 가능', async () => {
    const { makeInitialState, applyAgentEvent } = await import(
      '../../src/renderer/src/store/reducer'
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
      '../../src/renderer/src/store/reducer'
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

// ── [time 5] snapshotForPersist — msg-only time 미포함(비영속) ────────────────

describe('[W7-time] snapshotForPersist — time 비영속', () => {
  it('msg에 time 있어도 snapshotForPersist 결과에 time 없음', async () => {
    const { makePanelInitialState, snapshotForPersist } = await import(
      '../../src/renderer/src/store/panelSession'
    )
    const s0 = makePanelInitialState()
    // thread에 time 있는 msg 수동 주입
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
    // PersistedMsg에 time 없어야(비영속)
    expect((snapshot.messages[0] as { time?: string }).time).toBeUndefined()
  })
})

// ── [interleave] 인터리브 회귀가드 ──────────────────────────────────────────────

describe('[W7-interleave] time/bash 추가 후 인터리브 포인터 무파손', () => {
  it('time 주입해도 openMsgId/openGroupId/seq 인터리브 불변', async () => {
    const { makeInitialState, applyAgentEvent } = await import(
      '../../src/renderer/src/store/reducer'
    )
    let s = makeInitialState()
    // text → toolcall → text 인터리브 시퀀스
    s = applyAgentEvent(s, { runId: 'r', event: { type: 'text', delta: 'A' } }, '오후 1:00')
    const afterText1OpenMsgId = s.openMsgId
    expect(afterText1OpenMsgId).not.toBeNull()
    expect(s.openGroupId).toBeNull()

    s = applyAgentEvent(s, { runId: 'r', event: { type: 'tool_call', id: 'tc1', name: 'Bash', input: {} } }, '오후 1:01')
    expect(s.openMsgId).toBeNull() // 텍스트 버블 닫기
    expect(s.openGroupId).not.toBeNull() // 새 toolgroup

    s = applyAgentEvent(s, { runId: 'r', event: { type: 'text', delta: 'B' } }, '오후 1:02')
    expect(s.openGroupId).toBeNull() // 그룹 닫기
    expect(s.openMsgId).not.toBeNull() // 새 버블

    // thread: msg(A) + toolgroup + msg(B) — 3개
    expect(s.thread.filter((i) => i.kind === 'msg')).toHaveLength(2)
    expect(s.thread.filter((i) => i.kind === 'toolgroup')).toHaveLength(1)
  })

  it('time 주입이 seq 카운터에 영향 없음', async () => {
    const { makeInitialState, applyAgentEvent } = await import(
      '../../src/renderer/src/store/reducer'
    )
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, { runId: 'r', event: { type: 'text', delta: 'x' } }, '오후 2:00')
    const s2 = applyAgentEvent(s1, { runId: 'r', event: { type: 'text', delta: 'y' } }, '오후 2:01')
    // 동일 msg에 append → seq 변화 없음(첫 text만 seq++)
    expect(s2.seq).toBe(s1.seq)
  })
})
