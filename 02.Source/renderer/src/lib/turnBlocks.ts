/**
 * turnBlocks.ts — 단일 채팅 턴 그룹핑 순수 함수 (TG1 P03).
 *
 * 목표(01.Phases/18_TG1-thinking-gui/03-turn-block-unification.md): "한 턴 = 한 블록 =
 * 아바타 1개"를 성립시키기 위해 thread(ThreadItem[])를 턴 블록 배열로 그룹핑한다.
 * Conversation.tsx는 이 함수의 결과만 useMemo([thread])로 소비한다(단방향 흐름 — 컴포넌트가
 * 그룹핑 로직을 직접 갖지 않는다).
 *
 * 계약 고정(99.Others/tests/renderer/tg1-p03-turn-blocks.test.ts):
 *   - user: role:'user' msg 1개 — 항상 자기 자신만의 블록(kind='user', Claude 아바타 없음).
 *   - agent: 연속하는 agent-side 아이템의 최대 런을 아바타 1개로 묶는다. agent-side =
 *     thinking · toolgroup · msg(role:'assistant') · subagent(사고→도구→답변이 한 화자 —
 *     GAP1 P16 인접 연출(store/continuity.ts)이 담당하던 "연속처럼 보이게" 문제를 이 턴
 *     개념이 구조적으로 대체한다).
 *   - standalone: notice · compact-boundary · informational · permission-denied ·
 *     cmdresult · orchestration — 아바타 없는 독립 행. 진행 중이던 agent 런을 끊고(다음
 *     agent 아이템은 새 블록 = 새 아바타), 자신도 항상 독립 1아이템 블록(연속 standalone도
 *     서로 병합하지 않는다 — 각자 별개 통지/카드로 남는다).
 *   - interrupted assistant msg·cron origin assistant msg는 특별취급 없이 agent-side
 *     그대로(kind='msg'&&role:'assistant'라는 사실만 본다 — 부가 필드 무시).
 *
 * CRITICAL: 순수 함수 — fs/네트워크/타이머/랜덤 0, 결정론. store 접근 0(store 로직 무변경
 * 제약 — 이 파일은 store가 아니라 순수 lib).
 */
import type { ThreadItem } from '../store/threadTypes'

export type TurnBlockKind = 'user' | 'agent' | 'standalone'

/** 턴 블록 1개 — user/standalone은 항상 items 1개, agent는 연속 agent-side 런 전체. */
export interface TurnBlock {
  kind: TurnBlockKind
  items: ThreadItem[]
}

/**
 * classify — 아이템 1개의 턴 블록 소속 분류. switch가 ThreadItem['kind']의 msg 이외 전종을
 * 소진(exhaustive)하므로, 새 kind가 추가되고 여기 분류가 누락되면 default 분기의 `never`
 * 대입이 typecheck를 깨뜨린다(방어적 컴파일타임 안전망 — standalone 6종 목록은 여기 1곳만
 * 유지, 이중 소스 0).
 */
function classify(item: ThreadItem): TurnBlockKind {
  if (item.kind === 'msg') return item.role === 'user' ? 'user' : 'agent'
  switch (item.kind) {
    case 'thinking':
    case 'toolgroup':
    case 'subagent':
      return 'agent'
    case 'notice':
    case 'compact-boundary':
    case 'informational':
    case 'permission-denied':
    case 'cmdresult':
    case 'orchestration':
      return 'standalone'
    default: {
      const exhaustive: never = item
      return exhaustive
    }
  }
}

/**
 * groupIntoTurnBlocks — thread를 턴 블록 배열로 그룹핑(순서 보존).
 *
 * 순서: 아이템을 앞에서부터 훑으며 classify로 분류 → 'agent'가 연속되는 동안은 직전에
 * 연 agent 블록에 계속 push, 그 외(user/standalone)는 항상 새 1아이템 블록을 열고 진행 중인
 * agent 런 포인터를 끊는다(다음 agent 아이템이 오면 새 블록 = 새 아바타).
 */
export function groupIntoTurnBlocks(thread: ThreadItem[]): TurnBlock[] {
  const blocks: TurnBlock[] = []
  let openAgent: TurnBlock | null = null

  for (const item of thread) {
    const kind = classify(item)
    if (kind === 'agent') {
      if (openAgent) {
        openAgent.items.push(item)
      } else {
        openAgent = { kind: 'agent', items: [item] }
        blocks.push(openAgent)
      }
      continue
    }
    openAgent = null
    blocks.push({ kind, items: [item] })
  }

  return blocks
}
