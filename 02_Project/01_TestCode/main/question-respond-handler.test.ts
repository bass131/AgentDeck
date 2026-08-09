import { describe, it, expect } from 'vitest'
import type { RunResponse } from '../../../02_Project/00_Source/main/01_agents/AgentBackend'
import type { RunManager } from '../../../02_Project/00_Source/main/00_ipc/agentRuns'

interface QuestionResponseInput {
  runId?: unknown
  requestId?: unknown
  answers?: unknown
}

function handleQuestionRespond(
  req: QuestionResponseInput,
  runManager: Pick<RunManager, 'respond'>
): { ok: boolean } {
  if (!req?.runId || typeof req.runId !== 'string' || req.runId.trim() === '') {
    return { ok: false }
  }
  if (!req?.requestId || typeof req.requestId !== 'string' || req.requestId.trim() === '') {
    return { ok: false }
  }

  const answers = req.answers
  if (answers !== null) {
    if (!Array.isArray(answers)) {
      return { ok: false }
    }
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
      expect(calls).toHaveLength(1)
    })
  })
})
