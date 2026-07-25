/**
 * UpdateNotes.tsx — 업데이트 패치노트 (F12-02).
 *
 * props { open, onClose }. open=false면 null 반환.
 * Shell default false — 자동 표시 안 함.
 * window.api 호출 0. 인라인 색 0.
 *
 * 원본 AgentCodeGUI UpdateNotes.tsx 1:1 시각 이식.
 * un-hero(메탈 그라디언트 대제목 + CharReveal) + un-marquee(키워드 루프)
 * + un-list(01·02… 넘버드 리스트) + un-cta "시작하기". Esc 닫기.
 */
import { useEffect, useRef, type JSX, type ReactNode } from 'react'
import { UN_ITEMS, UN_KEYWORDS } from '../../lib/updateNotesSampleData'
import './UpdateNotes.css'

export interface UpdateNotesProps {
  open: boolean
  onClose: () => void
}

// 한 줄 리드 텍스트를 글자 단위로 — 마운트하면 왼→오로 또렷해진다
function CharReveal({ text }: { text: string }): ReactNode {
  return (
    <>
      {Array.from(text).map((ch, i) => (
        <span
          key={i}
          className="un-char"
          style={{ animationDelay: `${0.25 + i * 0.014}s` }}
        >
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </>
  )
}

const RELEASE_TITLE = "WHAT'S NEW"
const RELEASE_LEAD = '코딩 에이전트 데스크탑이 한 걸음 더 나아갔어요. 읽고, 고치고, 더 빨라진 1.1.'

export function UpdateNotes({ open, onClose }: UpdateNotesProps): JSX.Element | null {
  const listRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // IntersectionObserver: un-item 뷰포트 진입 시 .in 추가 (jsdom 미지원 환경 안전 처리)
  useEffect(() => {
    if (!open) return
    const root = listRef.current
    if (!root) return
    if (typeof IntersectionObserver === 'undefined') return
    const items = Array.from(root.querySelectorAll<HTMLElement>('.un-item'))
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        }
      },
      { threshold: 0.18 }
    )
    items.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [open])

  if (!open) return null

  return (
    <div className="set-dialog-overlay un-overlay" role="dialog" aria-modal="true">
      {/* 상단 내비 */}
      <header className="un-nav">
        <div className="un-logo">
          AgentDeck<sup>v1.1</sup>
        </div>
      </header>

      {/* 히어로 */}
      <section className="un-hero">
        <div className="un-eyebrow">새 버전 · v1.1</div>
        <h1 className="un-title">{RELEASE_TITLE}</h1>
        <p className="un-lead">
          <CharReveal text={RELEASE_LEAD} />
        </p>
        <div className="un-scrollhint" aria-hidden="true">
          아래로 스크롤
        </div>
      </section>

      {/* 키워드 마퀴 */}
      <div className="un-marquee" aria-hidden="true">
        <div className="un-marquee-track">
          {Array.from({ length: 2 }).map((_, half) => (
            <div className="un-marquee-group" key={half}>
              {Array.from({ length: 3 }).flatMap((_, rep) =>
                UN_KEYWORDS.map((kw) => (
                  <span key={`${half}-${rep}-${kw}`} className="un-marquee-item">
                    {kw} <em>·</em>
                  </span>
                ))
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 넘버드 리스트 */}
      <section className="un-list" ref={listRef}>
        {UN_ITEMS.map((item) => (
          <article key={item.n} className="un-item">
            <div className="un-num">{item.n}</div>
            <div className="un-body">
              <div className="un-tag">{item.tag}</div>
              <h2 className="un-name">{item.lead}</h2>
              <p className="un-desc">{item.desc}</p>
            </div>
          </article>
        ))}
      </section>

      {/* CTA */}
      <footer className="un-foot">
        <button className="un-cta" onClick={onClose}>
          시작하기
        </button>
      </footer>
    </div>
  )
}
