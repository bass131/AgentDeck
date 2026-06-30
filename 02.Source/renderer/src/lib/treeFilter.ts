/**
 * treeFilter.ts — 탐색기 검색 필터 (순수, F2-02).
 *
 * store의 in-memory 파일 트리를 평탄화해 이름 매치 파일을 반환(새 IPC 없음).
 * startswith > contains 정렬, 경로순 타이브레이크, 상한.
 */
import type { FileTreeNode } from '../../../shared/ipc-contract'

export interface FlatFile {
  name: string
  path: string
}

/**
 * tree 전체에서 이름이 query를 포함하는 파일을 평탄 수집.
 * @param limit 최대 결과 수(기본 100)
 */
export function filterFiles(
  tree: FileTreeNode | null,
  query: string,
  limit = 100
): FlatFile[] {
  const q = query.trim().toLowerCase()
  if (!q || !tree) return []

  const out: FlatFile[] = []
  const walk = (node: FileTreeNode): void => {
    if (node.kind === 'file') {
      if (node.name.toLowerCase().includes(q)) out.push({ name: node.name, path: node.path })
    } else {
      node.children?.forEach(walk)
    }
  }
  tree.children?.forEach(walk)

  out.sort((a, b) => {
    const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1
    const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1
    if (aStarts !== bStarts) return aStarts - bStarts
    return a.path.localeCompare(b.path)
  })

  return out.slice(0, limit)
}
