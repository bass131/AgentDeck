// @vitest-environment jsdom
/**
 * cp1-p06-agentpanel-tracking-prune.test.tsx — CP1 Phase 06 ②③:
 * AgentPanel lastSeenRef·timersRef 프루닝 + 대화 전환 감지 초기화.
 *
 * ② 배경: F-D(완료 서브에이전트 2초 뒤 숨김, agentpanel-subagent-lifecycle.test.tsx)
 * 타이머는 id 키 Map(lastSeenRef/timersRef)에 쌓인다. subagents 배열이 교체되어(예:
 * 대화 초기화 clearConversation()의 makeInitialState() → subagents:[]) 특정 id가
 * 더 이상 배열에 없어지면, 기존 코드는 배열을 순회하며 "있는" 항목만 갱신할 뿐
 * "사라진" id의 Map/타이머 엔트리는 그대로 방치했다(메모리 누수 + 이미 화면에 없는
 * 항목의 타이머가 계속 살아있다 뒤늦게 발화). 이 Phase는 배열에 없는 id를 감지해
 * Map 엔트리와 예약된 setTimeout을 함께 정리(프루닝)한다.
 *
 * ③ 배경: AgentPanel은 대화가 바뀌어도 리마운트되지 않는다(Shell 수명 컴포넌트,
 * key 없음) — lastSeenRef/timersRef는 그대로 유지된다. store의 대화 전환 경로 중
 * 디스크 로드 경로(sessions.ts selectConversation, bgRuns 스냅샷이 없는 일반 케이스)는
 * subagents 필드를 명시적으로 재설정하지 않는다 — 이전 대화의 subagents 배열
 * 레퍼런스가 그대로 남을 수 있다. 이 경우 배열 레퍼런스가 안 바뀌므로 ②의 프루닝
 * 이펙트(subagents 참조 변경에 의존)조차 재실행되지 않아, 이전 대화에서 예약된 숨김
 * 타이머가 취소되지 않고 살아남는다 — 사용자가 이미 다른 대화를 보고 있는 동안
 * 뒤늦게 발화해 상태를 오염시킬 수 있다("완만 재노출" 엣지, Phase 문서 ③).
 * conversationKey(대화 식별자) 변화를 전환 신호로 별도 사용해 lastSeenRef·timersRef를
 * 즉시 초기화(예약된 타이머 취소 포함)한다 — 배열 레퍼런스 변경 여부와 무관하게 동작.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import type { SubAgentInfo } from '../../../02.Source/renderer/src/lib/agentSampleData'
import { AgentPanel } from '../../../02.Source/renderer/src/components/05_agent/AgentPanel'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('CP1 P06 ② — AgentPanel lastSeenRef·timersRef 프루닝', () => {
  it('배열에서 id가 사라지면 예약된 숨김 타이머를 즉시 취소(프루닝) — conversationKey 불변', async () => {
    vi.useFakeTimers()
    const subs: SubAgentInfo[] = [
      { id: 'sa-x', name: 'explorer', role: 'x', status: 'done', tools: [] },
    ]
    const { rerender } = await act(async () => render(<AgentPanel subagents={subs} />))

    // done 서브에이전트 → 2초 뒤 숨김 타이머 1개 예약됨(F-D, agentpanel-subagent-lifecycle.test.tsx)
    expect(vi.getTimerCount()).toBe(1)

    // 배열 교체(해당 id 소멸) — 대화 초기화(subagents: []) 등으로 배열이 바뀌는 상황과 동형.
    // conversationKey는 건드리지 않음 — ③(전환 감지)이 아니라 ②(프루닝) 단독 검증.
    await act(async () => {
      rerender(<AgentPanel subagents={[]} />)
    })

    // 프루닝 — 더 이상 존재하지 않는 id의 타이머는 즉시 취소돼야 한다(방치 시 누수)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('일부 id만 사라지면 남은 id의 타이머는 유지, 사라진 id만 취소', async () => {
    vi.useFakeTimers()
    const subs: SubAgentInfo[] = [
      { id: 'sa-keep', name: 'keeper', role: 'x', status: 'done', tools: [] },
      { id: 'sa-drop', name: 'dropper', role: 'y', status: 'done', tools: [] },
    ]
    const { rerender } = await act(async () => render(<AgentPanel subagents={subs} />))
    expect(vi.getTimerCount()).toBe(2)

    await act(async () => {
      rerender(<AgentPanel subagents={[subs[0]]} />)
    })
    // sa-drop의 타이머만 취소되고 sa-keep의 타이머는 그대로 살아있어야 한다
    expect(vi.getTimerCount()).toBe(1)
  })
})

describe('CP1 P06 ③ — 대화 전환 감지 시 lastSeenRef·timersRef 초기화', () => {
  it('conversationKey 변경 시 이전 대화의 예약 타이머가 즉시 취소된다(배열 레퍼런스 불변이어도)', async () => {
    vi.useFakeTimers()
    const subs: SubAgentInfo[] = [
      { id: 'sa-dup', name: 'a1', role: 'x', status: 'done', tools: [] },
    ]
    const { rerender } = await act(async () =>
      render(<AgentPanel subagents={subs} conversationKey="conv-A" />)
    )
    expect(vi.getTimerCount()).toBe(1)

    // 대화 전환 — store의 디스크 로드 경로가 subagents 참조를 그대로 남기는 경우를
    // 재현(같은 배열 레퍼런스 subs, conversationKey만 바뀜 → ②의 프루닝 이펙트는
    // subagents 참조 불변이라 재실행되지 않는다).
    await act(async () => {
      rerender(<AgentPanel subagents={subs} conversationKey="conv-B" />)
    })

    // 전환 감지 → lastSeenRef/timersRef 초기화 → 이전 타이머 즉시 취소(advance 불필요)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('conversationKey가 같으면(같은 대화 내 갱신) 예약 타이머를 건드리지 않는다', async () => {
    vi.useFakeTimers()
    const subs: SubAgentInfo[] = [
      { id: 'sa-y', name: 'b1', role: 'x', status: 'done', tools: [] },
    ]
    const { rerender } = await act(async () =>
      render(<AgentPanel subagents={subs} conversationKey="conv-A" />)
    )
    expect(vi.getTimerCount()).toBe(1)

    await act(async () => {
      rerender(<AgentPanel subagents={subs} conversationKey="conv-A" />)
    })
    // 전환 아님 — 타이머 유지
    expect(vi.getTimerCount()).toBe(1)
  })

  it('최초 마운트 시(conversationKey 최초 값)는 전환으로 취급하지 않는다(불필요 초기화 방지)', async () => {
    vi.useFakeTimers()
    const subs: SubAgentInfo[] = [
      { id: 'sa-mount', name: 'm1', role: 'x', status: 'done', tools: [] },
    ]
    await act(async () => render(<AgentPanel subagents={subs} conversationKey="conv-A" />))
    // 마운트 직후에도 정상적으로 숨김 타이머가 예약돼 있어야 한다(전환 오탐으로 취소 X)
    expect(vi.getTimerCount()).toBe(1)
  })
})
