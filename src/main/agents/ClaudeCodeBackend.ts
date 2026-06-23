/**
 * ClaudeCodeBackend.ts — Claude Agent SDK 어댑터 (Phase 21b ADR-016)
 *
 * AgentBackend 구현: @anthropic-ai/claude-agent-sdk query() 사용.
 * SDK가 yield하는 SDKMessage → mapClaudeStreamLine → AgentEvent async iterable.
 *
 * 핵심 책임: 엔진 고유 출력(SDK SDKMessage) → 공통 AgentEvent 정규화.
 * raw SDK 출력을 외부로 누수하지 않는다.
 *
 * 엔진 분기는 registry.ts에서만 수행한다.
 * 이 클래스를 직접 import하는 곳은 registry.ts 하나뿐이어야 한다.
 *
 * API 키: 환경변수(ANTHROPIC_API_KEY)에서 SDK가 자동 처리.
 *          코드·로그에 평문 노출 절대 금지.
 *
 * 설계 (ADR-016, 결정 #1~#9):
 * - CLI spawn/taskkill 제거 → SDK query() 사용.
 * - lazy query injection (결정 #8): 생성자에서 queryFn 주입 가능.
 *   기본값은 lazy dynamic import — mock 테스트가 실 SDK를 평가하지 않음.
 * - canUseTool: 자동허용 (결정 #5, TODO(M4-4) 마커).
 * - abort: abortController.abort() + query.interrupt() best-effort (결정 #6).
 * - isAvailable: SDK 하드 의존성 → true (결정 #7).
 * - version: SDK 패키지 버전 문자열 (결정 #7).
 *
 * 엔진 출력 → AgentEvent 매핑 표:
 * ┌──────────────────────────────────────┬───────────────────────────────────┐
 * │ SDK SDKMessage                        │ AgentEvent                        │
 * ├──────────────────────────────────────┼───────────────────────────────────┤
 * │ type:"assistant" content[text]       │ { type:"text", delta }            │
 * │ type:"assistant" content[tool_use]   │ { type:"tool_call", id,name,input}│
 * │ type:"user" content[tool_result]     │ { type:"tool_result", id,ok,output│
 * │ type:"result" is_error=false         │ { type:"done", usage?, contextWin │
 * │ type:"result" is_error=true          │ { type:"error", message }         │
 * │                                      │ + { type:"done" }                 │
 * │ type:"system" (init)                 │ [] (무시, session_id 내부 캡처)   │
 * │ type:"stream_event"                  │ [] (무시, includePartialMessages=0│
 * │ 기타 SDKMessage 타입                  │ [] (forward-compatible)           │
 * └──────────────────────────────────────┴───────────────────────────────────┘
 */

import { mapClaudeStreamLine } from './claude-stream'
import { buildQueryOptions } from './run-args'
import type { AgentBackend, AgentRun, AgentRunInput } from './AgentBackend'
import type { AgentEvent } from '../../shared/agent-events'

// ── SDK 버전 상수 ─────────────────────────────────────────────────────────────

/** SDK 패키지 버전 (package.json에서 확인, 하드코딩). */
const SDK_VERSION = '0.3.186'

// ── QueryFn 타입 ──────────────────────────────────────────────────────────────

/**
 * query() 함수 시그니처.
 * 실 SDK와 mock 모두 이 타입을 만족한다.
 * options는 unknown으로 열어두어 실 SDK Options 타입과 mock 양쪽 호환.
 */
export type QueryFn = (params: {
  prompt: string
  options?: unknown
}) => AsyncIterable<unknown> & { interrupt?: () => Promise<void> }

// ── 기본 queryFn (lazy dynamic import) ───────────────────────────────────────

/**
 * 기본 queryFn: @anthropic-ai/claude-agent-sdk를 lazy하게 import하여 query를 반환.
 * 모듈 top-level import가 아닌 lazy import → mock 테스트 시 실 SDK를 평가하지 않음.
 * (결정 #8)
 */
async function getDefaultQueryFn(): Promise<QueryFn> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk = await import('@anthropic-ai/claude-agent-sdk') as any
  return sdk.query as QueryFn
}

// ── ClaudeAgentRun ─────────────────────────────────────────────────────────────

/**
 * SDK query 실행 핸들.
 * AgentRun 인터페이스 구현.
 *
 * events: SDK SDKMessage → mapClaudeStreamLine → AgentEvent.
 * abort(): abortController.abort() + query.interrupt() best-effort.
 */
class ClaudeAgentRun implements AgentRun {
  readonly events: AsyncIterable<AgentEvent>

  private _aborted = false
  private _abortController = new AbortController()
  private _queryHandle: { interrupt?: () => Promise<void> } | null = null

  constructor(req: AgentRunInput, queryFn: QueryFn | null) {
    this.events = this._createEventStream(req, queryFn)
  }

  abort(): void {
    // 멱등: 이미 abort됐으면 무시
    if (this._aborted) return
    this._aborted = true

    // AbortController 신호
    this._abortController.abort()

    // SDK query.interrupt() best-effort (결정 #6)
    if (this._queryHandle?.interrupt) {
      try {
        void this._queryHandle.interrupt()
      } catch {
        // best-effort: 실패해도 좀비 없음 (SDK가 AbortController로 정리)
      }
    }
  }

  /**
   * AsyncGenerator로 events 스트림 생성.
   *
   * 흐름:
   * 1. 마지막 user 메시지를 프롬프트로 추출
   * 2. buildQueryOptions로 SDK 옵션 패치 생성
   * 3. queryFn 호출 (lazy 해석 또는 주입된 mock)
   * 4. SDK SDKMessage → mapClaudeStreamLine → yield AgentEvent
   * 5. 에러/abort → error 이벤트 + done
   */
  private async *_createEventStream(
    req: AgentRunInput,
    queryFn: QueryFn | null
  ): AsyncGenerator<AgentEvent> {
    // 마지막 user 메시지를 프롬프트로 사용
    const lastUserMsg = req.messages
      .filter(m => m.role === 'user')
      .at(-1)

    if (!lastUserMsg) {
      yield { type: 'error', message: 'No user message found in AgentRunInput.messages' }
      yield { type: 'done' }
      return
    }

    const prompt = lastUserMsg.content

    // abort 전에 이미 aborted인 경우 즉시 종료
    if (this._aborted) {
      return
    }

    // queryFn 해석: 주입된 경우 사용, 아니면 lazy import
    let resolvedQueryFn: QueryFn
    try {
      if (queryFn !== null) {
        resolvedQueryFn = queryFn
      } else {
        resolvedQueryFn = await getDefaultQueryFn()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      yield { type: 'error', message: `Failed to load Agent SDK: ${msg}` }
      yield { type: 'done' }
      return
    }

    // abort 체크 (SDK 로드 중 abort됐을 수 있음)
    if (this._aborted) return

    // SDK 옵션 빌드 (run-args의 allowlist 검증)
    const optionsPatch = buildQueryOptions({
      model: req.model,
      effort: req.effort,
      mode: req.mode
    })

    // canUseTool: 자동허용 (결정 #5)
    // TODO(M4-4): 인터랙티브 권한 prompt — 현재 자동 허용(M4-1 CLI 동작 보존)
    const canUseTool = async (
      _toolName: string,
      input: Record<string, unknown>,
      _opts: { signal: AbortSignal; toolUseID: string }
    ): Promise<{ behavior: 'allow'; updatedInput: Record<string, unknown> }> => {
      return { behavior: 'allow', updatedInput: input }
    }

    // SDK query 옵션
    const sdkOptions: Record<string, unknown> = {
      ...optionsPatch,
      cwd: req.workspaceRoot ?? process.cwd(),
      abortController: this._abortController,
      includePartialMessages: false,
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      canUseTool
    }

    // API 키: 환경변수(process.env)에서 SDK가 자동 처리.
    // 코드에 평문 노출 절대 금지. env 객체는 spawn 인자가 아닌 SDK 내부에서 처리.

    // query 호출
    let queryIterable: AsyncIterable<unknown> & { interrupt?: () => Promise<void> }
    try {
      queryIterable = resolvedQueryFn({ prompt, options: sdkOptions })
      this._queryHandle = queryIterable
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      yield { type: 'error', message: `Failed to start agent query: ${msg}` }
      yield { type: 'done' }
      return
    }

    // SDK SDKMessage 스트림 소비 → AgentEvent 정규화
    try {
      for await (const msg of queryIterable) {
        // abort 관찰: 신호가 설정되면 즉시 종료
        if (this._aborted || this._abortController.signal.aborted) {
          return
        }

        // 엔진 출력 → AgentEvent (raw 누수 없음)
        const events = mapClaudeStreamLine(msg)
        for (const event of events) {
          yield event
        }
      }
    } catch (err) {
      // abort로 인한 중단은 정상 종료로 처리
      if (this._aborted || this._abortController.signal.aborted) {
        return
      }
      const msg = err instanceof Error ? err.message : String(err)
      yield { type: 'error', message: `Agent execution error: ${msg}` }
      yield { type: 'done' }
    }
  }
}

// ── ClaudeCodeBackend ─────────────────────────────────────────────────────────

/**
 * Claude Agent SDK 어댑터.
 * AgentBackend 인터페이스 구현.
 *
 * 주입형 queryFn으로 테스트 격리 지원 (결정 #8).
 * 기본값은 lazy dynamic import → mock 테스트가 실 SDK를 평가하지 않음.
 */
export class ClaudeCodeBackend implements AgentBackend {
  readonly id = 'claude-code' as const

  private _queryFn: QueryFn | null

  /**
   * @param queryFn 선택적 query 함수 주입 (테스트용).
   *   미전달 시 null → start() 시점에 lazy dynamic import.
   */
  constructor(queryFn?: QueryFn) {
    this._queryFn = queryFn ?? null
  }

  /**
   * SDK 가용성 확인.
   * SDK는 하드 의존성(npm install 필수)이므로 dynamic import가 성공하면 true.
   * (결정 #7)
   */
  async isAvailable(): Promise<boolean> {
    try {
      await getDefaultQueryFn()
      return true
    } catch {
      return false
    }
  }

  /**
   * SDK 패키지 버전 반환.
   * system `claude --version`이 아닌 SDK 패키지 버전.
   * (결정 #7)
   */
  async version(): Promise<string | null> {
    return SDK_VERSION
  }

  /**
   * 에이전트 실행 시작.
   * AgentRun을 즉시 반환 (비동기 스트리밍은 events 소비 시 시작).
   */
  start(req: AgentRunInput): AgentRun {
    return new ClaudeAgentRun(req, this._queryFn)
  }
}
