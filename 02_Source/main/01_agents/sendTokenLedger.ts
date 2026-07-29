/**
 * sendTokenLedger.ts — 전송 토큰 장부 관심사 (GAP1 P11 → RS1 P06 ② 분리)
 *
 * claudeAgentRun(어댑터 본체)이 들고 있던 "send-token 턴 귀속 회계"를 한 모듈로 모은
 * 것이다. 거동은 분리 이전과 1비트도 다르지 않다 — 계약 핀은 기존 골든
 * (`gap1-p11-send-token-accounting` · `gap1-p11-autonomous-done-theft.repro` ·
 * `gap1-dogfood-interturn-anchor.repro` · `gap1-p12-*`) **무수정 green**이고,
 * 단위 표면은 `sendTokenLedger.test.ts`가 잠근다.
 *
 * ── 이 장부가 푸는 문제 (GAP1 P11 — origin 판정 정본, 옛 `_pendingSends` 카운터 대체) ──
 *
 * 옛 설계의 결함: `_pendingSends`는 "미소비 user turn 수"를 세고, **done 도착 그 시점의
 * 값**을 보고 turnOrigin을 역산했다 — push↔done의 *도착 순서*에 origin이 의존했다. 자율
 * (cron) 턴 A가 실행 중일 때 사용자 push(B)가 카운터를 0→1로 올리면, A의 늦은 done이
 * "지금 카운터가 >0이니 user"로 오분류해 B의 미소비 token을 탈취(1→0)했다 — origin이
 * "누가 이 done을 유발했는가"가 아니라 "이 순간 카운터가 뭐였는가"를 답했기 때문(P11 반증).
 *
 * 봉합 원리: token에게 수명(lifecycle)을 준다. push()/초기 입력마다 로컬 seq를 발급해
 *   queued(입력 큐 적재) → delivered(`_inputGen`이 pull, SDK에 전달됨) →
 *   owned(그 token이 귀속된 turn epoch가 실제로 시작됨, ANCHOR) →
 *   completed(그 epoch의 done 도착)
 * 로 전이시킨다. done은 **자기 turn epoch에 owned된 token만** 완료할 수 있다 — 무토큰
 * epoch(자율 턴)의 done은 애초에 완료할 token이 없어 남의 것을 훔칠 길이 없다.
 *
 * turnOrigin은 더 이상 done 도착 시점의 카운터 재계산이 아니라, 이 epoch가 시작될 때
 * (`anchorIfEligible()`) 확정된 owned token의 유무(`hasOwnedToken()`)로만 결정된다 —
 * 같은 epoch의 모든 메시지가 동일한 origin을 본다(epoch 중간에 값이 바뀔 수 없다).
 *
 * idle-close 게이트(claudeAgentRun 6곳)는 `outstandingCount()`(queued+delivered+owned
 * 총합, 완료 안 된 token 전체)를 "살아있을 이유"로 쓴다 — 완료 안 된 token이 하나라도
 * 있으면(어느 상태든) idle-close를 막는다는 옛 `_pendingSends===0` 게이트의 의미를 그대로
 * 보존한다(P04b 9종 시나리오 의미 보존).
 *
 * 단발(비-persistent) 경로에서는 사용되지 않는다(모든 필드가 초기값에 머문다 = 회귀 0).
 *
 * 소유권 규칙(RS1 P06 설계 규율): 장부 상태는 **이 모듈이 단독 소유**하고 claudeAgentRun은
 * 인스턴스를 하나 들고 위임만 한다. 단 하나의 예외가 `queuedSeqs`(라이브 뷰)인데, 그
 * 근거는 아래 게터 JSDoc에 적어 뒀다(입력 큐와의 1:1 불변식은 claudeAgentRun 쪽에서만
 * 검사 가능하기 때문 — 큐 내용은 이 모듈이 모른다).
 *
 * ADR-003: 원시 SDK 메시지 형상 검사(`isTurnAnchoringMessage`)는 어댑터 디렉토리
 * (`01_agents/`) 내부에만 산다 — 밖으로 나가는 것은 정규화된 `AgentEvent`뿐이다.
 */

/**
 * 이 원시 SDK 메시지가 turn epoch를 시작(ANCHOR)할 자격이 있는가
 * (GAP1 dogfood 결함 B 봉합 — P11×P04 상호작용).
 *
 * P11 ANCHOR는 원래 지속 펌프의 **모든** 원시 메시지에서 발화했다. 그런데 실 SDK 방출
 * 순서(fixture 실측: probe-2b-session-state-env.jsonl)는 running → result(done) →
 * **idle**(done *뒤* 별개 system msg)이라, 턴 경계를 통과한 직후 도착하는 늦은 idle이
 * 다음 turn epoch를 무토큰으로 선점 앵커했다 — 이후 사용자 push 턴의 done이 'cron'으로
 * 오분류(자율 발동 배지 오표시)되고, 그 미완료 send-token이 다음 유령 epoch의 owned로
 * 좌초해 `outstandingCount()`가 1로 영구 잔존 → idle-close 게이트 영구 봉쇄(좀비 세션,
 * P04b 취지 위반). 라이브 dogfood 2세션 재현 2/2 (gap1-dogfood-interturn-anchor.repro).
 *
 * 봉합: **턴에 귀속되지 않는(턴 사이 창에 도착할 수 있는) 세션 레벨 메시지**는 epoch를
 * 시작하지 못하게 한다. 제외 목록:
 *  - `system`/`session_state_changed` state:'idle' — 세션 유휴 신호. 실 SDK 순서상 항상
 *    턴 *종료 후*에 도착한다(턴의 첫 메시지일 수 없음). 반면 'running'·'requires_action'은
 *    턴 활동 신호이므로 앵커 자격 유지 — gap1-p11 ①a 핀(running_A가 자율 A epoch를
 *    B token delivery *前* 무토큰으로 선-앵커해 done_A의 B token 탈취를 봉쇄)이 이
 *    자격에 명시적으로 의존한다.
 *  - `system`/`task_*`(started/progress/updated/notification) — 백그라운드 태스크
 *    생명주기. 태스크는 턴과 독립 수명(P09)이라 턴 사이 창에 도착할 수 있다(늦은 idle과
 *    동일한 선점 문제 — repro 파일 헤더의 파생 케이스).
 *
 * 나머지 모든 메시지(assistant/user/stream_event/result · 기타 system[init·api_retry·
 * compact_boundary 등])는 기존대로 앵커 자격을 유지한다. 안전 근거: 모든 턴은 result로
 * 끝나고 result가 앵커 자격을 가지므로, 진짜 턴이 시작되면 ANCHOR는 늦어도 그 턴의
 * done 산출 전에 반드시 수행된다(origin 판정 소실 없음).
 *
 * ADR-003: 원시 msg 형상('system'·subtype 리터럴) 검사는 어댑터 내부에만 격리.
 */
export function isTurnAnchoringMessage(msg: unknown): boolean {
  if (msg === null || typeof msg !== 'object') return true
  const m = msg as Record<string, unknown>
  if (m['type'] !== 'system') return true
  const subtype = m['subtype']
  if (subtype === 'session_state_changed') {
    return m['state'] !== 'idle'
  }
  if (
    subtype === 'task_started' ||
    subtype === 'task_progress' ||
    subtype === 'task_updated' ||
    subtype === 'task_notification'
  ) {
    return false
  }
  return true
}

/**
 * send-token 장부 — 토큰 수명(queued→delivered→owned→completed)의 단독 소유자.
 *
 * 상태:
 *   - `_nextSeq`: 단조증가 seq 발급기. `issue()`(push()/초기 입력)마다 1개 소모.
 *   - `_queued`: queued 상태 seq FIFO. claudeAgentRun의 `_inputQueue`와 인덱스 1:1
 *     동기(같은 push/초기 적재가 두 배열에 함께 쌓이고, `_inputGen`이 pull할 때 함께
 *     shift). 이 불변식의 *검사*는 큐 내용을 아는 claudeAgentRun 쪽 책임이다.
 *   - `_delivered`: delivered 상태(pull됐지만 이 epoch가 아직 시작 전) seq 단 1개
 *     (null 가능) — 턴은 직렬·비인터리브라 이 상태는 항상 최대 1개뿐이다.
 *   - `_owned`: 현재 turn epoch가 소유한 seq(null = 무토큰 epoch = 자율 발동).
 *   - `_anchored`: 이 epoch에서 delivered→owned ANCHOR 전이를 이미 수행했는가.
 *     `completeTurn()`(done 도착)에서 false로 리셋 — 다음 epoch 첫 메시지에서 재수행.
 */
export class SendTokenLedger {
  private _nextSeq = 0
  private readonly _queued: number[] = []
  private _delivered: number | null = null
  private _owned: number | null = null
  private _anchored = false

  /**
   * queued 상태 seq FIFO의 **라이브 뷰**(복사본 아님).
   *
   * 노출 이유(캡슐화 예외의 근거): `_inputQueue`(내용)와 이 FIFO의 인덱스 1:1 동기는
   * claudeAgentRun만 검사할 수 있는 불변식이다(이 모듈은 큐 내용을 모른다) —
   * `_inputGen`의 dev-assert가 pull 직전에 이 길이를 읽는다. 같은 성질을 이용해
   * gap1-p12 §4 C-2가 "공개 API로 도달 불가한 desync"를 여기에 주입한다(테스트 seam).
   *
   * ⚠️ 이 배열을 *대체*(재할당)하지 말 것 — 장부가 참조를 유지한다. 길이 절단·요소
   * 조작은 곧 회계 불변식 위반이므로 프로덕션 코드에서는 읽기만 한다.
   */
  get queuedSeqs(): number[] {
    return this._queued
  }

  /**
   * 새 send-token을 발급해 queued 상태로 적재한다(push()/초기 입력 1건당 1개).
   * @returns 발급된 seq(단조증가).
   */
  issue(): number {
    const seq = this._nextSeq++
    this._queued.push(seq)
    return seq
  }

  /**
   * queued→delivered 전이 — `_inputGen`이 입력을 pull해 SDK에 전달하는 시점.
   *
   * delivered→owned 전이(ANCHOR)는 그 epoch의 첫 스트림 메시지 도착 시에만 일어난다 —
   * 여기서 곧바로 owned로 승격하지 않는다(승격 시점을 앞당기면 gap1-p11 ①a 앵커
   * 테스트가 잡아낸다).
   *
   * @returns 실제로 queued token을 하나 꺼냈으면 true. FIFO가 비었으면 false(=1:1
   *   불변식 desync — 호출측이 관찰 가능하게 warn할 근거) + delivered는 null로 폴백해
   *   token-less 전달을 이어간다(옛 `?? null` 거동 그대로, throw 금지 — prod 안전).
   */
  deliverNext(): boolean {
    const seq = this._queued.shift()
    this._delivered = seq ?? null
    return seq !== undefined
  }

  /**
   * ANCHOR: 이 turn epoch의 첫 *턴 귀속* 스트림 메시지에서 delivered→owned 승격.
   *
   * 턴 경계(이전 done)를 통과한 뒤 이 epoch에서 정확히 1회만 수행된다(`_anchored`
   * 멱등 가드). 이 호출 이후 이 epoch이 끝날 때까지(다음 `completeTurn()`까지) owned는
   * 불변이다 — origin 판정·grace 게이트가 모두 이 승격 결과를 공유한다(도착 시점
   * 재계산 없음).
   *
   * 자격 판정은 `isTurnAnchoringMessage()`에 위임한다 — 턴-비귀속 세션 레벨 메시지
   * (늦은 session_state:idle · task_* 생명주기)는 epoch를 선점하지 못한다(GAP1 dogfood
   * 결함 B 봉합). 자격 없는 메시지로 호출하면 조용한 no-op이다.
   *
   * ⚠️ 이 메서드에서 owned를 강제로 채우게 바꾸면(예: 멱등 가드 제거)
   * gap1-p11-send-token-accounting의 ①a[delivered→owned 앵커]가 RED로 뒤집힌다.
   */
  anchorIfEligible(msg: unknown): void {
    if (!isTurnAnchoringMessage(msg)) return
    if (this._anchored) return
    this._anchored = true
    this._owned = this._delivered
    this._delivered = null
  }

  /**
   * 현재 epoch가 owned한 token이 있는가 — turn origin 판정의 정본
   * (true=user, false=무토큰 epoch=cron 자율 발동).
   */
  hasOwnedToken(): boolean {
    return this._owned !== null
  }

  /**
   * 턴 경계(done 도착): owned token 완료 + 다음 epoch ANCHOR 재무장.
   *
   * 무토큰 epoch(자율)은 완료할 token이 없어 null→null no-op이 자동 성립한다 —
   * 남의 token을 훔칠 경로 자체가 없다(P11 탈취 봉합의 구조적 근거).
   */
  completeTurn(): void {
    this._owned = null
    this._anchored = false
  }

  /**
   * outstanding(=아직 completed 안 된) send-token 총수 — queued+delivered+owned 합.
   *
   * idle-close "살아있을 이유" 판정의 정본 — 옛 `_pendingSends===0` 게이트를 대체한다.
   * 완료(done)되지 않은 token이 하나라도 있으면(대기 큐에 있든, pull됐지만 epoch 미시작
   * 이든, 현재 epoch가 owned해 처리 중이든) idle-close를 막아야 한다는 의미는 그대로다 —
   * 옛 단일 카운터가 겸직하던 "살아있을 이유"를 세 상태 총합으로 정밀화했을 뿐이다.
   */
  outstandingCount(): number {
    return (
      this._queued.length +
      (this._delivered !== null ? 1 : 0) +
      (this._owned !== null ? 1 : 0)
    )
  }
}
