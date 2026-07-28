/**
 * reducer/helpers.ts — 리듀서 내부 순수 헬퍼 (P12 분해).
 *
 * extractTarget·isMetaBlockText·extractSubagentText·closeAbortedCommandCard·
 * closeAbortedOrchestrationCards·terminalResetFields.
 * CRITICAL: 순수 함수 — window.api/Node/fs 0.
 */
import type { ThreadItem } from '../threadTypes'
import type { AppState } from './types'

/**
 * terminalResetFields가 소유하는 "터미널 리셋 공통분" 필드 집합.
 *
 * Pick<AppState, …>로 선언해 필드 이름·타입이 AppState와 자동 동기화된다 —
 * 개별 나열(수동 복사)이던 구조에서 이 타입이 유일 정본이 된다.
 */
export type TerminalResetFields = Pick<
  AppState,
  | 'activeLoops'
  | 'loopsStoppedNotice'
  | 'isRunning'
  | 'currentRunId'
  | 'thinkingText'
  | 'thinkingStartedAt'
  | 'pendingPermission'
  | 'pendingQuestion'
  | 'openMsgId'
  | 'openGroupId'
  | 'pendingCommand'
  | 'autonomyActive'
  | 'lastActivityAt'
  | 'bannerStale'
  | 'staleDismissed'
  | 'goalRun'
>

/**
 * terminalResetFields — run이 종료(abort / dead-run 확정 / 패널 CLEAR_LOOPS)됐을 때
 * 세 호출부가 똑같이 리셋하던 필드 공통분을 단일 정의로 모은다 (RS1 P04).
 *
 * 배경(산탄 수정 Shotgun Surgery 해소): 동일한 ~16필드 목록이 runtime.ts의
 * closeDeadRunState·abortRun과 panelSession.ts의 CLEAR_LOOPS 세 곳에 손으로 복사돼 있었고,
 * "안 하면 값이 샌다"는 취지의 경고 주석까지 함께 복제돼 있었다 — 필드를 하나 추가할 때마다
 * 세 곳을 모두 고쳐야 했고, 한 곳을 빠뜨리면 그 경로만 조용히 값이 새는 구조였다.
 *
 * ⚠️ 여기 있는 것은 **공통분뿐**이다. 세 호출부의 *차이*는 의도된 것이라 뭉개면 안 되며
 * 각 호출부에 로컬로 남는다:
 *   - `runGeneration: null` — runtime.ts 두 곳만(패널은 이 필드를 소유하지 않는다).
 *   - `queue: []` — abortRun만(중단은 예약 큐도 함께 폐기 / dead-run·패널은 큐 보존).
 *   - `thread` — abortRun만 markInterruptedOpenMsg로 잘린 assistant msg에 중단 마킹을
 *     추가한다(나머지 둘은 closeAborted{Command,Orchestration}Card 2겹만).
 *
 * loopsStoppedNotice는 "루프를 끊은 종료에만 점화"라는 조건이 세 곳 모두 동일하므로
 * 조건까지 함께 소유한다 — 조건이 거짓이면 기존 값을 그대로 돌려준다(끄지 않는다).
 *
 * CRITICAL: 순수 함수 — 인자로 받은 상태만 읽는다(Date.now()/window.api 0).
 *
 * @param state 리셋 판정에 필요한 현재 상태(활성 루프·진행 중 커맨드·기존 배너 값).
 * @returns 세 호출부가 스프레드해 쓰는 공통 리셋 필드.
 */
export function terminalResetFields(
  state: Pick<AppState, 'activeLoops' | 'pendingCommand' | 'loopsStoppedNotice'>
): TerminalResetFields {
  // goal은 loop과 동형의 self-re-arm 자기지속 — 정지 확인 배너 점화 대상에 함께 편입.
  const goalStopping = state.pendingCommand?.name === 'goal'
  return {
    activeLoops: [],
    // LR3-06: 루프를 끊은 종료에만 정지 확인 배너를 점화 — 아니면 기존 값 보존.
    loopsStoppedNotice: (state.activeLoops.length > 0 || goalStopping) ? true : state.loopsStoppedNotice,
    isRunning: false,
    currentRunId: null,
    thinkingText: null,
    // TG1 P02: 사고 경과 시작점도 thinkingText와 동일 지점에서 리셋.
    thinkingStartedAt: null,
    pendingPermission: null,
    pendingQuestion: null,
    openMsgId: null,
    openGroupId: null,
    pendingCommand: null,
    // LR4 P05 터미널 리셋(폴백): 세션 종료 = 자율반복도 종료 — ended 신호를 기다리지 않고
    // 즉시 배너 off(벨트+멜빵).
    autonomyActive: false,
    // BL1 P03: stale-watchdog 필드도 함께 정리 — 다음 run이 이 값을 잘못 이어받지 않게 한다
    // (호출부는 필요 시 refreshStaleWatchdog()으로 라이브 타이머도 dispose).
    lastActivityAt: null,
    bannerStale: false,
    staleDismissed: false,
    // goal 표시 수명 일원화(BL1 후속): 종료 신호 3종(ended/error/abort) — 지속 goal 컨텍스트도 소멸.
    goalRun: null,
  }
}

/**
 * tool_call input 객체에서 도구 대상을 best-effort로 1줄 추출한다.
 * file_path > path > command > pattern 순으로 확인.
 * 미발견 시 빈 문자열.
 */
export function extractTarget(input: unknown): string {
  if (input === null || typeof input !== 'object') return ''
  const obj = input as Record<string, unknown>
  const candidate = obj['file_path'] ?? obj['path'] ?? obj['command'] ?? obj['pattern']
  if (candidate === undefined || candidate === null) return ''
  return String(candidate)
}

/**
 * 서브에이전트 tool_result content → 정제 텍스트 (F-E).
 *
 * Task 서브에이전트 최종 결과는 `[{type:'text',text:'…'}, {type:'text',text:'agentId:… <usage>…'}]`
 * 형태로 온다(라이브 프로브 확인). text 블록만 추출·join하고 agentId/usage 메타 블록은 제거해
 * 상세/카드에 raw JSON이 덤프되지 않게 한다. 추출 불가(객체 등)면 JSON.stringify 폴백(truthy 보존).
 *
 * CRITICAL(신뢰경계): 모델 출력 텍스트만 — 별도 fs/네트워크 접근 0.
 */
export function isMetaBlockText(t: string): boolean {
  const s = t.trim()
  return s.startsWith('agentId:') || s.includes('<usage>') || s.includes('use SendMessage with to:')
}

/**
 * closeAbortedCommandCard — abort(세션 강제 종료)로 실행이 끊긴 슬래시 커맨드 카드
 * (`cmdresult` ThreadItem, 예: /goal·/compact 진행카드)를 "중단됨" 상태로 닫는다.
 *
 * 배경(FB2 육안 게이트 P0, 영호 실측 2026-07-04): main(agentRuns.ts RunManager.abort())은
 * cleanup()으로 `activeRun.done=true`를 abortFn() 호출 *전에* 세팅한다 — 이후 소비 루프는
 * 'loops' 타입 이벤트만 통과시키고 done/error를 포함한 나머지는 전부 드롭한다(의도적 설계,
 * agentRuns.ts:206-224). 즉 abort 후에는 renderer가 done/error를 통해 카드를 자연 닫을
 * 기회가 원천 차단된다 — done(자연 완료)·error(실패)와 구분되는 세 번째 종료 경로(사용자
 * 강제 중단)를 로컬에서 직접 처리해야 한다.
 *
 * running=false로 스피너/dots를 끄고 title을 중단 문구로 교체 — sub(목표 텍스트 등
 * detail)·failed는 건드리지 않는다(실패가 아니라 사용자 의도적 중단이므로 실패 카드로
 * 만들지 않음). cardId 불일치 항목은 그대로 통과.
 *
 * @param thread  현재 thread
 * @param cardId  닫을 cmdresult 카드 id (pendingCommand.cardId). undefined/null이면
 *                pendingCommand 자체가 없던 것 — thread를 그대로 반환(no-op, 새 배열
 *                생성 없음 — 참조 안정성으로 불필요 리렌더 방지).
 */
export function closeAbortedCommandCard(thread: ThreadItem[], cardId?: string | null): ThreadItem[] {
  if (!cardId) return thread
  return thread.map((item) =>
    item.kind === 'cmdresult' && item.id === cardId
      ? { ...item, running: false, title: '중단했어요' }
      : item
  )
}

/**
 * closeAbortedOrchestrationCards — abort로 실행이 끊긴 시점에 여전히 "실행 중"으로 표시된
 * orchestration(멀티에이전트, Phase 37 #4b) 카드 전부를 닫는다.
 *
 * reviewer 🟡 봉합(closeAbortedCommandCard와 동일 버그 클래스, FB2 육안 게이트 P0):
 * handleDone(lifecycle.ts:58-61 closeOrch)·handleError(lifecycle.ts:144-149 closeOrchFailed)는
 * done/error 시 running orchestration 카드를 항상 함께 닫지만, abort 후에는 main이 done/error를
 * 영원히 보내지 않아(agentRuns.ts:206-224 — 'loops' 이외 전부 드롭) 이 정리를 못 만난다 —
 * goal/loop가 서브에이전트(orchestration)를 띄운 채 정지되면 스피너가 영구 잔존한다.
 *
 * closeOrch(done)와 동형 — running:false만 전환하고 failed는 건드리지 않는다(closeOrch도
 * failed를 건드리지 않음 — lifecycle 관례를 그대로 따름). cmdresult(closeAbortedCommandCard)와
 * 달리 orchestration은 pendingCommand로 추적되는 특정 id가 없다(카드 자체가 유일 소스) —
 * closeOrch와 동일하게 running인 항목 전부를 스캔 대상으로 삼는다(통상 동시 1개).
 *
 * @param thread 현재 thread
 * @returns running orchestration 항목이 하나도 없으면 원본 thread 참조 그대로(no-op, 불필요
 *          리렌더 방지) — 있으면 그 항목만 교체한 새 배열.
 */
export function closeAbortedOrchestrationCards(thread: ThreadItem[]): ThreadItem[] {
  const hasRunningOrchestration = thread.some((item) => item.kind === 'orchestration' && item.running)
  if (!hasRunningOrchestration) return thread
  return thread.map((item) =>
    item.kind === 'orchestration' && item.running ? { ...item, running: false } : item
  )
}

/**
 * markInterruptedOpenMsg — 인터럽트/abort 시점에 스트리밍 중이던(openMsgId가 가리키는)
 * assistant msg에 `interrupted: true`를 남긴다 (GAP1 P15-R1 S3).
 *
 * 배경: "중단됨" 표시는 cmdresult 카드(closeAbortedCommandCard)에만 있고 잘린 assistant
 * 텍스트 msg에는 아무 마커가 없었다 — 대화 기록만 보면 미완성 답변인지 원래 그렇게 끝난
 * 답변인지 구분 불가(P15 라운드0 dogfood 관찰). abort는 main이 이후 done/error를 드롭하고
 * (agentRuns.ts:206-224), interrupt accepted:true는 main이 error를 suppress하고 done만
 * 보내므로(BF1 P03) — 어느 경로든 renderer가 요청 시점에 직접 마킹해야 한다.
 *
 * @param thread    현재 thread
 * @param openMsgId 스트리밍 중이던 msg id (state.openMsgId). null이면 스트리밍 텍스트가
 *                  없던 것(도구 실행 중 등) — thread 그대로 반환(no-op, 참조 안정성 유지).
 * @returns 대상 msg가 없으면 원본 thread 참조 그대로(no-op — closeAbortedCommandCard와
 *          동일 관례. 호출부가 참조 비교로 "실제 변경 없음"을 판별할 수 있어야 한다 —
 *          lr4-p01 핀이 accepted:true 무변경 시 상태 참조 동일성을 단정한다).
 */
export function markInterruptedOpenMsg(thread: ThreadItem[], openMsgId: string | null): ThreadItem[] {
  if (!openMsgId) return thread
  const hasTarget = thread.some((item) => item.kind === 'msg' && item.id === openMsgId)
  if (!hasTarget) return thread
  return thread.map((item) =>
    item.kind === 'msg' && item.id === openMsgId ? { ...item, interrupted: true } : item
  )
}

export function extractSubagentText(output: unknown): string {
  if (typeof output === 'string') return output
  if (Array.isArray(output)) {
    const texts = output
      .map((b) =>
        b !== null && typeof b === 'object' &&
        (b as Record<string, unknown>)['type'] === 'text' &&
        typeof (b as Record<string, unknown>)['text'] === 'string'
          ? ((b as Record<string, unknown>)['text'] as string)
          : ''
      )
      .filter((t) => t.length > 0 && !isMetaBlockText(t))
    if (texts.length > 0) return texts.join('\n\n')
    return JSON.stringify(output) // text 블록 없음 → 폴백
  }
  if (output !== null && typeof output === 'object') {
    const t = (output as Record<string, unknown>)['text']
    if (typeof t === 'string' && t.length > 0) return t
  }
  return JSON.stringify(output) // 객체/기타 → 폴백(truthy 보존)
}
