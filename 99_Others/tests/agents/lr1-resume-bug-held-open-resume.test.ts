/**
 * lr1-resume-bug-held-open-resume.test.ts — LR1 Phase 01: 후보② 반증 회귀고정.
 *
 * 배경(_resume-bug-diagnosis.md §1·§2): resume 버그 원인 후보 중
 *   후보②("held-open(persistent) 경로가 resumeSessionId를 미사용")는 정적 진단으로 **반증**됨 —
 *   단발(_runPump)·지속세션(_runPersistentPump) 둘 다 공용 buildClaudeSdkOptions를 거치므로
 *   resumeSessionId가 있으면 persistent 여부와 무관하게 SDK에 resume이 주입된다.
 *
 * 이 테스트는 그 반증을 회귀 고정한다: persistent:true + resumeSessionId 조합에서도
 * buildClaudeSdkOptions 결과에 resume이 포함되는지 명시적으로 확인한다.
 * (기존 99.Others/tests/agents/sdkOptions.test.ts의 resumeSessionId 케이스는 persistent 필드를
 *  전달하지 않아 이 조합을 커버하지 않았음 — 이 파일이 그 간극을 메운다.)
 *
 * 신뢰경계: 실 SDK 호출 0. buildClaudeSdkOptions는 순수 조립 함수(옵션 dict 반환)만 검증.
 */
import { describe, it, expect } from 'vitest'
import { buildClaudeSdkOptions } from '../../../02.Source/main/01_agents/sdkOptions'
import type { CanUseToolFn } from '../../../02.Source/main/01_agents/permissionCoordinator'

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
