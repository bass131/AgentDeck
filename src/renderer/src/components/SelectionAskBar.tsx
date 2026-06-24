/**
 * SelectionAskBar.tsx — CodeViewer CM6 선택 영역 부동 툴바 (W6b).
 *
 * CM6 선택 모델 기반 재구현 (원본 AgentCodeGUI는 DOM selection 기반).
 * - CM6 EditorView.state.selection.main (from/to offset)으로 선택 감지.
 * - EditorView.updateListener.of로 selectionSet 이벤트 구독.
 * - EditorView.coordsAtPos로 바 위치 계산.
 * - "질문" → onAskSelection(path, text, fromLine, toLine) 콜백.
 * - "복사" → navigator.clipboard.writeText.
 * - createPortal(document.body)로 오버레이 위에 표시.
 *
 * 신뢰경계: 선택 텍스트는 표시/composer 텍스트로만. eval/dangerouslySetInnerHTML 0.
 * IPC 0 — renderer-only.
 * 인라인 색상 0 — CSS 변수 토큰.
 * 안티슬롭: 네온/그라데이션/과한 애니 0.
 */
import { useState, useEffect, useRef, type JSX, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { EditorView } from '@codemirror/view'
import { IconCopy, IconCheck, IconBot } from './icons'

// ── 공개 타입 ──────────────────────────────────────────────────────────────────

export interface AskSelectionArgs {
  path: string
  text: string
  fromLine: number | null
  toLine: number | null
}

/** composer 주입 텍스트 포맷 빌더 (순수 함수, 테스트 가능). */
export function buildAskPayload(args: AskSelectionArgs): string {
  const { path, text, fromLine, toLine } = args
  const lineRef =
    fromLine !== null && toLine !== null
      ? `${path}:L${fromLine}-L${toLine}`
      : path
  return `\`${lineRef}\`\n\`\`\`\n${text}\n\`\`\`\n`
}

// ── 테스트 전용 선택 주입 타입 ──────────────────────────────────────────────────

interface TestSelection {
  from: number
  to: number
  text: string
}

// ── Props ──────────────────────────────────────────────────────────────────────

export interface SelectionAskBarProps {
  /**
   * CM6 EditorView ref.
   * null이면 바 비활성 (뷰 미생성 상태).
   */
  viewRef: React.RefObject<EditorView | null>
  /** 현재 파일 경로 (질문 컨텍스트용, 절대경로 X) */
  filePath?: string
  /** 선택질문 콜백 — CodeViewer → FileModal → Shell → Conversation */
  onAskSelection?: (args: AskSelectionArgs) => void
  /**
   * 테스트 전용: 선택 상태 직접 주입 (_testSelection).
   * undefined=뷰에서 읽기(실제), null=빈 선택(비표시), 객체=선택 있음.
   * production에서 절대 사용 금지.
   */
  _testSelection?: TestSelection | null
}

// ── SelectionAskBar ────────────────────────────────────────────────────────────

/**
 * CM6 선택 영역 부동 질문 툴바.
 *
 * 단방향 데이터 흐름:
 *   CM6 updateListener(selectionSet) → setSelInfo state → JSX 렌더
 *   "질문" click → onAskSelection(args) → 상위 콜백 체인
 *   "복사" click → navigator.clipboard.writeText
 *
 * 성능: updateListener는 EditorView 라이프사이클과 동기화.
 * 렌더: 선택 없으면 null (DOM 없음). 선택 있으면 portal(body).
 */
export function SelectionAskBar({
  viewRef,
  filePath = '',
  onAskSelection,
  _testSelection,
}: SelectionAskBarProps): JSX.Element | null {
  const [selInfo, setSelInfo] = useState<{
    text: string
    fromLine: number | null
    toLine: number | null
    x: number
    y: number
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  // CM6 updateListener 등록 — selectionSet 이벤트 감지
  useEffect(() => {
    // 테스트 전용 주입 모드: _testSelection이 명시적으로 전달된 경우
    if (_testSelection !== undefined) {
      if (_testSelection === null) {
        setSelInfo(null)
        return
      }
      const { text, from, to } = _testSelection
      const view = viewRef.current
      const fromLine = view ? view.state.doc.lineAt(from).number : null
      const toLine = view ? view.state.doc.lineAt(to).number : null
      const coords = view ? view.coordsAtPos(from) : { top: 100, left: 200 }
      setSelInfo({
        text,
        fromLine,
        toLine,
        x: coords ? coords.left : 200,
        y: coords ? coords.top : 100,
      })
      return
    }

    // 실제 CM6 updateListener 등록
    // EditorView.updateListener.of는 EditorView가 생성된 후에만 사용 가능.
    // viewRef.current가 준비될 때까지 폴링하지 않고,
    // CodeViewer가 view 생성 후 SelectionAskBar를 렌더하므로
    // mount 시점에 viewRef.current가 있다고 가정.
    // 없으면 리스너 미등록 (graceful).

    // updateListener는 EditorView 외부에서 동적 추가 불가 → view 재생성 필요.
    // 우리 CodeViewer는 content/language 변경 시 view 재생성하므로,
    // 여기서는 window selectionchange 이벤트로 폴백 (CM6 선택은 DOM selection과 동기화됨).
    // CM6 readOnly 모드에서 텍스트 선택 → DOM selectionchange → CM6 state.selection 동기.

    const onSelChange = (): void => {
      const view = viewRef.current
      if (!view) {
        setSelInfo(null)
        return
      }
      const { from, to } = view.state.selection.main
      if (from === to) {
        setSelInfo(null)
        return
      }

      // 선택 텍스트: CM6 doc.sliceString
      const text = (view.state.doc as unknown as { sliceString: (from: number, to: number) => string }).sliceString?.(from, to)?.trim() ?? ''
      if (!text) {
        setSelInfo(null)
        return
      }

      const fromLine = view.state.doc.lineAt(from).number
      const toLine = view.state.doc.lineAt(to).number
      const coords = view.coordsAtPos(from)

      setSelInfo({
        text,
        fromLine,
        toLine,
        x: coords ? coords.left : 200,
        y: coords ? coords.bottom : 120,
      })
    }

    const onMouseDown = (e: MouseEvent): void => {
      if (barRef.current?.contains(e.target as Node)) return
      setSelInfo(null)
    }

    document.addEventListener('selectionchange', onSelChange)
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      document.removeEventListener('selectionchange', onSelChange)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [viewRef, _testSelection])

  if (!selInfo) return null

  const BAR_W = 260
  const BAR_H = 44
  const flipX = selInfo.x + 14 + BAR_W > window.innerWidth - 8
  const flipY = selInfo.y + 16 + BAR_H > window.innerHeight - 8

  const style: CSSProperties = {
    position: 'fixed',
    left: Math.max(8, flipX ? selInfo.x - 10 : selInfo.x + 14),
    top: Math.max(8, flipY ? selInfo.y - 12 : selInfo.y + 16),
    transform:
      [flipX ? 'translateX(-100%)' : '', flipY ? 'translateY(-100%)' : ''].join(' ').trim() ||
      undefined,
    zIndex: 9999,
  }

  const handleCopy = (): void => {
    navigator.clipboard
      ?.writeText(selInfo.text)
      .then(() => {
        setCopied(true)
        setTimeout(() => {
          setCopied(false)
          setSelInfo(null)
        }, 500)
      })
      .catch(() => {})
  }

  const handleAsk = (): void => {
    if (!onAskSelection) return
    onAskSelection({
      path: filePath,
      text: selInfo.text,
      fromLine: selInfo.fromLine,
      toLine: selInfo.toLine,
    })
    setSelInfo(null)
  }

  const bar = (
    <div
      className="sel-bar"
      data-testid="sel-bar"
      ref={barRef}
      style={style}
      // mousedown 시 선택 유지 (mousedown이 selection collapse 막음)
      onMouseDown={(e) => e.preventDefault()}
    >
      <button className="sel-act" type="button" onClick={handleCopy}>
        {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
        <span>{copied ? '복사됨' : '복사'}</span>
      </button>
      <span className="sel-div" />
      <button className="sel-act" type="button" onClick={handleAsk}>
        <IconBot size={14} />
        <span>Claude에게 질문</span>
      </button>
    </div>
  )

  // portal → body (오버레이 backdrop-filter 기준 우회)
  return createPortal(bar, document.body)
}

export default SelectionAskBar
