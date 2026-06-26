/**
 * claude-question.test.ts — Phase 24d TDD (질문 응답 양방향 흐름)
 *
 * ClaudeCodeBackend의 AskUserQuestion 질문카드 흐름 검증.
 * mock queryFn으로 실 네트워크 0. electron import 0.
 *
 * 검증 항목:
 *  Q1. AskUserQuestion → question_request emit + 정규화 questions[] (raw 누수 0).
 *  Q2. respond(kind:'question', answers) → canUseTool이 deny+formatAnswers 메시지 반환.
 *  Q3. answers=null(dismiss) → 건너뜀 안내 메시지 포함 deny 반환.
 *  Q4. abort 중 질문 waiter 취소 → hang 없이 events 종료.
 *  Q5. parseQuestions: 빈/비정형 input → 빈 배열 → 즉시 allow.
 *  Q6. claude-stream: AskUserQuestion tool_use → tool_call 미emit (원본 미러).
 *  Q7. 권한(24c) 회귀: AskUserQuestion 이후 일반 Bash 권한 발화도 정상 동작.
 *  Q8. _waiters 통합: permission respond와 question respond가 동일 맵에서 처리.
 */

import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../src/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../src/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../src/shared/agent-events'
import { mapClaudeStreamLine } from '../../src/main/01_agents/claude-stream'

// ── 픽스처 헬퍼 ───────────────────────────────────────────────────────────────

function mkResultSuccess() {
  return {
    type: 'result' as const,
    subtype: 'success' as const,
    is_error: false,
    usage: { input_tokens: 10, output_tokens: 5 },
    modelUsage: {},
    errors: []
  }
}

type CapturedCanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  opts: { signal: AbortSignal; toolUseID: string }
) => Promise<{ behavior: string; updatedInput?: unknown; updatedPermissions?: unknown; message?: string }>

interface Captured {
  canUseTool?: CapturedCanUseTool
  options?: Record<string, unknown>
  run?: import('../../src/main/01_agents/AgentBackend').AgentRun
}

function makeCaptureQuery(
  messages: unknown[],
  cap: Captured,
  runWithCapture?: () => Promise<void>
): QueryFn {
  return async function* (params: { prompt: string; options?: unknown }) {
    const opts = params.options as Record<string, unknown> | undefined
    cap.options = opts
    cap.canUseTool = opts?.canUseTool as CapturedCanUseTool
    if (runWithCapture) {
      await runWithCapture()
    }
    for (const msg of messages) {
      const ab = opts?.abortController as AbortController | undefined
      if (ab?.signal.aborted) return
      yield msg
    }
  }
}

async function drain(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []
  for await (const e of events) out.push(e)
  return out
}

// ── AskUserQuestion 입력 픽스처 ───────────────────────────────────────────────

function mkAskInput(questions: unknown[] = [
  {
    question: '어떤 언어를 사용하시겠어요?',
    header: '언어 선택',
    options: [
      { label: 'TypeScript', description: '타입 안전' },
      { label: 'JavaScript', description: '빠른 시작' }
    ],
    multiSelect: false
  }
]): Record<string, unknown> {
  return { questions }
}

// ── Q1. AskUserQuestion → question_request emit ───────────────────────────────

describe('Phase 24d — AskUserQuestion → question_request emit', () => {
  it('Q1-a: question_request 이벤트가 events 스트림에 흐른다', async () => {
    const cap: Captured = {}
    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = new AbortController().signal
      const p = cap.canUseTool!('AskUserQuestion', mkAskInput(), { signal, toolUseID: 'ask-tu-1' })
      await new Promise(r => setTimeout(r, 10))
      // answers=[['TypeScript']] 로 응답
      cap.run!.respond('ask-1', { kind: 'question', answers: [['TypeScript']] })
      await p
    })

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'start' }] })
    cap.run = run
    const events = await drain(run.events)

    const reqs = events.filter(e => e.type === 'question_request')
    expect(reqs).toHaveLength(1)
  })

  it('Q1-b: question_request의 questions[]가 정규화되어 있다 (raw 누수 없음)', async () => {
    const cap: Captured = {}
    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = new AbortController().signal
      const p = cap.canUseTool!('AskUserQuestion', mkAskInput(), { signal, toolUseID: 'ask-tu-1' })
      await new Promise(r => setTimeout(r, 10))
      cap.run!.respond('ask-1', { kind: 'question', answers: [['TypeScript']] })
      await p
    })

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'start' }] })
    cap.run = run
    const events = await drain(run.events)

    const req = events.find(e => e.type === 'question_request') as {
      type: 'question_request'
      requestId: string
      questions: Array<{ question: string; header?: string; options: Array<{ label: string; description?: string }>; multiSelect?: boolean }>
    }

    expect(req).toBeDefined()
    expect(req.requestId).toMatch(/^ask-/)
    expect(Array.isArray(req.questions)).toBe(true)
    expect(req.questions[0].question).toBe('어떤 언어를 사용하시겠어요?')
    expect(req.questions[0].header).toBe('언어 선택')
    expect(req.questions[0].options[0].label).toBe('TypeScript')
    expect(req.questions[0].options[1].label).toBe('JavaScript')
    // raw 누수 확인: question_request는 type, requestId, questions 필드만
    expect(Object.keys(req).sort()).toEqual(['questions', 'requestId', 'type'])
  })

  it('Q1-c: requestId는 ask- 접두어를 갖는다', async () => {
    const cap: Captured = {}
    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = new AbortController().signal
      const p = cap.canUseTool!('AskUserQuestion', mkAskInput(), { signal, toolUseID: 'ask-tu' })
      await new Promise(r => setTimeout(r, 10))
      cap.run!.respond('ask-1', { kind: 'question', answers: null })
      await p
    })

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'x' }] })
    cap.run = run
    const events = await drain(run.events)

    const req = events.find(e => e.type === 'question_request') as { requestId: string } | undefined
    expect(req?.requestId).toMatch(/^ask-\d+$/)
  })
})

// ── Q2. respond(kind:'question', answers) → deny+formatAnswers ────────────────

describe('Phase 24d — respond(question) → canUseTool deny + formatAnswers', () => {
  it('Q2-a: answers=[["TypeScript"]] → deny 반환 + 메시지에 TypeScript 포함', async () => {
    const cap: Captured = {}
    let cutResult!: { behavior: string; message?: string }

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = new AbortController().signal
      const p = cap.canUseTool!('AskUserQuestion', mkAskInput(), { signal, toolUseID: 'tu' })
      await new Promise(r => setTimeout(r, 10))
      cap.run!.respond('ask-1', { kind: 'question', answers: [['TypeScript']] })
      cutResult = await p
    })

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'start' }] })
    cap.run = run
    await drain(run.events)

    expect(cutResult.behavior).toBe('deny')
    expect(cutResult.message).toBeTruthy()
    expect(cutResult.message).toContain('TypeScript')
  })

  it('Q2-b: 복수 질문 answers → 각 질문별 답변이 메시지에 포함', async () => {
    const cap: Captured = {}
    let cutResult!: { behavior: string; message?: string }

    const multiInput = mkAskInput([
      {
        question: '언어?',
        header: '언어',
        options: [{ label: 'TypeScript' }, { label: 'Python' }],
        multiSelect: false
      },
      {
        question: '프레임워크?',
        header: '프레임워크',
        options: [{ label: 'React' }, { label: 'Vue' }],
        multiSelect: false
      }
    ])

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = new AbortController().signal
      const p = cap.canUseTool!('AskUserQuestion', multiInput, { signal, toolUseID: 'tu' })
      await new Promise(r => setTimeout(r, 10))
      cap.run!.respond('ask-1', { kind: 'question', answers: [['TypeScript'], ['React']] })
      cutResult = await p
    })

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'start' }] })
    cap.run = run
    await drain(run.events)

    expect(cutResult.behavior).toBe('deny')
    expect(cutResult.message).toContain('TypeScript')
    expect(cutResult.message).toContain('React')
  })

  it('Q2-c: formatAnswers 메시지는 모델이 계속 진행하도록 지시를 포함', async () => {
    const cap: Captured = {}
    let cutResult!: { behavior: string; message?: string }

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = new AbortController().signal
      const p = cap.canUseTool!('AskUserQuestion', mkAskInput(), { signal, toolUseID: 'tu' })
      await new Promise(r => setTimeout(r, 10))
      cap.run!.respond('ask-1', { kind: 'question', answers: [['TypeScript']] })
      cutResult = await p
    })

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'start' }] })
    cap.run = run
    await drain(run.events)

    // 원본 formatAnswers: "계속 진행하세요" 류 안내 포함
    expect(cutResult.message).toContain('계속 진행')
  })
})

// ── Q3. answers=null → 건너뜀 메시지 ─────────────────────────────────────────

describe('Phase 24d — answers=null → 건너뜀 안내 메시지', () => {
  it('Q3-a: dismiss(answers=null) → deny + 건너뜀 안내 메시지', async () => {
    const cap: Captured = {}
    let cutResult!: { behavior: string; message?: string }

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = new AbortController().signal
      const p = cap.canUseTool!('AskUserQuestion', mkAskInput(), { signal, toolUseID: 'tu' })
      await new Promise(r => setTimeout(r, 10))
      cap.run!.respond('ask-1', { kind: 'question', answers: null })
      cutResult = await p
    })

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'start' }] })
    cap.run = run
    await drain(run.events)

    expect(cutResult.behavior).toBe('deny')
    // 원본 formatAnswers(null): "건너뛰었습니다" 류 메시지
    expect(cutResult.message).toBeTruthy()
    expect(cutResult.message).toMatch(/건너뛰|skip/i)
  })

  it('Q3-b: dismiss 시 기본값으로 진행하도록 안내', async () => {
    const cap: Captured = {}
    let cutResult!: { behavior: string; message?: string }

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = new AbortController().signal
      const p = cap.canUseTool!('AskUserQuestion', mkAskInput(), { signal, toolUseID: 'tu' })
      await new Promise(r => setTimeout(r, 10))
      cap.run!.respond('ask-1', { kind: 'question', answers: null })
      cutResult = await p
    })

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'start' }] })
    cap.run = run
    await drain(run.events)

    // 원본: "합리적인 기본값으로 계속 진행하세요" 포함
    expect(cutResult.message).toMatch(/기본값|default/i)
  })
})

// ── Q4. abort 중 질문 waiter 취소 ────────────────────────────────────────────

describe('Phase 24d — abort 중 질문 waiter 취소 (hang 없음)', () => {
  it('Q4: AskUserQuestion 대기 중 abort() → events hang 없이 종료', async () => {
    const cap: Captured = {}

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = (cap.options?.abortController as AbortController).signal
      // 응답하지 않고 abort를 기다린다
      void cap.canUseTool!('AskUserQuestion', mkAskInput(), { signal, toolUseID: 'tu' })
      await new Promise(r => setTimeout(r, 10))
      cap.run!.abort()
    })

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'x' }] })
    cap.run = run

    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error('timeout: events did not close after abort')), 3000)
    )
    await Promise.race([drain(run.events), timeout])
    // 타임아웃 없이 종료되면 테스트 통과
    expect(true).toBe(true)
  }, 5000)

  it('Q4-b: SDK signal abort → 질문 waiter도 취소(null)로 resolve', async () => {
    const cap: Captured = {}
    let cutResult: { behavior: string; message?: string } | undefined
    const externalAbort = new AbortController()

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const p = cap.canUseTool!('AskUserQuestion', mkAskInput(), {
        signal: externalAbort.signal,
        toolUseID: 'tu'
      })
      await new Promise(r => setTimeout(r, 10))
      externalAbort.abort()
      cutResult = await p
    })

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'x' }] })
    cap.run = run
    await drain(run.events)

    // signal abort 시 질문은 취소(null answers) → deny 반환
    expect(cutResult?.behavior).toBe('deny')
  }, 5000)
})

// ── Q5. parseQuestions: 빈/비정형 input → 즉시 allow ─────────────────────────

describe('Phase 24d — parseQuestions 빈/비정형 → 즉시 allow', () => {
  it('Q5-a: questions 배열 없음 → allow (빈 input)', async () => {
    const cap: Captured = {}
    let cutResult!: { behavior: string }

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = new AbortController().signal
      // questions 키 없는 input
      cutResult = await cap.canUseTool!('AskUserQuestion', {}, { signal, toolUseID: 'tu' })
    })

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'x' }] })
    cap.run = run
    await drain(run.events)

    expect(cutResult.behavior).toBe('allow')
  })

  it('Q5-b: questions=[] 빈 배열 → allow', async () => {
    const cap: Captured = {}
    let cutResult!: { behavior: string }

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = new AbortController().signal
      cutResult = await cap.canUseTool!('AskUserQuestion', { questions: [] }, { signal, toolUseID: 'tu' })
    })

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'x' }] })
    cap.run = run
    await drain(run.events)

    expect(cutResult.behavior).toBe('allow')
  })

  it('Q5-c: questions=[{옵션 없는 항목}] → 파싱 후 빈 배열 → allow', async () => {
    const cap: Captured = {}
    let cutResult!: { behavior: string }

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = new AbortController().signal
      // options 없는 항목은 parseQuestions가 무시해 빈 배열
      cutResult = await cap.canUseTool!('AskUserQuestion', {
        questions: [{ question: '?', options: [] }]
      }, { signal, toolUseID: 'tu' })
    })

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'x' }] })
    cap.run = run
    await drain(run.events)

    expect(cutResult.behavior).toBe('allow')
  })
})

// ── Q6. claude-stream: AskUserQuestion tool_call 미emit ──────────────────────

describe('Phase 24d — claude-stream: AskUserQuestion tool_use → tool_call 미emit', () => {
  it('Q6-a: AskUserQuestion tool_use 블록 → AgentEvent[] 빈 배열', () => {
    const obj = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'ask-tool-1',
            name: 'AskUserQuestion',
            input: {
              questions: [
                {
                  question: '어떤 스타일?',
                  options: [{ label: 'A' }, { label: 'B' }]
                }
              ]
            }
          }
        ]
      },
      parent_tool_use_id: null
    }

    const events = mapClaudeStreamLine(obj)
    const toolCalls = events.filter(e => e.type === 'tool_call')
    // AskUserQuestion은 tool_call로 emit되면 안 됨
    expect(toolCalls).toHaveLength(0)
    // AskUserQuestion은 TodoWrite와 마찬가지로 tool_call 미emit
    const askCalls = events.filter(e =>
      e.type === 'tool_call' && (e as { name?: string }).name === 'AskUserQuestion'
    )
    expect(askCalls).toHaveLength(0)
  })

  it('Q6-b: 같은 content에 다른 tool_use + AskUserQuestion → 다른 tool_use만 emit', () => {
    const obj = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'bash-1',
            name: 'Bash',
            input: { command: 'ls' }
          },
          {
            type: 'tool_use',
            id: 'ask-tool-1',
            name: 'AskUserQuestion',
            input: { questions: [{ question: '?', options: [{ label: 'A' }] }] }
          }
        ]
      },
      parent_tool_use_id: null
    }

    const events = mapClaudeStreamLine(obj)
    const toolCalls = events.filter(e => e.type === 'tool_call')
    // Bash는 emit, AskUserQuestion은 미emit
    expect(toolCalls).toHaveLength(1)
    expect((toolCalls[0] as { name: string }).name).toBe('Bash')
  })

  it('Q6-c: AskUserQuestion이 있어도 text/thinking 블록은 그대로 emit', () => {
    const obj = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: '질문을 드릴게요.' },
          {
            type: 'tool_use',
            id: 'ask-tool-1',
            name: 'AskUserQuestion',
            input: { questions: [{ question: '?', options: [{ label: 'A' }] }] }
          }
        ]
      },
      parent_tool_use_id: null
    }

    const events = mapClaudeStreamLine(obj)
    const textEvents = events.filter(e => e.type === 'text')
    expect(textEvents).toHaveLength(1)
    const toolCalls = events.filter(e => e.type === 'tool_call')
    expect(toolCalls).toHaveLength(0)
  })
})

// ── Q7. 권한(24c) 회귀 ────────────────────────────────────────────────────────

describe('Phase 24d — 권한(24c) 회귀 검증', () => {
  it('Q7: AskUserQuestion 이후 Bash 권한 발화도 정상 동작', async () => {
    const cap: Captured = {}
    const askResults: { behavior: string; message?: string }[] = []
    const permResults: { behavior: string }[] = []

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = new AbortController().signal

      // 1) 먼저 질문 발화
      const askP = cap.canUseTool!('AskUserQuestion', mkAskInput(), { signal, toolUseID: 'ask-tu' })
      await new Promise(r => setTimeout(r, 5))
      cap.run!.respond('ask-1', { kind: 'question', answers: [['TypeScript']] })
      askResults.push(await askP)

      // 2) 이어서 Bash 권한 발화 (24c 경로)
      const bashP = cap.canUseTool!('Bash', { command: 'ls' }, { signal, toolUseID: 'bash-tu' })
      await new Promise(r => setTimeout(r, 5))
      cap.run!.respond('perm-2', { kind: 'permission', behavior: 'allow' })
      permResults.push(await bashP)
    })

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'start' }] })
    cap.run = run
    await drain(run.events)

    // AskUserQuestion → deny (질문 경로)
    expect(askResults[0].behavior).toBe('deny')
    // Bash → allow (권한 경로)
    expect(permResults[0].behavior).toBe('allow')
  })
})

// ── Q8. _waiters 통합: permission respond와 question respond 공존 ──────────────

describe('Phase 24d — _waiters 통합 (permission + question 동일 맵)', () => {
  it('Q8: permission 응답과 question 응답이 동일 맵에서 독립적으로 동작', async () => {
    const cap: Captured = {}
    const results: Array<{ behavior: string; message?: string }> = []

    const queryFn = makeCaptureQuery([mkResultSuccess()], cap, async () => {
      const signal = new AbortController().signal

      // 두 요청 동시 발화(순서 보장 안 됨 가정)
      const askP = cap.canUseTool!('AskUserQuestion', mkAskInput(), { signal, toolUseID: 'ask-tu' })
      const bashP = cap.canUseTool!('Bash', { command: 'x' }, { signal, toolUseID: 'bash-tu' })

      await new Promise(r => setTimeout(r, 10))

      // 두 requestId 중 permission은 perm-2(두 번째 _permCounter 증가),
      // question은 ask-1(첫 번째 _permCounter)
      // (순서는 구현에 따라 다름 — 각각의 prefix로 구분)
      cap.run!.respond('ask-1', { kind: 'question', answers: [['TypeScript']] })
      cap.run!.respond('perm-2', { kind: 'permission', behavior: 'deny' })

      results.push(await askP)
      results.push(await bashP)
    })

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: 'start' }] })
    cap.run = run
    await drain(run.events)

    // AskUserQuestion은 deny + 메시지
    expect(results[0].behavior).toBe('deny')
    expect(results[0].message).toBeTruthy()
    // Bash는 deny (사용자 거부)
    expect(results[1].behavior).toBe('deny')
  })
})
