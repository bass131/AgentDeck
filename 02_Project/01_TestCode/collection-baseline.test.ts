import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TESTS_ROOT = fileURLToPath(new URL('./', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const VITEST_CONFIG = path.join(REPO_ROOT, 'vitest.config.ts')

const EXPECTED_INCLUDE = [
  '02_Project/01_TestCode/**/*.test.ts',
  '02_Project/01_TestCode/**/*.test.tsx',
] as const

const COLLECTED_SUFFIXES = ['.test.ts', '.test.tsx'] as const

const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', 'coverage', '.git'])

// M02 Phase 5: 하한(≥) 판정을 집행 후 정확값 등호로 전환했다 ([USER] 2026-08-10 산출물·수집 차분 고정).
// 하한이면 수집 파일이 조용히 늘거나 줄어도 통과해서 차분이 판정 표면에 잡히지 않는다.
// 값을 바꿀 때는 추측하지 말고 실측해서(find 02_Project/01_TestCode -name '*.test.ts' -o -name '*.test.tsx') 고친다.
const BASELINE_TEST_FILES = 417

function collectTestFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      collectTestFiles(full, acc)
      continue
    }
    if (!entry.isFile()) continue
    if (COLLECTED_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) {
      acc.push(path.relative(TESTS_ROOT, full).split(path.sep).join('/'))
    }
  }
  return acc.sort()
}

describe('테스트 수집 기준선 (fitness)', () => {
  it('vitest include 글롭이 세는 기준과 일치한다', () => {
    const source = fs.readFileSync(VITEST_CONFIG, 'utf-8')
    const match = /include:\s*\[([^\]]*)\]/.exec(source)
    expect(match, 'vitest.config.ts 에서 test.include 를 찾지 못했다').not.toBeNull()

    const declared = Array.from(match![1].matchAll(/'([^']+)'/g)).map((m) => m[1])
    expect(declared).toEqual([...EXPECTED_INCLUDE])
  })

  it(`수집되는 테스트 파일이 정확히 ${BASELINE_TEST_FILES}개다`, () => {
    const files = collectTestFiles(TESTS_ROOT)
    expect(files.length).toBe(BASELINE_TEST_FILES)
  })

  it('e2e 스펙(playwright 소관)은 수집 수에 섞이지 않는다', () => {
    const files = collectTestFiles(TESTS_ROOT)
    expect(files.filter((f) => f.endsWith('.e2e.ts'))).toEqual([])
    expect(files.every((f) => f.endsWith('.test.ts') || f.endsWith('.test.tsx'))).toBe(true)
  })

  it('이 fitness 테스트 자신도 수집 대상에 들어 있다', () => {
    const files = collectTestFiles(TESTS_ROOT)
    expect(files).toContain('collection-baseline.test.ts')
  })
})
