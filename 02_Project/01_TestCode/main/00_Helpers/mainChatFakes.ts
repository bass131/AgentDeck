// M10 G2 시험 도우미 — 메인 대화(05_Loop/mainChat.ts)용 대본 백엔드. 세션 id와 resume을 SDK처럼 흉내 낸다.
//   - resume 없이 열면 새 세션 id(`S<n>`)를 알리고, 아는 id로 resume하면 같은 id를 알린다(탐침 A 실측: 같은 id가 이어진다).
//   - 모르는 id로 resume하면 세션 사건 없이 error와 done만 낸다(탐침 A 실측: 「No conversation found …」 꼴).
//   - 대본(script)이 그 뒤 사건을 낸다. 질문은 question()으로 내고 answer()로 답을 기다린다. 세션이 끊기면 answer()는 null이다.
//   - 동시에 돈 세션 수의 최댓값(maxActive)을 잰다 — 턴 대기열이 한 줄로 서는지 본다.
import fs from 'node:fs'
import path from 'node:path'
import type { AgentBackend, AgentRun, AgentRunInput, RunResponse } from '@main/03_Agent/AgentBackend'
import type { AgentEvent } from '@shared/agentEvents'

export interface TurnScript {
  req: AgentRunInput
  prompt: string
  // 이 세션의 SDK 세션 id
  sessionId: string
  // 몇 번째 start인가(1부터)
  n: number
  write(rel: string, text: string): void
  question(requestId: string, question?: string): AgentEvent
  answer(requestId: string): Promise<RunResponse | null>
  aborted(): boolean
}
export type Script = (t: TurnScript) => AsyncGenerator<AgentEvent>

export interface ScriptedBackend {
  backend: AgentBackend
  starts: AgentRunInput[]
  prompts: string[]
  known: Set<string>
  maxActive: () => number
  active: () => number
}

export const textOnly = (text: string): Script => async function* () {
  yield { type: 'text', delta: text, messageId: `m-${text.length}` }
  yield { type: 'done' }
}

export function scriptedBackend(script: Script): ScriptedBackend {
  const starts: AgentRunInput[] = []
  const prompts: string[] = []
  const known = new Set<string>()
  let seq = 0
  let active = 0
  let maxActive = 0
  const backend: AgentBackend = {
    id: 'claude-code',
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    listSupportedCommands: () => [],
    start(req): AgentRun {
      starts.push(req)
      const n = starts.length
      const prompt = String(req.messages.at(-1)?.content ?? '')
      prompts.push(prompt)
      const waiters = new Map<string, (r: RunResponse | null) => void>()
      let stopped = false
      const stop = (): void => {
        stopped = true
        for (const w of waiters.values()) w(null)
        waiters.clear()
      }
      const resume = req.resumeSessionId
      const sessionId = resume ?? `S${++seq}`
      const root = req.workspaceRoot as string
      const t: TurnScript = {
        req, prompt, sessionId, n,
        write: (rel, text) => {
          fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
          fs.writeFileSync(path.join(root, rel), text)
        },
        question: (requestId, question = '어떻게 할까?') => ({
          type: 'question_request', requestId, questions: [{ question, options: [{ label: '예' }, { label: '아니오' }] }],
        }),
        answer: (requestId) => (stopped ? Promise.resolve(null) : new Promise((r) => { waiters.set(requestId, r) })),
        aborted: () => stopped,
      }
      return {
        events: (async function* (): AsyncGenerator<AgentEvent> {
          active++
          maxActive = Math.max(maxActive, active)
          try {
            if (resume !== undefined && !known.has(resume)) {
              yield { type: 'error', message: `No conversation found with session ID: ${resume}` }
              yield { type: 'done' }
              return
            }
            known.add(sessionId)
            yield { type: 'session', sessionId }
            for await (const e of script(t)) {
              if (stopped) return
              yield e
            }
          } finally {
            active--
          }
        })(),
        abort: stop,
        interrupt() {},
        push() {},
        respond(id, r) {
          const w = waiters.get(id)
          waiters.delete(id)
          w?.(r)
        },
      }
    },
  }
  return { backend, starts, prompts, known, maxActive: () => maxActive, active: () => active }
}
