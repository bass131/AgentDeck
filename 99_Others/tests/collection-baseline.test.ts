/**
 * collection-baseline.test.ts — 테스트 수집 기준선 fitness (RS1 P01)
 *
 * 목적:
 *   `99_Others/tests/**` 아래에서 **vitest 가 수집하는** 테스트 파일 수가
 *   기준선(BASELINE_TEST_FILES) 아래로 떨어지면 red 를 켠다.
 *   개명·통합·이동 실수로 파일이 수집에서 *조용히* 빠지는 침묵 고장을 잡는 장치다.
 *
 * 적합도 함수(fitness function):
 *   "테스트가 전부 수집된다"는 아키텍처 성질을 사람의 기억 대신 기계 검사로 상시 감시한다.
 *
 * 세는 기준:
 *   vitest.config.ts 의 `test.include` 글롭과 **같은 기준**(확장자 `.test.ts` / `.test.tsx`).
 *   e2e(`*.e2e.ts`)는 playwright 소관이라 세지 않는다 — 세면 vitest 수집 수와 어긋난다.
 *   기준이 어긋나는 것 자체를 막기 위해, include 글롭이 바뀌면 아래 첫 케이스가 red 가 된다.
 *
 * 결정론:
 *   시간·랜덤·네트워크 의존 없음. 파일 시스템 순회(node:fs)만 사용하고
 *   경로는 import.meta.url 기준이라 cwd 에 의존하지 않는다.
 *
 * 알려진 한계:
 *   하한 단언이라 기준선 위에서 줄어드는 것(예: 405 → 404)은 잡지 못한다.
 *   파일이 늘어난 Phase 를 닫을 때 기준선을 올리는 ratchet 갱신은 각 Phase 재량.
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ── 경로 (테스트 파일 위치 기준 — cwd 비의존) ─────────────────────────────────
const TESTS_ROOT = fileURLToPath(new URL('./', import.meta.url)) // 99_Others/tests
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const VITEST_CONFIG = path.join(REPO_ROOT, 'vitest.config.ts')

/** vitest.config.ts 가 수집하는 글롭 — 이 목록이 바뀌면 세는 기준도 함께 바뀌어야 한다. */
const EXPECTED_INCLUDE = [
  '99_Others/tests/**/*.test.ts',
  '99_Others/tests/**/*.test.tsx',
] as const

/** 위 글롭에 대응하는 확장자 접미사. */
const COLLECTED_SUFFIXES = ['.test.ts', '.test.tsx'] as const

/** 순회에서 제외하는 디렉토리(빌드 산출물·의존성 — vitest 기본 exclude 와 같은 취지). */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', 'coverage', '.git'])

/** RS1 P01 실측 기준선. 이 파일 자신을 포함해 403 → 하한은 402. */
const BASELINE_TEST_FILES = 402

/**
 * TESTS_ROOT 이하를 재귀 순회하며 vitest 수집 대상 파일의 상대 경로를 모은다.
 * 반환은 정렬된 배열 — 파일 시스템 순서에 흔들리지 않게(결정론).
 */
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
    // 글롭이 바뀌었는데 이 테스트의 확장자 기준이 그대로면 수를 잘못 세게 된다.
    expect(declared).toEqual([...EXPECTED_INCLUDE])
  })

  it(`수집되는 테스트 파일이 ${BASELINE_TEST_FILES}개 이상이다`, () => {
    const files = collectTestFiles(TESTS_ROOT)
    expect(files.length).toBeGreaterThanOrEqual(BASELINE_TEST_FILES)
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
