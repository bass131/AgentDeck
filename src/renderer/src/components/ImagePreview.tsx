/**
 * ImagePreview.tsx — 이미지 파일 미리보기 컴포넌트.
 *
 * 신뢰경계 (CRITICAL):
 *   - dataUrl이 없거나 data: 로 시작하지 않으면 img 미렌더(방어).
 *   - 외부 URL/상대경로 → 안내문 출력.
 *   - fs/Node/IPC 직접 호출 0. Props로 dataUrl 받아 순수 렌더.
 *   - 인라인 색상 0 — CSS 변수 토큰.
 */
import { useState, memo } from 'react'
import './ImagePreview.css'

// ── Props ────────────────────────────────────────────────────────────────────

export interface ImagePreviewProps {
  /** 표시할 이미지 data URL (data: 로 시작해야 함) */
  dataUrl: string | null
  /** 파일 경로 (헤더 표시 + aria-label용, 선택) */
  filePath?: string
}

// ── ImagePreview ─────────────────────────────────────────────────────────────

export function ImagePreview({ dataUrl, filePath }: ImagePreviewProps): JSX.Element {
  const [fitMode, setFitMode] = useState<'fit' | 'actual'>('fit')

  // dataUrl이 없거나 data: 로 시작하지 않으면 방어 렌더
  const isValid = dataUrl !== null && dataUrl.startsWith('data:')

  return (
    <div
      className="image-preview"
      aria-label={filePath ? `이미지 뷰어: ${filePath}` : '이미지 뷰어'}
    >
      {/* 헤더 — CodeViewer와 동일 톤 */}
      <div className="code-viewer-header">
        {filePath && (
          <span className="code-viewer-path" title={filePath}>{filePath}</span>
        )}
        {isValid && (
          <button
            className="image-preview-toggle"
            onClick={() => setFitMode(m => m === 'fit' ? 'actual' : 'fit')}
            type="button"
          >
            {fitMode === 'fit' ? '실제 크기' : '맞춤'}
          </button>
        )}
      </div>

      {/* 본문 */}
      <div className="image-preview-body">
        {isValid ? (
          <img
            className={`image-preview-img image-preview-img--${fitMode}`}
            src={dataUrl}
            alt={filePath ?? 'image'}
          />
        ) : (
          <div className="image-preview-empty">
            <span className="image-preview-msg">이미지를 표시할 수 없습니다</span>
            {filePath && (
              <span className="image-preview-path">{filePath}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(ImagePreview)
