/**
 * roots-security.test.ts — 루트 레지스트리 + readFileSafe 통합 보안 회귀 테스트
 *
 * 목적: IPC fs.read 핸들러의 root 게이트가 차단하는 두 가지 핵심 경로를
 *        레지스트리 + readFileSafe 조합으로 직접 검증한다.
 *
 * 보안 불변식:
 *   1) get(미등록 root ID) → null → IPC 핸들러가 not-found 반환 (경로 주입 차단)
 *   2) 레퍼런스 루트 기준 ../../ 탈출 → readFileSafe 가 not-found 반환 (루트별 독립)
 *
 * electron import 없음 → node 환경에서 실행.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRootRegistry } from '../../src/main/fs/roots'
import { readFileSafe } from '../../src/main/fs/read'

// ── 픽스처 ────────────────────────────────────────────────────────────────────

let refRoot: string      // 레퍼런스 루트 (임시 디렉토리)
let outsideDir: string   // 레퍼런스 루트 밖 디렉토리

beforeAll(() => {
  // ref root: /tmp/agentdeck-ref-xxx/
  //   secret.txt  (루트 안, 접근 허용)
  // outside dir: /tmp/agentdeck-outside-xxx/
  //   private.txt (루트 밖, 접근 차단)
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

// ── 보안 회귀 1: 미등록 root ID → not-found ───────────────────────────────────

describe('[보안] 미등록 root ID 차단', () => {
  it('get(bogus-id) → null (IPC 핸들러 not-found 근거)', () => {
    const registry = createRootRegistry()
    expect(registry.get('bogus-id')).toBeNull()
    expect(registry.get('ref-999')).toBeNull()
    expect(registry.get('workspace')).toBeNull() // 워크스페이스 미설정
  })

  it('미등록 ID null → readFileSafe 경유 흐름이 차단됨 (시뮬레이션)', () => {
    const registry = createRootRegistry()
    // IPC 핸들러 로직 시뮬레이션:
    //   const root = _roots.get(rootId)
    //   if (!root) return { kind: 'not-found' }
    //   return readFileSafe(root.path, req.path, ...)
    const bogusId = 'ref-999'
    const root = registry.get(bogusId)
    if (!root) {
      // 핸들러가 여기서 not-found 반환 — readFileSafe 도달 불가
      expect(root).toBeNull()
      return
    }
    // 이 코드에 도달하면 안 됨
    throw new Error('미등록 ID 가 레지스트리를 통과했습니다 — 보안 위반')
  })

  it('[절대경로 주입] 절대경로를 root ID로 보내도 null (레지스트리 차단)', () => {
    const registry = createRootRegistry()
    // renderer가 임의 경로를 root 필드에 주입해도 ID 조회 실패 → null
    const injectedPath = process.platform === 'win32'
      ? 'C:/Windows/System32'
      : '/etc'
    expect(registry.get(injectedPath)).toBeNull()
  })

  it('[절대경로 주입] 실제 존재하는 경로를 root ID로 줘도 null', () => {
    const registry = createRootRegistry()
    // refRoot 가 실제로 존재하는 경로이지만 레지스트리에 등록되지 않으면 null
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

// ── 보안 회귀 2: 레퍼런스 루트 기준 경로 탈출 차단 ──────────────────────────────

describe('[보안] 레퍼런스 루트 기준 경로 탈출 차단 (루트별 독립 resolveSafe)', () => {
  it('레퍼런스 루트 내 정상 파일 → 읽기 성공 (기준선)', () => {
    const result = readFileSafe(refRoot, 'secret.txt')
    expect(result.kind).toBe('text')
    if (result.kind === 'text') {
      expect(result.content).toBe('ref secret content')
    }
  })

  it('[탈출] ../../ 로 레퍼런스 루트 밖 파일 접근 → not-found', () => {
    // refRoot/../../private.txt 형태의 탈출 시도
    const result = readFileSafe(refRoot, '../../etc/passwd')
    expect(result.kind).toBe('not-found')
  })

  it('[탈출] 루트 밖 outsideDir 내 파일 탈출 시도 → not-found', () => {
    // outsideDir 가 refRoot 와 형제 디렉토리 관계 → 탈출 시도
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
    // refRoot 안에 루트 밖(outsideDir)을 가리키는 링크(Windows=junction, POSIX=dir symlink).
    // 문자열 containment(1단계)는 통과하지만 realpath(2단계)가 루트 밖 → not-found.
    const linkPath = join(refRoot, 'escape-link')
    let linked = false
    try {
      symlinkSync(outsideDir, linkPath, 'junction')
      linked = true
    } catch {
      // 심링크 생성 권한 부재 환경 — 단정 스킵(문자열 탈출은 위 케이스들이 커버)
    }
    if (linked) {
      const result = readFileSafe(refRoot, 'escape-link/private.txt')
      expect(result.kind).toBe('not-found')
      rmSync(linkPath, { recursive: true, force: true })
    }
  })

  it('[루트 독립] 레퍼런스 루트 path로 워크스페이스 파일 접근 불가 (루트 격리)', () => {
    // 레지스트리에 두 루트 등록 후, refRoot 기준으로 wsRoot 내 파일 접근 시도
    const wsRoot = join(tmpdir(), `agentdeck-ws-${Date.now()}`)
    mkdirSync(wsRoot, { recursive: true })
    writeFileSync(join(wsRoot, 'workspace-file.ts'), 'ws content')

    try {
      const registry = createRootRegistry()
      registry.setWorkspace(wsRoot)
      const ref = registry.addReference(refRoot, 'ref')

      // ref root 기준으로 형제 wsRoot 내 파일 탈출 시도
      const refEntry = registry.get(ref.id)!
      const wsBasename = wsRoot.split(/[\\/]/).pop()!
      const result = readFileSafe(refEntry.path, `../${wsBasename}/workspace-file.ts`)
      expect(result.kind).toBe('not-found')
    } finally {
      rmSync(wsRoot, { recursive: true, force: true })
    }
  })
})

// ── 보안 불변식: 레퍼런스는 읽기 전용 ──────────────────────────────────────────

describe('[보안] 레퍼런스 readOnly 불변식', () => {
  it('addReference 반환 readOnly 는 항상 literal true', () => {
    const registry = createRootRegistry()
    const ref = registry.addReference(refRoot, 'testRef')
    // TypeScript 타입 readOnly: true + 런타임 값 확인
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
