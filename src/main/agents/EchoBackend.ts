/**
 * EchoBackend.ts — e2e 결정론 전용 백엔드.
 *
 * 실제 `claude` CLI/네트워크 없이 핵심 루프(스트리밍·도구카드·파일변경·diff)를
 * Playwright e2e로 검증하기 위한 스크립트된 백엔드.
 *
 * 활성: registry.ts가 process.env.AGENTDECK_E2E === '1' 일 때만 반환.
 *   환경변수는 e2e 하네스만 설정 — renderer(untrusted)는 설정 불가 → 신뢰경계 무관.
 *   프로덕션 경로엔 절대 노출되지 않는다.
 */

import type { AgentBackend, AgentRun, AgentRunInput } from './AgentBackend'
import type { AgentEvent } from '../../shared/agent-events'
import type { BackendId } from '../../shared/ipc-contract'

/** e2e 워크스페이스가 생성해 둔 파일(file_changed/diff 대상) */
const E2E_CHANGED_FILE = 'sample.ts'

export class EchoBackend implements AgentBackend {
  readonly id: BackendId = 'claude-code'

  async isAvailable(): Promise<boolean> {
    return true
  }

  async version(): Promise<string | null> {
    return 'echo-e2e'
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
      { type: 'done', usage: { inputTokens: 10, outputTokens: 5 } }
    ]

    async function* gen(): AsyncIterable<AgentEvent> {
      for (const ev of steps) {
        if (aborted) return
        // 작은 지연으로 스트리밍 경로를 실제처럼 exercise (결정론 유지)
        await new Promise((r) => setTimeout(r, 15))
        if (aborted) return
        yield ev
      }
    }

    return {
      events: gen(),
      abort(): void {
        aborted = true
      }
    }
  }
}

/** registry가 e2e 모드에서 반환하는 싱글턴 */
export const echoBackend = new EchoBackend()
