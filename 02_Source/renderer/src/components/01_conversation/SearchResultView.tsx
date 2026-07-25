/**
 * SearchResultView.tsx — 구조화 검색 결과 렌더 (GAP1 P08).
 *
 * `search_result` AgentEvent(shared/agent-events.ts AgentEventSearchResult — 엔진 중립
 * 계약, CORE-02)만 소비한다. raw 텍스트 파싱 0 — 파싱은 어댑터 몫이고 renderer는
 * 계약 형상만 렌더한다.
 *
 * 렌더 형상(모드별):
 * - content: matches(flat 배열)를 path별로 그룹핑 — 파일 헤더 버튼([data-search-file])
 *   + 매치 라인 버튼([data-search-match][data-path][data-line], 라인번호+매치 텍스트).
 * - files_with_matches / count / glob: 파일 목록 행 버튼([data-search-file]) + total 표기.
 * - 어느 쪽이든 클릭 → store openFile — 기존 FileModal/CodeViewer로 열림
 *   (P01 CodeViewer 재사용 선례의 클릭 점프 판). 매치 라인 클릭은 3번째 인자로
 *   line을 전달해 해당 라인으로 스크롤(GAP1 P15 R2-A). 파일 헤더/목록은 line 미전달.
 *
 * data-* 훅은 테스트 계약(gap1-p08-search-result-render.test.tsx)이자 e2e 셀렉터 표면 —
 * 클래스명 변경과 독립적으로 유지한다.
 *
 * CRITICAL: renderer untrusted — 파일 열기는 store openFile(window.api.fsRead IPC) 경유만.
 * 인라인 색상 0 — CSS 변수 토큰(SearchResultView.css). 이모지 0. 클릭 요소는 button 시맨틱.
 */
import { memo, type JSX } from 'react'
import type { AgentEventSearchResult, SearchResultMatch } from '../../../../shared/agent-events'
import { useAppStore } from '../../store/appStore'
import './SearchResultView.css'

export interface SearchResultViewProps {
  /** 어댑터가 정규화한 search_result 이벤트 (전 필드 optional — 견고 렌더). */
  result: AgentEventSearchResult
}

/** flat matches → path별 그룹 (첫 등장 순서 보존 — Map 삽입 순서). */
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
  // openFile: store 액션 — IPC(window.api.fsRead) 담당. renderer 직접 fs 0.
  const openFile = useAppStore((s) => s.openFile)
  const open = (path: string, line?: number): void => {
    // 매치 라인 클릭만 line 전달(GAP1 P15 R2-A — openedLine → CodeViewer 스크롤).
    // rootId(2번째 인자)는 미전달 유지(워크스페이스 파일).
    // line 없는 클릭(파일 헤더/목록/라인 없는 매치)은 기존 단일 인자 호출 그대로 —
    // P08 골든의 정확-인자(toHaveBeenCalledWith(path)) 핀과 R2-A 핀을 함께 만족.
    if (line === undefined) void openFile(path)
    else void openFile(path, undefined, line)
  }

  // total 표기: files 개수가 아니라 계약의 total 필드(count 모드는 파일 수 ≠ 매치 총수).
  const footer =
    result.total !== undefined ? (
      <div className="sr-total">
        총 {result.total}건{result.truncated ? ' · 일부만 표시' : ''}
      </div>
    ) : null

  // content 모드 + 매치 상세 존재 → 파일별 그룹핑 렌더.
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

  // files_with_matches / count / glob(또는 matches 없는 content 방어) → 파일 목록 렌더.
  // files 부재 시 matches의 path로 유일 목록 파생(계약 전 필드 optional — 견고성).
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
