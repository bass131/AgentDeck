/**
 * WhatsNew.tsx — 6슬라이드 온보딩 덱 (F12-02).
 *
 * props { open, onClose }. open=false면 null 반환.
 * Shell default false — 자동 표시 안 함.
 * window.api 호출 0. 인라인 색 0.
 *
 * 원본 AgentCodeGUI WhatsNew.tsx 1:1 시각 이식 (비디오 제외 — 정적 배경).
 * 슬라이드: ← → 키 / 하단 칩 / CTA(둘러보기/다음/시작하기) / 건너뛰기 / Esc.
 */
import { useEffect, useState, type JSX } from 'react'
import { WN_SLIDES } from '../../lib/whatsNewSampleData'
import './WhatsNew.css'

export interface WhatsNewProps {
  open: boolean
  onClose: () => void
}

export function WhatsNew({ open, onClose }: WhatsNewProps): JSX.Element | null {
  const [slide, setSlide] = useState(0)

  // 슬라이드 인덱스 리셋(재오픈 시)
  useEffect(() => {
    if (open) setSlide(0)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowRight') {
        setSlide((s) => Math.min(s + 1, WN_SLIDES.length - 1))
      } else if (e.key === 'ArrowLeft') {
        setSlide((s) => Math.max(s - 1, 0))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const cur = WN_SLIDES[slide]
  const last = slide === WN_SLIDES.length - 1

  return (
    <div className="set-dialog-overlay wn-overlay" role="dialog" aria-modal="true">
      {/* 스크림 (배경 어두운 베일) */}
      <div className="wn-scrim" aria-hidden="true" />

      {/* 상단 내비: 로고 + 건너뛰기 */}
      <header className="wn-nav">
        <div className="wn-logo">
          AgentDeck<sup>v1.0</sup>
        </div>
        <button className="wn-glass wn-nav-cta" onClick={onClose}>
          건너뛰기
        </button>
      </header>

      {/* 히어로 — key로 리마운트(슬라이드 전환 시 fade-rise 재실행) */}
      <main className="wn-hero" key={slide}>
        <div className="wn-eyebrow">
          {slide === 0
            ? 'Introducing — v1.0'
            : `0${slide} / 0${WN_SLIDES.length - 1} — ${cur.chip}`}
        </div>
        <div className="wn-titlewrap">
          <h1 className="wn-title">
            {cur.title}
            {cur.titleMuted && (
              <>
                <br />
                <em>{cur.titleMuted}</em>
              </>
            )}
          </h1>
          <span className="wn-accent" aria-hidden="true">
            {cur.accent}
          </span>
        </div>
        <p className="wn-desc">{cur.desc}</p>
        <button
          className="wn-glass wn-cta"
          onClick={() => (last ? onClose() : setSlide(slide + 1))}
          autoFocus
        >
          {last ? '시작하기' : slide === 0 ? '둘러보기' : '다음 이야기'}
        </button>
      </main>

      {/* 하단 칩 도크 */}
      <footer className="wn-dock">
        {WN_SLIDES.map((s, i) => (
          <button
            key={i}
            className={'wn-glass wn-chip' + (i === slide ? ' on' : '')}
            onClick={() => setSlide(i)}
          >
            {s.chip}
          </button>
        ))}
      </footer>
    </div>
  )
}
