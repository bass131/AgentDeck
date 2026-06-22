/**
 * CodeViewerPane.tsx — 중앙 pane의 코드 뷰어 탭.
 *
 * store.openedStatus에 따라:
 *   idle → "파일을 선택하세요" 안내
 *   loading → "로딩 중..." 안내
 *   ready → CodeViewer 렌더
 *   too-large → 파일 크기 초과 안내
 *   binary-skipped → 바이너리 파일 안내
 *   not-found → 파일 없음 안내
 *
 * CRITICAL: renderer untrusted — fs/Node 직접 0. IPC는 store 액션 경유.
 * 인라인 색상 0 — CSS 변수 토큰.
 */
import { memo } from 'react'
import {
  useAppStore,
  selectOpenedFile,
  selectOpenedContent,
  selectOpenedLanguage,
  selectOpenedStatus,
  selectOpenedViewer,
  selectOpenedDataUrl,
} from '../store/appStore'
import { CodeViewer } from '../components/CodeViewer'
import { MarkdownView } from '../components/MarkdownView'
import { ImagePreview } from '../components/ImagePreview'
import './CodeViewerPane.css'

export function CodeViewerPane(): JSX.Element {
  const filePath = useAppStore(selectOpenedFile)
  const content = useAppStore(selectOpenedContent)
  const language = useAppStore(selectOpenedLanguage)
  const status = useAppStore(selectOpenedStatus)
  const viewer = useAppStore(selectOpenedViewer)
  const dataUrl = useAppStore(selectOpenedDataUrl)

  // ── 상태별 분기 ────────────────────────────────────────────────────────────

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

  // status === 'ready' — 뷰어 종류에 따라 라우팅
  if (viewer === 'image') {
    return <ImagePreview dataUrl={dataUrl} filePath={filePath ?? undefined} />
  }

  if (viewer === 'markdown') {
    if (content === null) {
      return (
        <div className="cvp-empty">
          <span className="cvp-empty-msg">내용을 불러올 수 없습니다</span>
        </div>
      )
    }
    return <MarkdownView source={content} filePath={filePath ?? undefined} />
  }

  // viewer === 'code' (기본)
  if (content === null) {
    return (
      <div className="cvp-empty">
        <span className="cvp-empty-msg">내용을 불러올 수 없습니다</span>
      </div>
    )
  }

  return (
    <CodeViewer
      content={content}
      language={language ?? 'text'}
      filePath={filePath}
    />
  )
}

export default memo(CodeViewerPane)
