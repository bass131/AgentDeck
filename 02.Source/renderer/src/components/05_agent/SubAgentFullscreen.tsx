/**
 * SubAgentFullscreen.tsx — 서브에이전트 풀스크린 상세 = 하위 채팅 세션 뷰 (F-E, FB1 P06).
 *
 * 사용자 요구: SubAgent 클릭 → 상세를 Claude Code CLI처럼 **채팅 대화 형태**로.
 *  - 작업 지시(role)를 대화 시작 메시지로(위임 프롬프트, user 역할).
 *  - 서브에이전트의 흐름(transcript: 사고/텍스트/도구)을 채팅 메시지로 순서대로.
 *  - 최종 답변(activity, reducer가 정제)을 마지막 에이전트 메시지로(raw JSON 아님).
 *  - 라이브: 부모가 store에서 id로 조회한 agent를 prop으로 넘겨 transcript가 실시간 누적.
 *
 * FB1 P06: 순서/역할 매핑은 lib/subagentChat.ts(순수 함수, 단위 테스트됨)로 뽑아내고,
 * 렌더링은 본 채팅 컴포넌트를 최대한 재사용한다 — 새 시각 문법 발명 최소화.
 *   - task(위임 프롬프트)/text(응답) → 01_conversation/MessageBubble.tsx(원래 Conversation.tsx
 *     안에 있었으나 이 재사용을 위해 별도 파일로 추출 — 순환참조 회피, 아래 참조).
 *     user 역할 버블은 name="작업"으로 오버라이드(기본 '나' 라벨이 부적절 — 실제 사람이
 *     아니라 상위 에이전트의 위임 지시). assistant 역할 버블은 name=agent.name으로 오버라이드
 *     (하드코딩 'Claude'가 아니라 실제 서브에이전트 이름 — 하위 세션 구분의 핵심 장치).
 *   - tool(도구 호출) → 01_conversation/ToolCallCard.tsx. 서브에이전트 도구 데이터
 *     (SubAgentTranscriptItem)는 이미 정규화된 verb/target만 있고 raw input/result가
 *     없어(shared/agent-events.ts) toolTarget() 파생이 안 되므로 targetOverride로 주입.
 *     같은 이유로 입력/결과 접이식 상세·diff는 재사용 불가(데이터 자체가 없음 — 새 IPC로
 *     result를 태우는 건 이 Phase 범위 밖, 필요 시 별도 escalate 대상).
 *   - thinking(사고) → 기존 saf-* 전용 마크업 유지(재사용 불가 지점): 메인 채팅의
 *     ThinkingItem은 "현재 진행 중" 애니메이션(점 3개)을 전제하는데, 서브에이전트
 *     transcript의 thinking은 이미 끝난 과거 기록이라 애니메이션을 붙이면 거짓 신호.
 *
 * 하위 세션 구분(본 채팅과 혼동 방지, 기존 토큰만): 헤더(saf-head: 이름/역할/상태),
 * 위임 프롬프트 버블의 보라 강조(--ultracode/--ultracode-soft — 기존에도 쓰이던 토큰),
 * assistant 버블 라벨이 'Claude'가 아니라 서브에이전트 이름.
 *
 * FullscreenOverlay(P-4 공통셸) 재사용 — 블러/Esc/바깥클릭 제공.
 * CRITICAL(ADR-003): 'Agent'/'Task'/'Workflow' 리터럴 0 — 중립 표현만.
 * CRITICAL: renderer untrusted — window.api/fs/Node 직접 0. 인라인 색상 0(토큰만).
 * CSS 주석 trap: 블록 주석 안에 별-슬래시 없음.
 */
import { useMemo, type JSX } from 'react'
import type { SubAgentInfo } from '../../lib/agentSampleData'
import { buildSubagentChatItems, hasSubagentConversation, type SubagentChatItem } from '../../lib/subagentChat'
import { modelLabel } from '../../lib/modelLabel'
import { FullscreenOverlay } from '../common/FullscreenOverlay'
import { IconCheck, IconSearch, IconFile, IconBot } from '../common/icons'
import { MessageBubble } from '../01_conversation/MessageBubble'
import { ToolCallCard } from '../01_conversation/ToolCallCard'
import type { ToolCard, ToolCardStatus } from '../../store/reducer'
import './SubAgentFullscreen.css'

const SA_STATUS_LABEL: Record<SubAgentInfo['status'], string> = {
  queued: '대기 중',
  running: '실행 중',
  done: '완료',
}

function saIcon(name: string, size: number): JSX.Element {
  const n = name.toLowerCase()
  if (n.includes('explore') || n.includes('search') || n.includes('탐색'))
    return <IconSearch size={size} />
  if (n.includes('verify') || n.includes('test') || n.includes('검증'))
    return <IconCheck size={size} />
  if (n.includes('build') || n.includes('구현') || n.includes('code') || n.includes('file'))
    return <IconFile size={size} />
  return <IconBot size={size} />
}

/** tool 채팅 아이템 → ToolCallCard가 요구하는 ToolCard 셰이프로 최소 변환(shim). */
function toShimToolCard(item: Extract<SubagentChatItem, { kind: 'tool' }>): ToolCard {
  // ToolCardStatus엔 'queued'가 없음(SubAgentTool엔 있음) — 시각적으로는 running과
  // 동일하게 취급(스피너)해도 무해: 리듀서가 실제로 'queued'를 만드는 경로가 없다
  // (reducer/tool.ts handleToolCall은 자식 tool을 항상 'running'으로 생성).
  const status: ToolCardStatus = item.status === 'queued' ? 'running' : item.status
  return { id: item.id, name: item.verb, input: undefined, status }
}

export function SubAgentFullscreen({
  agent,
  onClose,
}: {
  agent: SubAgentInfo | null
  onClose: () => void
}): JSX.Element | null {
  // Hooks는 조건부 return보다 위(React 규칙) — agent=null이면 빈 배열로 계산.
  const items = useMemo(() => (agent ? buildSubagentChatItems(agent) : []), [agent])

  if (!agent) return null

  const hasConvo = hasSubagentConversation(items)
  const title = agent.name + ' · ' + SA_STATUS_LABEL[agent.status]
  // FB2 P07 3단계: 원시 모델 ID(agent.model)를 표시 이름으로 병기(있을 때만, 미지 ID는 원문).
  const modelText = modelLabel(agent.model)
  // 마지막 text 아이템 인덱스 — 실행 중이면 그 버블만 스트리밍 커서 표시(본 채팅과 동형).
  let lastTextIdx = -1
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].kind === 'text') {
      lastTextIdx = i
      break
    }
  }

  return (
    <FullscreenOverlay onClose={onClose} title={title}>
      {/* 헤더 메타 — 아이콘 + 이름/역할/상태(하위 세션 식별의 1차 장치) */}
      <div className="saf-head">
        <span className={'saf-ic ' + agent.status}>{saIcon(agent.name, 22)}</span>
        <div className="saf-titles">
          <div className="saf-name">{agent.name}</div>
          {(agent.role || modelText) && (
            <div className="saf-role">
              {agent.role}
              {agent.role && modelText ? ' · ' : ''}
              {modelText}
            </div>
          )}
        </div>
        <span className={'saf-status-badge ' + agent.status}>
          {SA_STATUS_LABEL[agent.status]}
        </span>
      </div>

      {/* 채팅 대화 — 위임 프롬프트 → 도구/응답 흐름 → 최종 답변 (Claude Code CLI식) */}
      <div className="saf-convo">
        {items.map((item, idx) => {
          if (item.kind === 'task') {
            return (
              <div className="saf-msg saf-msg--task" key={item.id}>
                <MessageBubble role="user" name="작업" content={item.text} />
              </div>
            )
          }

          if (item.kind === 'tool') {
            return (
              <div className="saf-tool-slot" key={item.id}>
                <ToolCallCard card={toShimToolCard(item)} targetOverride={item.target} />
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
          const streaming = idx === lastTextIdx && agent.status === 'running'
          return (
            <div className="saf-msg saf-msg--agent" key={item.id}>
              <MessageBubble role="assistant" name={agent.name} content={item.text} streaming={streaming} />
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
    </FullscreenOverlay>
  )
}

export default SubAgentFullscreen
