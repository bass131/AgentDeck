/**
 * roots.ts — 루트 레지스트리 팩토리 (순수 모듈)
 *
 * CRITICAL: electron import 금지 → vitest node 환경에서 직접 테스트 가능.
 * path 문자열만 다루며, resolveSafe / buildTree / fs 접근은 하지 않는다.
 * (fs 접근은 호출 측(ipc/index.ts)이 검증 후 이 레지스트리에 신뢰된 경로만 넘긴다.)
 *
 * 보안 불변식:
 *   - 워크스페이스: WORKSPACE_ROOT_ID(고정), readOnly:false.
 *   - 레퍼런스: 'ref-1', 'ref-2'… 순차 ID, readOnly:true.
 *   - get(미등록 ID) → null — IPC 핸들러가 이 null 로 not-found 응답.
 *   - 같은 path 중복 등록 → 기존 레코드 반환(멱등, 카운터 소모 없음).
 */

import { basename } from 'node:path'
import { WORKSPACE_ROOT_ID } from '../../shared/ipc-contract'
import type { ReferenceFolder } from '../../shared/ipc-contract'

// ── 내부 레코드 타입 ─────────────────────────────────────────────────────────

interface RootEntry {
  id: string
  path: string
  readOnly: boolean
  name: string
}

// ── 공개 인터페이스 ───────────────────────────────────────────────────────────

export interface RootRegistry {
  /**
   * 워크스페이스를 WORKSPACE_ROOT_ID 로 등록/갱신.
   * @param path  호출자가 검증한 절대경로(신뢰 경로).
   */
  setWorkspace(path: string): void

  /**
   * 레퍼런스 폴더를 등록하고 ReferenceFolder 레코드를 반환.
   * - 같은 path 재등록 시 기존 레코드 반환(멱등, 카운터 소모 없음).
   * - name 생략 시 path basename 사용.
   * @param path  호출자가 검증한 절대경로(신뢰 경로).
   * @param name  사용자에게 보여줄 폴더 이름 (생략 시 basename).
   */
  addReference(path: string, name?: string): ReferenceFolder

  /**
   * ID → 루트 엔트리 조회.
   * 미등록 ID(임의 문자열·절대경로 주입 포함)는 null 반환.
   * fs.read IPC 핸들러가 null 이면 not-found 로 응답 — 경로 탈출 차단 근거.
   */
  get(id: string): RootEntry | null

  /**
   * 등록된 레퍼런스 폴더 목록 반환 (워크스페이스 제외).
   * 등록 순서 보존.
   */
  listReferences(): ReferenceFolder[]
}

// ── 팩토리 ────────────────────────────────────────────────────────────────────

/**
 * 루트 레지스트리 인스턴스를 생성한다.
 *
 * 앱 생명주기당 한 인스턴스(src/main/ipc/index.ts 의 모듈 상태)를 공유하며,
 * 테스트에서는 beforeEach 마다 새 인스턴스로 격리한다.
 */
export function createRootRegistry(): RootRegistry {
  const _map = new Map<string, RootEntry>()
  // path → id 역방향 인덱스 (중복 등록 방지)
  const _pathIndex = new Map<string, string>()
  let _refCounter = 0

  return {
    setWorkspace(path: string): void {
      const name = basename(path) || path
      const entry: RootEntry = {
        id: WORKSPACE_ROOT_ID,
        path,
        readOnly: false,
        name
      }
      _map.set(WORKSPACE_ROOT_ID, entry)
    },

    addReference(path: string, name?: string): ReferenceFolder {
      // 중복 path → 기존 레코드 반환 (카운터 소모 없음)
      const existingId = _pathIndex.get(path)
      if (existingId !== undefined) {
        const existing = _map.get(existingId)!
        return {
          id: existing.id,
          name: existing.name,
          rootPath: existing.path,
          readOnly: true
        }
      }

      // 신규 등록
      _refCounter += 1
      const id = `ref-${_refCounter}`
      const resolvedName = name ?? basename(path) ?? path
      const entry: RootEntry = {
        id,
        path,
        readOnly: true,
        name: resolvedName
      }
      _map.set(id, entry)
      _pathIndex.set(path, id)

      return {
        id,
        name: resolvedName,
        rootPath: path,
        readOnly: true
      }
    },

    get(id: string): RootEntry | null {
      // 빈 문자열 포함 미등록 ID → null
      if (!id) return null
      return _map.get(id) ?? null
    },

    listReferences(): ReferenceFolder[] {
      const result: ReferenceFolder[] = []
      for (const entry of _map.values()) {
        if (entry.id === WORKSPACE_ROOT_ID) continue
        result.push({
          id: entry.id,
          name: entry.name,
          rootPath: entry.path,
          readOnly: true
        })
      }
      return result
    }
  }
}
