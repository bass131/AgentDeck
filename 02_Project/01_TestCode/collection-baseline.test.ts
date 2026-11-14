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
// M05 G9a: 414 → 415. 공용 실행 코어의 구조 단위 테스트 renderer/g9a-run-core.test.ts를 더했다.
// M05 G9a: 415 → 416. 단일·멀티 실행 동작 정렬(E 항목) 테스트 renderer/g9a-run-core-alignment.test.tsx를 더했다.
// M05 G9b: 416 → 417. 공용 스레드 렌더(ThreadView) 구조 테스트 renderer/g9b-thread-view.test.tsx를 더했다.
// M05 G9b: 417 → 418. 패널이 공용 스레드 렌더를 쓰는지(R1~R7) 고정하는 renderer/g9b-panel-thread.test.tsx를 더했다.
// M05 G9b: 418 → 419. 선택기 하나(PickerGroup, P1·P2·P5) 테스트 renderer/g9b-picker-group.test.tsx를 더했다.
// M05 G9b: 419 → 420. 입력창 본체 하나(ComposerView)·대기열·패널 입력창 테스트 renderer/g9b-composer-view.test.tsx를 더했다.
// M05 G9b: 420 → 421. 대기열을 공용 실행 상태로 옮긴 구조 테스트 renderer/g9b-queue-core.test.tsx를 더했다.
// M05 G9b: 421 → 420. 패널 팔레트 사본 useInputPalettes.ts를 지우며 그 테스트 renderer/useInputPalettes.test.tsx도
// 지웠다. root 전달 테스트는 useSlashPalette.test.tsx로 옮겼고, 나머지는 공용 훅 테스트가 이미 덮는다.
// M05 G9c: 420 → 421. 세션 레지스트리 키 형식(sessionKeys) 테스트 renderer/g9c-session-keys.test.ts를 더했다.
const BASELINE_TEST_FILES = 421

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
