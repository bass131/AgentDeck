/**
 * AgentBackend.ts — 엔진 추상화 인터페이스 (공통 이벤트 모델)
 *
 * ARCHITECTURE.md "백엔드 추상화" 섹션의 TypeScript 구현.
 * 모든 엔진 어댑터(ClaudeCodeBackend / CodexBackend)는 AgentBackend를 구현한다.
 *
 * backend-contract 깃발: 이 파일 변경 시 전 어댑터·소비자 영향.
 * 단독 변경 금지 — coordinator + shared-ipc + renderer + qa 정합 동반.
 *
 * 엔진 분기는 registry.ts에서만 수행한다.
 * 호출부(IPC 핸들러 등)는 구체 엔진을 알 수 없다.
 */

import type { AgentEvent } from '../../shared/agent-events'
import type { BackendId, ConversationMessage } from '../../shared/ipc-contract'

// ── AgentRunInput ─────────────────────────────────────────────────────────────

/**
 * AgentBackend.start()에 전달하는 실행 요청 파라미터.
 */
export interface AgentRunInput {
  /**
   * 대화 히스토리.
   * 마지막 메시지가 현재 user 입력이어야 한다.
   * ConversationMessage는 shared/ipc-contract에서 import — 재정의 금지.
   */
  messages: ConversationMessage[]
  /**
   * 에이전트가 실행될 워크스페이스 루트 절대 경로.
   * undefined면 현재 프로세스 CWD 사용.
   */
  workspaceRoot?: string
  /**
   * 모델 picker id (예: 'opus'|'sonnet'|'haiku'|'fable').
   * run-args가 allowlist 검증 후 --model 인자화. 미전달/미지 → CLI 기본값. (M4-1)
   */
  model?: string
  /**
   * effort picker id (예: 'max'|'xhigh'|'high'|'medium'|'low'|'minimal').
   * 모델 의존 처리는 run-args 담당. 미전달 → CLI 기본값. (M4-1)
   */
  effort?: string
  /**
   * 권한 모드 picker id (예: 'normal'|'plan'|'acceptEdits'|'auto'|'bypass').
   * run-args allowlist 검증 후 --permission-mode 인자화. (M4-1)
   */
  mode?: string
}

// ── RunResponse (양방향 사용자 응답) ───────────────────────────────────────────

/**
 * 사용자가 에이전트의 양방향 요청(permission_request / question_request)에 보내는 응답.
 *
 * AgentRun.respond(requestId, response)로 전달되며, 어댑터 내부에서 await 중인
 * canUseTool(권한) 또는 질문 핸들러를 깨운다(Phase 24c/24d).
 *
 * discriminated union (`kind` 필드로 narrowing):
 *  - 'permission': 권한 요청 응답.
 *      behavior 'allow'=한 번 허용, 'allow_always'=세션 규칙 추가 후 허용, 'deny'=거부.
 *  - 'question': 질문 요청 응답(Phase 24d에서 사용 — 지금은 타입만 포함).
 *      answers는 질문별 선택 답안 배열의 배열. null이면 사용자 dismiss(건너뛰기).
 */
export type RunResponse =
  | { kind: 'permission'; behavior: 'allow' | 'allow_always' | 'deny' }
  | { kind: 'question'; answers: string[][] | null }

// ── AgentRun ──────────────────────────────────────────────────────────────────

/**
 * 진행 중인 에이전트 실행 핸들.
 * start()가 반환하며, 이벤트 스트림 구독과 abort를 제공한다.
 *
 * - events: 엔진 고유 출력이 AgentEvent로 정규화된 AsyncIterable.
 *   done 또는 error 이벤트 후 종료 보장.
 * - abort(): 자식프로세스 트리 kill + iterable 종료. 멱등(두 번 호출 안전).
 * - respond(): 양방향 요청(permission/question)에 대한 사용자 응답 주입.
 */
export interface AgentRun {
  /**
   * 공통 이벤트 스트림.
   * 엔진별 raw 출력이 아닌 AgentEvent로 정규화되어 흐른다.
   * done 또는 error 이벤트로 종료.
   */
  readonly events: AsyncIterable<AgentEvent>
  /**
   * 실행 중단.
   * 자식프로세스 트리를 kill하고 events iterable을 종료한다.
   * abort 후 추가 yield 없음. 좀비 프로세스 금지.
   * 멱등: 두 번 이상 호출해도 예외 없음.
   *
   * 미해결 양방향 요청(permission/question)이 있으면 전부 거부/취소로 정리하여
   * 자식 await가 영원히 매달리지 않도록 보장한다(좀비 hang 방지).
   */
  abort(): void
  /**
   * 양방향 요청에 대한 사용자 응답을 주입한다.
   *
   * events 스트림에 흐른 permission_request / question_request의 requestId에 대응한다.
   * 어댑터는 해당 requestId로 await 중인 핸들러를 깨워 에이전트 실행을 재개시킨다.
   *
   * 멱등·안전:
   *  - 미존재 requestId(이미 응답됨/abort됨/오타) → no-op (예외 없음).
   *  - 같은 requestId 중복 호출 → 첫 응답만 적용, 이후 no-op.
   *  - permission_request를 emit하지 않는 백엔드(Echo/Codex)에서는 호출될 일이 없으며
   *    호출되어도 no-op이어야 한다.
   *
   * @param requestId 응답 대상 요청 식별자 (event.requestId)
   * @param response  사용자 응답 (permission | question)
   */
  respond(requestId: string, response: RunResponse): void
}

// ── AgentBackend ──────────────────────────────────────────────────────────────

/**
 * 코딩 엔진 추상화 인터페이스.
 *
 * 모든 엔진 어댑터가 구현해야 하는 공통 계약.
 * 호출부는 이 인터페이스만 알고, 구체 엔진 클래스는 registry를 통해서만 얻는다.
 *
 * 어댑터 패턴(Adapter pattern):
 *   서로 다른 인터페이스를 공통 인터페이스로 감싸 호출부가 차이를 모르게 하는 구조.
 *   엔진 추가 = 이 인터페이스를 구현하는 어댑터 1개 추가.
 */
export interface AgentBackend {
  /**
   * 백엔드 식별자.
   * BackendId는 shared/ipc-contract에서 import — 재정의 금지.
   * 엔진 분기 로직은 registry.ts에서만 사용.
   */
  readonly id: BackendId

  /**
   * 엔진이 이 환경에 사용 가능한지 탐지(구현체별 — ClaudeCodeBackend=`claude --version`;
   * SDK 전환 후 SDK 가용성, ADR-016).
   * true = 사용 가능, false = 미설치(stub 포함).
   */
  isAvailable(): Promise<boolean>

  /**
   * 설치된 엔진의 버전 문자열 반환.
   * 미설치 또는 버전 탐지 실패 시 null.
   */
  version(): Promise<string | null>

  /**
   * 에이전트 실행 시작.
   * AgentRun을 즉시 반환한다(비동기 스폰은 내부에서 시작).
   * 이벤트는 run.events AsyncIterable을 통해 소비.
   *
   * @param req 실행 요청 파라미터
   * @returns AgentRun 핸들 (events + abort)
   */
  start(req: AgentRunInput): AgentRun
}
