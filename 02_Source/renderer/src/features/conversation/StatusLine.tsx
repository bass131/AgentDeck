import { useState, useEffect, memo, type JSX } from 'react'
import { WORKING_PHRASES, nextPhraseIndex } from '../../lib/workingPhrases'
import { computeThinkingElapsedSeconds } from '../../store/thinkingElapsed'
import { buildStatusMeta, formatPhraseLabel } from '../../lib/statusLineFormat'
import './StatusLine.css'

export interface StatusLineProps {
  text: string | null
  thinkingStartedAt: number | null
  estimatedTokens?: number
}

export const StatusLine = memo(function StatusLine({
  text,
  thinkingStartedAt,
  estimatedTokens,
}: StatusLineProps): JSX.Element {
  const [phraseIdx, setPhraseIdx] = useState(0)
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>
    function schedule(): void {
      const delay = 5000 + Math.random() * 15000
      id = setTimeout(() => {
        setPhraseIdx((n) => nextPhraseIndex(n, WORKING_PHRASES.length))
        schedule()
      }, delay)
    }
    schedule()
    return () => clearTimeout(id)
  }, [])

  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const label = text ?? WORKING_PHRASES[phraseIdx]
  const elapsedSeconds = computeThinkingElapsedSeconds(thinkingStartedAt, nowMs)
  const meta = buildStatusMeta(elapsedSeconds, estimatedTokens)

  return (
    <div className="msg ai-msg status-line">
      <div className="msg-main">
        <div className="thinking status-line-row" data-testid="status-line">
          <span className="status-line-symbol" aria-hidden="true">✻</span>
          <span className="status-line-phrase">{formatPhraseLabel(label)}</span>
          {meta && <span className="status-line-meta">{meta}</span>}
        </div>
      </div>
    </div>
  )
})

export default StatusLine
