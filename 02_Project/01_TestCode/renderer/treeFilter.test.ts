import { describe, it, expect } from 'vitest'
import { filterFiles } from '../../../02_Project/00_Source/renderer/src/lib/treeFilter'
import type { FileTreeNode } from '../../../02_Project/00_Source/shared/ipcContract'

const tree: FileTreeNode = {
  name: 'root',
  path: '',
  kind: 'directory',
  children: [
    { name: 'app.ts', path: 'app.ts', kind: 'file' },
    {
      name: 'src',
      path: 'src',
      kind: 'directory',
      children: [
        { name: 'index.ts', path: 'src/index.ts', kind: 'file' },
        { name: 'appStore.ts', path: 'src/appStore.ts', kind: 'file' },
        { name: 'styles.css', path: 'src/styles.css', kind: 'file' },
      ],
    },
  ],
}

describe('filterFiles', () => {
  it('빈 쿼리 → 빈 배열', () => {
    expect(filterFiles(tree, '')).toEqual([])
    expect(filterFiles(tree, '   ')).toEqual([])
  })

  it('null 트리 → 빈 배열', () => {
    expect(filterFiles(null, 'app')).toEqual([])
  })

  it('이름 부분 매치(중첩 디렉토리 가로질러 평탄)', () => {
    const r = filterFiles(tree, 'app')
    const names = r.map((f) => f.name)
    expect(names).toContain('app.ts')
    expect(names).toContain('appStore.ts')
    expect(names).not.toContain('styles.css')
  })

  it('대소문자 무관', () => {
    expect(filterFiles(tree, 'TS').length).toBe(3)
  })

  it('startswith가 contains보다 먼저 정렬된다', () => {
    const r = filterFiles(tree, 'app')
    expect(r[0].name).toBe('app.ts')
  })

  it('상한(limit)을 적용한다', () => {
    expect(filterFiles(tree, 't', 2).length).toBe(2)
  })

  it('디렉토리는 결과에 포함하지 않는다(파일만)', () => {
    const r = filterFiles(tree, 'src')
    expect(r.every((f) => !f.path.endsWith('src') || f.name !== 'src')).toBe(true)
    expect(r.map((f) => f.name)).not.toContain('src')
  })
})
