/**
 * ToolCallCard.tsx — 도구 호출 행 (F3-03 `.t-row` 구조).
 *
 * 아이콘(종류 색) + verb → target → result. 클릭 시 상세(입력/결과) 접이식(.bo-block).
 * 종류/대상은 lib/toolKind.ts에서 파생(store ToolCard는 name/input/result만).
 *
 * Phase B: 파일 편집 도구(kind edit/write)일 때 fileDiffs[target]으로 DiffViewer 표시.
 * - fileDiffs: Conversation 또는 ToolCallCard 소비자에서 prop 주입 (단방향 — store → prop → view).
 * - diff 있으면 헤더에 "+add −del" 요약, 펼침에 DiffViewer.
 * - diff 없으면 기존 bo-log JSON 표시(회귀 0).
 *
 * 색은 종류별 토큰. 이모지 0(벡터 아이콘). 인라인 색상 0(CSS 변수 토큰만).
 */
import { useState, memo, type JSX } from 'react'
import type { ToolCard, FileDiffEntry } from '../store/reducer'
import { toolMetaFor, toolTarget, type ToolKind } from '../lib/toolKind'
import { IconEye, IconPencil, IconBolt, IconSearch, IconFile, IconSpark, IconChevRight } from './icons'
import type { IconProps } from './icons'
import { DiffViewer } from './DiffViewer'
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

/** 파일 편집 도구 kind — diff 표시 대상 */
const FILE_EDIT_KINDS = new Set<ToolKind>(['edit', 'write'])

interface ToolCallCardProps {
  card: ToolCard
  /**
   * 파일 경로 → diff 엔트리 Record.
   * Conversation에서 selectFileDiffs 셀렉터로 읽어 주입.
   * 미제공 시 빈 객체({})로 처리 — 기존 동작 유지(회귀 0).
   */
  fileDiffs?: Record<string, FileDiffEntry>
}

function ToolCallCardInner({ card, fileDiffs = {} }: ToolCallCardProps): JSX.Element {
  const { kind, verb, color } = toolMetaFor(card.name)
  const target = toolTarget(card.input)
  const Icon = KIND_ICON[kind]
  const [open, setOpen] = useState(false)

  // Phase B: 파일 편집 도구 + 해당 도구의 diff 있을 때 DiffViewer 모드.
  // 키 = card.id(tool_use id) — file_changed.toolId와 매칭. path는 워크스페이스 상대
  // POSIX라 절대경로 target과 키가 어긋나므로 toolId로 정확 연결.
  const isFileEdit = FILE_EDIT_KINDS.has(kind)
  const diffEntry = isFileEdit ? fileDiffs[card.id] : undefined

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
          ) : diffEntry ? (
            // Phase B: diff 요약 "+add −del" 표시
            <span className="t-diff-summary">
              <span className="t-diff-add">+{diffEntry.add}</span>
              {' '}
              <span className="t-diff-del">−{diffEntry.del}</span>
            </span>
          ) : hasDetail ? (
            <span className="t-chev" aria-hidden="true">
              <IconChevRight size={12} />
            </span>
          ) : null}
        </span>
      </button>

      {open && hasDetail && (
        <div className="bo-block">
          {diffEntry ? (
            // Phase B: diff 있는 파일 편집 → DiffViewer (기존 JSON 대신)
            <DiffViewer filePath={target} lines={diffEntry.lines} />
          ) : (
            // 기존 동작: input/result JSON 텍스트 표시
            <>
              {card.input !== undefined && (
                <pre className="bo-log mono">{detailText(card.input)}</pre>
              )}
              {resultText && <pre className="bo-log mono bo-res">{resultText}</pre>}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export const ToolCallCard = memo(ToolCallCardInner)
export default ToolCallCard
