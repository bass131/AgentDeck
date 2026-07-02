/**
 * loop-store.test.ts — appStore SDK 크론 표시(activeLoops) 정리 회귀 (LR3-03 축소).
 *
 * 배경: 이 파일은 원래 앱 레벨 /loop 상태(activeLoop 단수 + startLoop/tickLoop/stopLoop/
 * dismissLoop)를 검증했다. LR3-03(앱 타이머 /loop 폐기 — 영호 확정 "토큰 맥싱")에서 그
 * 슬라이스(store/slices/loop.ts)가 통째로 삭제되어 해당 테스트도 함께 제거한다.
 *
 * 잔존시키는 것(LR3-03 함정 항목 — 반드시 유지): abort/interrupt가 activeLoops(SDK 크론
 * 표시, 복수)를 정리/보존하는 로직은 앱 타이머와 무관한 별도 계약이다. main abort는 done
 * 마킹 후 이벤트를 끊어(agent-runs.ts:193) 백엔드 abortCleanup의 loops:[] 정리 이벤트가
 * renderer에 안 닿는다(LR2-03 라이브 실측) — 표시를 renderer-local로 동기화하는 이 봉합을
 * 다시 깨뜨리면 SDK 크론 배너가 정지 후에도 잔존한다.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'

const mockApi = {
  conversationLoad: async () => ({ conversations: [] }),
  conversationSave: async () => ({ id: 'cv-1' }),
  agentRun: async () => ({ runId: 'r1' }),
  agentAbort: async () => ({ accepted: true }),
  agentInterrupt: async () => ({ accepted: true }),
  onAgentEvent: () => () => {},
  listFiles: async () => ({ files: [] }),
  pathForFile: () => '',
  saveImageData: async () => ({ path: '' }),
  workspaceOpen: async () => ({ rootPath: null, tree: null }),
  referenceList: async () => ({ references: [] }),
  referenceTree: async () => ({ tree: null }),
  referenceAdd: async () => ({ reference: null }),
  fsRead: async () => ({ kind: 'not-found' }),
}
Object.defineProperty(globalThis, 'window', {
  value: { api: mockApi },
  writable: true,
  configurable: true,
})

function reset() {
  useAppStore.setState({ queue: [], currentRunId: null } as Parameters<typeof useAppStore.setState>[0])
}

describe('store loop — abort/interrupt 연동 (SDK 크론 표시 activeLoops 정리, LR2-03 봉합 잔존)', () => {
  beforeEach(() => reset())

  // LR2-03 라이브 실측: main abort는 done 마킹 후 이벤트를 끊어(agent-runs.ts:193)
  // 백엔드 abortCleanup의 loops:[] 정리 이벤트가 renderer에 영원히 안 닿는다 →
  // SDK 크론 배너 잔존. main 상태는 실제로 정리되므로(cronTracker.clear) 표시를
  // renderer-local로 동기화한다. (main 이벤트 드롭 수리는 🔴 위험구역 — 아침 큐)
  it('abortRun → activeLoops(SDK 크론 표시)도 해제 (세션 종료 = 크론 사멸 동기화)', async () => {
    useAppStore.setState({
      currentRunId: 'r1',
      activeLoops: [{ id: 'cc1', summary: '매분 점검', interval: 'Every minute' }],
    } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().abortRun()
    expect(useAppStore.getState().activeLoops).toEqual([])
  })

  it('interruptRun(턴 정지, 세션 유지)은 activeLoops 유지 — 크론 살아있음', async () => {
    useAppStore.setState({
      currentRunId: 'r1',
      activeLoops: [{ id: 'cc1', summary: '매분 점검', interval: 'Every minute' }],
    } as Parameters<typeof useAppStore.setState>[0])
    await useAppStore.getState().interruptRun()
    expect(useAppStore.getState().activeLoops.length).toBe(1)
  })
})

describe('panel loop — CLEAR_LOOPS (LR2-03, abort 시 SDK 크론 표시 정리)', () => {
  it('CLEAR_LOOPS → activeLoops [] (단일채팅 abortRun과 동형)', async () => {
    const { panelReducerFn } = await import('../../../02.Source/renderer/src/store/panelSession')
    const { makeInitialState } = await import('../../../02.Source/renderer/src/store/reducer')
    const base = {
      ...makeInitialState(),
      currentRunId: 'p1',
      activeLoops: [{ id: 'cc1', summary: '매분 점검', interval: 'Every minute' }],
    }
    const next = panelReducerFn(
      base as Parameters<typeof panelReducerFn>[0],
      { type: 'CLEAR_LOOPS' } as Parameters<typeof panelReducerFn>[1]
    )
    expect(next.activeLoops).toEqual([])
  })
})
