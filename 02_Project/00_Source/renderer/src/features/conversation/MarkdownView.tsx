import { memo, type JSX } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { Components } from 'react-markdown'
import './MarkdownView.css'

function safeUrlTransform(url: string, key: string): string {
  if (key === 'src' && url.startsWith('data:')) return url
  return defaultUrlTransform(url)
}

function SafeImg({ src, alt }: { src?: string; alt?: string }) {
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

const components: Components = {
  img: SafeImg as Components['img'],
}

export interface MarkdownViewProps {
  source: string
  filePath?: string
}

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
