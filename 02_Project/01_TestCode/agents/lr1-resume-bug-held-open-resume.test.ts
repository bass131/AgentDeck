import { describe, it, expect } from 'vitest'
import { buildClaudeSdkOptions } from '../../../02_Project/00_Source/main/01_agents/sdkOptions'
import type { CanUseToolFn } from '../../../02_Project/00_Source/main/01_agents/permissionCoordinator'

const noopCanUse: CanUseToolFn = async (_t, input) => ({ behavior: 'allow', updatedInput: input })
const noopDialog = async () => ({ behavior: 'cancelled' as const })

describe('buildClaudeSdkOptions — persistent(held-open) + resumeSessionId 공존 (후보② 반증 고정)', () => {
  it('persistent:true + resumeSessionId → resume 키 포함 (held-open도 resume 받음)', () => {
    const opts = buildClaudeSdkOptions({
      req: {
        messages: [{ role: 'user', content: 'hi' }],
        mode: 'normal',
        persistent: true,
        sessionKey: 'conv-lr1-1',
        resumeSessionId: 'sess-lr1-held-open',
      },
      abortController: new AbortController(),
      canUseTool: noopCanUse,
      skillOverrides: null,
      mcpDenied: null,
      onUserDialog: noopDialog,
    })
    expect(opts['resume']).toBe('sess-lr1-held-open')
  })

  it('persistent:false(단발) + resumeSessionId → resume 키 포함 (동일 경유, 대조군)', () => {
    const opts = buildClaudeSdkOptions({
      req: {
        messages: [{ role: 'user', content: 'hi' }],
        mode: 'normal',
        persistent: false,
        resumeSessionId: 'sess-lr1-single-shot',
      },
      abortController: new AbortController(),
      canUseTool: noopCanUse,
      skillOverrides: null,
      mcpDenied: null,
      onUserDialog: noopDialog,
    })
    expect(opts['resume']).toBe('sess-lr1-single-shot')
  })

  it('persistent:true + resumeSessionId 미전달 → resume 키 없음 (신규 held-open 세션, 회귀 0)', () => {
    const opts = buildClaudeSdkOptions({
      req: {
        messages: [{ role: 'user', content: 'hi' }],
        mode: 'normal',
        persistent: true,
        sessionKey: 'conv-lr1-2',
      },
      abortController: new AbortController(),
      canUseTool: noopCanUse,
      skillOverrides: null,
      mcpDenied: null,
      onUserDialog: noopDialog,
    })
    expect('resume' in opts).toBe(false)
  })
})
