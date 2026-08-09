import { useState, useEffect, useRef, type JSX, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { EditorView } from '@codemirror/view'
import { IconCopy, IconCheck, IconBot } from '../../components/common/icons'

export interface AskSelectionArgs {
  path: string
  text: string
  fromLine: number | null
  toLine: number | null
}

export function buildAskPayload(args: AskSelectionArgs): string {
  const { path, text, fromLine, toLine } = args
  const lineRef =
    fromLine !== null && toLine !== null
      ? `${path}:L${fromLine}-L${toLine}`
      : path
  return `\`${lineRef}\`\n\`\`\`\n${text}\n\`\`\`\n`
}

interface TestSelection {
  from: number
  to: number
  text: string
}

export interface SelectionAskBarProps {
  viewRef: React.RefObject<EditorView | null>
  filePath?: string
  onAskSelection?: (args: AskSelectionArgs) => void
  _testSelection?: TestSelection | null
}

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

  useEffect(() => {
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

  return createPortal(bar, document.body)
}

export default SelectionAskBar
