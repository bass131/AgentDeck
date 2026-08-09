import { type JSX, type RefObject } from 'react'
import { IconImage } from '../../components/common/icons'

interface ImageTrayProps {
  dragOver: boolean
  attachedImages: string[]
  fileInputRef: RefObject<HTMLInputElement | null>
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onOpenImage?: (images: string[], index: number) => void
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
      {dragOver && (
        <div className="drop-hint">
          <IconImage size={24} />
          <span>이미지를 여기에 놓으세요</span>
        </div>
      )}

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
