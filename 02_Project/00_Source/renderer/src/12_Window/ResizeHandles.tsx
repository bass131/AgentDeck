import { memo, type JSX } from 'react'
import type { ResizeEdge } from '@shared/ipcContract'
import { ipc } from '@renderer/01_Ipc'
import './ResizeHandles.css'

const EDGES: ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

function ResizeHandlesInner(): JSX.Element {
  const startResize = (edge: ResizeEdge) => (e: React.MouseEvent): void => {
    if (e.button !== 0) return
    e.preventDefault()
    void ipc.window.resizeStart({ edge })
    const onUp = (): void => {
      void ipc.window.resizeEnd()
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
