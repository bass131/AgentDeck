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
}

/**
 * ToolGroup — toolgroup 1개를 래핑한다.
 *
 * 원본 Chat.tsx:260-306의 ToolGroup 컴포넌트를 우리 ToolCard 타입으로 변환.
 * tools가 비어 있으면 null 반환.
 */
export const ToolGroup = memo(function ToolGroup({ group, lead, fileDiffs }: ToolGroupProps): JSX.Element | null {
  if (group.tools.length === 0) return null

  return (
    <div className={'toollog' + (lead ? ' lead' : '')}>
      {lead && (
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
        <ToolCallCard key={card.id} card={card} fileDiffs={fileDiffs} />
      ))}
    </div>
  )
})

export default ToolGroup
