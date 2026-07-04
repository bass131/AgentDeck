/**
 * SmoothMarkdown.tsx — 스트리밍 토큰 점진 reveal 컴포넌트.
 *
 * 원본: AgentCodeGUI Chat.tsx:312~356 SmoothMarkdown을 우리 구조에 이식.
 *
 * 동작:
 *   - 누적 텍스트(text)와 진행 여부(running)를 받아 내부에 분수 커서(shown) 관리.
 *   - requestAnimationFrame 루프로 프레임마다 shown을 증가 → 글자가 매끄럽게 흘러나옴.
 *   - reveal 진행 중(shown < text.length) 또는 running 중: 플레인 텍스트(pre 태그).
 *   - reveal 완료 + running 끝: MarkdownView(react-markdown)로 최종 색화 — 플리커 방지.
 *   - text가 길어지면(새 청크) 자연히 이어서 reveal.
 *   - 언마운트 시 RAF 취소.
 *
 * 신뢰경계: renderer 순수 컴포넌트. IPC/fs/window.api 호출 0.
 * 성능: shown state 갱신만으로 컴포넌트 자체만 리렌더 — 부모 전체 리렌더 유발 X.
 */
import { useState, useRef, useEffect, memo } from 'react'
import { MarkdownView } from './MarkdownView'
import { smoothRevealStep } from '../../lib/smoothReveal'
import { foldSoftLinebreaks } from '../../lib/softLinebreak'

export interface SmoothMarkdownProps {
  /** 누적 전체 텍스트 (스트리밍 중 계속 길어짐) */
  text: string
  /** 엔진 실행 중 여부 — true이면 플레인 모드 유지 */
  running: boolean
}

/**
 * SmoothMarkdown — 스트리밍 텍스트를 분수 커서로 점진 reveal.
 *
 * 원본 공식(AgentCodeGUI Chat.tsx:334~338):
 *   targetVel = buffer * 3.2 + 18
 *   vel += (targetVel - vel) * min(1, dt * 3.5)
 *   cur  = min(target, cur + vel * dt)
 */
export const SmoothMarkdown = memo(function SmoothMarkdown({
  text,
  running,
}: SmoothMarkdownProps) {
  // running=false(이미 완료)이면 처음부터 전체 표시 — 원본 패턴
  const [shown, setShown] = useState(() => (running ? 0 : text.length))

  // RAF 루프 내부에서 최신 text를 읽기 위한 ref (원본 targetRef 패턴)
  const targetRef = useRef(text)
  targetRef.current = text

  // 분수 커서(cur)·속도(vel)·타임스탬프 ref
  // state가 아닌 이유: 프레임마다 업데이트되지만 React 렌더는 shown 정수값만 트리거
  const curRef = useRef(running ? 0 : text.length)
  const velRef = useRef(0)
  const lastTRef = useRef(0)

  // text가 짧아지면(새 메시지 replace 또는 clear) 커서 리셋
  const prevTextLenRef = useRef(text.length)
  useEffect(() => {
    const prev = prevTextLenRef.current
    prevTextLenRef.current = text.length
    if (text.length < prev) {
      // 짧아짐 → 초기화
      const init = running ? 0 : text.length
      curRef.current = init
      velRef.current = 0
      lastTRef.current = 0
      setShown(init)
    }
  }, [text, running])

  // RAF 루프 — 원본 Chat.tsx:320~351 tick() 직접 이식
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
      // 원본: setShown(Math.floor(cur)) — 항상 호출(React가 같은 값이면 bail out)
      setShown(Math.floor(nextCur))

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
    // 마운트 1회만 — 최신 text는 targetRef로 읽음 (원본 동일)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 원본 Chat.tsx:354:
  // colorize only once run finished AND reveal caught up (avoids flicker)
  const plain = running || shown < text.length

  if (plain) {
    // 점진 reveal 중: 플레인 pre 텍스트 — 마크다운 파싱 비용·플리커 0.
    // FB1-01: 단, 개행만은 foldSoftLinebreaks로 마크다운(CommonMark) soft-break 규칙과
    // 동일하게 접는다 — 완료 후 react-markdown 렌더와 줄바꿈 의미론을 맞춰
    // "완료 순간 점프"를 없앤다. 리스트/펜스드 코드블록은 foldSoftLinebreaks 내부의
    // 블록 인지 가드가 예외 처리(줄 단위 단일 패스 O(n), AST 파싱 없음 — lib/softLinebreak.ts).
    const visible = foldSoftLinebreaks(text.slice(0, shown))
    return (
      <div className="smooth-markdown smooth-markdown--plain">
        {/* 원본 1:1: caret은 텍스트 끝 inline. pre 내부에 둬야 블록 분리(아래 줄) 안 됨. */}
        <pre className="smooth-pre">{visible}<span className="stream-cursor" aria-hidden="true" /></pre>
      </div>
    )
  }

  // reveal 완료 + running 끝: 마크다운 색화 (MarkdownView = react-markdown+rehype-highlight)
  return (
    <div className="smooth-markdown">
      <MarkdownView source={text} />
    </div>
  )
})

export default SmoothMarkdown
