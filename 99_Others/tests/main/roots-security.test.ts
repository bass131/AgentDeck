import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRootRegistry } from '../../../02_Source/main/02_fs/roots'
import { readFileSafe } from '../../../02_Source/main/02_fs/read'

let refRoot: string
let outsideDir: string

beforeAll(() => {
  refRoot = join(tmpdir(), `agentdeck-ref-${Date.now()}`)
  outsideDir = join(tmpdir(), `agentdeck-outside-${Date.now()}`)

  mkdirSync(refRoot, { recursive: true })
  mkdirSync(outsideDir, { recursive: true })

  writeFileSync(join(refRoot, 'secret.txt'), 'ref secret content')
  writeFileSync(join(outsideDir, 'private.txt'), 'outside private content')
})

afterAll(() => {
  rmSync(refRoot, { recursive: true, force: true })
  rmSync(outsideDir, { recursive: true, force: true })
})

describe('[보안] 미등록 root ID 차단', () => {
  it('get(bogus-id) → null (IPC 핸들러 not-found 근거)', () => {
    const registry = createRootRegistry()
    expect(registry.get('bogus-id')).toBeNull()
    expect(registry.get('ref-999')).toBeNull()
    expect(registry.get('workspace')).toBeNull()
  })

  it('미등록 ID null → readFileSafe 경유 흐름이 차단됨 (시뮬레이션)', () => {
    const registry = createRootRegistry()
    const bogusId = 'ref-999'
    const root = registry.get(bogusId)
    if (!root) {
      expect(root).toBeNull()
      return
    }
    throw new Error('미등록 ID 가 레지스트리를 통과했습니다 — 보안 위반')
  })

  it('[절대경로 주입] 절대경로를 root ID로 보내도 null (레지스트리 차단)', () => {
    const registry = createRootRegistry()
    const injectedPath = process.platform === 'win32'
      ? 'C:/Windows/System32'
      : '/etc'
    expect(registry.get(injectedPath)).toBeNull()
  })

  it('[절대경로 주입] 실제 존재하는 경로를 root ID로 줘도 null', () => {
    const registry = createRootRegistry()
    expect(registry.get(refRoot)).toBeNull()
  })

  it('등록된 레퍼런스 root ID는 정상 조회됨 (차단되면 안 되는 케이스)', () => {
    const registry = createRootRegistry()
    const ref = registry.addReference(refRoot, 'testRef')
    const entry = registry.get(ref.id)
    expect(entry).not.toBeNull()
    expect(entry?.path).toBe(refRoot)
  })
})

describe('[보안] 레퍼런스 루트 기준 경로 탈출 차단 (루트별 독립 resolveSafe)', () => {
  it('레퍼런스 루트 내 정상 파일 → 읽기 성공 (기준선)', () => {
    const result = readFileSafe(refRoot, 'secret.txt')
    expect(result.kind).toBe('text')
    if (result.kind === 'text') {
      expect(result.content).toBe('ref secret content')
    }
  })

  it('[탈출] ../../ 로 레퍼런스 루트 밖 파일 접근 → not-found', () => {
    const result = readFileSafe(refRoot, '../../etc/passwd')
    expect(result.kind).toBe('not-found')
  })

  it('[탈출] 루트 밖 outsideDir 내 파일 탈출 시도 → not-found', () => {
    const relativePath = `../${outsideDir.split(/[\\/]/).pop()}/private.txt`
    const result = readFileSafe(refRoot, relativePath)
    expect(result.kind).toBe('not-found')
  })

  it('[탈출] 절대경로로 루트 밖 직접 지정 → not-found', () => {
    const abs = process.platform === 'win32'
      ? 'C:/Windows/System32/drivers/etc/hosts'
      : '/etc/passwd'
    const result = readFileSafe(refRoot, abs)
    expect(result.kind).toBe('not-found')
  })

  it('[탈출] 레퍼런스 루트 내 junction/symlink로 루트 밖 탈출 → not-found (realpath 2단계)', () => {
    const linkPath = join(refRoot, 'escape-link')
    let linked = false
    try {
      symlinkSync(outsideDir, linkPath, 'junction')
      linked = true
    } catch {
    }
    if (linked) {
      const result = readFileSafe(refRoot, 'escape-link/private.txt')
      expect(result.kind).toBe('not-found')
      rmSync(linkPath, { recursive: true, force: true })
    }
  })

  it('[루트 독립] 레퍼런스 루트 path로 워크스페이스 파일 접근 불가 (루트 격리)', () => {
    const wsRoot = join(tmpdir(), `agentdeck-ws-${Date.now()}`)
    mkdirSync(wsRoot, { recursive: true })
    writeFileSync(join(wsRoot, 'workspace-file.ts'), 'ws content')

    try {
      const registry = createRootRegistry()
      registry.setWorkspace(wsRoot)
      const ref = registry.addReference(refRoot, 'ref')

      const refEntry = registry.get(ref.id)!
      const wsBasename = wsRoot.split(/[\\/]/).pop()!
      const result = readFileSafe(refEntry.path, `../${wsBasename}/workspace-file.ts`)
      expect(result.kind).toBe('not-found')
    } finally {
      rmSync(wsRoot, { recursive: true, force: true })
    }
  })
})

describe('[보안] 레퍼런스 readOnly 불변식', () => {
  it('addReference 반환 readOnly 는 항상 literal true', () => {
    const registry = createRootRegistry()
    const ref = registry.addReference(refRoot, 'testRef')
    expect(ref.readOnly).toBe(true)
    expect(ref.readOnly).toStrictEqual(true)
  })

  it('listReferences 의 모든 항목 readOnly === true', () => {
    const registry = createRootRegistry()
    registry.addReference(refRoot, 'r1')
    registry.addReference(join(tmpdir(), 'dummy'), 'r2')
    const list = registry.listReferences()
    for (const item of list) {
      expect(item.readOnly).toBe(true)
    }
  })

  it('워크스페이스 엔트리는 readOnly === false (레퍼런스와 구분)', () => {
    const registry = createRootRegistry()
    registry.setWorkspace('/some/ws')
    const ws = registry.get('workspace')
    expect(ws?.readOnly).toBe(false)
  })
})
