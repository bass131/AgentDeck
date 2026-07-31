import { memo, type JSX } from 'react'
import type { AgentEventSearchResult, SearchResultMatch } from '../../../../shared/agentEvents'
import { useAppStore } from '../../store/appStore'
import './SearchResultView.css'

export interface SearchResultViewProps {
  result: AgentEventSearchResult
}

function groupByPath(matches: SearchResultMatch[]): Map<string, SearchResultMatch[]> {
  const groups = new Map<string, SearchResultMatch[]>()
  for (const m of matches) {
    const arr = groups.get(m.path)
    if (arr) arr.push(m)
    else groups.set(m.path, [m])
  }
  return groups
}

function SearchResultViewInner({ result }: SearchResultViewProps): JSX.Element {
  const openFile = useAppStore((s) => s.openFile)
  const open = (path: string, line?: number): void => {
    if (line === undefined) void openFile(path)
    else void openFile(path, undefined, line)
  }

  const footer =
    result.total !== undefined ? (
      <div className="sr-total">
        총 {result.total}건{result.truncated ? ' · 일부만 표시' : ''}
      </div>
    ) : null

  if (result.mode === 'content' && result.matches && result.matches.length > 0) {
    const groups = [...groupByPath(result.matches).entries()]
    return (
      <div className="sr-view">
        {groups.map(([path, matches]) => (
          <div key={path} className="sr-group">
            <button
              type="button"
              className="sr-file"
              data-search-file={path}
              onClick={() => open(path)}
              aria-label={`파일 열기 ${path}`}
            >
              <span className="sr-path">{path}</span>
              <span className="sr-file-n">{matches.length}</span>
            </button>
            {matches.map((m, i) => (
              <button
                key={`${m.line ?? 'n'}-${i}`}
                type="button"
                className="sr-match"
                data-search-match=""
                data-path={m.path}
                data-line={m.line !== undefined ? String(m.line) : undefined}
                onClick={() => open(m.path, m.line)}
                aria-label={`매치 열기 ${m.path}${m.line !== undefined ? ` ${m.line}행` : ''}`}
              >
                {m.line !== undefined && <span className="sr-ln">{m.line}</span>}
                <span className="sr-text">{m.text ?? ''}</span>
              </button>
            ))}
          </div>
        ))}
        {footer}
      </div>
    )
  }

  const files =
    result.files ?? (result.matches ? [...new Set(result.matches.map((m) => m.path))] : [])
  return (
    <div className="sr-view">
      {files.map((path) => (
        <button
          type="button"
          key={path}
          className="sr-file"
          data-search-file={path}
          onClick={() => open(path)}
          aria-label={`파일 열기 ${path}`}
        >
          <span className="sr-path">{path}</span>
        </button>
      ))}
      {footer}
    </div>
  )
}

export const SearchResultView = memo(SearchResultViewInner)
export default SearchResultView
