/**
 * permission-respond-handler.test.ts — PERMISSION_RESPOND 핸들러 입력 검증 단위 테스트
 *
 * ipc/index.ts는 electron(ipcMain)을 import하므로 직접 단위 테스트 불가.
 * 대신 핸들러의 핵심 책임인 "입력 검증 + RunManager.respond 위임" 로직을
 * 동일한 guard 코드를 추출하여 검증한다.
 *
 * 테스트 대상 로직 (핸들러 내 guard 추출):
 *   1) runId / requestId: 비어있지 않은 string 검증
 *   2) behavior: 'allow'|'allow_always'|'deny' allowlist 검증
 *   3) 통과 시 RunManager.respond()로 위임 → 결과 { ok } 반환
 *   4) 미존재/완료 run → ok: false (no-op)
 *
 * 신뢰경계 검증:
 *   - 불합격 입력 → { ok: false }, throw 없음
 *   - 통과 시 검증된 인자만 RunManager에 전달
 */

import { describe, it, expect } from 'vitest'
import type { RunResponse } from '../../src/main/01_agents/AgentBackend'
import type { RunManager } from '../../src/main/00_ipc/agent-runs'

// ── 핸들러 guard 로직 추출 ────────────────────────────────────────────────────
//
// ipc/index.ts의 PERMISSION_RESPOND 핸들러와 동일한 검증 로직.
// 핸들러가 변경되면 이 함수도 동기화해야 한다.

const ALLOWED_BEHAVIORS = ['allow', 'allow_always', 'deny'] as const
type AllowedBehavior = (typeof ALLOWED_BEHAVIORS)[number]

interface PermissionResponseInput {
  runId?: unknown
  requestId?: unknown
  behavior?: unknown
}

function handlePermissionRespond(
  req: PermissionResponseInput,
  runManager: Pick<RunManager, 'respond'>
): { ok: boolean } {
  // 입력 검증 (untrusted) — 타입 + 비어있음 + allowlist
  if (!req?.runId || typeof req.runId !== 'string' || req.runId.trim() === '') {
    return { ok: false }
  }
  if (!req?.requestId || typeof req.requestId !== 'string' || req.requestId.trim() === '') {
    return { ok: false }
  }
  if (!ALLOWED_BEHAVIORS.includes(req.behavior as AllowedBehavior)) {
    return { ok: false }
  }

  const ok = runManager.respond(req.runId, req.requestId, {
    kind: 'permission',
    behavior: req.behavior as AllowedBehavior
  })
  return { ok }
}

// ── 가짜 RunManager ────────────────────────────────────────────────────────────

function makeFakeRunManager(respondReturnValue: boolean): {
  manager: Pick<RunManager, 'respond'>
  calls: Array<{ runId: string; requestId: string; response: RunResponse }>
} {
  const calls: Array<{ runId: string; requestId: string; response: RunResponse }> = []
  return {
    manager: {
      respond(runId, requestId, response) {
        calls.push({ runId, requestId, response })
        return respondReturnValue
      }
    },
    calls
  }
}

// ── 입력 검증 테스트 ──────────────────────────────────────────────────────────

describe('PERMISSION_RESPOND 핸들러 입력 검증', () => {
  describe('runId 검증', () => {
    it('runId가 undefined면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handlePermissionRespond(
        { requestId: 'req-1', behavior: 'allow' },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('runId가 빈 문자열이면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handlePermissionRespond(
        { runId: '', requestId: 'req-1', behavior: 'allow' },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('runId가 공백만 있으면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handlePermissionRespond(
        { runId: '   ', requestId: 'req-1', behavior: 'allow' },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('runId가 number면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handlePermissionRespond(
        { runId: 123, requestId: 'req-1', behavior: 'allow' },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })
  })

  describe('requestId 검증', () => {
    it('requestId가 undefined면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handlePermissionRespond(
        { runId: 'run-1', behavior: 'allow' },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('requestId가 빈 문자열이면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handlePermissionRespond(
        { runId: 'run-1', requestId: '', behavior: 'allow' },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })
  })

  describe('behavior allowlist 검증', () => {
    it('behavior가 undefined면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handlePermissionRespond(
        { runId: 'run-1', requestId: 'req-1' },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('behavior가 알 수 없는 값이면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handlePermissionRespond(
        { runId: 'run-1', requestId: 'req-1', behavior: 'permit' },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('behavior가 빈 문자열이면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handlePermissionRespond(
        { runId: 'run-1', requestId: 'req-1', behavior: '' },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('behavior가 대소문자 불일치("Allow")면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handlePermissionRespond(
        { runId: 'run-1', requestId: 'req-1', behavior: 'Allow' },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it.each(['allow', 'allow_always', 'deny'] as const)(
      '올바른 behavior "%s"는 검증을 통과한다',
      (behavior) => {
        const { manager, calls } = makeFakeRunManager(true)
        const result = handlePermissionRespond(
          { runId: 'run-1', requestId: 'req-1', behavior },
          manager
        )
        expect(result).toEqual({ ok: true })
        expect(calls).toHaveLength(1)
        expect(calls[0].response).toEqual({ kind: 'permission', behavior })
      }
    )
  })

  describe('RunManager.respond 위임', () => {
    it('검증 통과 시 runManager.respond에 올바른 인자를 전달한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      handlePermissionRespond(
        { runId: 'run-abc', requestId: 'req-xyz', behavior: 'allow_always' },
        manager
      )
      expect(calls).toHaveLength(1)
      expect(calls[0]).toEqual({
        runId: 'run-abc',
        requestId: 'req-xyz',
        response: { kind: 'permission', behavior: 'allow_always' }
      })
    })

    it('runManager.respond가 true를 반환하면 { ok: true }를 반환한다', () => {
      const { manager } = makeFakeRunManager(true)
      const result = handlePermissionRespond(
        { runId: 'run-1', requestId: 'req-1', behavior: 'deny' },
        manager
      )
      expect(result).toEqual({ ok: true })
    })

    it('runManager.respond가 false(미존재 run)를 반환하면 { ok: false }를 반환한다', () => {
      const { manager } = makeFakeRunManager(false)
      const result = handlePermissionRespond(
        { runId: 'nonexistent', requestId: 'req-1', behavior: 'allow' },
        manager
      )
      expect(result).toEqual({ ok: false })
    })

    it('runManager.respond가 false(완료된 run)를 반환하면 { ok: false }를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(false)
      const result = handlePermissionRespond(
        { runId: 'done-run', requestId: 'req-1', behavior: 'allow' },
        manager
      )
      expect(result).toEqual({ ok: false })
      // respond는 호출되었지만 run이 없어서 false 반환
      expect(calls).toHaveLength(1)
    })
  })
})
