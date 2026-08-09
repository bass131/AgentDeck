import { type JSX } from 'react'
import type { DiffLine } from '../../../../shared/ipcContract'
import './DiffViewer.css'

export interface DiffViewerProps {
  filePath: string
  lines: DiffLine[]
}

export function DiffViewer({ filePath, lines }: DiffViewerProps): JSX.Element {
  if (lines.length === 0) {
    return (
      <div className="diff-viewer diff-viewer--empty">
        <span className="diff-empty-msg">변경 없음</span>
        <span className="diff-filepath">{filePath}</span>
      </div>
    )
  }

  return (
    <div className="diff-viewer">
      <div className="diff-file-header">{filePath}</div>
      <pre className="diff-body mono">
        {lines.map((line, idx) => {
          const cls =
            line.kind === 'add'
              ? 'diff-line diff-add'
              : line.kind === 'remove'
                ? 'diff-line diff-del'
                : 'diff-line diff-ctx'
          const prefix =
            line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '
          const oldNum = line.lineOld != null ? String(line.lineOld) : ''
          const newNum = line.lineNew != null ? String(line.lineNew) : ''
          return (
            <div key={idx} className={cls}>
              <span className="diff-gutter-old">{oldNum}</span>
              <span className="diff-gutter-new">{newNum}</span>
              <span className="diff-prefix">{prefix}</span>
              <span className="diff-content">{line.content}</span>
            </div>
          )
        })}
      </pre>
    </div>
  )
}

export default DiffViewer
