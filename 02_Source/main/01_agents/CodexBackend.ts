import type { AgentBackend, AgentRun, AgentRunInput } from './AgentBackend'
import type { AgentEvent } from '../../shared/agentEvents'
import type { SlashCommandInfo } from '../../shared/ipcContract'

class CodexAgentRun implements AgentRun {
  readonly events: AsyncIterable<AgentEvent>

  constructor() {
    this.events = this._stubStream()
  }

  abort(): void {
  }

  interrupt(): void {
  }

  push(): void {
  }

  respond(): void {
  }

  private async *_stubStream(): AsyncGenerator<AgentEvent> {
    yield {
      type: 'error',
      message: 'Codex backend not implemented (Track 2 / M6)'
    }
    yield { type: 'done' }
  }
}

export class CodexBackend implements AgentBackend {
  readonly id = 'codex' as const

  async isAvailable(): Promise<boolean> {
    return false
  }

  async version(): Promise<string | null> {
    return null
  }

  async latestVersion(): Promise<string | null> {
    return null
  }

  start(_req: AgentRunInput): AgentRun {
    return new CodexAgentRun()
  }

  listSupportedCommands(_workspaceRoot?: string | null): SlashCommandInfo[] {
    return []
  }
}
