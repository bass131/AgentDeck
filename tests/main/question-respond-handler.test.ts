/**
 * question-respond-handler.test.ts — QUESTION_RESPOND 핸들러 입력 검증 단위 테스트
 *
 * ipc/index.ts는 electron(ipcMain)을 import하므로 직접 단위 테스트 불가.
 * 대신 핸들러의 핵심 책임인 "입력 검증 + RunManager.respond 위임" 로직을
 * permission-respond-handler.test.ts와 동일한 guard 추출 방식으로 검증한다.
 *
 * 테스트 대상 로직 (핸들러 내 guard 추출):
 *   1) runId / requestId: 비어있지 않은 string 검증
 *   2) answers: null 또는 string[][] 검증
 *      - null → 통과 (사용자 dismiss)
 *      - string[][] → 통과 (각 원소가 string[] 이어야 함)
 *      - 그 외(문자열·1차원 배열·숫자·객체 등) → ok:false
 *   3) 통과 시 RunManager.respond()로 위임 → 결과 { ok } 반환
 *   4) 미존재/완료 run → ok: false (no-op)
 *
 * 신뢰경계 검증:
 *   - 불합격 입력 → { ok: false }, throw 없음
 *   - 통과 시 검증된 인자만 RunManager에 전달
 */

import { describe, it, expect } from 'vitest'
import type { RunResponse } from '../../src/main/agents/AgentBackend'
import type { RunManager } from '../../src/main/ipc/agent-runs'

// ── 핸들러 guard 로직 추출 ────────────────────────────────────────────────────
//
// ipc/index.ts의 QUESTION_RESPOND 핸들러와 동일한 검증 로직.
// 핸들러가 변경되면 이 함수도 동기화해야 한다.
//
// answers 검증 규칙:
//   - null: 허용 (사용자 dismiss — "건너뜀" 의미)
//   - string[][]: 허용 — Array.isArray(answers) &&
//                         answers.every(row => Array.isArray(row) && row.every(v => typeof v === 'string'))
//   - 그 외: 거부 (ok:false)

interface QuestionResponseInput {
  runId?: unknown
  requestId?: unknown
  answers?: unknown
}

function handleQuestionRespond(
  req: QuestionResponseInput,
  runManager: Pick<RunManager, 'respond'>
): { ok: boolean } {
  // runId 검증 (untrusted)
  if (!req?.runId || typeof req.runId !== 'string' || req.runId.trim() === '') {
    return { ok: false }
  }
  // requestId 검증 (untrusted)
  if (!req?.requestId || typeof req.requestId !== 'string' || req.requestId.trim() === '') {
    return { ok: false }
  }

  // answers 검증: null 허용 또는 string[][] 검증
  const answers = req.answers
  if (answers !== null) {
    // null이 아닌 경우 — string[][]인지 확인
    if (!Array.isArray(answers)) {
      return { ok: false }
    }
    // 각 원소가 string[]인지 확인
    for (const row of answers) {
      if (!Array.isArray(row)) {
        return { ok: false }
      }
      for (const val of row) {
        if (typeof val !== 'string') {
          return { ok: false }
        }
      }
    }
  }

  const ok = runManager.respond(req.runId, req.requestId, {
    kind: 'question',
    answers: answers as string[][] | null
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

describe('QUESTION_RESPOND 핸들러 입력 검증', () => {

  describe('runId 검증', () => {
    it('runId가 undefined면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handleQuestionRespond(
        { requestId: 'req-1', answers: null },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('runId가 빈 문자열이면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handleQuestionRespond(
        { runId: '', requestId: 'req-1', answers: null },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('runId가 공백만 있으면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handleQuestionRespond(
        { runId: '   ', requestId: 'req-1', answers: null },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('runId가 number면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handleQuestionRespond(
        { runId: 42, requestId: 'req-1', answers: null },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })
  })

  describe('requestId 검증', () => {
    it('requestId가 undefined면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handleQuestionRespond(
        { runId: 'run-1', answers: null },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('requestId가 빈 문자열이면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handleQuestionRespond(
        { runId: 'run-1', requestId: '', answers: null },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('requestId가 공백만 있으면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handleQuestionRespond(
        { runId: 'run-1', requestId: '  ', answers: null },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })
  })

  describe('answers 검증', () => {
    it('answers가 null이면 통과한다(사용자 dismiss)', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handleQuestionRespond(
        { runId: 'run-1', requestId: 'req-1', answers: null },
        manager
      )
      expect(result).toEqual({ ok: true })
      expect(calls).toHaveLength(1)
      expect(calls[0].response).toEqual({ kind: 'question', answers: null })
    })

    it('answers가 빈 string[][]이면 통과한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handleQuestionRespond(
        { runId: 'run-1', requestId: 'req-1', answers: [] },
        manager
      )
      expect(result).toEqual({ ok: true })
      expect(calls).toHaveLength(1)
      expect(calls[0].response).toEqual({ kind: 'question', answers: [] })
    })

    it('answers가 정상 string[][]이면 통과한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handleQuestionRespond(
        { runId: 'run-1', requestId: 'req-1', answers: [['yes', 'no'], ['maybe']] },
        manager
      )
      expect(result).toEqual({ ok: true })
      expect(calls).toHaveLength(1)
      expect(calls[0].response).toEqual({
        kind: 'question',
        answers: [['yes', 'no'], ['maybe']]
      })
    })

    it('단일 선택(길이 1짜리 배열)도 통과한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handleQuestionRespond(
        { runId: 'run-1', requestId: 'req-1', answers: [['option-A']] },
        manager
      )
      expect(result).toEqual({ ok: true })
      expect(calls).toHaveLength(1)
    })

    it('answers가 문자열(string)이면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handleQuestionRespond(
        { runId: 'run-1', requestId: 'req-1', answers: 'yes' },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('answers가 1차원 string[]이면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handleQuestionRespond(
        { runId: 'run-1', requestId: 'req-1', answers: ['yes', 'no'] },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('answers가 숫자면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handleQuestionRespond(
        { runId: 'run-1', requestId: 'req-1', answers: 42 },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('answers가 일반 객체이면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handleQuestionRespond(
        { runId: 'run-1', requestId: 'req-1', answers: { a: 'b' } },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('answers가 undefined이면 ok:false를 반환한다', () => {
      // undefined는 null이 아니고 배열도 아님 → 거부
      const { manager, calls } = makeFakeRunManager(true)
      const result = handleQuestionRespond(
        { runId: 'run-1', requestId: 'req-1', answers: undefined },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('answers[][] 내부 원소가 string이 아닌 경우 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handleQuestionRespond(
        { runId: 'run-1', requestId: 'req-1', answers: [[1, 2], ['ok']] },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })

    it('answers 원소 중 배열이 아닌 것이 있으면 ok:false를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(true)
      const result = handleQuestionRespond(
        { runId: 'run-1', requestId: 'req-1', answers: [['ok'], 'not-array'] },
        manager
      )
      expect(result).toEqual({ ok: false })
      expect(calls).toHaveLength(0)
    })
  })

  describe('RunManager.respond 위임', () => {
    it('검증 통과 시 runManager.respond에 올바른 인자를 전달한다 (null)', () => {
      const { manager, calls } = makeFakeRunManager(true)
      handleQuestionRespond(
        { runId: 'run-abc', requestId: 'req-xyz', answers: null },
        manager
      )
      expect(calls).toHaveLength(1)
      expect(calls[0]).toEqual({
        runId: 'run-abc',
        requestId: 'req-xyz',
        response: { kind: 'question', answers: null }
      })
    })

    it('검증 통과 시 runManager.respond에 올바른 인자를 전달한다 (string[][])', () => {
      const { manager, calls } = makeFakeRunManager(true)
      handleQuestionRespond(
        { runId: 'run-abc', requestId: 'req-xyz', answers: [['A', 'B']] },
        manager
      )
      expect(calls).toHaveLength(1)
      expect(calls[0]).toEqual({
        runId: 'run-abc',
        requestId: 'req-xyz',
        response: { kind: 'question', answers: [['A', 'B']] }
      })
    })

    it('runManager.respond가 true를 반환하면 { ok: true }를 반환한다', () => {
      const { manager } = makeFakeRunManager(true)
      const result = handleQuestionRespond(
        { runId: 'run-1', requestId: 'req-1', answers: null },
        manager
      )
      expect(result).toEqual({ ok: true })
    })

    it('runManager.respond가 false(미존재 run)를 반환하면 { ok: false }를 반환한다', () => {
      const { manager } = makeFakeRunManager(false)
      const result = handleQuestionRespond(
        { runId: 'nonexistent', requestId: 'req-1', answers: null },
        manager
      )
      expect(result).toEqual({ ok: false })
    })

    it('runManager.respond가 false(완료된 run)를 반환하면 { ok: false }를 반환한다', () => {
      const { manager, calls } = makeFakeRunManager(false)
      const result = handleQuestionRespond(
        { runId: 'done-run', requestId: 'req-1', answers: [['yes']] },
        manager
      )
      expect(result).toEqual({ ok: false })
      // respond는 호출되었지만 run이 없어서 false 반환
      expect(calls).toHaveLength(1)
    })
  })
})
