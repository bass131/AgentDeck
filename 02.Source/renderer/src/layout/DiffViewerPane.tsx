/**
 * DiffViewerPane.tsx — 좌측 pane의 diff 탭 뷰.
 *
 * store.diffFilePath가 있으면 window.api.fsDiff를 호출하여 DiffViewer에 전달.
 * window.api 호출은 이 컴포넌트의 effect 내에서만 (store 액션으로 추출 가능하나
 * diff는 읽기 전용 + 파일별 로드이므로 로컬 effect가 적합).
 *
 * CRITICAL: fsDiff 결과는 로컬 state — 변환 없이 DiffViewer props로 전달.
 */
import { useState, useEffect, type JSX } from 'react'
import { useAppStore, selectDiffFilePath } from '../store/appStore'
import { DiffViewer } from '../components/03_viewer/DiffViewer'
import type { DiffLine } from '../../../shared/ipc-contract'

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
