import { useState, useEffect, type JSX } from 'react'
import { useAppStore, selectDiffFilePath } from '../store/appStore'
import { DiffViewer } from '../features/viewer'
import type { DiffLine } from '../../../shared/ipcContract'

export function DiffViewerPane(): JSX.Element {
  const filePath = useAppStore(selectDiffFilePath)
  const [lines, setLines] = useState<DiffLine[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filePath) return
    setLoading(true)
    window.api
      .fsDiff({ filePath })
      .then((res) => {
        setLines(res.lines)
      })
      .catch(() => {
        setLines([])
      })
      .finally(() => {
        setLoading(false)
      })
  }, [filePath])

  if (!filePath) {
    return (
      <div className="pane-empty">파일을 선택하세요</div>
    )
  }

  if (loading) {
    return (
      <div className="pane-empty">로딩 중...</div>
    )
  }

  return <DiffViewer filePath={filePath} lines={lines} />
}

export default DiffViewerPane
