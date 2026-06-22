/**
 * ToolCallCard.tsx — 도구 호출 행 (F3-03 `.t-row` 구조).
 *
 * 아이콘(종류 색) + verb → target → result. 클릭 시 상세(입력/결과) 접이식(.bo-block).
 * 종류/대상은 lib/toolKind.ts에서 파생(store ToolCard는 name/input/result만).
 *
 * 색은 종류별 토큰. 이모지 0(벡터 아이콘).
 */
import { useState, memo, type JSX } from 'react'
import type { ToolCard } from '../store/reducer'
import { toolMetaFor, toolTarget, type ToolKind } from '../lib/toolKind'
import { IconEye, IconPencil, IconBolt, IconSearch, IconFile, IconSpark, IconChevRight } from './icons'
import type { IconProps } from './icons'
import './ToolCallCard.css'

const KIND_ICON: Record<ToolKind, (p: IconProps) => JSX.Element> = {
  read: IconEye,
  write: IconPencil,
  edit: IconPencil,
  bash: IconBolt,
  search: IconSearch,
  web: IconSearch,
  mcp: IconSpark,
  other: IconFile,
}

function detailText(v: unknown): string {
  if (v === undefined || v === null) return ''
  return typeof v === 'string' ? v : JSON.stringify(v, null, 2)
}

function ToolCallCardInner({ card }: { card: ToolCard }): JSX.Element {
  const { kind, verb, color } = toolMetaFor(card.name)
  const target = toolTarget(card.input)
  const Icon = KIND_ICON[kind]
  const [open, setOpen] = useState(false)

  const hasDetail = card.input !== undefined || card.result !== undefined
  const resultText = detailText(card.result)

  return (
    <div className={`t-item t-${kind} t-${card.status}`}>
      <button
        type="button"
        className={`t-row${hasDetail ? ' openable' : ''}`}
        onClick={() => hasDetail && setOpen((v) => !v)}
        aria-expanded={hasDetail ? open : undefined}
        aria-label={`${verb} ${target}`}
      >
        <span className="t-ic" style={{ color }} aria-hidden="true">
          <Icon size={14} />
        </span>
        <span className="t-verb">{verb}</span>
        {target && <span className="t-sep" aria-hidden="true">·</span>}
        {target && <span className="t-target">{target}</span>}
        <span className="t-res">
          {card.status === 'running' ? (
            <span className="t-spin" aria-label="실행중" />
          ) : card.status === 'error' ? (
            <span className="t-res-err">오류</span>
          ) : hasDetail ? (
            <span className="t-chev" aria-hidden="true">
              <IconChevRight size={12} />
            </span>
          ) : null}
        </span>
      </button>

      {open && hasDetail && (
        <div className="bo-block">
          {card.input !== undefined && (
            <pre className="bo-log mono">{detailText(card.input)}</pre>
          )}
          {resultText && <pre className="bo-log mono bo-res">{resultText}</pre>}
        </div>
      )}
    </div>
  )
}

export const ToolCallCard = memo(ToolCallCardInner)
export default ToolCallCard
