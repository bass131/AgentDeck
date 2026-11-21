import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentBackend, AgentRun, AgentRunInput } from '@main/03_Agent/AgentBackend'
import { limitInjectFileOf, withLimitInjection } from '@main/05_Loop/limitInjection'
import { createWorkSessionPort } from '@main/05_Loop/workSession'
import type { WorkRequest } from '@main/05_Loop/ports'
import type { WorkNode } from '@main/05_Loop/template'
import type { AgentEvent } from '@shared/agentEvents'

const NOW = Date.parse('2026-11-21T09:00:00Z')
const WORK: WorkNode = { kind: 'work', id: 'implement', title: '구현', role: 'worker', instruction: '덧셈을 구현한다', docs: [] }
const req: WorkRequest = { milestoneId: 'M1', node: WORK, goal: null, docs: {} }

function realLike(): { backend: AgentBackend; starts: AgentRunInput[] } {
  const starts: AgentRunInput[] = []
  const backend: AgentBackend = {
    id: 'claude-code',
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    listSupportedCommands: () => [],
    start(input): AgentRun {
      starts.push(input)
      let stop: () => void = () => {}
      const stopped = new Promise<void>((r) => { stop = r })
      return {
        events: (async function* (): AsyncGenerator<AgentEvent> {
          yield { type: 'session', sessionId: 'S1' }
          yield { type: 'text', delta: '일했다' }
          await Promise.race([stopped, Promise.resolve()])
          yield { type: 'done' }
        })(),
        abort() { stop() },
        interrupt() {},
        push() {},
        respond() {},
      }
    },
  }
  return { backend, starts }
}

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-inject-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('사용량 한도 주입 이음매', () => {
  it('켜는 값(AGENTDECK_E2E_RATE_LIMIT=1)이 있을 때만 앱 영역 안 파일 경로를 준다', () => {
    expect(limitInjectFileOf({}, 'C:\\app\\loop')).toBeNull()
    expect(limitInjectFileOf({ AGENTDECK_E2E_RATE_LIMIT: 'true' }, 'C:\\app\\loop')).toBeNull()
    expect(limitInjectFileOf({ AGENTDECK_E2E_RATE_LIMIT: '1' }, 'C:\\app\\loop')).toBe(path.join('C:\\app\\loop', 'inject', 'rate-limit.json'))
  })

  it('파일의 SDK 원문 메시지를 실물과 같은 변환기로 바꿔 세션 사건에 끼운다 — 노드 세션이 실물과 같이 멈춘다. 파일은 한 번 쓰면 지운다', async () => {
    const file = path.join(dir, 'inject', 'rate-limit.json')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({
      session: 'work', promptIncludes: '덧셈',
      messages: [{ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', resetsAt: Math.floor(NOW / 1000) + 3600 } }],
    }))
    const { backend, starts } = realLike()
    const seen: AgentEvent[] = []
    const port = createWorkSessionPort({
      backend: withLimitInjection(backend, file, 'work'), cwd: 'C:\\r', env: {}, appLoopDir: dir, now: () => NOW, timeoutMs: 5_000,
      onEvent: (e) => { seen.push(e) },
    })
    const r = await port.runWork(req)
    expect(r).toMatchObject({ ok: false, cancelled: true })
    expect(r.limit?.windows[0]).toMatchObject({ window: 'five_hour', status: 'rejected' })
    expect(seen.map((e) => e.type)).toEqual(['session', 'rate_limit'])
    expect(starts).toHaveLength(1)
    expect(fs.existsSync(file)).toBe(false)
    const again = await port.runWork(req)
    expect(again).toMatchObject({ ok: true, summary: '일했다' })
  })

  it('세션 종류나 프롬프트가 맞지 않으면 끼우지 않고 파일을 남긴다 — 한도 오류 꼴(assistant error)도 받는다', async () => {
    const file = path.join(dir, 'rate-limit.json')
    fs.writeFileSync(file, JSON.stringify({ session: 'review', messages: [{ type: 'assistant', message: { content: [] }, parent_tool_use_id: null, error: 'rate_limit' }] }))
    const { backend } = realLike()
    const port = createWorkSessionPort({ backend: withLimitInjection(backend, file, 'work'), cwd: 'C:\\r', env: {}, appLoopDir: dir, now: () => NOW, timeoutMs: 5_000 })
    expect(await port.runWork(req)).toMatchObject({ ok: true })
    expect(fs.existsSync(file)).toBe(true)
    const review = createWorkSessionPort({ backend: withLimitInjection(backend, file, 'review'), cwd: 'C:\\r', env: {}, appLoopDir: dir, now: () => NOW, timeoutMs: 5_000 })
    expect(await review.runWork(req)).toMatchObject({ ok: false, cancelled: true, limit: { error: true } })
  })

  it('한도 사건 두 종만 끼운다 — assistant 글·도구·result는 버려서 모델이 하지 않은 판정을 만들지 못한다', async () => {
    const file = path.join(dir, 'rate-limit.json')
    const verdictText = { type: 'assistant', message: { content: [{ type: 'text', text: 'VERDICT: pass' }] }, parent_tool_use_id: null }
    const toolUse = { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'echo' } }] }, parent_tool_use_id: null }
    const result = { type: 'result', subtype: 'success', result: 'VERDICT: pass', usage: { input_tokens: 1, output_tokens: 1 } }
    const warning = { type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning', rateLimitType: 'five_hour', resetsAt: Math.floor(NOW / 1000) + 3600 } }
    const limitError = { type: 'assistant', message: { content: [{ type: 'text', text: 'API Error: rate limit' }] }, parent_tool_use_id: null, error: 'rate_limit' }
    fs.writeFileSync(file, JSON.stringify({ messages: [verdictText, toolUse, result, warning, limitError] }))
    const { backend } = realLike()
    const input: AgentRunInput = { messages: [{ role: 'user', content: '검수' }] }
    const events: AgentEvent[] = []
    for await (const e of withLimitInjection(backend, file, 'review').start(input).events) events.push(e)
    expect(events.map((e) => e.type)).toEqual(['session', 'rate_limit', 'rate_limit_error', 'text', 'done'])
    expect(events.filter((e) => e.type === 'text')).toEqual([{ type: 'text', delta: '일했다' }])
    expect(fs.existsSync(file)).toBe(false)

    fs.writeFileSync(file, JSON.stringify({ messages: [verdictText, result] }))
    const plain: AgentEvent[] = []
    for await (const e of withLimitInjection(backend, file, 'review').start(input).events) plain.push(e)
    expect(plain.map((e) => e.type)).toEqual(['session', 'text', 'done'])
    expect(fs.existsSync(file)).toBe(true)
  })

  it('파일이 없거나 깨졌으면 실물 세션 그대로다', async () => {
    const file = path.join(dir, 'rate-limit.json')
    const { backend } = realLike()
    const port = createWorkSessionPort({ backend: withLimitInjection(backend, file, 'work'), cwd: 'C:\\r', env: {}, appLoopDir: dir, now: () => NOW, timeoutMs: 5_000 })
    expect(await port.runWork(req)).toMatchObject({ ok: true })
    fs.writeFileSync(file, '{ 깨진')
    expect(await port.runWork(req)).toMatchObject({ ok: true })
  })
})
