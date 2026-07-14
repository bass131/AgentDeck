/**
 * SubAgentChatStream.tsx — 서브에이전트 대화 스트림 공용 조각 (GAP1 P14 sub-B 추출).
 *
 * SubAgentFullscreen.tsx의 본문(패널 3단 셸 .ma-p-body/.ma-p-thread/.ma-p-messages +
 * task/tool/thinking/text 채팅 렌더 + 진행중/빈 대화 표시)을 그대로 들어낸 것 —
 * 풀스크린 상세와 스플릿 그리드 셀(SubAgentCell)이 같은 시각 문법을 공유하기 위한
 * 단일 소유 지점이다. DOM 구조·클래스는 추출 전 풀스크린과 문자 그대로 동일
 * (subagent-fullscreen.test.tsx가 풀스크린 쪽 회귀를, subagent-cell.test.tsx SC1이
 * 조각 단독 계약을 잠근다 — .saf-msg--* · .toollog · .ma-p-messages.saf-convo).
 *
 * 렌더 규칙(원본 주석 계승 — FB1 P06 / 영호 지시 2026-07-04):
 *   - task(위임 프롬프트)/text(응답) → 01_conversation/MessageBubble.tsx 재사용.
 *     user 역할 버블은 name="작업", assistant 역할 버블은 name=displayName(?? name).
 *   - tool → 01_conversation/ToolCallCard.tsx. SubAgentTranscriptItem은 정규화된
 *     verb/target/status만 보존하고 raw input/result가 없어(shared/agent-events.ts —
 *     P14 함정: raw 표시 시도 금지) targetOverride로 주입.
 *   - 인접 tool은 lib/subagentChat.ts groupSubagentToolRuns()로 런 그룹핑 →
 *     본 채팅 ToolGroup.css `.toollog` 재사용.
 *   - thinking → saf-* 전용 마크업(과거 기록 — ThinkingItem 애니메이션은 거짓 신호라
 *     부적합). 텍스트는 도착 데이터 그대로(어댑터 90자 cap 유지 — P14 (e) 기각 확정,
 *     어댑터·shared 무접촉).
 *   - 마지막 text + status=running → SmoothMarkdown 스트리밍 커서(본 채팅과 동형).
 *   - [P14 sub-C 항목 7 — 허용된 최소 수정] tail-follow: 새 조각(items 변경) 도착 시
 *     스크롤 컨테이너(.ma-p-thread) 하단 추종. 사용자가 위로 스크롤하면 해제, 바닥
 *     근처(40px — Conversation isScrolledUp 관례) 복귀 시 재개. 스플릿 셀의 "Split
 *     Terminal 느낌" 실질이며 풀스크린도 동일 혜택. 셀(SubAgentCell) freeze 중엔 이
 *     조각이 재렌더되지 않아 effect도 안 돌므로 자연히 정지(추가 분기 불요).
 *
 * CSS 소유: .saf-msg--* 및 .saf-running은 SubAgentFullscreen.css 소유(전역 셀렉터 —
 * .saf-panel 스코프 아님)를 그대로 둔다 — 스타일 무이동 추출로 시각 회귀 0
 * (trade-off: 파일명과 소유의 불일치 감수, 아래 직접 import로 자기문서화).
 * 셀이 풀스크린 없이 단독 마운트돼도 성립하도록 소비 CSS는 전부 직접 import
 * (전이 로드 의존 방어 — reviewer 🟡 2026-07-04 관례 계승). .ag-empty/.spin은
 * AgentPanel.css 소유 — 같은 이유로 직접 import.
 *
 * CRITICAL(ADR-003): 'Agent'/'Task'/'Workflow' 리터럴 0 — 중립 표현만.
 * CRITICAL: renderer untrusted — window.api/fs/Node 직접 0. 인라인 색상 0(토큰만).
 * CSS 주석 trap: 블록 주석 안에 별-슬래시 없음.
 */
import { useEffect, useMemo, useRef, type JSX } from 'react'
import type { SubAgentInfo } from '../../lib/agentSampleData'
import {
  buildSubagentChatItems,
  hasSubagentConversation,
  groupSubagentToolRuns,
  type SubagentToolItem,
} from '../../lib/subagentChat'
import { isScrolledUp } from '../../lib/scrollHelpers'
import { MessageBubble } from '../01_conversation/MessageBubble'
import { ToolCallCard } from '../01_conversation/ToolCallCard'
import type { ToolCard, ToolCardStatus } from '../../store/reducer'
import '../00_shell/MultiWorkspace.css'
// reviewer 🟡(2026-07-04): .toollog는 이 파일이 직접 소비 — Conversation→ToolGroup 전이
// 로드에 의존하지 않도록 직접 import로 방어·자기문서화(SubAgentFullscreen에서 계승).
import '../01_conversation/ToolGroup.css'
// .saf-msg--* 및 .saf-running 스타일 소유 파일(위 CSS 소유 주석 참조).
import './SubAgentFullscreen.css'
// .ag-empty(빈 대화)/.spin(진행중 스피너) 소유 — 전이 로드 의존 방어.
import './AgentPanel.css'

/** SubAgentInfo.status → 한국어 라벨 (헤더 pill 공용 — 풀스크린/셀 양쪽 소비). */
export const SA_STATUS_LABEL: Record<SubAgentInfo['status'], string> = {
  queued: '대기 중',
  running: '실행 중',
  done: '완료',
}

/** SubAgentInfo.status → 패널 문법(.ma-p-dot/.ma-status) cls 접미사.
 *  PanelView.liveStatus 매핑과 동형: running→working(패널의 "작업 중" 색), done→done,
 *  queued는 접미사 없음(두 클래스 모두 기본값이 이미 중립 회색이라 별도 cls 불필요). */
export function panelStatusCls(status: SubAgentInfo['status']): string {
  if (status === 'running') return 'working'
  if (status === 'done') return 'done'
  return ''
}

/** tool 채팅 아이템 → ToolCallCard가 요구하는 ToolCard 셰이프로 최소 변환(shim). */
function toShimToolCard(item: SubagentToolItem): ToolCard {
  // ToolCardStatus엔 'queued'가 없음(SubAgentTool엔 있음) — 시각적으로는 running과
  // 동일하게 취급(스피너)해도 무해: 리듀서가 실제로 'queued'를 만드는 경로가 없다
  // (reducer/tool.ts handleToolCall은 자식 tool을 항상 'running'으로 생성).
  const status: ToolCardStatus = item.status === 'queued' ? 'running' : item.status
  return { id: item.id, name: item.verb, input: undefined, status }
}

/**
 * SubAgentChatStream — transcript → 채팅 스트림(패널 3단 셸 포함) 렌더.
 * agent는 non-null 전제(호출부가 guard) — store가 라이브 갱신하면 그대로 누적 표시.
 * 표시 전용: 부수효과 0, 셀별 입력/abort 없음(P14 비범위).
 */
export function SubAgentChatStream({ agent }: { agent: SubAgentInfo }): JSX.Element {
  const items = useMemo(() => buildSubagentChatItems(agent), [agent])
  // 인접 tool 런 그룹핑(세부화) — .toollog 재사용을 위한 렌더 전용 2차 변환.
  const groups = useMemo(() => groupSubagentToolRuns(items), [items])

  const hasConvo = hasSubagentConversation(items)
  // CP1 P07 displayName 소비 — 사람이 붙인 표시명 우선(name=subagent_type은 보존).
  const displayLabel = agent.displayName ?? agent.name

  // tail-follow(P14 항목 7) — 새 조각 도착 시 하단 추종. 사용자가 위로 스크롤하면
  // 해제(userScrolledUp ref — setState 없음, 스크롤 이벤트에 리렌더 0), 바닥 근처 복귀
  // 시 재개. BackgroundTaskView(항상 추종)와 달리 Conversation의 isScrolledUp 관례를
  // 계승해 위로 읽는 중엔 강제로 끌어내리지 않는다.
  const threadRef = useRef<HTMLDivElement | null>(null)
  const userScrolledUp = useRef(false)
  const handleScroll = (): void => {
    const el = threadRef.current
    if (!el) return
    userScrolledUp.current = isScrolledUp({
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
      clientHeight: el.clientHeight,
    })
  }
  useEffect(() => {
    const el = threadRef.current
    if (!el || userScrolledUp.current) return
    el.scrollTop = el.scrollHeight
  }, [items])

  // 마지막 text 아이템 id — 실행 중이면 그 버블만 스트리밍 커서 표시(본 채팅과 동형).
  let lastTextId: string | null = null
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].kind === 'text') {
      lastTextId = items[i].id
      break
    }
  }

  return (
    <div className="ma-p-body">
      <div className="ma-p-thread" ref={threadRef} onScroll={handleScroll}>
        <div className="ma-p-messages saf-convo">
          {groups.map((group) => {
            if (group.kind === 'toolgroup') {
              // 세부화 — 인접 도구 호출을 본 채팅과 동일한 .toollog 묶음으로.
              return (
                <div className="toollog" key={group.id}>
                  {group.tools.map((t) => (
                    <ToolCallCard key={t.id} card={toShimToolCard(t)} targetOverride={t.target} />
                  ))}
                </div>
              )
            }

            const item = group.item

            if (item.kind === 'task') {
              return (
                <div className="saf-msg saf-msg--task" key={item.id}>
                  <MessageBubble role="user" name="작업" content={item.text} />
                </div>
              )
            }

            if (item.kind === 'thinking') {
              // 재사용 불가 지점: 완료된 과거 기록이라 ThinkingItem(애니메이션 전제)은 부적합.
              return (
                <div className="saf-msg saf-msg--thinking" key={item.id}>
                  <div className="saf-msg-who">생각 중</div>
                  <div className="saf-msg-body">{item.text}</div>
                </div>
              )
            }

            // kind === 'text' — 서브에이전트 응답(중간 또는 최종 답변).
            // 마지막 text이면서 아직 실행 중이면 SmoothMarkdown(스트리밍 커서) 사용.
            const streaming = item.id === lastTextId && agent.status === 'running'
            return (
              <div className="saf-msg saf-msg--agent" key={item.id}>
                <MessageBubble role="assistant" name={displayLabel} content={item.text} streaming={streaming} />
              </div>
            )
          })}

          {/* 진행 중 표시 */}
          {agent.status === 'running' && (
            <div className="saf-running">
              <span className="spin" aria-hidden="true" />
              <span>서브에이전트가 작업 중…</span>
            </div>
          )}

          {/* 빈 대화 */}
          {!hasConvo && agent.status !== 'running' && (
            <div className="ag-empty">아직 대화가 없어요</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SubAgentChatStream
