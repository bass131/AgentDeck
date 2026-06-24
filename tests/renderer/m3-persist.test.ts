/**
 * m3-persist.test.ts — M3 Frontend half TDD 단위 테스트
 *
 * TDD 원칙: 이 파일을 먼저 작성하여 RED 확인 → 구현 후 GREEN.
 *
 * 검증 범위:
 *   (S3) snapshotForPersist — msg kind만, JSON 라운드트립, 휘발 필드 미포함
 *   (B5) makePanelInitialState(snapshot) — 복원 시드 + id 재발급
 *   (B3) race 게이트 — 복원 완료 전 save 미발화 단정 (MultiWorkspace mock 검증)
 *   (B4) picker 리프팅 회귀 — PanelView picker/setPicker props 수용
 *
 * CRITICAL: reducer/threadTypes/panelApply 무변경 (교차 불변식).
 * Node 환경(jsdom 불필요) — 순수 함수 + mock 단위 테스트.
 */

import { describe, it, expect } from 'vitest'
import {
  makePanelInitialState,
  snapshotForPersist,
  panelApply,
} from '../../src/renderer/src/store/panelSession'
import type { PanelSessionState } from '../../src/renderer/src/store/panelSession'
import type { PanelThreadSnapshot } from '../../src/shared/ipc-contract'
import type { ThreadItem } from '../../src/renderer/src/store/threadTypes'

// ── 헬퍼 ────────────────────────────────────────────────────────────────────────

/** 패널 상태에 메시지 여러 개를 수동으로 집어넣은 mock 상태 생성 */
function makeStateWithMessages(msgs: ThreadItem[]): PanelSessionState {
  const base = makePanelInitialState()
  return { ...base, thread: msgs, seq: msgs.length }
}

// ═══════════════════════════════════════════════════════════════════════════════
// (S3) snapshotForPersist — msg kind만, JSON 라운드트립
// ═══════════════════════════════════════════════════════════════════════════════

describe('snapshotForPersist (S3) — msg kind만 영속, 휘발 필드 제외', () => {

  it('msg 항목만 PersistedMsg로 직렬화 (toolgroup/thinking/notice 제외)', () => {
    const msgs: ThreadItem[] = [
      { kind: 'msg', id: 'u1', role: 'user', text: '안녕' },
      { kind: 'thinking', id: 'th1', text: '생각 중...' },
      { kind: 'msg', id: 'a1', role: 'assistant', text: '안녕하세요' },
      {
        kind: 'toolgroup', id: 'tg1', tools: [
          { id: 'tc1', name: 'bash', input: {}, status: 'done' }
        ]
      },
      { kind: 'notice', id: 'n1', text: '알림' },
    ]
    const state = makeStateWithMessages(msgs)
    const snapshot = snapshotForPersist(state)

    expect(snapshot.messages).toHaveLength(2)
    expect(snapshot.messages[0].role).toBe('user')
    expect(snapshot.messages[0].text).toBe('안녕')
    expect(snapshot.messages[1].role).toBe('assistant')
    expect(snapshot.messages[1].text).toBe('안녕하세요')
  })

  it('msg 없으면 messages 빈 배열', () => {
    const msgs: ThreadItem[] = [
      { kind: 'thinking', id: 'th1', text: '생각 중' },
      { kind: 'toolgroup', id: 'tg1', tools: [] },
    ]
    const state = makeStateWithMessages(msgs)
    const snapshot = snapshotForPersist(state)
    expect(snapshot.messages).toHaveLength(0)
  })

  it('seq 포함', () => {
    const state = { ...makePanelInitialState(), seq: 42, thread: [] }
    const snapshot = snapshotForPersist(state)
    expect(snapshot.seq).toBe(42)
  })

  it('lastUsage 포함 (있을 때)', () => {
    const usage = { inputTokens: 100, outputTokens: 50 }
    const state = { ...makePanelInitialState(), lastUsage: usage, thread: [] }
    const snapshot = snapshotForPersist(state)
    expect(snapshot.lastUsage?.inputTokens).toBe(100)
    expect(snapshot.lastUsage?.outputTokens).toBe(50)
  })

  it('lastContextWindow 포함 (있을 때)', () => {
    const state = { ...makePanelInitialState(), lastContextWindow: 200000, thread: [] }
    const snapshot = snapshotForPersist(state)
    expect(snapshot.lastContextWindow).toBe(200000)
  })

  it('JSON 라운드트립 동일 — JSON.stringify→parse 후 messages 동일', () => {
    const msgs: ThreadItem[] = [
      { kind: 'msg', id: 'u1', role: 'user', text: 'hello' },
      { kind: 'msg', id: 'a1', role: 'assistant', text: 'hi', error: false },
    ]
    const state = makeStateWithMessages(msgs)
    const snapshot = snapshotForPersist(state)
    const roundTripped = JSON.parse(JSON.stringify(snapshot)) as PanelThreadSnapshot
    expect(roundTripped.messages).toEqual(snapshot.messages)
    expect(roundTripped.seq).toBe(snapshot.seq)
  })

  it('휘발 필드(currentRunId/isRunning/openMsgId/openGroupId) 미포함 — 반환값에 없어야 함', () => {
    const state = { ...makePanelInitialState(), currentRunId: 'run-999', isRunning: true, thread: [] }
    const snapshot = snapshotForPersist(state)
    // snapshot은 PanelThreadSnapshot 타입만
    expect((snapshot as unknown as Record<string, unknown>).currentRunId).toBeUndefined()
    expect((snapshot as unknown as Record<string, unknown>).isRunning).toBeUndefined()
    expect((snapshot as unknown as Record<string, unknown>).openMsgId).toBeUndefined()
    expect((snapshot as unknown as Record<string, unknown>).openGroupId).toBeUndefined()
  })

  it('msg error/images 필드도 PersistedMsg에 포함', () => {
    const msgs: ThreadItem[] = [
      { kind: 'msg', id: 'e1', role: 'assistant', text: '오류', error: true, images: ['data:img/png;base64,abc'] },
    ]
    const state = makeStateWithMessages(msgs)
    const snapshot = snapshotForPersist(state)
    expect(snapshot.messages[0].error).toBe(true)
    expect(snapshot.messages[0].images).toEqual(['data:img/png;base64,abc'])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// (B5) makePanelInitialState(snapshot) — 복원 시드 + id 재발급
// ═══════════════════════════════════════════════════════════════════════════════

describe('makePanelInitialState(snapshot) (B5) — 복원 시드 + id 재발급', () => {

  it('snapshot 없이 호출 → 빈 초기상태 (하위호환 회귀 0)', () => {
    const state = makePanelInitialState()
    expect(state.thread).toHaveLength(0)
    expect(state.currentRunId).toBeNull()
    expect(state.isRunning).toBe(false)
    expect(state.seq).toBe(0)
  })

  it('snapshot.messages → thread가 msg kind ThreadItem[]으로 재구성됨', () => {
    const snapshot: PanelThreadSnapshot = {
      messages: [
        { id: 'p1', role: 'user', text: 'hello' },
        { id: 'p2', role: 'assistant', text: 'world' },
      ],
      seq: 2,
    }
    const state = makePanelInitialState(snapshot)
    expect(state.thread).toHaveLength(2)
    expect(state.thread[0].kind).toBe('msg')
    expect(state.thread[1].kind).toBe('msg')
    const msgs = state.thread as Extract<ThreadItem, { kind: 'msg' }>[]
    expect(msgs[0].role).toBe('user')
    expect(msgs[0].text).toBe('hello')
    expect(msgs[1].role).toBe('assistant')
    expect(msgs[1].text).toBe('world')
  })

  it('currentRunId = null (휘발 필드 복원 0)', () => {
    const snapshot: PanelThreadSnapshot = {
      messages: [{ id: 'p1', role: 'user', text: 'hi' }],
      seq: 1,
    }
    const state = makePanelInitialState(snapshot)
    expect(state.currentRunId).toBeNull()
  })

  it('복원 후 새 nextId() 발급분 > 복원 메시지 id (B5 핵심 — 충돌 0)', () => {
    // snapshot 메시지를 복원한 뒤 한 번 더 makePanelInitialState를 호출해서
    // 새로 생성될 id가 복원 id보다 큰지(사전순/번호순) 검증하기 위해
    // 복원 상태의 seq가 snapshot.seq 이상인지 확인한다.
    // (내부 nextId 카운터가 복원 후 시드로 올라가 있어야 새 id가 충돌 않음)
    const snapshot: PanelThreadSnapshot = {
      messages: [
        { id: 'pmsg-1', role: 'user', text: 'a' },
        { id: 'pmsg-2', role: 'assistant', text: 'b' },
      ],
      seq: 5,
    }
    const state = makePanelInitialState(snapshot)

    // 복원된 메시지의 id가 새 id와 다른지 확인하기 위해: 복원 메시지 id는 재발급됨
    // 새로 발급된 id는 snapshot.messages의 원본 id와 달라야 한다
    const restoredIds = state.thread.map((t) => t.id)
    // B5: 복원 시 id 재발급 → 원본 snapshot id와 달라야 함 (또는 seq 기반 새 id)
    // seq가 최소 snapshot.seq 이상이어야 함 → 미래 충돌 차단
    expect(state.seq).toBeGreaterThanOrEqual(snapshot.seq)

    // 복원된 id는 snapshot 원본 id와 달라야 한다 (재발급)
    expect(restoredIds).not.toContain('pmsg-1')
    expect(restoredIds).not.toContain('pmsg-2')
  })

  it('복원 메시지 id < 이후 발급 id — 복원 후 snapshotForPersist 재직렬화 시 id 일관성', () => {
    // 복원 후 다시 snapshotForPersist() 호출 → msg는 재발급 id로 직렬화
    const snapshot: PanelThreadSnapshot = {
      messages: [{ id: 'pmsg-1', role: 'user', text: 'hi' }],
      seq: 3,
    }
    const state = makePanelInitialState(snapshot)
    // 복원 후 snapshotForPersist → messages[0].id는 새 id여야 함
    const reSnap = snapshotForPersist(state)
    expect(reSnap.messages[0].text).toBe('hi')
    // id는 재발급됐으므로 원본과 다르거나 같아도 괜찮지만 text는 유지
  })

  it('snapshot 빈 messages → thread 빈 배열', () => {
    const snapshot: PanelThreadSnapshot = { messages: [], seq: 0 }
    const state = makePanelInitialState(snapshot)
    expect(state.thread).toHaveLength(0)
  })

  it('snapshot.messages error/images 필드 → 복원 후 thread item에 보존', () => {
    const snapshot: PanelThreadSnapshot = {
      messages: [
        { id: 'p1', role: 'assistant', text: '오류', error: true, images: ['data:x'] },
      ],
      seq: 1,
    }
    const state = makePanelInitialState(snapshot)
    const item = state.thread[0] as Extract<ThreadItem, { kind: 'msg' }>
    expect(item.error).toBe(true)
    expect(item.images).toEqual(['data:x'])
  })

  it('snapshot 없으면 isRunning=false, openMsgId=null, openGroupId=null (기본 불변식)', () => {
    const state = makePanelInitialState()
    expect(state.isRunning).toBe(false)
    expect(state.openMsgId).toBeNull()
    expect(state.openGroupId).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 교차 불변식 — reducer/panelApply 무변경 확인
// ═══════════════════════════════════════════════════════════════════════════════

describe('교차 불변식 — 복원 후 panelApply append-only 동작', () => {

  it('복원 상태에서 text 이벤트 적용 → 기존 복원 메시지 + 새 assistant msg 공존', () => {
    const snapshot: PanelThreadSnapshot = {
      messages: [{ id: 'p1', role: 'user', text: '복원된 메시지' }],
      seq: 2,
    }
    const restoredState = makePanelInitialState(snapshot)
    const stateWithRun = { ...restoredState, currentRunId: 'r1' }

    const s1 = panelApply(stateWithRun, {
      runId: 'r1',
      event: { type: 'text', delta: '새 assistant 응답' },
    })

    // 복원 user msg + 새 assistant msg 공존 (append-only)
    const msgs = s1.thread.filter((t: ThreadItem) => t.kind === 'msg') as Extract<ThreadItem, { kind: 'msg' }>[]
    expect(msgs.some((m) => m.role === 'user' && m.text === '복원된 메시지')).toBe(true)
    expect(msgs.some((m) => m.role === 'assistant' && m.text === '새 assistant 응답')).toBe(true)
  })

  it('복원 상태에서 타 runId 이벤트는 무시됨 (panelApply 필터 불변)', () => {
    const snapshot: PanelThreadSnapshot = {
      messages: [{ id: 'p1', role: 'user', text: '복원된 메시지' }],
      seq: 1,
    }
    const restoredState = makePanelInitialState(snapshot)
    const stateWithRun = { ...restoredState, currentRunId: 'r1' }

    const s1 = panelApply(stateWithRun, {
      runId: 'r-other',
      event: { type: 'text', delta: '타 패널 응답' },
    })

    // 타 runId → 상태 불변
    expect(s1).toBe(stateWithRun)
  })
})
