import { useState, memo, type JSX } from 'react'
import './ImagePreview.css'

export interface ImagePreviewProps {
  dataUrl: string | null
  filePath?: string
}

export function ImagePreview({ dataUrl, filePath }: ImagePreviewProps): JSX.Element {
  const [fitMode, setFitMode] = useState<'fit' | 'actual'>('fit')

  const isValid = dataUrl !== null && dataUrl.startsWith('data:')

  return (
    <div
      className="image-preview"
      aria-label={filePath ? `이미지 뷰어: ${filePath}` : '이미지 뷰어'}
    >
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
