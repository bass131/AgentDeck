/**
 * bgTaskObserver.ts — 백그라운드 태스크 관찰 관심사 (GAP1 P09 → RS1 P06 ① 분리)
 *
 * claudeAgentRun(어댑터 본체)이 들고 있던 "활성 백그라운드 태스크 레지스트리 +
 * output 파일 tail 배선 + idle-close 게이트" 세 조각을 한 모듈로 모은 것이다.
 * 거동은 분리 이전과 1비트도 다르지 않다(특성화[characterization] 테스트
 * `gap1-p09-bg-task*` 무수정 green + 단위 `bgTaskObserver.test.ts`가 그 계약 핀).
 *
 * 소유권 규칙(RS1 P06 설계 규율): 상태(`_tasks` 레지스트리)는 **이 모듈이 단독
 * 소유**하고, claudeAgentRun은 인스턴스를 하나 들고 위임만 한다. 상태를 양쪽에
 * 복제하는 순간(예: 호출측이 활성 태스크 수를 따로 세는 것) 두 진실이 갈라지는
 * 버그가 된다.
 *
 * CORE-01(신뢰 경계) / ADR-003(엔진 추상화): 이 모듈은 **어댑터 디렉토리 내부**
 * (`01_agents/`)에 산다 — 원시 SDK 메시지 형상(`tool_use_result.backgroundTaskId`,
 * 사람용 안내 문구)을 읽는 코드는 어댑터 밖으로 나가면 안 된다. 밖으로 나가는 것은
 * 정규화된 `AgentEvent`(bg_task)뿐이다.
 *
 * 관심사 경계(무엇이 여기 없는가): 유예(grace) 타이머 자체·session_state 축·
 * send-token 장부는 여전히 claudeAgentRun 소유다. 이 모듈은 "게이트가 열려 있는가"
 * (`gateOpen()`) 하나만 답하고, 그 값을 어떤 조건과 ∧ 결합할지는 호출측이 정한다.
 */

import { startBgTaskTail } from './bgTaskTail'
import type { BgTaskTailHandle } from './bgTaskTail'
import type { AgentEvent, AgentEventBgTask } from '../../shared/agentEvents'

/**
 * 백그라운드 Bash tool_result의 content 문자열에서 output 파일 경로를 best-effort
 * 추출한다 (GAP1 P09 — `BgTaskObserver.maybeStartTail` 전용).
 *
 * ⚠️ fragile: "Output is being written to: <경로>.output" 사람용 안내 문구 포맷
 * (probe④ 실측, SDK 메시지 포맷 의존)에 결합돼 있다 — 포맷 변경 시 null(조용한
 * 실패, tail 없이 생명주기 이벤트만). 호출측은 반드시 구조 payload
 * (`tool_use_result.backgroundTaskId`)로 백그라운드 태스크임을 먼저 확정해야 한다.
 *
 * @param m 원시 user 메시지(type:'user'). content 블록 중 tool_result의 문자열
 *   content(또는 text 파트 배열)를 검사한다.
 * @returns 추출한 경로 또는 null(추출 실패 — graceful degrade).
 */
export function extractBgOutputPath(m: Record<string, unknown>): string | null {
  const message = m['message']
  if (message === null || typeof message !== 'object') return null
  const content = (message as Record<string, unknown>)['content']
  if (!Array.isArray(content)) return null
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue
    const b = block as Record<string, unknown>
    if (b['type'] !== 'tool_result') continue
    const raw = b['content']
    let text = ''
    if (typeof raw === 'string') {
      text = raw
    } else if (Array.isArray(raw)) {
      // content가 파트 배열 형상일 수도 있다({type:'text', text} 파트만 이어붙임).
      text = raw
        .map((part) =>
          part !== null && typeof part === 'object' && typeof (part as Record<string, unknown>)['text'] === 'string'
            ? ((part as Record<string, unknown>)['text'] as string)
            : ''
        )
        .join('')
    }
    if (text.length === 0) continue
    // lazy 캡처가 첫 '.output' 경계에서 멈춘다 — 후행 마침표/문장은 제외된다.
    const match = /Output is being written to:\s*(.+?\.output)/.exec(text)
    if (match) return match[1]
  }
  return null
}

/**
 * 활성 백그라운드 태스크 레지스트리 + tail 폴러 소유자 (GAP1 P09).
 *
 * 수명: bg_task 'started' 관측 시 추가 → 'notification' 관측 시 제거(+tail 정지).
 * run abort/펌프 종료 시 전량 정리(`stopAll()` — 타이머 누수 0).
 *
 * 두 역할:
 *  1. **idle-close 게이트**(`gateOpen()`) — 활성 태스크가 하나라도 있으면
 *     idle-close 유예 스케줄/커밋 금지(dev 서버를 백그라운드로 돌려두고 지켜보는
 *     세션이 "무활동"으로 오판돼 접히면 안 된다 — P09 완료 조건).
 *  2. **output 파일 tail 핸들 보관** — 백그라운드 Bash tool_result에서 best-effort
 *     추출한 output 경로로 시작한 bgTaskTail 핸들(라이브 증분 로그).
 *
 * 엔트리의 outputFile: tool_result content에서 추출한 경로(추출 실패 시 undefined —
 * tail 없이 생명주기 이벤트만, graceful degrade). task_notification의
 * output_file(구조 필드)이 정본 — 불일치가 관측되면 추출 경로의 잔여 flush를
 * 포기한다(notification 우선).
 */
export class BgTaskObserver {
  /** 활성 태스크 레지스트리 — 이 모듈 단독 소유(외부 복제 금지). */
  private readonly _tasks = new Map<string, { outputFile?: string; tail: BgTaskTailHandle | null }>()

  /**
   * @param _emit tail이 합성한 `bg_task { kind:'output' }` 조각의 방출 콜백.
   *   claudeAgentRun은 여기에 push-queue 적재(`_push`)를 주입한다 — close 가드가
   *   붙은 그 메서드를 **호출 시점에** 타야 하므로 반드시 지연 호출(람다)로 넘긴다.
   */
  constructor(private readonly _emit: (ev: AgentEventBgTask) => void) {}

  /**
   * bg-task 게이트: 활성 백그라운드 태스크(bg_task 'started' 관측 ~ 'notification'
   * 관측 사이)가 하나라도 있으면 false — idle-close 유예 스케줄/커밋 금지.
   *
   * P04b 축1(`_sessionStateGateOpen()`)과 동형의 ∧ 결합 — 기존 5축 결정 표의 어떤
   * 축도 대체하지 않고 조건 하나를 위에 더 얹는다(활성 태스크가 없으면 이 게이트는
   * 항상 열려 있어 기존 거동을 단 1비트도 바꾸지 않는다).
   */
  gateOpen(): boolean {
    return this._tasks.size === 0
  }

  /**
   * 정규화된 bg_task 이벤트 관측 → 레지스트리 갱신 + tail 정지 (GAP1 P09).
   *
   *  - kind:'started' → 레지스트리 추가(tail은 아직 없음 — output 경로는 이후
   *    백그라운드 Bash tool_result에서 획득, `maybeStartTail`).
   *  - kind:'notification' → 레지스트리 제거 + tail 정지. 추출 경로와 notification의
   *    output_file(정본)이 불일치하면 잘못된 파일의 잔여 flush를 포기(finalFlush=false),
   *    일치/미상이면 잔여분 최종 flush(finalFlush=true).
   *  - kind:'updated'/'output' → 레지스트리 무관(상태 패치/조각 — 수명 경계 아님).
   *
   * 단발·지속 펌프 공용. idle-close 회복 트리거는 지속 펌프에만 있다(호출측 분기).
   */
  observeEvent(e: AgentEvent): void {
    if (e.type !== 'bg_task') return
    if (e.kind === 'started') {
      if (!this._tasks.has(e.taskId)) {
        this._tasks.set(e.taskId, { tail: null })
      }
      return
    }
    if (e.kind === 'notification') {
      const entry = this._tasks.get(e.taskId)
      if (!entry) return
      this._tasks.delete(e.taskId)
      if (entry.tail) {
        const pathAgrees =
          entry.outputFile === undefined ||
          e.outputFile === undefined ||
          entry.outputFile === e.outputFile
        entry.tail.stop(pathAgrees).catch(() => {})
      }
    }
  }

  /**
   * 원시 user tool_result 메시지에서 백그라운드 태스크 output 경로를 획득해 tail을
   * 시작한다 (GAP1 P09 — 어댑터 내부 전용, 이벤트 합성 없음).
   *
   * 경로 획득 원천(probe④ 실측): task_started에는 output 경로가 없다. 유일한 조기
   * 원천 = 백그라운드 Bash tool_result의 content 문자열("Output is being written
   * to: <경로>.output"). 판별은 **구조 payload가 정본** — 원시 메시지 top-level
   * `tool_use_result.backgroundTaskId`(sdk.d.ts:4297)로 백그라운드 태스크임을 확정한
   * 뒤에만, 같은 메시지 content에서 경로를 best-effort 정규식 추출한다.
   *
   * ⚠️ fragile(주석 명시 의무): 경로 추출은 SDK의 사람용 안내 문구 포맷에 의존한다 —
   * SDK가 문구를 바꾸면 조용히 실패한다. 실패 시 tail 없이 생명주기 이벤트만 흐른다
   * (graceful degrade). task_notification의 output_file(구조 필드)이 항상 정본.
   *
   * qa 골든 핀: content 문자열에서 **taskId를 추출하지 않는다**(decoy 대조군) — 상관
   * 키는 구조 payload의 backgroundTaskId뿐이고, bg_task 이벤트도 합성하지 않는다.
   */
  maybeStartTail(msg: unknown): void {
    if (msg === null || typeof msg !== 'object') return
    const m = msg as Record<string, unknown>
    if (m['type'] !== 'user') return
    const tur = m['tool_use_result']
    if (tur === null || typeof tur !== 'object' || Array.isArray(tur)) return
    const taskId = (tur as Record<string, unknown>)['backgroundTaskId']
    if (typeof taskId !== 'string' || taskId.length === 0) return

    // task_started('started' 관측)가 선행돼야 활성 태스크 — 미등록이면 스킵(graceful).
    const entry = this._tasks.get(taskId)
    if (!entry || entry.tail !== null) return

    const outputFile = extractBgOutputPath(m)
    if (outputFile === null) return // 추출 실패 → tail 없이 생명주기만(degrade)

    entry.outputFile = outputFile
    entry.tail = startBgTaskTail({
      taskId,
      outputFile,
      emit: (ev) => this._emit(ev), // close 후 늦은 조각은 호출측 _push 가드가 차단
    })
  }

  /**
   * 모든 활성 tail 정지 + 레지스트리 정리 (GAP1 P09 — abort/펌프 종료 공용).
   * finalFlush 없이 즉시 정지(run이 끝나는 마당에 잔여 조각을 밀어넣지 않는다 —
   * 어차피 close 후 방출은 호출측이 무시한다). 타이머 누수 0 보장 지점.
   */
  stopAll(): void {
    for (const entry of this._tasks.values()) {
      if (entry.tail) entry.tail.stop(false).catch(() => {})
    }
    this._tasks.clear()
  }
}
