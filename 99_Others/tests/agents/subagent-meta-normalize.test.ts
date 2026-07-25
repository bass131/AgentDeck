/**
 * subagent-meta-normalize.test.ts — RunEventNormalizer가 subagent tool_result의 내부
 * 메타를 sanitizeSubagentToolResult로 정제하는지 검증 (FB1 Phase 05, TDD RED)
 *
 * 노출 경로(실증): claude-stream.ts mapUserContent()가 tool_result content를 가공 없이
 * `output: blockContent`로 그대로 emit(claude-stream.ts:361-367) → eventNormalizer.ts가
 * 지금까지 orchestration/Task* id만 추적하고 subagent id는 tool_result output을 건드리지
 * 않은 채 그대로 통과시킴 → 렌더러 reducer/tool.ts handleToolResult "② subagent id 매칭"
 * 분기가 extractSubagentText(output)으로 activity에 그대로 반영 → SubAgentFullscreen이
 * finalAnswer로 원문 노출(스크린샷 실측).
 *
 * 수정 계약: eventNormalizer가 F-C(orchestration id 추적)와 동일 패턴으로 'subagent'
 * 이벤트의 id를 _subagentToolIds에 등록하고, 해당 id의 tool_result가 오면
 * sanitizeSubagentToolResult(event.output)으로 치환한 뒤(suppress 아님 — 완료 신호는
 * 유지) 그대로 흘려보낸다. 다른 id(일반 tool_result)는 절대 건드리지 않는다(과필터 방지).
 *
 * 검증 범위:
 *  N1 subagent 등록 후 해당 id의 tool_result(async launch 메타, 스크린샷 실측) → output 정제(빈 문자열)
 *  N2 subagent 등록 후 해당 id의 tool_result(2블록: 실제결과+메타) → 메타 블록만 제거
 *  N3 subagent와 무관한 다른 id의 tool_result → output 불변(과필터 방지, 회귀 0)
 *  N4 실제 결과만 담은 tool_result(메타 아님) → output 불변(회귀 0)
 *  N5 tool_result 이벤트 자체는 suppress되지 않음(events에 여전히 포함 — 완료 판정 유지)
 *  N6 cleanup(abortCleanup/singlePumpCleanup/persistentPumpCleanup) 후 재사용 시 이전
 *     subagent id로도 오탐 없음(상태 클리어 확인)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { RunEventNormalizer } from '../../../02.Source/main/01_agents/eventNormalizer'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

// ── 픽스처 (eventNormalizer.test.ts 컨벤션 미러) ────────────────────────────────

function assistantMsg(contents: unknown[]) {
  return { type: 'assistant', message: { role: 'assistant', content: contents } }
}

function userMsg(contents: unknown[]) {
  return { type: 'user', message: { role: 'user', content: contents } }
}

function toolUse(id: string, name: string, input: unknown) {
  return { type: 'tool_use', id, name, input }
}

function toolResult(id: string, content: unknown, isError = false) {
  return {
    type: 'tool_result',
    tool_use_id: id,
    content,
    ...(isError ? { is_error: true } : {}),
  }
}

const ASYNC_LAUNCH_META =
  "Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)\n" +
  "agentId: a1eb66c99aa76e143 (internal ID - do not mention to user. Use SendMessage with to: 'a1eb66c99aa76e143', summary: '<5-10 word recap>' to continue this agent.)\n" +
  "The agent is working in the background. You will be notified automatically when it completes.\n" +
  "output_file: C:\\Users\\bass1\\AppData\\Local\\Temp\\claude\\tasks\\a1eb66c99aa76e143.output\n" +
  "Do NOT Read or tail this file via the shell tool — it is the full subagent JSONL transcript."

describe('RunEventNormalizer — 서브에이전트 tool_result 내부 메타 정규화 (FB1 Phase 05)', () => {
  let norm: RunEventNormalizer

  beforeEach(() => {
    norm = new RunEventNormalizer('r-fb1-05')
  })

  it('N1: subagent 등록 후 async launch 메타 tool_result → output 정제(빈 문자열)', () => {
    // Task tool_use(최상위, parentToolId 없음) → subagent 이벤트 + id 등록
    const r1 = norm.process(assistantMsg([toolUse('sa1', 'Task', { subagent_type: 'claude', description: 'Summarize Button.ts' })]))
    expect(r1.events.some(e => e.type === 'subagent')).toBe(true)

    // 해당 id의 tool_result(문자열 content = 실측 async launch 메타) → 정제
    const r2 = norm.process(userMsg([toolResult('sa1', ASYNC_LAUNCH_META)]))
    const tr = r2.events.find(e => e.type === 'tool_result') as Extract<AgentEvent, { type: 'tool_result' }> | undefined
    expect(tr).toBeDefined()
    expect(tr!.output).toBe('')
  })

  it('N2: 2블록 배열(실제결과+메타) tool_result → 메타 블록만 제거, 실제 결과 보존', () => {
    norm.process(assistantMsg([toolUse('sa2', 'Agent', { subagent_type: 'claude', description: '탐색' })]))

    const content = [
      { type: 'text', text: '바이너리 서치는 정렬된 배열에서 절반씩 좁혀 찾는다.' },
      { type: 'text', text: "agentId: abc123 (use SendMessage with to: 'abc123')\n<usage>subagent_tokens: 10291</usage>" },
    ]
    const r2 = norm.process(userMsg([toolResult('sa2', content)]))
    const tr = r2.events.find(e => e.type === 'tool_result') as Extract<AgentEvent, { type: 'tool_result' }>
    const output = tr.output as Array<{ type: string; text: string }>
    expect(output).toHaveLength(1)
    expect(output[0].text).toBe('바이너리 서치는 정렬된 배열에서 절반씩 좁혀 찾는다.')
  })

  it('N3: subagent와 무관한 다른 id의 tool_result → output 불변(과필터 방지)', () => {
    norm.process(assistantMsg([toolUse('sa3', 'Task', { description: 'x' })]))

    // 다른 도구(id 다름)의 tool_result — 우연히 'agentId:' 유사 텍스트를 포함해도 손대지 않음
    const r = norm.process(userMsg([toolResult('other-tool-1', '탐색 완료. 3개 파일.')]))
    const tr = r.events.find(e => e.type === 'tool_result') as Extract<AgentEvent, { type: 'tool_result' }>
    expect(tr.output).toBe('탐색 완료. 3개 파일.')
  })

  it('N4: 실제 결과만 담은 subagent tool_result(메타 아님) → output 불변(회귀 0)', () => {
    norm.process(assistantMsg([toolUse('sa4', 'Task', { description: 'x' })]))
    const r = norm.process(userMsg([toolResult('sa4', 'ALPHA 결과 완료.')]))
    const tr = r.events.find(e => e.type === 'tool_result') as Extract<AgentEvent, { type: 'tool_result' }>
    expect(tr.output).toBe('ALPHA 결과 완료.')
  })

  it('N5: tool_result 이벤트 자체는 suppress되지 않음(완료 판정 유지)', () => {
    norm.process(assistantMsg([toolUse('sa5', 'Task', { description: 'x' })]))
    const r = norm.process(userMsg([toolResult('sa5', ASYNC_LAUNCH_META)]))
    expect(r.events.some(e => e.type === 'tool_result')).toBe(true)
  })

  it('N6: abortCleanup 후 동일 id 재등장 시 이전 상태 영향 없음(상태 클리어 확인)', () => {
    norm.process(assistantMsg([toolUse('sa6', 'Task', { description: 'x' })]))
    norm.abortCleanup()

    // 클리어 후 같은 id의 tool_result가 오면 subagent로 인식되지 않으므로 정제 없이 통과
    // (등록 자체가 사라졌으므로 일반 tool_result 취급 — 과필터 없음 확인)
    const r = norm.process(userMsg([toolResult('sa6', ASYNC_LAUNCH_META)]))
    const tr = r.events.find(e => e.type === 'tool_result') as Extract<AgentEvent, { type: 'tool_result' }>
    expect(tr.output).toBe(ASYNC_LAUNCH_META)
  })
})
