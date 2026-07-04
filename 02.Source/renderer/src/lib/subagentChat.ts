/**
 * subagentChat.ts — SubAgentInfo → 시간순 "채팅 아이템" 프로젝션 (순수, FB1 P06).
 *
 * 목적: SubAgent 상세를 Claude Code CLI처럼 하위 채팅 세션으로 보이게 하려면, store가
 * 들고 있는 원본 데이터(SubAgentInfo.role/transcript/activity)를 화면이 그대로 그리기
 * 좋은 "채팅 아이템" 순서/역할 배열로 변환해야 한다. 이 변환을 컴포넌트 밖(순수 함수)으로
 * 뽑아내 단위 테스트 가능하게 한다(TDD).
 *
 * 순서 규칙(위임 프롬프트 → 도구/응답 → 최종 답변):
 *   1) agent.role 있으면 'task' 아이템 1개(대화 시작점 — 위임 프롬프트).
 *   2) agent.transcript를 순서대로 순회:
 *      - kind='tool' → 'tool' 아이템(항상 새 항목 — 각 도구 호출은 별개 행).
 *      - kind='text'|'thinking' → 직전에 쌓인 아이템이 같은 kind면 텍스트를 이어붙임(병합).
 *        엔진이 같은 논리적 메시지를 여러 delta로 쪼개 보내는 경우(reducer는 매 delta를
 *        별도 transcript 항목으로 append — reducer/text.ts 참조) 화면에서 버블이 N개로
 *        쪼개져 "라벨 블록 나열"처럼 보이는 걸 막는다. 도구 호출이 사이에 끼면 새 버블(원본
 *        채팅에서 tool_call이 openMsgId를 닫는 것과 동형 — reducer/tool.ts handleToolCall).
 *   3) 최종 답변(agent.activity)이 transcript 마지막 text와 다르면 별도 'text' 아이템으로
 *      추가(항상 신규 — 정제된 완료 답변이라는 성격상 직전 원시 조각과 병합하지 않는다).
 *
 * CRITICAL: 순수 함수 — window.api/Node/fs 0, 부수효과 0. 새 데이터 소스 0(SubAgentInfo만).
 */
import type { SubAgentInfo, SubAgentTranscriptItem } from '../../../shared/agent-events'

export interface SubagentTaskItem {
  kind: 'task'
  id: string
  text: string
}

export interface SubagentToolItem {
  kind: 'tool'
  id: string
  verb: string
  target: string
  status: 'running' | 'done' | 'queued'
}

export interface SubagentTextItem {
  kind: 'text'
  id: string
  text: string
}

export interface SubagentThinkingItem {
  kind: 'thinking'
  id: string
  text: string
}

/** SubAgentFullscreen(및 향후 재사용처)이 순서대로 렌더하면 되는 채팅 아이템. */
export type SubagentChatItem =
  | SubagentTaskItem
  | SubagentToolItem
  | SubagentTextItem
  | SubagentThinkingItem

/** transcript 'tool' 항목 → SubagentToolItem (누락 필드는 안전 기본값). */
function toToolItem(entry: SubAgentTranscriptItem, idx: number): SubagentToolItem {
  return {
    kind: 'tool',
    id: entry.id ?? `tool-${idx}`,
    verb: entry.verb ?? '',
    target: entry.target ?? '',
    status: entry.status ?? 'running',
  }
}

/**
 * buildSubagentChatItems — SubAgentInfo → SubagentChatItem[] (시간순, 역할별).
 *
 * agent가 null/undefined인 경우는 호출부(컴포넌트)가 처리 — 이 함수는 SubAgentInfo 1개를
 * 받는다는 전제(컴포넌트의 `if (!agent) return null` 이후 호출).
 */
export function buildSubagentChatItems(agent: SubAgentInfo): SubagentChatItem[] {
  const items: SubagentChatItem[] = []

  if (agent.role && agent.role.trim().length > 0) {
    items.push({ kind: 'task', id: 'task', text: agent.role })
  }

  const transcript = agent.transcript ?? []

  transcript.forEach((entry, idx) => {
    if (entry.kind === 'tool') {
      items.push(toToolItem(entry, idx))
      return
    }

    // entry.kind는 이제 'text' | 'thinking'.
    const kind = entry.kind
    const text = entry.text ?? ''
    const last = items[items.length - 1]

    if (last !== undefined && last.kind === kind) {
      // 직전 항목과 같은 kind(연속 delta) → 새 버블 만들지 않고 이어붙임.
      items[items.length - 1] = { kind: last.kind, id: last.id, text: last.text + text }
      return
    }

    items.push(
      kind === 'text'
        ? { kind: 'text', id: `text-${idx}`, text }
        : { kind: 'thinking', id: `thinking-${idx}`, text }
    )
  })

  // 최종 답변(activity) — 병합까지 끝난 마지막 text 버블과 다를 때만, 항상 새 항목으로 추가.
  // (raw transcript의 마지막 조각이 아니라 "병합된 결과"와 비교해야 델타 쪼개짐과 무관하게
  //  정확히 중복 판정된다 — 통합 시나리오 테스트가 이 지점을 고정한다.)
  const lastItem = items[items.length - 1]
  const lastMergedText = lastItem?.kind === 'text' ? lastItem.text : undefined
  const finalAnswer =
    agent.activity && agent.activity.trim() && agent.activity !== lastMergedText
      ? agent.activity
      : ''
  if (finalAnswer) {
    items.push({ kind: 'text', id: 'final', text: finalAnswer })
  }

  return items
}

/** items 중 'task'(위임 프롬프트)를 제외하고 실질적인 대화 내용이 있는지. */
export function hasSubagentConversation(items: SubagentChatItem[]): boolean {
  return items.some((it) => it.kind !== 'task')
}

/**
 * SubagentRenderGroup — 인접한 'tool' 아이템을 하나의 런(run)으로 묶은 렌더 단위
 * (영호 지시 2026-07-04: 멀티패널 문법 이식 — 도구 이력 구조화).
 *
 * 목적: 도구 호출이 연달아 발생하면(예: read → read → bash) 화면에 개별 행이 뿔뿔이
 * 흩어지는 대신, 본 채팅이 이미 쓰는 ToolGroup.css `.toollog` 관례(연속 도구를 한
 * 시각 묶음으로)를 SubAgentFullscreen도 그대로 재사용할 수 있게 인접 tool만 순서
 * 보존한 채 그룹핑한다. task/text/thinking은 그룹핑 대상이 아니다(단일 항목 그대로 통과).
 *
 * CRITICAL: 순수 함수 — 부수효과 0. items 순서/내용 불변(재배열 없음, 인접 tool만 합침).
 */
export type SubagentRenderGroup =
  | { kind: 'toolgroup'; id: string; tools: SubagentToolItem[] }
  | { kind: 'single'; item: Exclude<SubagentChatItem, SubagentToolItem> }

export function groupSubagentToolRuns(items: SubagentChatItem[]): SubagentRenderGroup[] {
  const groups: SubagentRenderGroup[] = []

  for (const item of items) {
    if (item.kind === 'tool') {
      const last = groups[groups.length - 1]
      if (last?.kind === 'toolgroup') {
        last.tools.push(item)
      } else {
        groups.push({ kind: 'toolgroup', id: `tg-${item.id}`, tools: [item] })
      }
      continue
    }
    groups.push({ kind: 'single', item })
  }

  return groups
}
