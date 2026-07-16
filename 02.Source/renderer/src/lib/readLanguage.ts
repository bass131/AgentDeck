/**
 * readLanguage.ts — 파일 경로 확장자 → CodeViewer language 문자열 매핑 (순수, GAP1 P01a).
 *
 * ToolCallCard의 Read 도구 결과를 CodeViewer로 렌더할 때 target(file_path) 확장자에서
 * 언어 힌트를 파생한다. main의 fs.read language 파생(shared FsReadResponse.language)과
 * 별개의 경량 렌더 판별 전용 버전 — CodeViewer.getLanguageExtension이 인식하는 언어
 * 집합(js/ts/tsx/jsx/py/json/md/html/css)만 다루고 나머지는 'text'로 폴백한다. 'text'여도
 * CodeViewer 자체의 라인번호·큰 파일 안전 렌더는 유지되므로 판별 실패가 렌더 깨짐으로
 * 이어지지 않는다.
 *
 * CRITICAL: 순수 함수 — window.api/Node/fs 0.
 */
const EXT_LANG: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  json: 'json',
  jsonc: 'json',
  md: 'markdown',
  markdown: 'markdown',
  html: 'html',
  htm: 'html',
  css: 'css',
}

/** path(또는 파일명) 확장자 → CodeViewer language 문자열. 확장자 없음/미지원 시 'text'. */
export function languageFromPath(path: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(path)
  if (!match) return 'text'
  return EXT_LANG[match[1].toLowerCase()] ?? 'text'
}
