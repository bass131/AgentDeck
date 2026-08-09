import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { listProjectFiles } from '../../../02_Project/00_Source/main/02_fs/listFiles'

let tmpRoot: string

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'agentdeck-listfiles-'))

  writeFileSync(join(tmpRoot, 'a.ts'), 'export const a = 1')

  mkdirSync(join(tmpRoot, 'sub'), { recursive: true })
  writeFileSync(join(tmpRoot, 'sub', 'b.ts'), 'export const b = 2')

  mkdirSync(join(tmpRoot, 'node_modules', 'some-pkg'), { recursive: true })
  writeFileSync(join(tmpRoot, 'node_modules', 'some-pkg', 'x.js'), 'module.exports = {}')

  mkdirSync(join(tmpRoot, '.git'), { recursive: true })
  writeFileSync(join(tmpRoot, '.git', 'y'), 'ref: refs/heads/main')

  mkdirSync(join(tmpRoot, 'dist'), { recursive: true })
  writeFileSync(join(tmpRoot, 'dist', 'bundle.js'), 'built')

  mkdirSync(join(tmpRoot, '.next'), { recursive: true })
  writeFileSync(join(tmpRoot, '.next', 'server.js'), 'built')

  mkdirSync(join(tmpRoot, '.claude'), { recursive: true })
  writeFileSync(join(tmpRoot, '.claude', 'skill.md'), '# skill')

  mkdirSync(join(tmpRoot, '.github', 'workflows'), { recursive: true })
  writeFileSync(join(tmpRoot, '.github', 'workflows', 'ci.yml'), 'name: CI')

  mkdirSync(join(tmpRoot, '.hidden'), { recursive: true })
  writeFileSync(join(tmpRoot, '.hidden', 'secret.txt'), 'hidden')
})

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

describe('listProjectFiles', () => {
  it('최상위 파일을 포함한다', async () => {
    const files = await listProjectFiles(tmpRoot)
    expect(files).toContain('a.ts')
  })

  it('중첩 파일을 POSIX 상대 경로로 포함한다', async () => {
    const files = await listProjectFiles(tmpRoot)
    expect(files).toContain('sub/b.ts')
  })

  it('node_modules 하위 파일은 제외한다', async () => {
    const files = await listProjectFiles(tmpRoot)
    const nodeModulesFiles = files.filter((f) => f.startsWith('node_modules'))
    expect(nodeModulesFiles).toHaveLength(0)
  })

  it('.git 하위 파일은 제외한다', async () => {
    const files = await listProjectFiles(tmpRoot)
    const gitFiles = files.filter((f) => f.startsWith('.git/'))
    expect(gitFiles).toHaveLength(0)
  })

  it('dist 하위 파일은 제외한다', async () => {
    const files = await listProjectFiles(tmpRoot)
    const distFiles = files.filter((f) => f.startsWith('dist/'))
    expect(distFiles).toHaveLength(0)
  })

  it('.next 하위 파일은 제외한다 (SKIP_DIRS)', async () => {
    const files = await listProjectFiles(tmpRoot)
    const nextFiles = files.filter((f) => f.startsWith('.next/'))
    expect(nextFiles).toHaveLength(0)
  })

  it('KEEP_DOT_DIRS인 .claude 하위 파일은 포함한다', async () => {
    const files = await listProjectFiles(tmpRoot)
    expect(files).toContain('.claude/skill.md')
  })

  it('KEEP_DOT_DIRS인 .github/workflows 파일은 포함한다', async () => {
    const files = await listProjectFiles(tmpRoot)
    expect(files).toContain('.github/workflows/ci.yml')
  })

  it('KEEP_DOT_DIRS에 없는 숨김 디렉토리(.hidden)는 제외한다', async () => {
    const files = await listProjectFiles(tmpRoot)
    const hiddenFiles = files.filter((f) => f.startsWith('.hidden/'))
    expect(hiddenFiles).toHaveLength(0)
  })

  it('경로 구분자는 항상 POSIX 슬래시다 (Windows 백슬래시 없음)', async () => {
    const files = await listProjectFiles(tmpRoot)
    const backslashFiles = files.filter((f) => f.includes('\\'))
    expect(backslashFiles).toHaveLength(0)
  })

  it('빈 문자열 입력은 [] 를 반환한다', async () => {
    const files = await listProjectFiles('')
    expect(files).toEqual([])
  })

  it('반환값은 배열이다', async () => {
    const files = await listProjectFiles(tmpRoot)
    expect(Array.isArray(files)).toBe(true)
  })
})
