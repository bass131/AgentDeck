/**
 * skipDirs.ts — @멘션 워크 전용 디렉토리 필터 상수 (단일 출처, Phase 35 M7)
 *
 * CRITICAL(단일출처): 이 상수는 listFiles.ts(멘션 워크)가 import해 사용한다.
 *   탐색기 listDir 에는 **미적용** — 원본(files.ts)이 listDir에 필터를 두지 않으며
 *   탐색기는 실트리(node_modules 포함)를 표시해야 한다.
 *
 * 원본: AgentCodeGUI/src/main/files.ts SKIP_DIRS·KEEP_DOT_DIRS·MAX_FILES.
 * 이전 위치: src/main/fs/listFiles.ts (인라인 중복).
 */

/**
 * @멘션 팔레트 BFS 순회 시 **진입하지 않는** 디렉토리 이름 집합.
 *
 * heavy(node_modules), generated(dist/build/out), VCS(.git/.hg/.svn),
 * 빌드 캐시(.next/.nuxt/.turbo 등) — 멘션 결과를 오염시키고 MAX_FILES 낭비.
 * node_modules 제외는 탐색기(listDir)에 해당 없음(실트리 표시).
 */
export const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'out', 'build', 'coverage',
  '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache', '.parcel-cache', '.vite',
  '.idea', '.vs', '.gradle', 'bin', 'obj', 'target', 'vendor', '__pycache__',
  '.venv', 'venv', '.mypy_cache', '.pytest_cache', '.expo', 'Pods', '.dart_tool'
])

/**
 * 숨김 dot-디렉토리 중 **@멘션에 포함할** 이름 집합.
 *
 * .github/.claude/.vscode 는 workflow·skill·MCP 설정 파일을 담고 있어
 * 실제로 멘션할 일이 있음 — SKIP_DIRS 에서 제외하여 BFS 통과시킨다.
 */
export const KEEP_DOT_DIRS = new Set(['.github', '.claude', '.vscode'])

/**
 * @멘션 팔레트 최대 파일 수.
 *
 * BFS가 이 개수에 도달하면 순회를 중단해 picker 응답성을 보호한다.
 * (renderer 측에서 추가 필터링을 해도 대용량 repo에서 IPC 페이로드 크기 안전.)
 */
export const MAX_FILES = 6000
