import { useEffect, useRef, useState, type JSX } from 'react'
import { imageSrc, imageName } from '../../lib/images'
import { IconClose, IconChevLeft, IconChevRight, IconEye } from '../common/icons'
import './ImageViewer.css'

export interface ImageViewerProps {
  images: string[]
  index: number
  onIndexChange: (i: number) => void
  onClose: () => void
}

export function ImageViewer({ images, index, onIndexChange, onClose }: ImageViewerProps): JSX.Element | null {
  const multi = images.length > 1
  const [zoom, setZoom] = useState(false)
  const stripRef = useRef<HTMLDivElement>(null)
  const downOnBackdrop = useRef(false)

  const go = (delta: number): void => {
    if (!multi) return
    onIndexChange((index + delta + images.length) % images.length)
  }

  const onCloseRef = useRef(onClose)
  const goRef = useRef(go)
  useEffect(() => {
    onCloseRef.current = onClose
    goRef.current = go
  })

  useEffect(() => setZoom(false), [index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCloseRef.current()
      else if (e.key === 'ArrowRight') goRef.current(1)
      else if (e.key === 'ArrowLeft') goRef.current(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const el = stripRef.current?.querySelector(`[data-i="${index}"]`)
    if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
      (el as HTMLElement).scrollIntoView({ block: 'nearest', inline: 'center' })
    }
  }, [index])

  if (!images.length) return null
  const path = images[Math.min(index, images.length - 1)]

  return (
    <div
      className="iv-overlay"
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose()
      }}
    >
      <div className="iv-top">
        <div className="iv-name" title={path}>
          {imageName(path)}
        </div>
        {multi && (
          <div className="iv-count">
            {index + 1} <span>/</span> {images.length}
          </div>
        )}
        <span className="iv-spacer" />
        <button
          className="iv-tbtn htip"
          data-tip="기본 앱으로 열기"
          aria-label="기본 앱으로 열기"
          onClick={() => { }}
        >
          <IconEye size={16} />
        </button>
        <button
          className="iv-tbtn htip"
          data-tip="닫기 (Esc)"
          aria-label="닫기"
          onClick={onClose}
        >
          <IconClose size={17} />
        </button>
      </div>

      <div className="iv-stage" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {multi && (
          <button className="iv-nav prev" aria-label="이전" onClick={() => go(-1)}>
            <IconChevLeft size={26} />
          </button>
        )}
        <div className={'iv-imgwrap' + (zoom ? ' zoom scroll' : '')}>
          <img
            key={path}
            src={imageSrc(path)}
            alt={imageName(path)}
            className={'iv-img' + (zoom ? ' zoomed' : '')}
            draggable={false}
            onClick={() => setZoom((z) => !z)}
          />
        </div>
        {multi && (
          <button className="iv-nav next" aria-label="다음" onClick={() => go(1)}>
            <IconChevRight size={26} />
          </button>
        )}
      </div>

      {multi && (
        <div className="iv-strip scroll" ref={stripRef}>
          {images.map((p, i) => (
            <button
              key={p + i}
              data-i={i}
              className={'iv-thumb' + (i === index ? ' on' : '')}
              onClick={() => onIndexChange(i)}
              aria-label={imageName(p)}
              aria-current={i === index}
            >
              <img src={imageSrc(p)} alt={imageName(p)} draggable={false} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
