import type { AgentBackend, AgentRun, AgentRunInput } from './AgentBackend'
import type { AgentEvent } from '../../shared/agentEvents'
import type { BackendId, SlashCommandInfo } from '../../shared/ipcContract'

const E2E_CHANGED_FILE = 'sample.ts'

export class EchoBackend implements AgentBackend {
  readonly id: BackendId = 'claude-code'

  async isAvailable(): Promise<boolean> {
    return true
  }

  async version(): Promise<string | null> {
    return 'echo-e2e'
  }

  async latestVersion(): Promise<string | null> {
    return null
  }

  listSupportedCommands(_workspaceRoot?: string | null): SlashCommandInfo[] {
    return []
  }

  start(req: AgentRunInput): AgentRun {
    let aborted = false
    const lastUser = req.messages[req.messages.length - 1]?.content ?? ''

    const steps: AgentEvent[] = [
      { type: 'text', delta: 'echo: ' },
      { type: 'text', delta: lastUser },
      { type: 'tool_call', id: 'echo-1', name: 'read_file', input: { path: E2E_CHANGED_FILE } },
      { type: 'tool_result', id: 'echo-1', ok: true, output: 'echo tool ok' },
      { type: 'file_changed', path: E2E_CHANGED_FILE, change: 'modify' },
      ...(lastUser.trimStart().startsWith('/loop')
        ? [{ type: 'loops', loops: [{ id: 'echo-loop', summary: 'echo 반복 재생', interval: 'Every minute' }] } as AgentEvent]
        : []),
      { type: 'done', usage: { inputTokens: 10, outputTokens: 5 } }
    ]

    async function* gen(): AsyncIterable<AgentEvent> {
      for (const ev of steps) {
        if (aborted) return
        await new Promise((r) => setTimeout(r, 15))
        if (aborted) return
        yield ev
      }
    }

    return {
      events: gen(),
      abort(): void {
        aborted = true
      },
      interrupt(): void {
      },
      push(): void {
      },
      respond(): void {
      }
    }
  }
}

export const echoBackend = new EchoBackend()
