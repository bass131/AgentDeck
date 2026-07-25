/**
 * cp1-p05-subagent-persist.test.ts — CP1 P05 서브에이전트 영속 renderer 데이터 계층 TDD.
 *
 * 대상: 02.Source/renderer/src/store/slices/conversationPayload.ts
 *   - buildConversationSavePayload의 서브에이전트 앵커(afterMessageIndex) 계산(빌더).
 *   - rebuildThreadWithSubagents — 복원 재구성(맨앞/중간/맨끝 위치).
 *   - freezePersistedSubagents — done 동결(top-level + tools + transcript kind==='tool').
 *
 * 설계 근거: 01.Phases/CP1-cwd-persist-sweep/04-design-note.md(P04 shared-ipc 확정 — GO).
 * 확정 알고리즘은 coordinator 지시문 그대로(재유도 없음) — docblock 근거는 구현 파일 참조.
 *
 * 아키텍처 준수: 순수 함수 테스트 — window.api/IPC 0, fs/Node 0.
 */
import { describe, it, expect } from 'vitest'
import {
  buildConversationSavePayload,
  rebuildThreadWithSubagents,
  freezePersistedSubagents,
} from '../../../02.Source/renderer/src/store/slices/conversationPayload'
import type { ThreadItem } from '../../../02.Source/renderer/src/store/threadTypes'
import type { PersistedSubAgent } from '../../../02.Source/shared/ipc-contract'
import type { SubAgentInfo } from '../../../02.Source/shared/agent-events'

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

function msg(id: string, text: string, role: 'user' | 'assistant' = 'assistant'): ThreadItem {
  return { kind: 'msg', id, role, text }
}

function marker(id: string): ThreadItem {
  return { kind: 'subagent', id }
}

function makeSubAgent(id: string, overrides: Partial<SubAgentInfo> = {}): SubAgentInfo {
  return {
    id,
    name: 'general-purpose',
    role: 'explorer',
    status: 'running',
    tools: [{ id: `${id}-t1`, verb: 'bash', target: 'npm test', status: 'running' }],
    ...overrides,
  }
}

// ── 저장(빌더): 앵커 계산 ─────────────────────────────────────────────────────

describe('buildConversationSavePayload — 서브에이전트 앵커 계산(빌더)', () => {
  it('맨앞(마커가 첫 msg보다 먼저) → afterMessageIndex 0', () => {
    const thread: ThreadItem[] = [marker('sub-1'), msg('m1', '첫 메시지', 'user')]
    const payload = buildConversationSavePayload(
      { thread, workspaceRoot: null, subagents: [makeSubAgent('sub-1')] },
      'conv-1'
    )
    expect(payload?.subagents).toHaveLength(1)
    expect(payload?.subagents?.[0].afterMessageIndex).toBe(0)
    expect(payload?.subagents?.[0].id).toBe('sub-1')
  })

  it('중간(마커가 msg 1개와 msg 2개 사이) → afterMessageIndex 1', () => {
    const thread: ThreadItem[] = [
      msg('m1', '첫 메시지', 'user'),
      marker('sub-1'),
      msg('m2', '두번째', 'assistant'),
    ]
    const payload = buildConversationSavePayload(
      { thread, workspaceRoot: null, subagents: [makeSubAgent('sub-1')] },
      'conv-1'
    )
    expect(payload?.subagents?.[0].afterMessageIndex).toBe(1)
  })

  it('맨끝(마커가 모든 msg 뒤) → afterMessageIndex는 전체 msg 개수', () => {
    const thread: ThreadItem[] = [
      msg('m1', '첫 메시지', 'user'),
      msg('m2', '두번째', 'assistant'),
      marker('sub-1'),
    ]
    const payload = buildConversationSavePayload(
      { thread, workspaceRoot: null, subagents: [makeSubAgent('sub-1')] },
      'conv-1'
    )
    expect(payload?.subagents?.[0].afterMessageIndex).toBe(2)
  })

  it('마커 없는 데이터(subagents에는 있지만 thread에 마커 없음) → 미포함', () => {
    const thread: ThreadItem[] = [msg('m1', '메시지', 'user')]
    const payload = buildConversationSavePayload(
      { thread, workspaceRoot: null, subagents: [makeSubAgent('sub-orphan')] },
      'conv-1'
    )
    // 결과가 비므로 필드 자체가 omit되어야 한다(빈 배열도 아님).
    expect(payload?.subagents).toBeUndefined()
  })

  it('데이터 없는 마커(thread에 마커는 있지만 subagents에 조인될 데이터 없음) → skip', () => {
    const thread: ThreadItem[] = [msg('m1', '메시지', 'user'), marker('sub-ghost')]
    const payload = buildConversationSavePayload(
      { thread, workspaceRoot: null, subagents: [] },
      'conv-1'
    )
    expect(payload?.subagents).toBeUndefined()
  })

  it('subagents 미지정(undefined) → subagents 필드 omit(회귀 0 — 기존 대화 호환)', () => {
    const thread: ThreadItem[] = [msg('m1', '메시지', 'user')]
    const payload = buildConversationSavePayload({ thread, workspaceRoot: null }, 'conv-1')
    expect(payload?.subagents).toBeUndefined()
  })

  it('여러 서브에이전트 — thread 순서대로 각자의 afterMessageIndex를 갖는다', () => {
    const thread: ThreadItem[] = [
      marker('sub-front'),
      msg('m1', '첫', 'user'),
      marker('sub-mid'),
      msg('m2', '둘째', 'assistant'),
      marker('sub-end'),
    ]
    const payload = buildConversationSavePayload(
      {
        thread,
        workspaceRoot: null,
        subagents: [makeSubAgent('sub-front'), makeSubAgent('sub-mid'), makeSubAgent('sub-end')],
      },
      'conv-1'
    )
    expect(payload?.subagents).toHaveLength(3)
    const byId = Object.fromEntries((payload?.subagents ?? []).map((s) => [s.id, s.afterMessageIndex]))
    expect(byId['sub-front']).toBe(0)
    expect(byId['sub-mid']).toBe(1)
    expect(byId['sub-end']).toBe(2)
  })

  it('SubAgentInfo 필드(tools/activity/model 등)가 재나열 없이 그대로 보존된다', () => {
    const thread: ThreadItem[] = [marker('sub-1'), msg('m1', '첫', 'user')]
    const info = makeSubAgent('sub-1', { activity: '탐색 중', model: 'claude-opus-4-8' })
    const payload = buildConversationSavePayload({ thread, workspaceRoot: null, subagents: [info] }, 'conv-1')
    expect(payload?.subagents?.[0].activity).toBe('탐색 중')
    expect(payload?.subagents?.[0].model).toBe('claude-opus-4-8')
    expect(payload?.subagents?.[0].tools).toEqual(info.tools)
  })
})

// ── 복원 재구성: rebuildThreadWithSubagents ──────────────────────────────────

describe('rebuildThreadWithSubagents — 앵커 라운드트립(저장→복원 위치 동일)', () => {
  it('맨앞 배치 — afterMessageIndex:0 → 마커가 messages[0]보다 먼저 온다', () => {
    const messages: Extract<ThreadItem, { kind: 'msg' }>[] = [
      { kind: 'msg', id: 'm1', role: 'user', text: '첫' },
    ]
    const persisted: PersistedSubAgent[] = [{ ...makeSubAgent('sub-1'), afterMessageIndex: 0 }]
    const rebuilt = rebuildThreadWithSubagents(messages, persisted)
    expect(rebuilt).toEqual([{ kind: 'subagent', id: 'sub-1' }, messages[0]])
  })

  it('중간 배치 — afterMessageIndex:1 → messages[0]과 messages[1] 사이에 온다', () => {
    const messages: Extract<ThreadItem, { kind: 'msg' }>[] = [
      { kind: 'msg', id: 'm1', role: 'user', text: '첫' },
      { kind: 'msg', id: 'm2', role: 'assistant', text: '둘째' },
    ]
    const persisted: PersistedSubAgent[] = [{ ...makeSubAgent('sub-1'), afterMessageIndex: 1 }]
    const rebuilt = rebuildThreadWithSubagents(messages, persisted)
    expect(rebuilt).toEqual([messages[0], { kind: 'subagent', id: 'sub-1' }, messages[1]])
  })

  it('맨끝 배치 — afterMessageIndex === messages.length → 모든 msg 뒤에 온다', () => {
    const messages: Extract<ThreadItem, { kind: 'msg' }>[] = [
      { kind: 'msg', id: 'm1', role: 'user', text: '첫' },
      { kind: 'msg', id: 'm2', role: 'assistant', text: '둘째' },
    ]
    const persisted: PersistedSubAgent[] = [{ ...makeSubAgent('sub-1'), afterMessageIndex: 2 }]
    const rebuilt = rebuildThreadWithSubagents(messages, persisted)
    expect(rebuilt).toEqual([messages[0], messages[1], { kind: 'subagent', id: 'sub-1' }])
  })

  it('저장→복원 풀 라운드트립 — 원본 thread 배치가 msg 순서와 마커 상대위치까지 그대로 재현된다', () => {
    const original: ThreadItem[] = [
      marker('sub-front'),
      msg('m1', '첫', 'user'),
      marker('sub-mid'),
      msg('m2', '둘째', 'assistant'),
      marker('sub-end'),
    ]
    const subagentsInfo = [makeSubAgent('sub-front'), makeSubAgent('sub-mid'), makeSubAgent('sub-end')]
    const payload = buildConversationSavePayload(
      { thread: original, workspaceRoot: null, subagents: subagentsInfo },
      'conv-1'
    )
    expect(payload?.subagents).toBeDefined()

    // 복원측: messages는 conv.messages(role/content)에서 재구성된 msg 항목이라 가정.
    const restoredMsgs: Extract<ThreadItem, { kind: 'msg' }>[] = [
      { kind: 'msg', id: 'm1', role: 'user', text: '첫' },
      { kind: 'msg', id: 'm2', role: 'assistant', text: '둘째' },
    ]
    const rebuilt = rebuildThreadWithSubagents(restoredMsgs, payload!.subagents!)
    const kinds = rebuilt.map((item) => (item.kind === 'subagent' ? `subagent:${item.id}` : `msg:${item.id}`))
    expect(kinds).toEqual(['subagent:sub-front', 'msg:m1', 'subagent:sub-mid', 'msg:m2', 'subagent:sub-end'])
  })

  it('persisted 미지정(undefined) → messages를 그대로 반환(회귀 0)', () => {
    const messages: Extract<ThreadItem, { kind: 'msg' }>[] = [
      { kind: 'msg', id: 'm1', role: 'user', text: '첫' },
    ]
    expect(rebuildThreadWithSubagents(messages, undefined)).toBe(messages)
  })

  it('persisted 빈 배열 → messages를 그대로 반환', () => {
    const messages: Extract<ThreadItem, { kind: 'msg' }>[] = [
      { kind: 'msg', id: 'm1', role: 'user', text: '첫' },
    ]
    expect(rebuildThreadWithSubagents(messages, [])).toBe(messages)
  })

  it('같은 afterMessageIndex를 공유하는 여러 마커는 persisted 배열 순서를 보존한다', () => {
    const messages: Extract<ThreadItem, { kind: 'msg' }>[] = [
      { kind: 'msg', id: 'm1', role: 'user', text: '첫' },
    ]
    const persisted: PersistedSubAgent[] = [
      { ...makeSubAgent('sub-a'), afterMessageIndex: 0 },
      { ...makeSubAgent('sub-b'), afterMessageIndex: 0 },
    ]
    const rebuilt = rebuildThreadWithSubagents(messages, persisted)
    expect(rebuilt[0]).toEqual({ kind: 'subagent', id: 'sub-a' })
    expect(rebuilt[1]).toEqual({ kind: 'subagent', id: 'sub-b' })
    expect(rebuilt[2]).toEqual(messages[0])
  })
})

// ── done 동결: freezePersistedSubagents ───────────────────────────────────────

describe('freezePersistedSubagents — done 동결(top-level + tools + transcript)', () => {
  it('top-level status가 running/queued여도 done으로 동결된다', () => {
    const persisted: PersistedSubAgent[] = [
      { ...makeSubAgent('sub-1', { status: 'running' }), afterMessageIndex: 0 },
      { ...makeSubAgent('sub-2', { status: 'queued' }), afterMessageIndex: 1 },
    ]
    const frozen = freezePersistedSubagents(persisted)
    expect(frozen[0].status).toBe('done')
    expect(frozen[1].status).toBe('done')
  })

  it('tools[].status가 모두 done으로 동결된다', () => {
    const persisted: PersistedSubAgent[] = [
      {
        ...makeSubAgent('sub-1', {
          tools: [
            { id: 't1', verb: 'bash', target: 'npm test', status: 'running' },
            { id: 't2', verb: 'read', target: 'a.ts', status: 'queued' },
          ],
        }),
        afterMessageIndex: 0,
      },
    ]
    const frozen = freezePersistedSubagents(persisted)
    expect(frozen[0].tools.every((t) => t.status === 'done')).toBe(true)
  })

  it('transcript 중 kind==="tool"인 항목만 status가 done으로 동결되고 text/thinking은 그대로다', () => {
    const persisted: PersistedSubAgent[] = [
      {
        ...makeSubAgent('sub-1', {
          transcript: [
            { kind: 'text', text: '탐색 시작', id: 'tr-1' },
            { kind: 'tool', verb: 'read', target: 'b.ts', status: 'running', id: 'tr-2' },
            { kind: 'thinking', text: '생각 중', id: 'tr-3' },
          ],
        }),
        afterMessageIndex: 0,
      },
    ]
    const frozen = freezePersistedSubagents(persisted)
    const transcript = frozen[0].transcript!
    expect(transcript[0]).toEqual({ kind: 'text', text: '탐색 시작', id: 'tr-1' })
    expect(transcript[1]).toEqual({ kind: 'tool', verb: 'read', target: 'b.ts', status: 'done', id: 'tr-2' })
    expect(transcript[2]).toEqual({ kind: 'thinking', text: '생각 중', id: 'tr-3' })
  })

  it('afterMessageIndex는 strip되어 결과 SubAgentInfo에 존재하지 않는다', () => {
    const persisted: PersistedSubAgent[] = [{ ...makeSubAgent('sub-1'), afterMessageIndex: 5 }]
    const frozen = freezePersistedSubagents(persisted)
    expect('afterMessageIndex' in frozen[0]).toBe(false)
  })

  it('미지정(undefined) → 빈 배열', () => {
    expect(freezePersistedSubagents(undefined)).toEqual([])
  })

  it('빈 배열 → 빈 배열', () => {
    expect(freezePersistedSubagents([])).toEqual([])
  })
})
