/**
 * CodexBackend.ts — Codex 어댑터 stub
 *
 * Track 1에서는 자리(stub)만 제공한다.
 * 실 spawn/네트워크 호출: 없음 (grep으로 확인 가능).
 * 실동작 구현 = Track 2 / M6 이후.
 *
 * isAvailable() = false (항상)
 * version() = null (항상)
 * start() = 즉시 error 이벤트 + done 이벤트 후 종료
 *
 * 이 클래스를 직접 import하는 곳은 registry.ts 하나뿐이어야 한다.
 */

import type { AgentBackend, AgentRun, AgentRunInput } from './AgentBackend'
import type { AgentEvent } from '../../shared/agent-events'

// ── CodexAgentRun stub ─────────────────────────────────────────────────────

/**
 * Codex stub AgentRun.
 * 즉시 "not implemented" error + done을 내보내고 종료.
 * abort()는 멱등 no-op.
 */
class CodexAgentRun implements AgentRun {
  readonly events: AsyncIterable<AgentEvent>

  constructor() {
    this.events = this._stubStream()
  }

  abort(): void {
    // stub: 자식프로세스 없음 — no-op (멱등)
  }

  private async *_stubStream(): AsyncGenerator<AgentEvent> {
    yield {
      type: 'error',
      message: 'Codex backend not implemented (Track 2 / M6)'
    }
    yield { type: 'done' }
  }
}

// ── CodexBackend ──────────────────────────────────────────────────────────────

/**
 * Codex CLI / OpenAI 어댑터 stub.
 * AgentBackend 인터페이스 구현 — Track 1에서는 자리만.
 */
export class CodexBackend implements AgentBackend {
  readonly id = 'codex' as const

  async isAvailable(): Promise<boolean> {
    // Track 1: 항상 false. Track 2에서 codex CLI 탐지 로직으로 교체.
    return false
  }

  async version(): Promise<string | null> {
    // Track 1: 항상 null. Track 2에서 교체.
    return null
  }

  start(_req: AgentRunInput): AgentRun {
    // stub: 실 spawn/네트워크 호출 없음.
    // _req는 미래 호환성을 위해 파라미터로 유지 (lint용 _prefix).
    return new CodexAgentRun()
  }
}
