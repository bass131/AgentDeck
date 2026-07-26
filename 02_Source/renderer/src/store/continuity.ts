/**
 * continuity.ts — 사고↔답변 시각 연속성 판정 (GAP1 P16 계열②).
 *
 * 영호 육안 피드백(2026-07-15 ①): "사고 중, 토큰 실시간으로 올라가는 아이콘이랑 이후
 * 클로드가 답변하는 게 분리되어서 가시성이 별로". Phase 확정 (B)안 — DOM 대재구조(턴
 * 래퍼 도입) 대신 저위험 인접 연출: thinking 아이템이 곧바로 다음 assistant msg로
 * 이어지는지만 순수 함수로 판정하고, 렌더는 그 판정이 true인 쌍에 연결 시각(gap 축소·
 * 아바타 정합)을 적용한다.
 *
 * CRITICAL: 순수 함수(fs/네트워크/타이머/랜덤 0) — 결정론.
 *
 * 계약 고정(gap1-p16-s2-thinking-continuity.test.ts):
 *   1) thread[index]가 kind:'thinking'이 아니면 즉시 false.
 *   2) j=index+1부터 앞으로 스캔 — options.ignoreToolgroups===true이고 thread[j]가
 *      kind:'toolgroup'이면 스킵(계속 전진). 그 외 kind면 멈춘다.
 *   3) 멈춘 위치 thread[j]가 kind:'msg'&&role:'assistant'면 true, 아니면 false.
 *
 *   단일챗(PanelView 미해당)은 toolgroup을 렌더하므로 ignoreToolgroups 기본 false —
 *   사이 toolgroup이 인접을 끊는다. 멀티 패널(PanelView)은 toolgroup을 렌더하지 않으므로
 *   (:244-253) ignoreToolgroups:true — 데이터상 사이 toolgroup은 화면엔 안 보여 여전히
 *   인접(연속)으로 판정한다. toolgroup 이외의 사이 삽입(notice 등)은 두 모드 모두 인접을 끊는다.
 *
 * 현황(TG1 P03·P06 이후): 이 판정을 소비하던 렌더 경로(Conversation.tsx·PanelView.tsx)가
 * 턴 블록 구조(lib/turnBlocks.ts)로 교체되며 프로덕션 소비처는 사라졌다. 이 파일은
 * 고아 모듈이 아니라 **의도적 보존**(백로그) — 순수 함수 계약을 gap1-p16-s2-thinking-
 * continuity.test.ts가 독립적으로 계속 잠그며, 삭제는 이 Phase 범위 밖 별건 위임 대상이다.
 */
import type { ThreadItem } from './threadTypes'

export interface ContinuityOptions {
  ignoreToolgroups?: boolean
}

/**
 * findContinuationTarget — thinking 아이템(index)의 연속 대상 assistant msg의 thread
 * 인덱스를 반환(없으면 -1). isThinkingContinuous가 이 함수 위에서 성립하며, 렌더
 * 레이어가 "어떤 assistant msg가 연속 대상인가"를 알아야 할 때(연결 시각 적용 대상
 * 판정) 재사용한다 — 확정 계약 밖 추가 export(테스트는 isThinkingContinuous만 단정).
 */
export function findContinuationTarget(
  thread: ThreadItem[],
  index: number,
  options?: ContinuityOptions
): number {
  const item = thread[index]
  if (!item || item.kind !== 'thinking') return -1

  const ignoreToolgroups = options?.ignoreToolgroups === true
  let j = index + 1
  while (j < thread.length) {
    const cur = thread[j]
    if (ignoreToolgroups && cur.kind === 'toolgroup') {
      j += 1
      continue
    }
    break
  }

  const target = thread[j]
  if (target !== undefined && target.kind === 'msg' && target.role === 'assistant') {
    return j
  }
  return -1
}

/**
 * isThinkingContinuous — thread[index]가 thinking일 때, 다음 assistant msg와 시각적으로
 * 인접(연속 연출 대상)인지 판정.
 */
export function isThinkingContinuous(
  thread: ThreadItem[],
  index: number,
  options?: ContinuityOptions
): boolean {
  return findContinuationTarget(thread, index, options) !== -1
}
