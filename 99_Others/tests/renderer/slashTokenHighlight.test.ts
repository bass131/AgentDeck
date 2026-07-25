/**
 * slashTokenHighlight.test.ts — FB2 Phase 06: 컴포저 슬래시 커맨드(`/xxx`) 토큰
 * 하이라이트 순수 세그먼트 분해 함수 경계 테스트(TDD RED → GREEN).
 *
 * segmentSlashTokens는 "행 시작 또는 공백 뒤 '/'로 시작하는 토큰만" 하이라이트하고,
 * 파일 경로(`/c/Dev/...`)·URL(`https://...`)·연속 슬래시(`//...`)는 오탐 배제해야 한다.
 * P04가 활성화한 ':' 콜론 네임스페이스(`/session:end`)도 매치 대상.
 */
import { describe, it, expect } from 'vitest'
import { segmentSlashTokens } from '../../../02.Source/renderer/src/lib/slashTokenHighlight'

describe('segmentSlashTokens — 빈 입력/토큰 없음', () => {
  it('빈 문자열 → 빈 배열', () => {
    expect(segmentSlashTokens('')).toEqual([])
  })

  it('슬래시 토큰 없는 일반 텍스트 → 세그먼트 1개(non-highlight)', () => {
    expect(segmentSlashTokens('hello world')).toEqual([{ text: 'hello world', highlight: false }])
  })
})

describe('segmentSlashTokens — 행 시작(^)', () => {
  it('문두 "/work-run" → [하이라이트, 일반]', () => {
    expect(segmentSlashTokens('/work-run 실행해줘')).toEqual([
      { text: '/work-run', highlight: true },
      { text: ' 실행해줘', highlight: false },
    ])
  })
})

describe('segmentSlashTokens — 공백 뒤', () => {
  it('공백 뒤 "/work-run" → 공백은 일반 세그먼트에 포함', () => {
    expect(segmentSlashTokens('check /work-run now')).toEqual([
      { text: 'check ', highlight: false },
      { text: '/work-run', highlight: true },
      { text: ' now', highlight: false },
    ])
  })

  it('개행 뒤 슬래시 토큰도 감지', () => {
    expect(segmentSlashTokens('설명:\n/ask 이제')).toEqual([
      { text: '설명:\n', highlight: false },
      { text: '/ask', highlight: true },
      { text: ' 이제', highlight: false },
    ])
  })
})

describe('segmentSlashTokens — 콜론 네임스페이스(P04)', () => {
  it('"/session:end" → 콜론 포함 전체가 하나의 하이라이트 토큰', () => {
    expect(segmentSlashTokens('/session:end 해줘')).toEqual([
      { text: '/session:end', highlight: true },
      { text: ' 해줘', highlight: false },
    ])
  })

  it('"/work:plan:sub" 같은 다중 콜론 네임스페이스도 전체 매치', () => {
    expect(segmentSlashTokens('run /work:plan:sub please')).toEqual([
      { text: 'run ', highlight: false },
      { text: '/work:plan:sub', highlight: true },
      { text: ' please', highlight: false },
    ])
  })
})

describe('segmentSlashTokens — 오탐 배제: 문장 중 경로', () => {
  it('"/c/Dev/AgentDeck"(유닉스식 다중 세그먼트 경로) → 하이라이트 없음', () => {
    expect(segmentSlashTokens('파일은 /c/Dev/AgentDeck/output.ts 에 있어요')).toEqual([
      { text: '파일은 /c/Dev/AgentDeck/output.ts 에 있어요', highlight: false },
    ])
  })

  it('"/etc/passwd" 같은 2세그먼트 경로 → 하이라이트 없음', () => {
    expect(segmentSlashTokens('확인해줘 /etc/passwd 파일')).toEqual([
      { text: '확인해줘 /etc/passwd 파일', highlight: false },
    ])
  })
})

describe('segmentSlashTokens — 오탐 배제: URL', () => {
  it('"https://example.com/workflows" → 하이라이트 없음(콜론·슬래시 모두 경계 불충족)', () => {
    expect(segmentSlashTokens('참고: https://example.com/workflows 문서')).toEqual([
      { text: '참고: https://example.com/workflows 문서', highlight: false },
    ])
  })
})

describe('segmentSlashTokens — 오탐 배제: Windows 드라이브 경로', () => {
  it('"C:/Dev/AgentDeck" → "/"로 시작하지 않아 애초에 매치 후보조차 아님', () => {
    expect(segmentSlashTokens('경로는 C:/Dev/AgentDeck 입니다')).toEqual([
      { text: '경로는 C:/Dev/AgentDeck 입니다', highlight: false },
    ])
  })
})

describe('segmentSlashTokens — 오탐 배제: 연속 슬래시', () => {
  it('"//work-run"(슬래시 2개) → 하이라이트 없음', () => {
    expect(segmentSlashTokens('see //work-run here')).toEqual([
      { text: 'see //work-run here', highlight: false },
    ])
  })
})

describe('segmentSlashTokens — 오탐 배제: 공백 없이 이어붙은 슬래시', () => {
  it('"단어/work-run"(직전 문자가 단어) → 경계 불충족으로 하이라이트 없음', () => {
    expect(segmentSlashTokens('word/work-run here')).toEqual([
      { text: 'word/work-run here', highlight: false },
    ])
  })
})

describe('segmentSlashTokens — 복수 토큰', () => {
  it('두 슬래시 커맨드가 한 문장에 등장 → 각각 하이라이트', () => {
    expect(segmentSlashTokens('먼저 /session:end 하고 /work-run 실행')).toEqual([
      { text: '먼저 ', highlight: false },
      { text: '/session:end', highlight: true },
      { text: ' 하고 ', highlight: false },
      { text: '/work-run', highlight: true },
      { text: ' 실행', highlight: false },
    ])
  })
})

describe('segmentSlashTokens — 세그먼트 재조립 = 원문(불변식)', () => {
  it('여러 세그먼트를 이어붙이면 원문과 정확히 일치한다', () => {
    const text = '/work-run 하고 확인해줘 /c/Dev/AgentDeck 은 건드리지 말고 /session:end'
    const segs = segmentSlashTokens(text)
    expect(segs.map((s) => s.text).join('')).toBe(text)
  })
})
