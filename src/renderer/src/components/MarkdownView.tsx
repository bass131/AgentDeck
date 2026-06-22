/**
 * MarkdownView.tsx — react-markdown 기반 마크다운 렌더러.
 *
 * 신뢰경계 (CRITICAL):
 *   - rehype-raw 미사용 → 원시 HTML 비활성(XSS 1차 방어).
 *   - 마크다운 내 이미지: data: URL만 허용(SafeImg). 원격/상대경로 → 플레이스홀더.
 *   - 코드 하이라이트: rehype-highlight(AST 기반, 안전).
 *   - fs/Node/IPC 직접 호출 0. Props로 source를 받아 순수 렌더.
 *   - 인라인 색상 0 — CSS 변수 토큰.
 */
import { memo } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { Components } from 'react-markdown'
import './MarkdownView.css'

// ── URL 변환 — data: URL 허용 ──────────────────────────────────────────────────

/**
 * react-markdown v9의 기본 urlTransform은 data: URL을 빈 문자열로 변환한다.
 * 인라인 이미지(`![](data:...)`)를 살리기 위해 data: 통과 예외를 두되,
 * **이미지 속성(key==='src')에만 한정**한다. 링크 href 등 다른 속성은
 * 기본 변환에 위임하여 data:/javascript: 등 위험 프로토콜을 차단한다
 * (이미지용 예외가 href로 새어 data:text/html 링크 벡터가 되지 않도록).
 * src의 data:는 SafeImg가 한 번 더 최종 검증한다.
 */
function safeUrlTransform(url: string, key: string): string {
  if (key === 'src' && url.startsWith('data:')) return url
  return defaultUrlTransform(url)
}

// ── SafeImg — 원격 이미지 차단 ────────────────────────────────────────────────

/**
 * 마크다운 내 이미지 커스텀 렌더러.
 * data: URL만 허용, 그 외는 .md-img-blocked 플레이스홀더.
 * SSRF/트래킹 픽셀 차단 (plan-auditor 요건).
 */
function SafeImg({ src, alt }: { src?: string; alt?: string }) {
  // src가 없거나 data: 로 시작하지 않으면 차단
  if (!src || !src.startsWith('data:')) {
    return (
      <span className="md-img-blocked" aria-label={alt ?? '이미지 차단됨'}>
        [이미지: {alt ?? src ?? ''}]
      </span>
    )
  }

  return (
    <img
      src={src}
      alt={alt ?? ''}
      className="md-img"
    />
  )
}

// ── 컴포넌트 재정의 집합 ──────────────────────────────────────────────────────

const components: Components = {
  // 이미지는 SafeImg로 교체
  img: SafeImg as Components['img'],
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface MarkdownViewProps {
  /** 렌더할 마크다운 소스 */
  source: string
  /** 파일 경로 (헤더 표시 + aria-label용, 선택) */
  filePath?: string
}

// ── MarkdownView ──────────────────────────────────────────────────────────────

export function MarkdownView({ source, filePath }: MarkdownViewProps): JSX.Element {
  return (
    <div
      className="markdown-view"
      aria-label={filePath ? `마크다운 뷰어: ${filePath}` : '마크다운 뷰어'}
    >
      {filePath && (
        <div className="code-viewer-header">
          <span className="code-viewer-path" title={filePath}>{filePath}</span>
          <span className="code-viewer-lang">MD</span>
        </div>
      )}
      <div className="markdown-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={components}
          urlTransform={safeUrlTransform}
        >
          {source}
        </ReactMarkdown>
      </div>
    </div>
  )
}

export default memo(MarkdownView)
