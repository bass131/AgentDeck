/**
 * softLinebreak.ts — 스트리밍 plain 텍스트의 개행 의미론을 마크다운 문단 규칙에 맞춘다.
 *
 * 배경(FB1-01 스트리밍/완료 렌더 정합):
 *   SmoothMarkdown의 plain 모드(`<pre>` + white-space:pre-wrap)는 원문의 모든 개행을
 *   줄바꿈으로 "보존"한다. 하지만 완료 후 렌더(react-markdown, MarkdownView)는
 *   CommonMark 규칙대로 문단 내부의 단일 개행을 공백 1개로 접어(soft line break)
 *   한 문단으로 병합하고, 빈 줄(개행 2개 이상)만 문단 경계로 취급한다.
 *   이 차이 때문에 "도중엔 한 줄에 숫자 1개씩, 완료 후엔 한 줄에 숫자 10개" 식으로
 *   완료 순간 텍스트가 재배치되어 보인다(실측: 01-stream-render-parity.md).
 *
 * 해결: 완전한 마크다운 파싱(AST) 대신 정규식/줄 단위 단일 패스(O(n))만 적용 —
 *   매 프레임 호출해도 비용이 무시할 수준이라 SmoothMarkdown의 스트리밍 최적화
 *   의도(마크다운 재파싱 회피)를 해치지 않는다.
 *
 * 블록 인지 가드(reviewer 후속 지시, 1차 구현의 회귀 수정):
 *   순수 산문(prose)만 놓고 보면 단일 개행을 무조건 접는 게 맞지만, 리스트나
 *   펜스드 코드블록처럼 "원래도 줄 단위로 보여야 하는" 구조에 그대로 적용하면
 *   반대 방향의 점프를 새로 만든다 — 스트리밍 중 "- a\n- b"가 "- a - b" 한 줄로
 *   붙어 있다가 완료 순간 리스트 2항목으로 스냅하거나, 코드블록 내부 줄바꿈이
 *   전부 사라졌다가 완료 순간 나타난다(코드블록은 산문보다 점프가 더 두드러짐).
 *   그래서 아래 두 예외를 둔다:
 *     1) 펜스드 코드(``` 또는 ~~~) 내부 개행은 전부 보존 — 닫는 펜스가 아직 오지
 *        않은 "미종결" 상태도 스트리밍 특성상 내부로 취급(끝까지 보존).
 *     2) 다음 줄이 블록 마커로 시작하면 그 개행을 보존 — 리스트(`- `/`* `/`+ `),
 *        순서 리스트(`1. `), 헤딩(`#`), 인용(`>`), 표(`|`). 펜스 시작 줄은 위
 *        1)의 펜스 태그가 이미 처리한다(별도 규칙 불필요).
 *   여전히 줄 단위 단일 패스(split('\n') 후 한 번 순회) — AST 파싱 없음.
 *
 * 한계(의도적 트레이드오프):
 *   - 아직 이어지는 중인 마지막 줄이 나중에 빈 줄(문단 구분)로 바뀔지 같은
 *     문단으로 이어질지는 스트리밍 도중엔 알 수 없다 — CommonMark 파서 자체도
 *     토큰이 더 도착하기 전엔 확정 못 하는 모호성. 완료 시점엔 항상 올바른
 *     결과로 수렴한다.
 *   - 펜스 닫힘 판정은 "``` 또는 ~~~로 시작하는 줄이면 토글"이라는 단순 규칙만
 *     쓴다. CommonMark는 여는 펜스와 같은 문자·같은 길이 이상만 닫는 펜스로
 *     인정하지만, 그 수준의 정합은 AST 파싱 없이는 어렵고 실사용 빈도가 낮은
 *     엣지 케이스(펜스 안에 다른 길이의 펜스 문자열을 리터럴로 넣는 경우)라
 *     범위 밖으로 둔다.
 *
 * CRITICAL: 순수 함수 — 부수효과 없음. window.api/DOM 접근 0.
 */

/** 펜스드 코드블록 구분선(``` 또는 ~~~, 0~3칸 들여쓰기 허용) */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/

/**
 * 다음 줄이 이 마커로 시작하면 그 앞의 개행을 보존한다.
 * 리스트(-/*+  뒤 공백) · 순서 리스트(숫자. 뒤 공백) · 헤딩(# 1~6개) · 인용(>) · 표(|).
 * 펜스 시작은 tagFencedLines가 이미 처리하므로 여기 포함하지 않는다.
 */
const BLOCK_MARKER_RE = /^ {0,3}(?:[-*+][ \t]|\d+\.[ \t]|#{1,6}(?:[ \t]|$)|>|\|)/

/**
 * 각 줄이 "펜스 내부(구분선 자신 포함)"인지 태깅한다.
 * 미종결 펜스(닫는 구분선이 아직 없음)도 끝까지 내부로 취급한다.
 */
function tagFencedLines(lines: string[]): boolean[] {
  const fenced = new Array<boolean>(lines.length).fill(false)
  let inFence = false
  for (let i = 0; i < lines.length; i += 1) {
    if (FENCE_RE.test(lines[i])) {
      fenced[i] = true // 구분선 자신도 펜스 영역으로 취급 — 인접 경계 보존
      inFence = !inFence
    } else {
      fenced[i] = inFence
    }
  }
  return fenced
}

/**
 * foldSoftLinebreaks — 문단 내부 단일 개행을 공백으로 접고, 연속 개행(2개 이상)은
 * 문단 경계(정확히 개행 2개)로 정규화한다. 단, 펜스드 코드블록 내부와 블록 마커
 * (리스트/헤딩/인용/표) 앞의 개행은 보존한다.
 *
 * 예:
 *   "1\n2\n3"       → "1 2 3"        (같은 문단 — soft break)
 *   "가\n\n나"       → "가\n\n나"      (문단 경계 보존)
 *   "가\n\n\n나"     → "가\n\n나"      (3개 이상도 문단 경계 1개로 정규화)
 *   "- a\n- b"      → "- a\n- b"     (리스트 — 보존)
 *   "```\nx\ny\n```" → "```\nx\ny\n```" (펜스드 코드 — 전부 보존)
 */
export function foldSoftLinebreaks(text: string): string {
  if (text.length === 0) return text

  const lines = text.split('\n')
  const fenced = tagFencedLines(lines)

  const out: string[] = [lines[0]]
  let i = 1
  while (i < lines.length) {
    // 펜스 내부(또는 펜스 구분선과 맞닿은 경계) — 원문 그대로, 병합/축약 없이 보존
    if (fenced[i - 1] || fenced[i]) {
      out.push('\n', lines[i])
      i += 1
      continue
    }

    // 펜스 밖의 빈 줄 런 — 개수와 무관하게 정확히 문단 경계 1개(개행 2개)로 정규화
    if (lines[i] === '') {
      let j = i
      while (j < lines.length && lines[j] === '') j += 1
      out.push('\n\n')
      if (j < lines.length) out.push(lines[j])
      i = j + 1
      continue
    }

    // 블록 마커로 시작하는 줄 앞의 개행은 보존, 그 외 산문은 공백으로 접음
    out.push(BLOCK_MARKER_RE.test(lines[i]) ? '\n' : ' ', lines[i])
    i += 1
  }

  return out.join('')
}
