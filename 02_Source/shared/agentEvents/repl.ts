/**
 * agentEvents/repl.ts — REPL 지속세션 · 자율반복 이벤트 (RS1 P03 분할)
 *
 * 원본: `02_Source/shared/agentEvents.ts`의 세션 식별자 · 활성 루프 · 자율반복 생존신호
 * 섹션(REPL_TRANSITION Phase 1 · 5c · LR4 P03).
 * 타입 표면(필드·discriminant 값)은 원본 그대로 — 분할은 파일 경계만 바꾼다.
 * 소비처 import 경로는 배럴 `02_Source/shared/agentEvents.ts`가 보존한다.
 *
 * 변경 주의: backend-contract 깃발 — agent-backend·renderer·qa 정합 동반.
 * `any` 사용 금지.
 */

/**
 * 세션 식별자 — 턴 간 맥락 복구용 (Phase 1, REPL_TRANSITION).
 * 엔진의 system/init에서 캡처한 불투명 세션 토큰. 다음 턴의 resume에 사용한다.
 * ADR-003: sessionId는 엔진 고유 *형상*이 아닌 불투명 문자열 — 중립 표면화 가능.
 *   `resume` 옵션으로의 *매핑*만 ClaudeCodeBackend 어댑터 내부에 둔다.
 */
export interface AgentEventSession {
  type: 'session'
  /** 엔진 세션 ID(불투명). 같은 대화의 다음 agentRun이 resumeSessionId로 되돌려 보낸다. */
  sessionId: string
}

/**
 * 활성 루프 1개 — 내장 `/loop`·`/schedule` 크론의 진행 표시용(5c, REPL 지속세션).
 * 엔진의 cron 상태를 어댑터가 중립 형태로 정규화한다.
 * ADR-003: 'CronCreate'/cron 표현식 등 엔진 리터럴은 어댑터(ClaudeCodeBackend) 내부에만.
 * 신뢰경계: summary는 모델 prompt를 sanitize·cap한 값 — 시크릿/경로/raw payload 0.
 */
export interface LoopInfo {
  /** 불투명 식별자(루프 구분·제거 매칭) */
  id: string
  /** 작업내용 — 루프가 반복 실행하는 작업 요약(sanitize·cap) */
  summary: string
  /** 사람표기 주기(선택, 예: 'Every minute') */
  interval?: string
}

/**
 * 활성 루프 전체 스냅샷 — REPL 지속세션의 "loop 진행중" 표시 데이터원(5c).
 * 어댑터가 Cron 도구(Create/Delete) 추적으로 누적해 변경마다 전체 스냅샷을 emit.
 * **빈 배열 = 활성 루프 없음**(표시 제거). 덮어쓰기 의미(부분 갱신 아님).
 */
export interface AgentEventLoops {
  type: 'loops'
  /** 활성 루프 전체 (빈 배열이면 표시 제거) */
  loops: LoopInfo[]
}

// ── 자율반복 생존신호(LR4 P03) ────────────────────────────────────────────────

/**
 * `autonomy_status` 이벤트의 종료 사유 — 리터럴 유니온(자유 string 금지).
 *
 * 'grace-expired': idle-close 유예(짧은 대기) 만료 후 추가 continuation 없이 자연종료.
 * 'cap-reached': 연속 자율(cron-origin) 턴 수가 상한을 초과해 펌프가 강제종료.
 *
 * 향후 사유가 늘면 이 유니온에 멤버만 additive로 추가한다 — renderer는 사유별
 * 한국어 카피를 매핑(표시 문구는 이 계약에 넣지 않는다).
 */
export type AutonomyEndedReason = 'grace-expired' | 'cap-reached'

/**
 * 자율반복(goal 자기지속·cron continuation) 생존신호 (LR4 P03, additive 신설).
 *
 * 지속세션(REPL, ADR-024) 펌프가 done 직후 즉시 idle-close하던 판정을 "짧은 유예 후
 * 판정 + 무한루프 상한"으로 바꾸면서, 그 유예/반복 진행 상태를 렌더러가 실시간으로
 * 알 수 있도록 방출하는 이벤트.
 *
 * (a) 방출 주체: 백엔드 지속 펌프(claudeAgentRun) — idle-close 유예 로직과 같은 소스.
 *   'active'는 자율(cron-origin) 연속 턴이 확인될 때마다(유예 중 continuation 흡수),
 *   'ended'는 유예가 만료되거나 상한을 초과해 자율반복이 실제로 멈출 때 emit한다.
 * (b) 소비 주체: P05(renderer) — 배너가 이 이벤트를 실상태로 소비해 기존 낙관적
 *   플래그(`pendingCommand`)를 대체한다. `pendingCommand`는 조기발동(실제 종료 전
 *   배너가 꺼짐)·미해제(실제 종료 후에도 배너가 안 꺼짐) 두 결함을 모두 가졌었다 —
 *   이 이벤트는 백엔드 실측 신호이므로 두 결함을 봉합한다.
 * (c) ADR-003(엔진중립): 'goal'·'cron'은 우리 앱 개념(REPL 지속세션·내장 크론)이며
 *   엔진 SDK의 리터럴이 아니다 — 어댑터 밖으로 새는 엔진 고유 표현은 없다.
 * (d) 신뢰경계: 모델 raw payload 0 — status·reason 리터럴만 전달. 프롬프트·경로·
 *   시크릿 등 어떤 모델 생성 텍스트도 이 이벤트에 담지 않는다.
 * (e) backend-contract 깃발: 이 이벤트 신설은 agent-backend(펌프가 유예/상한 로직에서
 *   emit — 별도 Phase 몫)·renderer(배너 소비 — P05 몫)·qa(골든 정합) 전체에 영향 →
 *   coordinator 조율 필수. 이 Phase(LR4 P03)는 계약 *정의만* — 방출·소비는 각각
 *   agent-backend/P05.
 */
export interface AgentEventAutonomyStatus {
  type: 'autonomy_status'
  /** 'active'=자율(cron-origin) 연속 턴 확인(유예 중 continuation 흡수) · 'ended'=자율반복 종료 */
  status: 'active' | 'ended'
  /**
   * ended일 때만 부여. 'grace-expired'=유예 만료 자연종료 · 'cap-reached'=연속 자율 턴
   * 상한 초과 강제종료. active면 미부여.
   */
  reason?: AutonomyEndedReason
}
