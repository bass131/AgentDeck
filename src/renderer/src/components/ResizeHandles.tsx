/**
 * ResizeHandles.tsx — 투명 frameless 창의 8 엣지/모서리 리사이즈 핸들 (F1-b).
 *
 * OS 네이티브 엣지 리사이즈가 없으므로 직접 그린다. 핸들 mousedown →
 * window.api.windowResizeStart(edge), mouseup(어디서든) → windowResizeEnd().
 * 실제 bounds 변경(커서 추종)은 main이 수행(window/controls.ts).
 *
 * CRITICAL: renderer untrusted — 윈도우 조작은 preload window.api 경유만.
 */
import { memo, type JSX } from 'react'
import type { ResizeEdge } from '../../../shared/ipc-contract'
import './ResizeHandles.css'

const EDGES: ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

function ResizeHandlesInner(): JSX.Element {
  const startResize = (edge: ResizeEdge) => (e: React.MouseEvent): void => {
    if (e.button !== 0) return
    e.preventDefault()
    void window.api.windowResizeStart(edge)
    const onUp = (): void => {
      void window.api.windowResizeEnd()
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div className="resize-layer" aria-hidden="true">
      {EDGES.map((edge) => (
        <div key={edge} className={`rz rz-${edge}`} onMouseDown={startResize(edge)} />
      ))}
    </div>
  )
}

export const ResizeHandles = memo(ResizeHandlesInner)
export default ResizeHandles
