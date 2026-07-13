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
 * W7(Phase 36): BashOutput 카드 추가 — bash 도구 결과를 고스트/자동펼침/error틴트/복사 카드로 표시.
 * - 원본 AgentCodeGUI Chat.tsx L198-248 미러.
 * - 접힘(고스트): 마지막 비공백 줄 + "— n줄".
 * - 자동펼침: failed(status error)일 때만.
 * - error 틴트: failed일 때만(.bo-ln.err). 성공 출력 무채색.
 * - error regex: /(^|\\s)(error|err!|fatal|exception|failed)\\b/i (원본 L220 정밀).
 * - 복사 버튼 → clipboard + "복사됨" 1.2s.
 * - ToolCard 타입/toolgroup 구조 불변 — 표시 레이어만.
 *
 * 색은 종류별 토큰. 이모지 0(벡터 아이콘). 인라인 색상 0(CSS 변수 토큰만).
 */
import { useState, useEffect, memo, type JSX } from 'react'
import type { ToolCard, FileDiffEntry } from '../../store/reducer'
import { toolMetaFor, toolTarget, type ToolKind } from '../../lib/toolKind'
import { languageFromPath } from '../../lib/readLanguage'
import { IconEye, IconPencil, IconBolt, IconSearch, IconFile, IconSpark, IconChevRight } from '../common/icons'
import type { IconProps } from '../common/icons'
import { DiffViewer } from '../03_viewer/DiffViewer'
import { CodeViewer } from '../03_viewer/CodeViewer'
import './ToolCallCard.css'

// ── BashOutput 카드 (W7 — 원본 Chat.tsx L198-248 미러) ────────────────────────

/**
 * BashOutput — bash 도구 결과를 고스트/자동펼침 카드로 표시.
 *
 * 접힘(고스트): 마지막 비공백 줄("└ {last} — n줄") + 클릭으로 펼침.
 * 자동펼침: failed(status error)일 때만.
 * error 틴트: failed일 때만 → 성공 출력은 무채색(원본 주석 미러).
 * error regex: /(^|\s)(error|err!|fatal|exception|failed)\b/i (원본 L220 정밀).
 * 복사: navigator.clipboard.writeText → "복사됨" 1.2s.
 *
 * CRITICAL: BashOutput 상태(open/copied)는 로컬. ToolCard 구조 불변(prop만 사용).
 */
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
  // 마지막 비공백 줄 (원본 reverse().find(l=>l.trim()) 미러)
  const last = [...lines].reverse().find((l) => l.trim()) ?? ''

  // error 라인 판별 (원본 L220 정밀): failed일 때만 + regex 적용
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

// ── KIND_ICON ─────────────────────────────────────────────────────────────────

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
  /**
   * target 문자열 직접 지정 — 기본은 toolTarget(card.input) 파생.
   * FB1 P06: SubAgentFullscreen이 이 카드를 재사용할 때 쓴다. 서브에이전트 도구 행
   * (SubagentChatItem)은 이미 정규화된 verb/target만 가지고 있고 raw input이 없어서
   * (SubAgentTool/SubAgentTranscriptItem 스키마 — shared/agent-events.ts) 기존 파생이
   * 불가능하다. 미지정 시 기존 동작 그대로(회귀 0).
   */
  targetOverride?: string
}

function ToolCallCardInner({ card, fileDiffs = {}, targetOverride }: ToolCallCardProps): JSX.Element {
  const { kind, verb, color } = toolMetaFor(card.name)
  const target = targetOverride ?? toolTarget(card.input)
  const Icon = KIND_ICON[kind]
  const [open, setOpen] = useState(false)

  // Phase B: 파일 편집 도구 + 해당 도구의 diff 있을 때 DiffViewer 모드.
  // 키 = card.id(tool_use id) — file_changed.toolId와 매칭. path는 워크스페이스 상대
  // POSIX라 절대경로 target과 키가 어긋나므로 toolId로 정확 연결.
  const isFileEdit = FILE_EDIT_KINDS.has(kind)
  const diffEntry = isFileEdit ? fileDiffs[card.id] : undefined

  // W7: bash 도구이고 결과가 있으면 BashOutput 카드 표시(done/error 모두)
  // running 상태는 기존 .t-spin 표시 유지
  const isBash = kind === 'bash'
  const hasBashOutput = isBash && card.status !== 'running' && typeof card.result === 'string' && card.result.length > 0

  const hasDetail = card.input !== undefined || card.result !== undefined
  const resultText = detailText(card.result)

  // GAP1 P01a: Read 도구 결과 → CodeViewer(CodeMirror 6 구문강조) 재사용.
  // 판별: kind='read' + result가 원본 문자열(비-문자열이면 detailText가 JSON.stringify한
  // 값이라 코드 원문이 아님) + status!=='error'(오류 메시지는 코드가 아님) + 비어있지 않음.
  // 판별 실패 시 아래 JSON pre 폴백 그대로 유지(렌더 깨짐 0).
  const isReadKind = kind === 'read'
  const showReadCode =
    isReadKind && card.status !== 'error' && typeof card.result === 'string' && card.result.length > 0
  const readLanguage = showReadCode ? languageFromPath(target) : 'text'

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
        {target && <span className="t-sep" aria-hidden="true">·</span>}
        {target && <span className="t-target">{target}</span>}
        <span className="t-res">
          {card.status === 'running' ? (
            <span className="t-spin" aria-label="실행중" />
          ) : hasBashOutput ? (
            // W7: bash 결과 있으면 BashOutput 카드로 표시 → 헤더 우측 표시 없음
            null
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

      {/* W7: bash 결과 → BashOutput 카드 */}
      {hasBashOutput && <BashOutput card={card} />}

      {/* 기존 접이식 상세 (bash 제외) */}
      {!hasBashOutput && open && hasDetail && (
        <div className="bo-block">
          {diffEntry ? (
            // Phase B: diff 있는 파일 편집 → DiffViewer (기존 JSON 대신)
            <DiffViewer filePath={target} lines={diffEntry.lines} />
          ) : showReadCode ? (
            // GAP1 P01a: Read 결과 → CodeViewer(구문강조). input은 기존과 동일하게 위에 표시.
            <>
              {card.input !== undefined && (
                <pre className="bo-log mono">{detailText(card.input)}</pre>
              )}
              <div className="t-code-viewer">
                <CodeViewer content={card.result as string} language={readLanguage} />
              </div>
            </>
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
