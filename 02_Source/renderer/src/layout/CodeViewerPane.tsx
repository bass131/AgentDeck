import { memo, type JSX } from 'react'
import {
  useAppStore,
  selectOpenedFile,
  selectOpenedContent,
  selectOpenedLanguage,
  selectOpenedStatus,
  selectOpenedViewer,
  selectOpenedDataUrl,
  selectOpenedRootId,
} from '../store/appStore'
import { CodeViewer } from '../features/viewer'
import { MarkdownView } from '../components/01_conversation/MarkdownView'
import { ImagePreview } from '../features/viewer'
import './CodeViewerPane.css'

export function CodeViewerPane(): JSX.Element {
  const filePath = useAppStore(selectOpenedFile)
  const content = useAppStore(selectOpenedContent)
  const language = useAppStore(selectOpenedLanguage)
  const status = useAppStore(selectOpenedStatus)
  const viewer = useAppStore(selectOpenedViewer)
  const dataUrl = useAppStore(selectOpenedDataUrl)
  const openedRootId = useAppStore(selectOpenedRootId)

  const isReadOnly = openedRootId !== null

  const readOnlyBadge = isReadOnly ? (
    <div className="cvp-readonly-wrap">
      <span className="cvp-readonly-badge" aria-label="읽기전용 레퍼런스 파일">읽기전용</span>
    </div>
  ) : null

  if (status === 'idle' || !filePath) {
    return (
      <div className="cvp-empty">
        <span className="cvp-empty-msg">파일을 선택하세요</span>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div className="cvp-empty">
        <span className="cvp-empty-msg">로딩 중...</span>
      </div>
    )
  }

  if (status === 'too-large') {
    return (
      <div className="cvp-empty">
        <span className="cvp-status-icon cvp-status-warn" aria-hidden="true" />
        <span className="cvp-empty-msg">너무 큰 파일입니다 (1MB 초과)</span>
        <span className="cvp-filepath">{filePath}</span>
      </div>
    )
  }

  if (status === 'binary-skipped') {
    return (
      <div className="cvp-empty">
        <span className="cvp-status-icon cvp-status-warn" aria-hidden="true" />
        <span className="cvp-empty-msg">바이너리 파일은 텍스트 뷰어로 볼 수 없습니다</span>
        <span className="cvp-filepath">{filePath}</span>
      </div>
    )
  }

  if (status === 'not-found') {
    return (
      <div className="cvp-empty">
        <span className="cvp-status-icon cvp-status-err" aria-hidden="true" />
        <span className="cvp-empty-msg">파일을 찾을 수 없습니다</span>
        <span className="cvp-filepath">{filePath}</span>
      </div>
    )
  }

  if (viewer === 'image') {
    return (
      <>
        {readOnlyBadge}
        <ImagePreview dataUrl={dataUrl} filePath={filePath ?? undefined} />
      </>
    )
  }

  if (viewer === 'markdown') {
    if (content === null) {
      return (
        <div className="cvp-empty">
          <span className="cvp-empty-msg">내용을 불러올 수 없습니다</span>
        </div>
      )
    }
    return (
      <>
        {readOnlyBadge}
        <MarkdownView source={content} filePath={filePath ?? undefined} />
      </>
    )
  }

  if (content === null) {
    return (
      <div className="cvp-empty">
        <span className="cvp-empty-msg">내용을 불러올 수 없습니다</span>
      </div>
    )
  }

  return (
    <>
      {readOnlyBadge}
      <CodeViewer
        content={content}
        language={language ?? 'text'}
        filePath={filePath}
        rootId={openedRootId ?? undefined}
        relPath={filePath ?? undefined}
      />
    </>
  )
}

export default memo(CodeViewerPane)
