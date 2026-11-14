import { useState, useRef, useEffect, memo } from 'react'
import { MarkdownView } from './MarkdownView'
import { smoothRevealStep } from '../../lib/smoothReveal'
import { foldSoftLinebreaks } from '../../lib/softLinebreak'

export interface SmoothMarkdownProps {
  text: string
  running: boolean
}

export const SmoothMarkdown = memo(function SmoothMarkdown({
  text,
  running,
}: SmoothMarkdownProps) {
  const [shown, setShown] = useState(() => (running ? 0 : text.length))

  const targetRef = useRef(text)
  targetRef.current = text

  const curRef = useRef(running ? 0 : text.length)
  const velRef = useRef(0)
  const lastTRef = useRef(0)

  const prevTextLenRef = useRef(text.length)
  useEffect(() => {
    const prev = prevTextLenRef.current
    prevTextLenRef.current = text.length
    if (text.length < prev) {
      const init = running ? 0 : text.length
      curRef.current = init
      velRef.current = 0
      lastTRef.current = 0
      setShown(init)
    }
  }, [text, running])

  useEffect(() => {
    let raf = 0
    let alive = true

    const tick = (now: number): void => {
      if (!alive) return
      if (lastTRef.current === 0) lastTRef.current = now
      const rawDt = (now - lastTRef.current) / 1000
      lastTRef.current = now

      const target = targetRef.current.length
      const { nextCur, nextVel } = smoothRevealStep({
        cur: curRef.current,
        vel: velRef.current,
        textLen: target,
        dt: rawDt,
      })

      curRef.current = nextCur
      velRef.current = nextVel
      setShown(Math.floor(nextCur))

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const plain = running || shown < text.length

  if (plain) {
    const visible = foldSoftLinebreaks(text.slice(0, shown))
    return (
      <div className="smooth-markdown smooth-markdown--plain">
        <pre className="smooth-pre">{visible}<span className="stream-cursor" aria-hidden="true" /></pre>
      </div>
    )
  }

  return (
    <div className="smooth-markdown">
      <MarkdownView source={text} />
    </div>
  )
})

export default SmoothMarkdown
