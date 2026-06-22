/**
 * FileModal.tsx — 파일 뷰어 플로팅 모달 (F15-02).
 *
 * openedFile null → 미렌더. 있으면:
 *   .fv-overlay > .fv-modal.rzm > .diff-head(헤더) + 본문(뷰어 라우팅) + ModalResizeHandles
 *
 * 기본=창모드(.fv-overlay--windowed): 우측 도킹, backdrop pointer-events 비차단.
 * 최대화(.fv-overlay--full): 전체 덮기 + 짙은 스크림.
 *
 * 닫기: 닫기 버튼/.dclose / 창모드 스크림 클릭 / Esc(자체 keydown, 전역 preventDefault 금지).
 *
 * 본문 라우팅:
 *   diffFilePath & changedFiles → DiffViewerPane
 *   image → ImagePreview
 *   markdown → MarkdownView
 *   code → CodeViewer
 * 읽기전용 배지(openedRootId 있을 때) 유지.
 *
 * CRITICAL: renderer untrusted — fs/Node/IPC 직접 0. store 액션만.
 * 인라인 색상 0(CSS 변수 토큰).
 */
import { memo, useEffect, useCallback, type JSX } from 'react'
import {
  useAppStore,
  selectOpenedFile,
  selectOpenedContent,
  selectOpenedLanguage,
  selectOpenedStatus,
  selectOpenedViewer,
  selectOpenedDataUrl,
  selectOpenedRootId,
  selectDiffFilePath,
  selectChangedFiles,
} from '../store/appStore'
import { useResizableModal, ModalResizeHandles } from '../lib/resizableModal'
import FileBadge from './FileBadge'
import { CodeViewer } from './CodeViewer'
import { MarkdownView } from './MarkdownView'
import { ImagePreview } from './ImagePreview'
import DiffViewerPane from '../layout/DiffViewerPane'
import { IconMax, IconRestore, IconClose } from './icons'
import './FileModal.css'

const STORAGE_KEY = 'fv-modal'

// 파일명/디렉토리 분리 헬퍼
function splitPath(p: string): { dir: string; name: string } {
  const normalized = p.replace(/\\/g, '/')
  const slash = normalized.lastIndexOf('/')
  if (slash < 0) return { dir: '', name: normalized }
  return { dir: normalized.slice(0, slash + 1), name: normalized.slice(slash + 1) }
}

export function FileModal(): JSX.Element | null {
  const openedFile = useAppStore(selectOpenedFile)
  const content = useAppStore(selectOpenedContent)
  const language = useAppStore(selectOpenedLanguage)
  const status = useAppStore(selectOpenedStatus)
  const viewer = useAppStore(selectOpenedViewer)
  const dataUrl = useAppStore(selectOpenedDataUrl)
  const openedRootId = useAppStore(selectOpenedRootId)
  const diffFilePath = useAppStore(selectDiffFilePath)
  const changedFiles = useAppStore(selectChangedFiles)
  const closeOpenedFile = useAppStore((s) => s.closeOpenedFile)

  const open = openedFile !== null
  const rz = useResizableModal(STORAGE_KEY, open, { defaultMaximized: false })

  // Esc → 닫기. 전역 preventDefault 금지 — 다른 모달 Esc 우선 준수.
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
  // 변경 파일 여부 (diff 라우팅 조건)
  const isChanged = changedFiles.has(openedFile)
  const showDiff = diffFilePath !== null && isChanged

  const readOnlyBadge = isReadOnly ? (
    <span className="cvp-readonly-badge" aria-label="읽기전용 레퍼런스 파일">읽기전용</span>
  ) : null

  // 뷰어 본문 라우팅
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
    // code (기본)
    body = (
      <div className="fv-body">
        {readOnlyBadge}
        {status === 'loading' && <div className="fv-loading">로딩 중...</div>}
        {status === 'ready' && content !== null && (
          <CodeViewer content={content} language={language ?? 'text'} filePath={openedFile} />
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

  const overlayClass = `fv-overlay ${rz.maximized ? 'fv-overlay--full' : 'fv-overlay--windowed'}`

  return (
    <div
      className={overlayClass}
      // 창모드: 스크림(overlay) 클릭 = 닫기. 최대화 시도 방지(모달 안쪽 클릭은 stopPropagation)
      onClick={rz.maximized ? undefined : closeOpenedFile}
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
        {/* 헤더 */}
        <div className="diff-head" onDoubleClick={rz.onHeaderDoubleClick}>
          <FileBadge path={openedFile} size={22} />
          <span className="dpath">
            {dir && <span className="dir">{dir}</span>}
            {name}
          </span>
          {isChanged && (
            <span className={`tag ${isChanged ? 'edit' : ''}`}>
              {isChanged ? 'EDIT' : ''}
            </span>
          )}
          <span className="dspacer" />
          {/* 최대화 / 복원 버튼 */}
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
          {/* 닫기 버튼 */}
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

        {/* 본문 */}
        {body}

        {/* 리사이즈 핸들 — 창모드에서만 */}
        {!rz.maximized && <ModalResizeHandles onStart={rz.startResize} />}
      </div>
    </div>
  )
}

export default memo(FileModal)
