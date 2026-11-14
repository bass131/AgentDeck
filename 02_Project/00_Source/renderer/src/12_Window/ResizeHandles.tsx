import { memo, type JSX } from 'react'
import type { ResizeEdge } from '../../../../shared/ipcContract'
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
