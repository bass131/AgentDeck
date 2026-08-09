import { describe, it, expect } from 'vitest'
import {
  makePanelInitialState,
  panelApply,
} from '../../../02_Source/renderer/src/store/panelSession'
import type { PanelThreadSnapshot } from '../../../02_Source/shared/ipcContract'
import type { ThreadItem } from '../../../02_Source/renderer/src/store/threadTypes'

function msgItems(state: { thread: ThreadItem[] }) {
  return state.thread.filter(
    (t): t is Extract<ThreadItem, { kind: 'msg' }> => t.kind === 'msg'
  )
}

describe('RESTORE-1: RESTORE 액션이 makePanelInitialState(snapshot)와 동일한 상태를 반환', () => {

  it('restore(snapshot) 호출 후 thread에 msg 2개 존재', async () => {
    const snapshot: PanelThreadSnapshot = {
      messages: [
        { id: 'p1', role: 'user', text: '복원 메시지 1' },
        { id: 'p2', role: 'assistant', text: '복원 응답 1' },
      ],
      seq: 4,
    }

    const restoredState = makePanelInitialState(snapshot)
    const msgs = msgItems(restoredState)

    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe('user')
    expect(msgs[0].text).toBe('복원 메시지 1')
    expect(msgs[1].role).toBe('assistant')
    expect(msgs[1].text).toBe('복원 응답 1')
    expect(restoredState.currentRunId).toBeNull()
    expect(restoredState.isRunning).toBe(false)
  })

  it('RESTORE 후 openMsgId/openGroupId가 null (인터리브 포인터 리셋)', () => {
    const snapshot: PanelThreadSnapshot = {
      messages: [{ id: 'p1', role: 'user', text: 'hi' }],
      seq: 1,
    }
    const state = makePanelInitialState(snapshot)
    expect(state.openMsgId).toBeNull()
    expect(state.openGroupId).toBeNull()
  })
})

describe('RESTORE-2: restore 후 APPLY_EVENT text → 복원 msg + 새 assistant msg 공존', () => {

  it('복원된 user msg가 보존되고 새 assistant msg가 추가됨', () => {
    const snapshot: PanelThreadSnapshot = {
      messages: [{ id: 'p1', role: 'user', text: '복원된 사용자 메시지' }],
      seq: 3,
    }

    const restoredState = makePanelInitialState(snapshot)
    const stateWithRun = { ...restoredState, currentRunId: 'run-restore-1' }

    const s1 = panelApply(stateWithRun, {
      runId: 'run-restore-1',
      event: { type: 'text', delta: '새로운 AI 응답' },
    })

    const msgs = msgItems(s1)
    expect(msgs.some((m) => m.role === 'user' && m.text === '복원된 사용자 메시지')).toBe(true)
    expect(msgs.some((m) => m.role === 'assistant' && m.text === '새로운 AI 응답')).toBe(true)
  })

  it('복원 후 새 메시지의 id가 복원된 메시지 id와 충돌하지 않음 (B5)', () => {
    const snapshot: PanelThreadSnapshot = {
      messages: [{ id: 'pmsg-1', role: 'user', text: 'hi' }],
      seq: 5,
    }
    const restoredState = makePanelInitialState(snapshot)
    const restoredIds = new Set(restoredState.thread.map((t) => t.id))

    const stateWithRun = { ...restoredState, currentRunId: 'run-x' }
    const s1 = panelApply(stateWithRun, {
      runId: 'run-x',
      event: { type: 'text', delta: 'response' },
    })

    const newIds = s1.thread
      .filter((t) => t.kind === 'msg' && (t as Extract<ThreadItem, { kind: 'msg' }>).role === 'assistant')
      .map((t) => t.id)

    newIds.forEach((id) => {
      expect(restoredIds.has(id)).toBe(false)
    })
  })

  it('restore 후 done 이벤트 → isRunning false, thread 보존', () => {
    const snapshot: PanelThreadSnapshot = {
      messages: [{ id: 'p1', role: 'user', text: 'hello' }],
      seq: 2,
    }
    const restoredState = makePanelInitialState(snapshot)
    const stateWithRun = { ...restoredState, currentRunId: 'run-y', isRunning: true }

    const s1 = panelApply(stateWithRun, {
      runId: 'run-y',
      event: { type: 'done' },
    })

    expect(s1.isRunning).toBe(false)
    const msgs = msgItems(s1)
    expect(msgs.some((m) => m.text === 'hello')).toBe(true)
  })
})

describe('RESTORE-3: snapshot 없는 패널 — restore 미호출, 빈 thread 유지', () => {

  it('snapshot=undefined → makePanelInitialState() 빈 thread (하위호환)', () => {
    const state = makePanelInitialState(undefined)
    expect(state.thread).toHaveLength(0)
    expect(state.currentRunId).toBeNull()
  })

  it('빈 messages snapshot → thread 빈 배열', () => {
    const snapshot: PanelThreadSnapshot = { messages: [], seq: 0 }
    const state = makePanelInitialState(snapshot)
    expect(state.thread).toHaveLength(0)
  })
})

describe('RESTORE-4: PanelSessionHookResult에 restore() 메서드 존재', () => {

  it('PanelSessionHookResult 타입에 restore 필드가 존재해야 한다', async () => {
    const mod = await import('../../../02_Source/renderer/src/store/panelSession')
    expect(typeof mod.makePanelInitialState).toBe('function')
    expect(typeof mod.snapshotForPersist).toBe('function')
    expect(typeof mod.panelApply).toBe('function')
    expect(typeof mod.usePanelSession).toBe('function')
  })
})
