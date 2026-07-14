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
import type { BackendId, ConversationMessage, SlashCommandInfo } from '../../shared/ipc-contract'

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
  /**
   * 패널/채팅별 커스텀 시스템 프롬프트 (Phase 30 M2 — 원본 AgentCodeGUI sysPrompt 미러).
   *
   * CRITICAL(신뢰경계·ADR-003):
   *   - IPC 계약에서 string만 운반. **SDK 고유 형상(preset/append)은 어댑터 내부에만.**
   *   - 어댑터(ClaudeCodeBackend)가 trim() 후 비면 무시, 유효하면 append로 주입.
   *   - 이 필드를 로그·DB·응답에 평문으로 노출하지 않는다.
   *   - 모델 컨텍스트(append)로만 흐른다 — CLI 인자/파일/셸/로그 누수 금지.
   *
   * 미전달/undefined/빈문자열/공백만 → 기존 preset 그대로({type:'preset',preset:'claude_code'}).
   * 유효 string → append 추가: {type:'preset',preset:'claude_code',append:trimmedValue}.
   */
  systemPrompt?: string
  /**
   * 멀티에이전트 오케스트레이션 모드 (UltraCode).
   *
   * main 핸들러가 AgentRunRequest.orchestration을 `=== true` 정규화해 전달한다.
   * 엔진별 매핑은 어댑터 내부에만 격리(ADR-003):
   *  - true  → 복잡/병렬 작업의 멀티에이전트 오케스트레이션 가이드를 systemPrompt에 append.
   *            어떤 도구(서브에이전트 위임 / 워크플로 구조)로 수행할지의 매핑은 어댑터 내부.
   *  - false/미전달 → 가이드 없이 기본 동작.
   *
   * CRITICAL(ADR-003): 엔진 고유 도구명·옵션명·가이드 문구는 어댑터(ClaudeCodeBackend)
   * 내부에만. 이 인터페이스에 엔진 고유 용어 누출 금지(불리언만 운반).
   */
  orchestration?: boolean
  /**
   * 턴 간 맥락 복구용 세션 ID (Phase 1, REPL_TRANSITION).
   *
   * 같은 대화의 직전 턴이 emit한 `session` 이벤트(system/init의 session_id)를 renderer가
   * 저장했다가 다음 agentRun에 되돌려 보낸다. 어댑터가 이 값으로 엔진 세션을 resume해
   * 직전 대화 맥락을 복원한다(query()-per-message의 맥락 끊김 해소).
   *
   * CRITICAL(ADR-003): 이 필드는 불투명 세션 토큰(string)만 운반. `resume` 옵션으로의
   *   *매핑*은 어댑터(ClaudeCodeBackend) 내부에만. 미전달/빈문자열 → resume 없이 새 세션(회귀 0).
   */
  resumeSessionId?: string
  /**
   * 지속세션(REPL, ADR-024) 옵트인 모드. (Phase 2)
   *
   * true → 어댑터가 held-open `query({prompt: AsyncIterable})` 세션을 열고 메시지를
   *   입력 스트림에 push(매 턴 새 query 아님). 내장 `/loop`·크론 자기제어 가능.
   * false/미전달 → 기존 단발 query()-per-message(+resumeSessionId resume). 회귀 0.
   *
   * CRITICAL(ADR-003): 엔진 고유 형상(streamInput/SDKUserMessage/query 옵션)은 어댑터
   *   내부에만. 이 인터페이스엔 불리언만. main 핸들러가 `=== true` 정규화.
   */
  persistent?: boolean
  /**
   * 지속세션 식별 키 (Phase 2, persistent와 함께). 보통 conversationId.
   *
   * 같은 sessionKey의 후속 agentRun은 새 세션이 아니라 **기존 held-open 세션에 push**된다
   * (PersistentSessionManager가 Map<sessionKey, PersistentSession>으로 라우팅).
   * persistent 모드에서 이벤트 runId는 이 키로 안정화 → cron-turn도 같은 대화로 라우팅((5)).
   *
   * CRITICAL(신뢰경계): renderer untrusted string. 미전달 시 persistent여도 단발로 degrade(회귀 0).
   */
  sessionKey?: string
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
   * **현재 turn만 중단** — 세션·events 스트림은 유지한다(지속세션, ADR-024 (3)).
   *
   * abort()와의 분리: abort=세션 종료(abortController.abort()+close), interrupt=턴만 중단.
   * 단발(비-persistent) 경로에서는 진행 중 query를 best-effort 중단(이후 done/error로 자연 종료).
   * 멱등·안전: query 핸들 미캡처/이미 종료 시 no-op(예외 없음). permission_request를 emit하지
   *   않는 백엔드(Echo/Codex)에서는 no-op이어야 한다.
   */
  interrupt(): void
  /**
   * **지속세션(REPL, ADR-024)에 후속 user 메시지(turn)를 주입**한다.
   *
   * persistent 모드 held-open 세션에서, 같은 sessionKey의 후속 agentRun을 새 query가 아니라
   * 이 메서드로 입력 스트림에 push해 같은 세션이 다음 turn으로 처리하게 한다.
   * 비-persistent 백엔드(Echo/Codex) 또는 held-open이 아닌 run에서는 no-op이어야 한다(안전).
   */
  push(content: string): void
  /**
   * **현재(및 이후) turn의 orchestration(UltraCode) 상태를 갱신**한다 (UC1-P02, ADR-032 ④).
   *
   * held-open 세션(persistent=true)에서, canUseTool 게이트가 "세션 생성 시점에 고정 캡처한
   * 값"이 아니라 "지금 이 turn"의 orchestration을 라이브로 읽도록 갱신하는 지점이다. 같은
   * sessionKey의 후속 agentRun이 push()로 content를 주입할 때(직전 또는 함께) 호출돼 이번
   * turn의 orchestration을 반영한다 — 어댑터 내부(claudeAgentRun.ts)는 이 값을 필드로 들고
   * canUseTool에 클로저가 아닌 게터로 넘겨 라이브 참조를 만든다.
   *
   * 선택적(optional): orchestration 상태를 세션 중간에 바꿀 구조가 없는 백엔드(단발 실행,
   * 또는 held-open·Workflow 게이트 개념이 없는 Codex/Echo 스텁)는 구현하지 않아도 된다.
   * 호출부는 항상 `run.setOrchestration?.(value)`처럼 optional chaining으로 호출한다.
   *
   * @param value 이 시점 이후 턴의 orchestration 상태(true=허용 턴, false=비허용 턴).
   */
  setOrchestration?(value: boolean): void
  /**
   * **지속세션(REPL, held-open)이 스스로 idle-close로 접히는 commit 시점의 통지 훅**을
   * 등록한다 (LR4 Phase 02, ADR-024 teardown).
   *
   * 등록된 콜백은 지속세션이 "살아있을 이유(pending user turn·활성 루프)가 사라져
   * 스스로 접힌다"고 확정한 commit 순간에 **정확히 1회, 동기 호출**된다. 이 신호로
   * run-manager(00_ipc/agent-runs.ts)가 라우팅 테이블(persistentRuns)에서 이 run을
   * 원자적으로 제거해, "펌프는 이미 닫히는 중인데 라우팅 엔트리는 stale로 남아 후속
   * send가 죽어가는 세션으로 흘러가는" teardown 창을 소거한다.
   *
   * abort()와의 분리(load-bearing): abort() 경로에서는 호출되지 않는다 — abort는
   * abortController.abort() + waiter 정리 + close로 이어지는 자체 정리 경로를 이미
   * 가지므로, 이 훅까지 발화하면 이중 정리가 된다. commit 시점은 오직 "스스로 접힘"
   * (idle-close) 하나뿐이다.
   *
   * 선택적(optional): held-open·idle-close 개념이 없는 백엔드(단발 실행, 또는
   * 미구현 Codex/Echo 스텁)는 구현하지 않아도 된다(no-op). 호출부는 항상
   * `run.onSessionClosing?.(cb)`처럼 optional chaining으로 등록한다.
   * 비-persistent 단발 실행에서는 절대 발화하지 않는다.
   *
   * @param cb idle-close commit 시점에 호출될 콜백(인자 없음). 등록은 1개면 충분
   *   (마지막 등록만 유효 — 덮어쓰기).
   */
  onSessionClosing?(cb: () => void): void
  /**
   * **백그라운드 태스크 정지 요청** — bg_task 이벤트의 taskId로 태스크를 중단한다
   * (GAP1 P09, backend-contract 깃발 — qa 골든 gap1-p09-bg-task.golden.test.ts 핀).
   *
   * fire-and-forget: 결과를 기다리지 않으며 반환값이 없다. 실제 종료는 엔진이
   * 이후 스트림으로 통지한다(bg_task kind:'notification' — 그것이 정지 결과의 정본).
   *
   * ADR-003(엔진중립): taskId는 bg_task 이벤트가 운반한 불투명 식별자 — 엔진 고유
   * 핸들(예: Claude SDK Query.stopTask)로의 매핑은 어댑터 내부에만 둔다.
   *
   * 멱등·안전:
   *  - query 핸들 미캡처(펌프 시작 전)/이미 종료/미존재 taskId → 조용한 no-op(예외 없음).
   *  - 같은 taskId 중복 호출 → 안전(엔진 쪽에서 멱등 처리, 어댑터는 예외 삼킴).
   *  - 선택적(optional): 백그라운드 태스크 개념이 없는 백엔드(Echo/Codex 스텁)는
   *    구현하지 않아도 된다. 호출부는 항상 `run.stopTask?.(taskId)`로 호출한다.
   *
   * @param taskId 정지 대상 백그라운드 태스크 id (bg_task 이벤트의 taskId)
   */
  stopTask?(taskId: string): void
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
   * 이 엔진의 최신 가용 버전 문자열 반환(구현체별 — ClaudeCodeBackend=npm registry 조회).
   * 오프라인·미지원·탐지 실패 시 null. version()의 형제(현재 vs 최신 비교용).
   *
   * CRITICAL(신뢰경계): 버전 문자열만 — 토큰/키/시크릿 절대 미포함.
   * 조회는 main 프로세스(어댑터 내부)에서만. renderer에 구체 URL/패키지명 미노출.
   * ADR-003: npm 패키지명·registry URL은 각 어댑터 내부에만 격리.
   */
  latestVersion(): Promise<string | null>

  /**
   * 에이전트 실행 시작.
   * AgentRun을 즉시 반환한다(비동기 스폰은 내부에서 시작).
   * 이벤트는 run.events AsyncIterable을 통해 소비.
   *
   * @param req 실행 요청 파라미터
   * @returns AgentRun 핸들 (events + abort)
   */
  start(req: AgentRunInput): AgentRun

  /**
   * 엔진이 실제 지원하는 슬래시 커맨드 목록(캡처된 캐시) 반환.
   *
   * 동기 — 캐시 조회만(IO 없음). 캡처 전·미지원이면 빈 배열(graceful).
   *
   * 구현 세부:
   *  - ClaudeCodeBackend: run 중 query 핸들이 확보된 직후 fire-and-forget으로
   *    queryIterable.supportedCommands()를 호출해 결과를 workspaceRoot별로 캐시.
   *    run을 블록하지 않음(스트림 지연 금지).
   *  - Codex/Echo: 미지원 → 항상 [] 반환.
   *
   * CRITICAL(신뢰경계): name·description(길이 cap·개행 제거)·argHint만.
   *   시크릿·경로·본문 0. 캡처·매핑은 main(어댑터) 내부에서만.
   *
   * backend-contract 깃발: 이 메서드 추가는 전 어댑터 구현 필수.
   * (ADR-019)
   *
   * @param workspaceRoot 워크스페이스 루트 절대 경로 (캐시 키).
   *   미전달·null·undefined → 빈 문자열 키(전역 캐시) 조회.
   */
  listSupportedCommands(workspaceRoot?: string | null): SlashCommandInfo[]
}
