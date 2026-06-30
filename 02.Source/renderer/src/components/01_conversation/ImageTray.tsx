/**
 * ImageTray.tsx — 이미지 첨부 트레이 하위 컴포넌트.
 *
 * Composer.tsx Phase 14 분해: img-tray + drop-hint + 숨김 file input 추출.
 * 22c: attachedImages prop 기반 렌더 (로컬 state 없음).
 * 세 DOM 요소를 Fragment로 묶어 .composer 직속 자식으로 위치.
 */
import { type JSX, type RefObject } from 'react'
import { IconImage } from '../common/icons'

interface ImageTrayProps {
  /** 드래그오버 상태 (useImageAttach.dragOver) */
  dragOver: boolean
  /** 현재 첨부 이미지 data URL 목록 (store → Conversation → prop) */
  attachedImages: string[]
  /** 숨김 file input ref (useImageAttach.fileInputRef) */
  fileInputRef: RefObject<HTMLInputElement | null>
  /** file input onChange (useImageAttach.handleFileInputChange) */
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  /** 썸네일 클릭 → ImageViewer 열기 (optional) */
  onOpenImage?: (images: string[], index: number) => void
  /** 특정 index 이미지 제거 (→ store.removeAttachedImage) */
  onRemoveImage?: (index: number) => void
}

export function ImageTray({
  dragOver,
  attachedImages,
  fileInputRef,
  handleFileInputChange,
  onOpenImage,
  onRemoveImage,
}: ImageTrayProps): JSX.Element {
  return (
    <>
      {/* 드롭 힌트 오버레이 */}
      {dragOver && (
        <div className="drop-hint">
          <IconImage size={24} />
          <span>이미지를 여기에 놓으세요</span>
        </div>
      )}

      {/* 이미지 첨부 트레이 */}
      {attachedImages.length > 0 && (
        <div className="img-tray">
          {attachedImages.map((src, i) => (
            <div className="img-thumb" key={src + i}>
              <button
                type="button"
                className="img-thumb-open"
                aria-label={`첨부 이미지 ${i + 1}`}
                title={`첨부 이미지 ${i + 1}`}
                onClick={() => onOpenImage?.(attachedImages, i)}
              >
                <img src={src} alt={`첨부 이미지 ${i + 1}`} draggable={false} />
              </button>
              <button
                type="button"
                className="img-thumb-x"
                aria-label="제거"
                onClick={() => onRemoveImage?.(i)}
              >
                <span className="img-thumb-x-ic" aria-hidden="true">×</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 숨김 file input (picker) — display:none, tabIndex=-1 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
        aria-hidden="true"
        tabIndex={-1}
      />
    </>
  )
}
