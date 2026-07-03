/**
 * useComposerKeywordMirror.ts — UC1 Phase 05: 컴포저 UltraCode 키워드 하이라이트
 * (미러 오버레이) 상태 훅. FB2 Phase 06: 일반 슬래시 커맨드(`/xxx`) 토큰 하이라이트로
 * 확장(같은 미러 메커니즘 재사용, 세그먼트만 kind 구분으로 일반화).
 *
 * 기법: textarea는 부분 스타일링이 불가능하므로, 하이라이트 대상(오케스트레이션
 * 키워드 "ultracode"/"/workflows" 또는 일반 슬래시 커맨드 "/work-run" 등)이 하나라도
 * 감지된 동안만(ghostActive) textarea 글자를 투명 처리(ghost)하고 그 아래 미러 div가
 * 세그먼트별로 렌더링한다(kind:'none'=--text 그대로, 'orchestration'=보라 그라데이션 flow,
 * 'slash'=정적 색). 아무 것도 감지되지 않은 평소 타이핑에는 오버레이가 전혀 개입하지
 * 않는다 — 네이티브 textarea 그대로라 회귀 위험 0(스펙의 "더 단순한 기법" 채택 —
 * 세그먼트별 부분투명 대신 전체 ghost 스위칭).
 *
 * 세그먼트 분해 자체는 composerHighlight.ts(오케스트레이션+슬래시 병합, 순수함수)에
 * 위임 — orchestrationKeyword.ts(ADR-032 단일 진실원)는 이 확장으로 전혀 변경되지
 * 않는다.
 *
 * IME(한글 조합) 대응: compositionstart~compositionend 구간은 ghost 강제 비활성 —
 * 조합 중인 글자가 네이티브 textarea에 정상 표시되어 어긋남이 없다(하이라이트 리터럴은
 * 항상 라틴 문자라 조합 이벤트 자체가 발생하지 않는 리터럴 — 조합 중인 한글이 우연히
 * 같은 문장 안에 있을 때만 영향받는 경계 케이스를 처리).
 *
 * 스크롤 동기화: 미러는 자체 스크롤바를 갖지 않는다(overflow:hidden 고정, CSS) —
 * textarea의 scrollTop/Left을 그대로 프로그램적으로 반영한다(ref 직접 대입, 리렌더 0).
 *
 * UC1-P07(ADR-032 개정 v2): 오케스트레이션 토글 상태를 세 번째 인자로 받아 하이라이트
 * 변형(highlightVariant)을 판정한다 — 토글 ON이면 P05의 보라 그라데이션('active') 그대로,
 * OFF면 뮤트 스타일('muted', 승격되지 않는다는 신호). 이 변형은 kind:'orchestration'
 * 세그먼트에만 적용된다(kind:'slash'는 토글과 무관 — ADR-032 권한 의미론과 별개의 순수
 * 표기 기능). 세그먼트 분해·ghost 판정 로직 자체는 토글 상태와 무관(키워드 감지는 여전히
 * 순수 텍스트 기반) — 렌더링 변형만 갈라진다.
 *
 * CRITICAL: renderer untrusted — IPC/fs 0. 순수 DOM 참조 + 메모리 상태.
 */
import { useMemo, useRef, useState, useCallback, useEffect, type RefObject } from 'react'
import {
  segmentComposerHighlights,
  type ComposerHighlightSegment,
} from '../../../lib/composerHighlight'

/** 'active' = 토글 ON(P05 보라 그라데이션) / 'muted' = 토글 OFF(승격 안 됨, 뮤트 스타일) */
export type OrchestrationHighlightVariant = 'active' | 'muted'

export interface UseComposerKeywordMirrorReturn {
  /** 세그먼트 분해 결과(memo, kind:'none'|'orchestration'|'slash') — 미러가 그대로 span으로 렌더링 */
  segments: ComposerHighlightSegment[]
  /** true면 텍스트에 하이라이트 대상(오케스트레이션 키워드 또는 슬래시 토큰)이 있어
   *  ghost 모드(미러 표시 + textarea 글자 투명) 활성 */
  ghostActive: boolean
  /** true면 세그먼트 중 오케스트레이션 키워드(kind:'orchestration')가 존재 — OFF 유도
   *  힌트는 이 값에만 반응한다(슬래시 토큰만 있을 때 오케스트레이션 힌트가 잘못
   *  뜨는 것을 방지, FB2 P06). */
  hasOrchestrationKeyword: boolean
  /** 하이라이트 span에 적용할 변형 — 토글 ON='active'(그라데이션) / OFF='muted'(뮤트).
   *  kind:'orchestration' 세그먼트에만 적용, kind:'slash'는 항상 고정 스타일. */
  highlightVariant: OrchestrationHighlightVariant
  mirrorRef: RefObject<HTMLDivElement | null>
  /** textarea onScroll에 연결 — 미러 scrollTop/Left 동기화 */
  handleScroll: (e: React.UIEvent<HTMLTextAreaElement>) => void
  /** textarea onCompositionStart에 연결 — 조합 중 ghost 비활성 */
  handleCompositionStart: () => void
  /** textarea onCompositionEnd에 연결 — 조합 종료 후 ghost 재판정 */
  handleCompositionEnd: () => void
}

export function useComposerKeywordMirror(
  value: string,
  inputRef: RefObject<HTMLTextAreaElement | null>,
  /** 오케스트레이션 토글 상태(ADR-032 v2) — 기본 true(하위호환: 미지정 시 P05 그라데이션). */
  orchestrationOn: boolean = true
): UseComposerKeywordMirrorReturn {
  const [isComposing, setIsComposing] = useState(false)
  const mirrorRef = useRef<HTMLDivElement>(null)

  const segments = useMemo(() => segmentComposerHighlights(value), [value])
  const hasKeyword = useMemo(() => segments.some((s) => s.kind !== 'none'), [segments])
  const hasOrchestrationKeyword = useMemo(
    () => segments.some((s) => s.kind === 'orchestration'),
    [segments]
  )
  const ghostActive = hasKeyword && !isComposing
  const highlightVariant: OrchestrationHighlightVariant = orchestrationOn ? 'active' : 'muted'

  const handleScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    const mirror = mirrorRef.current
    if (!mirror) return
    mirror.scrollTop = e.currentTarget.scrollTop
    mirror.scrollLeft = e.currentTarget.scrollLeft
  }, [])

  const handleCompositionStart = useCallback(() => setIsComposing(true), [])
  const handleCompositionEnd = useCallback(() => setIsComposing(false), [])

  // 값/모드 전환 후 재동기화 — 새 줄이 캐럿을 밀어 브라우저가 자동으로 scrollTop을
  // 조정하는 경우(onScroll 이벤트가 안 붙는 타이밍)까지 커버하는 안전망.
  useEffect(() => {
    const mirror = mirrorRef.current
    const el = inputRef.current
    if (!mirror || !el) return
    mirror.scrollTop = el.scrollTop
    mirror.scrollLeft = el.scrollLeft
  }, [value, ghostActive, inputRef])

  return {
    segments,
    ghostActive,
    hasOrchestrationKeyword,
    highlightVariant,
    mirrorRef,
    handleScroll,
    handleCompositionStart,
    handleCompositionEnd,
  }
}
