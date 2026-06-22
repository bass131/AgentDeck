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
}

// ── AgentRun ──────────────────────────────────────────────────────────────────

/**
 * 진행 중인 에이전트 실행 핸들.
 * start()가 반환하며, 이벤트 스트림 구독과 abort를 제공한다.
 *
 * - events: 엔진 고유 출력이 AgentEvent로 정규화된 AsyncIterable.
 *   done 또는 error 이벤트 후 종료 보장.
 * - abort(): 자식프로세스 트리 kill + iterable 종료. 멱등(두 번 호출 안전).
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
   */
  abort(): void
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
   * CLI 또는 SDK가 이 환경에 설치되어 있는지 탐지.
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
