/**
 * loopCommand.ts — 앱 레벨 `/loop` 슬래시 커맨드의 순수 로직.
 *
 * 배경: SDK 네이티브 `/loop`은 세션 전용 크론을 예약하나, AgentDeck은 메시지마다 새 단발
 * query()를 띄우고 응답 후 세션 close → 예약 크론이 소멸 → 2번째 틱부터 발동 안 함(프로브 실증).
 * → SDK로 보내지 않고 renderer가 직접 반복(앱 레벨). 이 파일은 그 "순수" 부분:
 *   - parseLoopCommand: `/loop [interval] <prompt>` 분류(start/stop/invalid) + interval 파싱.
 *   - decideLoopTick: idle 전이 시 다음 행동(schedule/halt/idle) — 안전 가드 포함.
 *   - isLoopCommand: 인터셉트 게이트(dispatchSend/handleSend 최상단).
 *
 * CRITICAL(신뢰경계): window.api/fs/타이머 미접촉 — 순수 함수. 컴포넌트 effect가 이 판정을 와이어링.
 * CRITICAL(ADR-003): `/loop`은 우리 앱 개념 — 엔진 고유 도구명('Workflow'/'task_') 미관여.
 */

// ── 상수 (전부 측정가능 — 단위 테스트로 단언) ─────────────────────────────────
/** interval 미지정(self-pace) 시 기본 간격 — 5초(런어웨이 방지 + 정지 개입창 확보, Q1). */
export const LOOP_DEFAULT_INTERVAL_MS = 5_000
/** 사용자 입력 interval 상한 — 6시간(거대 입력 `/loop 9999h` 클램프 방어). */
export const LOOP_MAX_INTERVAL_MS = 6 * 60 * 60 * 1000
/** 최대 틱 수 — 무한 토큰 소모 방지(Q4 안전 가드). */
export const LOOP_MAX_TICKS = 50
/** 최대 누적 시간 — 30분(Q4 안전 가드, 틱 상한과 이중). */
export const LOOP_MAX_DURATION_MS = 30 * 60 * 1000

// ── 타입 ──────────────────────────────────────────────────────────────────────

/** parseLoopCommand 결과 — start/stop/invalid 분류. */
export type LoopCommand =
  | { kind: 'start'; intervalMs: number; prompt: string }
  | { kind: 'stop' }
  | { kind: 'invalid'; reason: string }

/** 루프 정지 사유 — 정지 3경로(사용자/abort) + 안전 가드 2종. */
export type LoopStopReason = 'user' | 'abort' | 'max-ticks' | 'max-duration'

/**
 * ActiveLoop — 활성 루프의 휘발 상태(단일=appStore, 멀티=PanelView 로컬).
 * CRITICAL: 영속 X(snapshotForPersist 제외) — 세션 휘발. picker는 model/effort/mode만(orchestration 제외).
 */
export interface ActiveLoop {
  /** 매 틱 재전송할 내부 프롬프트(슬래시 커맨드 가능 — 예: /review). */
  prompt: string
  /** 틱 간 간격(ms). */
  intervalMs: number
  /** 틱 간 유지할 피커값(model/effort/mode). 미지정 시 기본값. */
  picker?: { model: string; effort: string; mode: string }
  /** 지금까지 루프가 발사한 dispatch 수(가드 분모). */
  tickCount: number
  /** running=재개 대상, stopped=상한 도달로 정지(인디케이터 표시 유지). */
  status: 'running' | 'stopped'
  /** stopped일 때 사유(상한 알림용). */
  stopReason?: LoopStopReason
  /** 루프 시작 시각(ms epoch) — 시간 상한 판정 분모. */
  startedAt: number
}

/** decideLoopTick 결과 — idle 전이 시 컴포넌트가 취할 행동. */
export type LoopTickDecision =
  | { action: 'schedule'; intervalMs: number }
  | { action: 'halt'; reason: 'max-ticks' | 'max-duration' }
  | { action: 'idle' }

// ── 인터셉트 게이트 ─────────────────────────────────────────────────────────────

/**
 * isLoopCommand — dispatchSend/handleSend 최상단 인터셉트 판정.
 * `/loop` 또는 `/loop ` 접두만 true — `/looping`(다른 단어) 오인 금지.
 * CRITICAL(🔴#1): commandOf/sendMessage 진입 전 이 게이트로 막아 평문 SDK 누수 차단.
 */
export function isLoopCommand(text: string): boolean {
  const t = text.trim()
  return t === '/loop' || t.startsWith('/loop ')
}

// ── interval 토큰 파싱 ──────────────────────────────────────────────────────────

const INTERVAL_RE = /^(\d+)(s|m|h)$/
const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000 }

/** interval 토큰(`30s`/`5m`/`1h`)을 ms로. 매칭 실패 시 null. 상한 클램프. */
function parseInterval(token: string): number | null {
  const m = INTERVAL_RE.exec(token)
  if (!m) return null
  const n = Number(m[1])
  const ms = n * UNIT_MS[m[2]]
  if (!Number.isFinite(ms)) return LOOP_MAX_INTERVAL_MS
  return Math.min(ms, LOOP_MAX_INTERVAL_MS)
}

// ── 파서 ────────────────────────────────────────────────────────────────────────

/**
 * parseLoopCommand — `/loop [interval] <prompt>` 분류.
 *
 *   /loop stop | /loop off      → {kind:'stop'}            (대소문자 무시)
 *   /loop 5m do X               → {kind:'start', intervalMs:300000, prompt:'do X'}
 *   /loop do X                  → {kind:'start', intervalMs:기본5초, prompt:'do X'}  (self-pace)
 *   /loop 5x do X               → 5x는 interval 아님 → prompt='5x do X', 기본 간격
 *   /loop | /loop 5m            → {kind:'invalid'} (프롬프트 없음)
 *
 * 전제: isLoopCommand(text)가 true인 텍스트에만 호출(아니어도 안전하게 분류).
 */
export function parseLoopCommand(text: string): LoopCommand {
  const t = text.trim()
  // `/loop` 접두 제거 후 나머지
  const rest = t.replace(/^\/loop\b/, '').trim()

  if (rest === '') return { kind: 'invalid', reason: '반복할 작업을 입력하세요. 예: /loop 5m 테스트 실행' }

  // stop/off 인터셉트 (대소문자 무시)
  const lower = rest.toLowerCase()
  if (lower === 'stop' || lower === 'off') return { kind: 'stop' }

  // 첫 토큰이 interval이면 분리, 아니면 전체가 prompt(기본 간격)
  const spaceIdx = rest.indexOf(' ')
  const firstToken = spaceIdx === -1 ? rest : rest.slice(0, spaceIdx)
  const afterFirst = spaceIdx === -1 ? '' : rest.slice(spaceIdx + 1).trim()

  const intervalFromFirst = parseInterval(firstToken)
  if (intervalFromFirst !== null) {
    // 첫 토큰이 interval — 나머지가 prompt
    if (afterFirst === '') return { kind: 'invalid', reason: 'interval만 있고 작업이 없습니다.' }
    return { kind: 'start', intervalMs: intervalFromFirst, prompt: afterFirst }
  }

  // interval 없음 → 전체가 prompt, 기본 간격
  return { kind: 'start', intervalMs: LOOP_DEFAULT_INTERVAL_MS, prompt: rest }
}

// ── 틱 판정 (안전 가드) ──────────────────────────────────────────────────────────

/**
 * decideLoopTick — idle 전이 시 다음 행동 결정. 순수(now를 인자로 받아 결정성 보장).
 *
 * 우선순위: idle(미실행/정지) → max-ticks → max-duration → schedule.
 * 컴포넌트 effect가 이 결과대로 setTimeout(schedule) / stopLoop(halt) / no-op(idle).
 *
 * @param loop 현재 활성 루프(null=루프 없음)
 * @param now  현재 시각(ms epoch) — 호출부가 Date.now() 주입(순수성)
 */
export function decideLoopTick(loop: ActiveLoop | null, now: number): LoopTickDecision {
  if (!loop || loop.status !== 'running') return { action: 'idle' }
  if (loop.tickCount >= LOOP_MAX_TICKS) return { action: 'halt', reason: 'max-ticks' }
  if (now - loop.startedAt >= LOOP_MAX_DURATION_MS) return { action: 'halt', reason: 'max-duration' }
  return { action: 'schedule', intervalMs: loop.intervalMs }
}

// ── 표시 헬퍼 ────────────────────────────────────────────────────────────────

/** formatLoopInterval — interval(ms)을 한국어 간격 문자열로(인디케이터 표시용, 순수). */
export function formatLoopInterval(ms: number): string {
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}시간`
  if (ms % 60_000 === 0) return `${ms / 60_000}분`
  return `${Math.round(ms / 1000)}초`
}
