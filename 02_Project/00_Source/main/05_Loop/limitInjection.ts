// 실물 한도에 닿지 않고 실주행을 시험한다. 주입 파일은 노드 세션이 쓰지 못하는 앱 영역에 둔다
import fs from 'node:fs'
import path from 'node:path'
import type { AgentBackend, AgentRun, AgentRunInput } from '@main/03_Agent/AgentBackend'
import { mapClaudeStreamLine } from '@main/04_Claude/stream/claudeStream'
import type { AgentEvent } from '@shared/agentEvents'

type SessionKind = 'work' | 'review'
interface InjectFile { session?: SessionKind; promptIncludes?: string; messages: unknown[] }

export function limitInjectFileOf(env: NodeJS.ProcessEnv, loopAppDir: string): string | null {
  return env.AGENTDECK_E2E_RATE_LIMIT === '1' ? path.join(loopAppDir, 'inject', 'rate-limit.json') : null
}

// 맞는 세션 하나가 가져가면 지운다(한 번만)
function take(file: string, kind: SessionKind, input: AgentRunInput): AgentEvent[] | null {
  let spec: InjectFile
  try { spec = JSON.parse(fs.readFileSync(file, 'utf8')) as InjectFile } catch { return null }
  if (!Array.isArray(spec?.messages)) return null
  if (spec.session !== undefined && spec.session !== kind) return null
  if (spec.promptIncludes !== undefined && !String(input.messages[0]?.content ?? '').includes(spec.promptIncludes)) return null
  const events = spec.messages.flatMap((m) => mapClaudeStreamLine(m))
  if (events.length === 0) return null
  try { fs.unlinkSync(file) } catch { return null }
  return events
}

const delegate = <T extends object>(target: T, own: Partial<T>): T => new Proxy(target, {
  get(t, prop) {
    if (Object.prototype.hasOwnProperty.call(own, prop)) return own[prop as keyof T]
    const v: unknown = Reflect.get(t, prop, t)
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v
  },
})

// 실물 세션의 첫 사건 뒤에 끼운다(세션이 열린 뒤 사건이 오는 실물의 순서)
function injectedEvents(source: AsyncIterable<AgentEvent>, extra: AgentEvent[]): AsyncIterable<AgentEvent> {
  return (async function* () {
    let pending: AgentEvent[] | null = extra
    for await (const e of source) {
      yield e
      if (pending) { const out = pending; pending = null; yield* out }
    }
    if (pending) yield* pending
  })()
}

export function withLimitInjection(backend: AgentBackend, file: string, kind: SessionKind): AgentBackend {
  return delegate(backend, {
    start(input: AgentRunInput): AgentRun {
      const run = backend.start(input)
      const extra = take(file, kind, input)
      return extra ? delegate(run, { events: injectedEvents(run.events, extra) }) : run
    },
  })
}
