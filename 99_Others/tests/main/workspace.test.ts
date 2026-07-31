import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { buildTree, resolveSafe, validateWorkspaceRoot } from '../../../02_Source/main/02_fs/workspace'

let tmpRoot: string

beforeAll(() => {
  tmpRoot = join(tmpdir(), `agentdeck-ws-test-${Date.now()}`)
  mkdirSync(tmpRoot, { recursive: true })

  writeFileSync(join(tmpRoot, 'a.ts'), 'export const a = 1')
  mkdirSync(join(tmpRoot, 'sub'), { recursive: true })
  writeFileSync(join(tmpRoot, 'sub', 'b.ts'), 'export const b = 2')
  mkdirSync(join(tmpRoot, 'sub', 'deep'), { recursive: true })
  writeFileSync(join(tmpRoot, 'sub', 'deep', 'c.ts'), 'export const c = 3')
})

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

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
    const tree = await buildTree(tmpRoot)
    const sub = tree.children?.find((c) => c.name === 'sub')
    expect(sub).toBeDefined()
    expect(sub?.kind).toBe('directory')
    expect(sub?.children).toBeUndefined()
  })

  it('1레벨 children에는 grandchildren이 없다 (재귀 제거)', async () => {
    const tree = await buildTree(tmpRoot)
    const sub = tree.children?.find((c) => c.name === 'sub')
    expect(sub?.children).toBeUndefined()
  })

  it('루트 1레벨 파일 노드의 path는 루트 기준 상대 경로다', async () => {
    const tree = await buildTree(tmpRoot)
    const aNode = tree.children?.find((c) => c.name === 'a.ts')
    expect(aNode?.path).toBe('a.ts')
  })

  it('루트 1레벨 디렉토리 노드의 path는 슬래시 구분자 상대 경로다', async () => {
    const tree = await buildTree(tmpRoot)
    const sub = tree.children?.find((c) => c.name === 'sub')
    expect(sub?.path).toBe('sub')
  })
})

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
    const outside = join(tmpdir(), `agentdeck-outside-${Date.now()}`)
    mkdirSync(outside, { recursive: true })
    writeFileSync(join(outside, 'secret.txt'), 'TOP SECRET')

    const linkPath = join(tmpRoot, 'escape-link')
    let linked = false
    try {
      symlinkSync(outside, linkPath, 'junction')
      linked = true
    } catch {
    }

    if (linked) {
      expect(resolveSafe(tmpRoot, 'escape-link/secret.txt')).toBeNull()
      rmSync(linkPath, { recursive: true, force: true })
    }
    rmSync(outside, { recursive: true, force: true })
  })
})

describe('validateWorkspaceRoot', () => {
  it('절대경로 + 존재 + 디렉토리인 후보는 그대로 반환한다', () => {
    expect(validateWorkspaceRoot(tmpRoot)).toBe(tmpRoot)
  })

  it('상대경로는 null을 반환한다(비절대 거부)', () => {
    expect(validateWorkspaceRoot('sub/deep')).toBeNull()
    expect(validateWorkspaceRoot('.')).toBeNull()
  })

  it('존재하지 않는 절대경로는 null을 반환한다', () => {
    const missing = join(tmpRoot, 'does-not-exist-' + Date.now())
    expect(validateWorkspaceRoot(missing)).toBeNull()
  })

  it('파일 경로(디렉토리 아님)는 null을 반환한다', () => {
    expect(validateWorkspaceRoot(join(tmpRoot, 'a.ts'))).toBeNull()
  })

  it('undefined는 null을 반환한다(부재 — 옵셔널 체이닝 경로)', () => {
    expect(validateWorkspaceRoot(undefined)).toBeNull()
  })

  it('null은 null을 반환한다', () => {
    expect(validateWorkspaceRoot(null)).toBeNull()
  })

  it('빈 문자열/공백 문자열은 null을 반환한다', () => {
    expect(validateWorkspaceRoot('')).toBeNull()
    expect(validateWorkspaceRoot('   ')).toBeNull()
  })

  it('하위 디렉토리 절대경로도 유효하면 통과한다', () => {
    const subAbs = join(tmpRoot, 'sub')
    expect(validateWorkspaceRoot(subAbs)).toBe(subAbs)
  })

  it('예외를 던지지 않는다(graceful) — 이상한 타입 입력도 흡수', () => {
    expect(() => validateWorkspaceRoot(123 as unknown as string)).not.toThrow()
    expect(validateWorkspaceRoot(123 as unknown as string)).toBeNull()
  })
})
