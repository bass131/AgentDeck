/**
 * ImageViewer.tsx — 라이트박스 오버레이 (F12-01).
 *
 * 단일: 이미지 + 닫기. 다중: chevron + 카운터 + 필름스트립.
 * props {images, index, onIndexChange, onClose}.
 * Esc / ← → / 백드롭 클릭으로 닫기/이동.
 * 이미지 클릭 → zoom 토글.
 *
 * CRITICAL: window.api 호출 0. 기본앱으로 열기 = no-op(M5).
 * 인라인 색 0. CSS 변수 토큰.
 */
import { useEffect, useRef, useState, type JSX } from 'react'
import { imageSrc, imageName } from '../lib/images'
import { IconClose, IconChevLeft, IconChevRight, IconEye } from './icons'
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
  // 백드롭 클릭: mousedown도 백드롭에서 시작한 경우만 닫기
  const downOnBackdrop = useRef(false)

  const go = (delta: number): void => {
    if (!multi) return
    onIndexChange((index + delta + images.length) % images.length)
  }

  // 이미지 바뀌면 zoom 해제
  useEffect(() => setZoom(false), [index])

  // 키보드: Esc 닫기 / ← → 탐색
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // go는 index/images.length 의존이므로 의도적으로 [index, images.length]만 선언
  }, [index, images.length])

  // 활성 썸네일 스크롤 인뷰
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
      {/* 상단 바: 파일명 + 카운터 + 기본앱열기(no-op) + 닫기 */}
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
        {/* 기본 앱으로 열기 — no-op (M5) */}
        <button
          className="iv-tbtn htip"
          data-tip="기본 앱으로 열기"
          aria-label="기본 앱으로 열기"
          onClick={() => { /* no-op: M5 */ }}
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

      {/* 이미지 스테이지 */}
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

      {/* 필름스트립 (다중만) */}
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
