import { memo, useEffect, useCallback, useRef, type JSX } from 'react'
import type { AskSelectionArgs } from '../03_viewer/SelectionAskBar'
import {
  useAppStore,
  selectOpenedFile,
  selectOpenedContent,
  selectOpenedLanguage,
  selectOpenedStatus,
  selectOpenedLine,
  selectOpenedViewer,
  selectOpenedDataUrl,
  selectOpenedRootId,
  selectDiffFilePath,
  selectChangedFiles,
} from '../../store/appStore'
import { useResizableModal, ModalResizeHandles } from '../../lib/resizableModal'
import FileBadge from './FileBadge'
import { CodeViewer } from '../03_viewer/CodeViewer'
import { MarkdownView } from '../01_conversation/MarkdownView'
import { ImagePreview } from '../03_viewer/ImagePreview'
import DiffViewerPane from '../../layout/DiffViewerPane'
import { IconMax, IconRestore, IconClose } from '../common/icons'
import './FileModal.css'

const STORAGE_KEY = 'fv-modal'

function splitPath(p: string): { dir: string; name: string } {
  const normalized = p.replace(/\\/g, '/')
  const slash = normalized.lastIndexOf('/')
  if (slash < 0) return { dir: '', name: normalized }
  return { dir: normalized.slice(0, slash + 1), name: normalized.slice(slash + 1) }
}

export interface FileModalProps {
  onAskSelection?: (args: AskSelectionArgs) => void
}

export function FileModal({ onAskSelection }: FileModalProps = {}): JSX.Element | null {
  const openedFile = useAppStore(selectOpenedFile)
  const content = useAppStore(selectOpenedContent)
  const language = useAppStore(selectOpenedLanguage)
  const status = useAppStore(selectOpenedStatus)
  const openedLine = useAppStore(selectOpenedLine)
  const viewer = useAppStore(selectOpenedViewer)
  const dataUrl = useAppStore(selectOpenedDataUrl)
  const openedRootId = useAppStore(selectOpenedRootId)
  const diffFilePath = useAppStore(selectDiffFilePath)
  const changedFiles = useAppStore(selectChangedFiles)
  const closeOpenedFile = useAppStore((s) => s.closeOpenedFile)

  const open = openedFile !== null
  const rz = useResizableModal(STORAGE_KEY, open, { defaultMaximized: true })
  const downOnOverlay = useRef(false)

  const handleEsc = useCallback(
    (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && open) {
        closeOpenedFile()
      }
    },
    [open, closeOpenedFile]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [handleEsc])

  if (!openedFile) return null

  const { dir, name } = splitPath(openedFile)
  const isReadOnly = openedRootId !== null
  const isChanged = changedFiles.has(openedFile)
  const showDiff = diffFilePath !== null && isChanged

  const readOnlyBadge = isReadOnly ? (
    <span className="cvp-readonly-badge" aria-label="읽기전용 레퍼런스 파일">읽기전용</span>
  ) : null

  let body: JSX.Element
  if (showDiff) {
    body = <DiffViewerPane />
  } else if (viewer === 'image') {
    body = (
      <div className="fv-body">
        {readOnlyBadge}
        <ImagePreview dataUrl={dataUrl} filePath={openedFile} />
      </div>
    )
  } else if (viewer === 'markdown') {
    body = (
      <div className="fv-body">
        {readOnlyBadge}
        {content !== null ? (
          <MarkdownView source={content} filePath={openedFile} />
        ) : (
          <div className="fv-empty">내용을 불러올 수 없습니다</div>
        )}
      </div>
    )
  } else {
    body = (
      <div className="fv-body">
        {readOnlyBadge}
        {status === 'loading' && <div className="fv-loading">로딩 중...</div>}
        {status === 'ready' && content !== null && (
          <CodeViewer
            content={content}
            language={language ?? 'text'}
            filePath={openedFile}
            rootId={openedRootId ?? undefined}
            relPath={openedFile ?? undefined}
            line={openedLine ?? undefined}
            onAskSelection={onAskSelection}
          />
        )}
        {status === 'too-large' && <div className="fv-empty">너무 큰 파일입니다 (1MB 초과)</div>}
        {status === 'binary-skipped' && <div className="fv-empty">바이너리 파일은 텍스트 뷰어로 볼 수 없습니다</div>}
        {status === 'not-found' && <div className="fv-empty">파일을 찾을 수 없습니다</div>}
        {(status === 'idle' || (status === 'ready' && content === null)) && (
          <div className="fv-empty">파일을 선택하세요</div>
        )}
      </div>
    )
  }

  return (
    <div
      className="fv-overlay"
      onMouseDown={(e) => {
        downOnOverlay.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (downOnOverlay.current && e.target === e.currentTarget) closeOpenedFile()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="파일 뷰어"
    >
      <div
        ref={rz.ref}
        className="fv-modal rzm"
        style={rz.modalStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="diff-head" onDoubleClick={rz.onHeaderDoubleClick}>
          <FileBadge path={openedFile} size={22} />
          <span className="dpath">
            {dir && <span className="dir">{dir}</span>}
            {name}
          </span>
          <span className="fv-mode">읽기</span>
          {isChanged && <span className="tag edit">EDIT</span>}
          <span className="dspacer" />
          {rz.maximized ? (
            <button
              className="dclose"
              aria-label="복원"
              title="창 모드로"
              onClick={rz.toggleMaximize}
              type="button"
            >
              <IconRestore size={16} />
            </button>
          ) : (
            <button
              className="dclose"
              aria-label="최대화"
              title="최대화"
              onClick={rz.toggleMaximize}
              type="button"
            >
              <IconMax size={16} />
            </button>
          )}
          <button
            className="dclose"
            aria-label="닫기"
            title="닫기"
            onClick={closeOpenedFile}
            type="button"
          >
            <IconClose size={16} />
          </button>
        </div>

        {body}

        {!rz.maximized && <ModalResizeHandles onStart={rz.startResize} />}
      </div>
    </div>
  )
}

export default memo(FileModal)
