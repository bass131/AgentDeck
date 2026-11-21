// 루프 세션(loopLock이 있는 실행 입력)은 사용자 전역 설정(user)을 싣지 않고 Taste·헌장 원문을 시스템 프롬프트 덧붙임에 싣는다.
// 채팅 세션은 세 원천 그대로이고, Taste 글이 넘어와도 싣지 않는다.
import { describe, it, expect } from 'vitest'
import { buildClaudeSdkOptions, WORKFLOW_GATE_NOTICE, MEMORY_CONTINUITY_GUIDE } from '@main/04_Claude/sdkOptions'
import type { AgentRunInput } from '@main/03_Agent/AgentBackend'

const LOOP = { repoRoot: 'C:\\work\\repo', appLoopDir: 'C:\\Users\\u\\AppData\\Roaming\\agentdeck\\loop' }
const DOCS = '[전역 Taste]\n# 전역 Taste\n\n## T1 a\n- 원칙: b\n\n[프로젝트 헌장 — docs/agentdeck/헌장.md]\n# 프로젝트 헌장\n\n## 목표\nx'

function build(req: Partial<AgentRunInput>, loopDocs?: string): Record<string, unknown> {
  return buildClaudeSdkOptions({
    req: { messages: [{ role: 'user', content: 'x' }], mode: 'auto', ...req } as AgentRunInput,
    abortController: new AbortController(),
    canUseTool: async (_n, input) => ({ behavior: 'allow', updatedInput: input }),
    skillOverrides: null,
    mcpDenied: null,
    onUserDialog: async () => ({ behavior: 'cancelled' }),
    ...(loopDocs !== undefined ? { loopDocs } : {}),
  })
}

const append = (opts: Record<string, unknown>): string | undefined => (opts['systemPrompt'] as { append?: string }).append

describe('세션 설정 원천과 Taste·헌장 싣기', () => {
  it('루프 세션은 settingSources에 user가 없고 project·local만 싣는다 — 읽기 전용·메인 대화 꼴도 같다', () => {
    for (const loopLock of [LOOP, { ...LOOP, readOnly: true }, { ...LOOP, mainChat: { toolServer: 's', canWrite: () => true } }]) {
      expect(build({ loopLock })['settingSources']).toEqual(['project', 'local'])
      expect(build({ loopLock }, DOCS)['settingSources']).toEqual(['project', 'local'])
    }
  })

  it('루프 세션의 덧붙임에 Taste·헌장 원문이 머리 표지와 함께 실리고, 기존 고지는 그대로 앞에 남는다', () => {
    const text = append(build({ loopLock: LOOP }, DOCS))
    expect(text).toBe(`${WORKFLOW_GATE_NOTICE}\n\n${DOCS}`)
    const resumed = append(build({ loopLock: LOOP, resumeSessionId: 's1', systemPrompt: '앞글' }, DOCS))
    expect(resumed).toBe(`앞글\n\n${WORKFLOW_GATE_NOTICE}\n\n${MEMORY_CONTINUITY_GUIDE}\n\n${DOCS}`)
  })

  it('실을 문서가 없는 루프 세션의 덧붙임은 지금과 같다', () => {
    expect(append(build({ loopLock: LOOP }))).toBe(WORKFLOW_GATE_NOTICE)
  })

  it('채팅 세션은 세 원천 그대로이고, Taste 글이 넘어와도 덧붙임에 싣지 않는다', () => {
    for (const docs of [undefined, DOCS]) {
      const opts = build({}, docs)
      expect(opts['settingSources']).toEqual(['user', 'project', 'local'])
      expect(append(opts)).toBe(WORKFLOW_GATE_NOTICE)
    }
  })
})
