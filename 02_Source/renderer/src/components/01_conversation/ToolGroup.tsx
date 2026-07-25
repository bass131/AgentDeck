/**
 * ToolGroup.tsx — toolgroup ThreadItem 1개 래퍼.
 *
 * Phase A-2: 원본 AgentCodeGUI Chat.tsx:260-306 미러.
 * 인터리브 thread에서 toolgroup 항목을 렌더링한다.
 *
 * props:
 *   group — Extract<ThreadItem, {kind:'toolgroup'}> (tools 배열 포함)
 *   lead  — true면 Claude 아바타 + 이름 헤더 표시 (직전 항목이 AI 블록이 아닐 때)
 *   fileDiffs — Phase B diff 표시용 Record (ToolCallCard에 전달)
 *
 * CRITICAL: 이모지 아이콘 0. 인라인 색상 0(CSS 변수 토큰). 부수효과 0.
 */
import { memo, type JSX } from 'react'
import type { ThreadItem } from '../../store/threadTypes'
import type { FileDiffEntry } from '../../store/reducer'
import { ToolCallCard } from './ToolCallCard'
import { IconClaude } from '../common/icons'
import './ToolGroup.css'

export interface ToolGroupProps {
  /** toolgroup ThreadItem */
  group: Extract<ThreadItem, { kind: 'toolgroup' }>
  /**
   * true면 Claude 아바타 + 이름 헤더를 표시.
   * 원본: 직전 항목이 AI 블록(assistant msg / toolgroup)이 아닐 때 lead=true.
   */
  lead?: boolean
  /** Phase B: 파일 diff 요약+라인 Record (toolId 키) */
  fileDiffs: Record<string, FileDiffEntry>
  /** GAP1 P09: 현재 runId — BackgroundTaskView 정지 IPC 대상(ToolCallCard에 전달). */
  runId?: string
  /**
   * TG1 아바타 감사 봉합: true면 lead=true여도 자신의 아바타+이름 헤더(.lead-ava/.lead-meta)
   * 를 렌더하지 않는다 — ThinkingItem·MessageBubble의 bare 게이트(TG1 P03/P06)와 동형 패턴.
   * 단일챗(Conversation.tsx)에서 ToolGroup은 항상 턴 블록(.turn-body) 내부에 있고, 그 턴
   * 블록 헤더가 이미 아바타 1개를 그리므로 ToolGroup 자신의 lead 헤더가 중복 노출된다
   * (턴이 도구/사고로 열릴 때 lead=true가 되어 .turn-block-ava와 .lead-ava가 동시 노출 —
   * "한 턴 = 한 블록 = 아바타 1개" 위반). 기본 false = 기존 외관 그대로(하위호환 — 이 prop을
   * 넘기지 않는 잠재적 호출부는 회귀 0).
   */
  bare?: boolean
}

/**
 * ToolGroup — toolgroup 1개를 래핑한다.
 *
 * 원본 Chat.tsx:260-306의 ToolGroup 컴포넌트를 우리 ToolCard 타입으로 변환.
 * tools가 비어 있으면 null 반환.
 */
export const ToolGroup = memo(function ToolGroup({ group, lead, fileDiffs, runId, bare = false }: ToolGroupProps): JSX.Element | null {
  if (group.tools.length === 0) return null

  const showLeadHeader = lead && !bare

  return (
    <div className={'toollog' + (showLeadHeader ? ' lead' : '')}>
      {showLeadHeader && (
        <>
          <div className="ava ai lead-ava" aria-hidden="true">
            <IconClaude size={16} />
          </div>
          <div className="lead-meta">
            <span className="name">Claude</span>
          </div>
        </>
      )}
      {group.tools.map((card) => (
        <ToolCallCard key={card.id} card={card} fileDiffs={fileDiffs} runId={runId} />
      ))}
    </div>
  )
})

export default ToolGroup
