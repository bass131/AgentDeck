/**
 * workspace.ts — 워크스페이스 파일 트리 + 경로 탈출 방어 (순수 모듈)
 *
 * CRITICAL: electron을 import하지 않는다 → vitest node 환경에서 직접 테스트 가능.
 * dialog / ipcMain 등 electron 의존은 src/main/ipc/index.ts (얇은 등록 레이어)에만.
 *
 * 보안 (ADR-007 · 헌법 신뢰경계):
 *   - resolveSafe()는 renderer(untrusted)에서 온 경로가 루트 밖을 탈출하지 않는지 검증.
 *   - 경로 정규화 후 루트 기준 containment 검사 → 실패 시 null 반환.
 */

import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { FileTreeNode } from '../../shared/ipc-contract'

// ── 경로 containment 헬퍼 ───────────────────────────────────────────────────────

/**
 * candidate가 root 자체이거나 root 하위에 있는지 검사 (슬래시 정규화 + win32 대소문자 무시).
 */
function isWithin(root: string, candidate: string): boolean {
  let r = resolve(root).replace(/\\/g, '/')
  let c = resolve(candidate).replace(/\\/g, '/')
  if (process.platform === 'win32') {
    r = r.toLowerCase()
    c = c.toLowerCase()
  }
  const rootWithSep = r.endsWith('/') ? r : r + '/'
  return c === r || c === rootWithSep.slice(0, -1) || c.startsWith(rootWithSep)
}

/**
 * 경로의 *존재하는 가장 깊은 조상*을 realpath로 해석해 반환(심링크 실주소).
 * 존재하는 노드가 없으면 null. (심링크는 반드시 존재하는 노드에만 있을 수 있으므로
 * 존재 조상의 realpath만 검사하면 비존재 leaf까지 안전하게 판정 가능.)
 */
function realOfExistingAncestor(p: string): string | null {
  let current = resolve(p)
  for (let i = 0; i < 4096; i++) {
    if (existsSync(current)) {
      try {
        return realpathSync.native(current)
      } catch {
        return current
      }
    }
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
  return null
}

// ── resolveSafe ───────────────────────────────────────────────────────────────

/**
 * 신뢰할 수 없는 경로(renderer에서 수신)를 워크스페이스 루트 기준으로 정규화.
 *
 * 경로 탈출 방어(Path Traversal, OWASP) — 2단:
 *   1) 문자열 정규화 containment: "../", 절대경로로 루트 밖을 가리키면 거부.
 *   2) realpath containment: 심볼릭 링크/junction이 실제로 루트 밖을 가리키면 거부
 *      (1단계는 통과하지만 링크 실주소가 밖인 경우 — TOCTOU 아닌 정적 검증).
 *
 * @param root   워크스페이스 루트 절대 경로 (신뢰할 수 있는 값 — main이 설정)
 * @param p      renderer에서 온 상대(또는 절대) 경로 (untrusted)
 * @returns      루트 안에 있으면 정규화된 절대 경로(슬래시), 탈출이면 null
 */
export function resolveSafe(root: string, p: string): string | null {
  const normalizedRoot = resolve(root)
  const candidate = resolve(normalizedRoot, p)

  // 1) 문자열 containment (../, 절대경로 탈출 차단 — fs 접근 없이 빠름)
  if (!isWithin(normalizedRoot, candidate)) return null

  // 2) realpath containment (심링크/junction 탈출 차단)
  //    실제 경로가 존재할 때만 의미. 둘 다 해석되는데 candidate 실주소가 root 실주소
  //    밖이면 거부. (비존재 테스트 루트 등은 같은 조상으로 해석 → 통과 — 하위호환)
  const realRoot = realOfExistingAncestor(normalizedRoot)
  const realCandidate = realOfExistingAncestor(candidate)
  if (realRoot && realCandidate && !isWithin(realRoot, realCandidate)) return null

  // 반환값은 평문 정규화 경로(슬래시) — 호출부(readFile 등)가 사용
  return candidate.replace(/\\/g, '/')
}

// ── buildTree ─────────────────────────────────────────────────────────────────

/**
 * 워크스페이스 루트의 파일 트리를 재귀적으로 구성.
 *
 * 큰 바이너리나 node_modules는 향후 필터링할 수 있으나 MVP에서는 전체 트리 반환.
 * 비동기 함수 — 향후 fs.promises 전환 또는 watcher 통합 시 확장 용이.
 *
 * @param root      워크스페이스 루트 절대 경로
 * @param relBase   루트 기준 현재 상대 경로 prefix (재귀 내부용, 외부에서 호출 시 생략)
 * @returns         FileTreeNode (contract 타입)
 */
export async function buildTree(root: string, relBase: string = ''): Promise<FileTreeNode> {
  const absPath = relBase ? join(root, relBase) : root
  const name = relBase ? relBase.split('/').pop()! : resolve(root).split(/[\\/]/).pop()!

  const stat = statSync(absPath)

  if (!stat.isDirectory()) {
    // 파일 노드
    return {
      name,
      path: relBase,
      kind: 'file'
    }
  }

  // 디렉토리 노드 — children 재귀 구성
  const entries = readdirSync(absPath)

  const children: FileTreeNode[] = []
  for (const entry of entries) {
    const childRel = relBase ? `${relBase}/${entry}` : entry
    try {
      const child = await buildTree(root, childRel)
      children.push(child)
    } catch {
      // 권한 없거나 접근 불가한 파일 스킵
    }
  }

  // 디렉토리 먼저, 그 다음 파일 알파벳순 정렬
  children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return {
    name,
    path: relBase,
    kind: 'directory',
    children
  }
}
