/**
 * workspace.test.ts — buildTree + resolveSafe 단위 테스트
 *
 * electron을 import하지 않는 순수 모듈을 테스트 → node 환경에서 실행 가능.
 * TDD: 테스트 먼저 작성(RED) → 구현(GREEN) 순서.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// 구현 모듈 — Phase 04에서 생성될 파일
import { buildTree, resolveSafe } from '../../../02.Source/main/02_fs/workspace'

// ── 임시 파일 트리 픽스처 ──────────────────────────────────────────────────────
let tmpRoot: string

beforeAll(() => {
  tmpRoot = join(tmpdir(), `agentdeck-ws-test-${Date.now()}`)
  mkdirSync(tmpRoot, { recursive: true })

  // 구조:
  //   root/
  //     a.ts
  //     sub/
  //       b.ts
  //       deep/
  //         c.ts
  writeFileSync(join(tmpRoot, 'a.ts'), 'export const a = 1')
  mkdirSync(join(tmpRoot, 'sub'), { recursive: true })
  writeFileSync(join(tmpRoot, 'sub', 'b.ts'), 'export const b = 2')
  mkdirSync(join(tmpRoot, 'sub', 'deep'), { recursive: true })
  writeFileSync(join(tmpRoot, 'sub', 'deep', 'c.ts'), 'export const c = 3')
})

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

// ── buildTree ─────────────────────────────────────────────────────────────────

describe('buildTree', () => {
  it('루트 노드를 directory 종류로 반환한다', async () => {
    const tree = await buildTree(tmpRoot)
    expect(tree.kind).toBe('directory')
    expect(tree.name).toBeTruthy()
  })

  it('최상위 파일을 children에 포함한다', async () => {
    const tree = await buildTree(tmpRoot)
    const names = tree.children?.map((c) => c.name) ?? []
    expect(names).toContain('a.ts')
  })

  it('1레벨 children에 sub 디렉토리가 포함된다 (buildTree 축소 — lazy 전환)', async () => {
    // Phase 35(lazy): buildTree는 루트 + 1레벨만 빌드. 재귀(grandchildren) 없음.
    const tree = await buildTree(tmpRoot)
    const sub = tree.children?.find((c) => c.name === 'sub')
    expect(sub).toBeDefined()
    expect(sub?.kind).toBe('directory')
    // 1레벨 축소: sub의 children(grandchildren)은 빌드되지 않음
    expect(sub?.children).toBeUndefined()
  })

  it('1레벨 children에는 grandchildren이 없다 (재귀 제거)', async () => {
    // Phase 35 이전: buildTree가 재귀적으로 sub/deep/c.ts까지 빌드했음.
    // Phase 35 이후: sub.children 없음 — lazy 펼침으로 대체.
    const tree = await buildTree(tmpRoot)
    const sub = tree.children?.find((c) => c.name === 'sub')
    expect(sub?.children).toBeUndefined()
  })

  it('루트 1레벨 파일 노드의 path는 루트 기준 상대 경로다', async () => {
    const tree = await buildTree(tmpRoot)
    const aNode = tree.children?.find((c) => c.name === 'a.ts')
    // 상대 경로 — OS 구분자 무관하게 슬래시 정규화
    expect(aNode?.path).toBe('a.ts')
  })

  it('루트 1레벨 디렉토리 노드의 path는 슬래시 구분자 상대 경로다', async () => {
    // Phase 35: 1레벨이므로 sub의 path만 검증 (sub/b.ts는 lazy 로드 대상)
    const tree = await buildTree(tmpRoot)
    const sub = tree.children?.find((c) => c.name === 'sub')
    expect(sub?.path).toBe('sub')
  })
})

// ── resolveSafe (경로 탈출 방어 CRITICAL) ────────────────────────────────────

describe('resolveSafe', () => {
  it('정상 상대 경로를 절대 경로로 반환한다', () => {
    const result = resolveSafe(tmpRoot, 'a.ts')
    expect(result).toBe(join(tmpRoot, 'a.ts').replace(/\\/g, '/'))
  })

  it('../ 로 루트 밖을 탈출하려 하면 null을 반환한다', () => {
    const result = resolveSafe(tmpRoot, '../etc/passwd')
    expect(result).toBeNull()
  })

  it('중첩된 ../를 포함한 탈출도 거부한다', () => {
    const result = resolveSafe(tmpRoot, 'sub/../../etc/passwd')
    expect(result).toBeNull()
  })

  it('절대 경로로 root 밖을 직접 지정하면 null을 반환한다', () => {
    const result = resolveSafe(tmpRoot, '/etc/passwd')
    expect(result).toBeNull()
  })

  it('루트 자체 경로(".")는 허용한다', () => {
    const result = resolveSafe(tmpRoot, '.')
    expect(result).not.toBeNull()
  })

  it('하위 경로는 정상 허용한다', () => {
    const result = resolveSafe(tmpRoot, 'sub/b.ts')
    expect(result).not.toBeNull()
    expect(result).toContain('sub')
  })

  it('심볼릭 링크/junction으로 루트 밖을 탈출하면 null을 반환한다 (realpath 검사)', () => {
    // 루트 밖 디렉토리 + 비밀 파일
    const outside = join(tmpdir(), `agentdeck-outside-${Date.now()}`)
    mkdirSync(outside, { recursive: true })
    writeFileSync(join(outside, 'secret.txt'), 'TOP SECRET')

    // 루트 안에 루트 밖을 가리키는 링크(Windows=junction, POSIX=dir symlink)
    const linkPath = join(tmpRoot, 'escape-link')
    let linked = false
    try {
      symlinkSync(outside, linkPath, 'junction')
      linked = true
    } catch {
      // 권한 부재 환경(심링크 생성 불가) — 단정 스킵, 단 문자열 탈출은 아래서 계속 검증
    }

    if (linked) {
      // 문자열 containment(1단계)는 통과하지만 realpath(2단계)가 루트 밖 → null이어야 함
      expect(resolveSafe(tmpRoot, 'escape-link/secret.txt')).toBeNull()
      rmSync(linkPath, { recursive: true, force: true })
    }
    rmSync(outside, { recursive: true, force: true })
  })
})
