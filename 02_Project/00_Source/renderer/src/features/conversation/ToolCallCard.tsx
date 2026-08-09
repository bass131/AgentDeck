import { useState, useEffect, memo, type JSX } from 'react'
import type { ToolCard, FileDiffEntry } from '../../store/reducer'
import { toolMetaFor, toolTarget, type ToolKind } from '../../lib/toolKind'
import { languageFromPath } from '../../lib/readLanguage'
import { IconEye, IconPencil, IconBolt, IconSearch, IconFile, IconSpark, IconChevRight, IconGitBranch } from '../../components/common/icons'
import type { IconProps } from '../../components/common/icons'
import { DiffViewer } from '../../features/viewer'
import { CodeViewer } from '../../features/viewer'
import { SearchResultView } from './SearchResultView'
import { BackgroundTaskView } from './BackgroundTaskView'
import './ToolCallCard.css'

function BashOutput({ card }: { card: ToolCard }): JSX.Element | null {
  const output = typeof card.result === 'string' ? card.result : null
  const failed = card.status === 'error'
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (failed) setOpen(true)
  }, [failed])

  if (!output) return null

  const lines = output.split('\n')
  const last = [...lines].reverse().find((l) => l.trim()) ?? ''

  const errLine = (ln: string): boolean =>
    failed && /(^|\s)(error|err!|fatal|exception|failed)\b/i.test(ln)

  if (!open) {
    return (
      <div className="bo-ghost" onClick={() => setOpen(true)}>
        <span className="bo-tick">└</span>
        <span className={'bo-pv' + (failed ? ' err' : '')}>{last}</span>
        <span className="bo-n">— {lines.length}줄</span>
      </div>
    )
  }

  const copy = (): void => {
    navigator.clipboard
      ?.writeText(output)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      })
      .catch(() => {})
  }

  return (
    <div className={'bo-block' + (failed ? ' fail' : '')}>
      <div className="bo-log scroll">
        {lines.map((ln, i) => (
          <div key={i} className={'bo-ln' + (errLine(ln) ? ' err' : '')}>
            {ln || ' '}
          </div>
        ))}
      </div>
      <div className="bo-foot">
        <span>{lines.length}줄</span>
        <span className="bo-sp" />
        <button className={copied ? 'bo-copied' : ''} onClick={copy}>
          {copied ? '복사됨' : '복사'}
        </button>
        <button onClick={() => setOpen(false)}>접기</button>
      </div>
    </div>
  )
}

const KIND_ICON: Record<ToolKind, (p: IconProps) => JSX.Element> = {
  read: IconEye,
  write: IconPencil,
  edit: IconPencil,
  bash: IconBolt,
  search: IconSearch,
  web: IconSearch,
  mcp: IconSpark,
  git: IconGitBranch,
  other: IconFile,
}

function detailText(v: unknown): string {
  if (v === undefined || v === null) return ''
  return typeof v === 'string' ? v : JSON.stringify(v, null, 2)
}

const FILE_EDIT_KINDS = new Set<ToolKind>(['edit', 'write'])

interface ToolCallCardProps {
  card: ToolCard
  fileDiffs?: Record<string, FileDiffEntry>
  targetOverride?: string
  runId?: string
}

function ToolCallCardInner({ card, fileDiffs = {}, targetOverride, runId }: ToolCallCardProps): JSX.Element {
  const { kind, verb, color } = toolMetaFor(card.name)
  const target = targetOverride ?? toolTarget(card.input)
  const Icon = KIND_ICON[kind]
  const [open, setOpen] = useState(false)

  const isFileEdit = FILE_EDIT_KINDS.has(kind)
  const diffEntry = isFileEdit ? fileDiffs[card.id] : undefined

  const hasBgTask = card.bgTask !== undefined

  const isBash = kind === 'bash'
  const hasBashOutput = isBash && !hasBgTask && card.status !== 'running' && typeof card.result === 'string' && card.result.length > 0

  const hasDetail = card.input !== undefined || card.result !== undefined
  const resultText = detailText(card.result)

  const isReadKind = kind === 'read'
  const showReadCode =
    isReadKind && card.status !== 'error' && typeof card.result === 'string' && card.result.length > 0
  const readLanguage = showReadCode ? languageFromPath(target) : 'text'

  const sr = card.searchResult
  const searchRender =
    sr !== undefined && ((sr.matches?.length ?? 0) > 0 || (sr.files?.length ?? 0) > 0)
      ? sr
      : undefined

  return (
    <div className={`t-item t-${kind} t-${card.status}`}>
      <button
        type="button"
        className={`t-row${hasDetail && !hasBashOutput ? ' openable' : ''}`}
        onClick={() => hasDetail && !hasBashOutput && setOpen((v) => !v)}
        aria-expanded={hasDetail && !hasBashOutput ? open : undefined}
        aria-label={`${verb} ${target}`}
      >
        <span className="t-ic" style={{ color }} aria-hidden="true">
          <Icon size={14} />
        </span>
        <span className="t-verb">{verb}</span>
        {card.background === true && (
          <span className="t-bg-badge" data-testid="bg-badge">백그라운드</span>
        )}
        {target && <span className="t-sep" aria-hidden="true">·</span>}
        {target && <span className="t-target">{target}</span>}
        <span className="t-res">
          {card.status === 'running' ? (
            <span className="t-spin" aria-label="실행중" />
          ) : hasBashOutput ? (
            null
          ) : card.status === 'error' ? (
            <span className="t-res-err">오류</span>
          ) : diffEntry ? (
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

      {card.bgTask && <BackgroundTaskView bgTask={card.bgTask} runId={runId} />}

      {hasBashOutput && <BashOutput card={card} />}

      {!hasBashOutput && open && hasDetail && (
        <div className="bo-block">
          {diffEntry ? (
            <DiffViewer filePath={target} lines={diffEntry.lines} />
          ) : searchRender ? (
            <>
              {card.input !== undefined && (
                <pre className="bo-log mono">{detailText(card.input)}</pre>
              )}
              <SearchResultView result={searchRender} />
            </>
          ) : showReadCode ? (
            <>
              {card.input !== undefined && (
                <pre className="bo-log mono">{detailText(card.input)}</pre>
              )}
              <div className="t-code-viewer">
                <CodeViewer content={card.result as string} language={readLanguage} />
              </div>
            </>
          ) : (
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
