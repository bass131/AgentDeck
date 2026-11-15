// M05 G12 — 테스트 배치 가드. 수집 테스트가 소스와 같은 `<프로세스>/NN_Domain/` 폴더에 놓이고,
// 이름이 작업 ID가 아니라 `<대상모듈>.<관점-kebab>.test.ts(x)`로 읽히는지 고정한다.
// 근거: 01_Milestones/M05_Structure/99c_Goal-G12-테스트-미러-배치.md(완료조건), 99d_G12-재실측.md(정규식·이름 규칙).
// 이 파일 이름도 새 이름 규칙의 꼴을 따른다(대상 = 테스트 배치, 관점 = guard). 자리는 루트의 「제자리」 항목이다.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TESTS_ROOT = fileURLToPath(new URL('./', import.meta.url))
const SOURCE_ROOT = fileURLToPath(new URL('../00_Source/', import.meta.url))

const COLLECTED_SUFFIXES = ['.test.ts', '.test.tsx'] as const
const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', 'coverage', '.git'])

// 「제자리」 — 옮기지 않는 항목(goal 결정 대장 [AI] 2026-11-16, 재실측 1·5절).
// e2e·fixtures는 vitest가 수집하지 않는 파일만 두지만, 걷기에서 아예 뺀다.
const STAY_DIR_PREFIXES = ['_lib/', 'hooks/', 'integration/', 'e2e/', 'fixtures/'] as const
const STAY_ROOT_FILES = new Set(['smoke.test.ts', 'collection-baseline.test.ts', 'testLayout.guard.test.ts'])

// 재실측 1절의 실측 정규식 — 옛 이름 172개(39계열)에 맞고 새 이름·소스 파일 이름에는 0개 맞는다.
const TASK_ID_PREFIX = /^(?:[a-z]{1,5}\d+[a-z]?|fb|phase-b)-/
// 끝에 붙은 작업 ID 13개(`-f14`·`-p5c`·`-fb2-p02`·`-bcd-e` 등). 옛 이름 13개에 맞고 새 이름에는 0개 맞는다.
const TASK_ID_SUFFIX = /-(?:[a-z]{1,3}\d+[a-z]?)(?:-[a-z]{1,3}\d+[a-z]?)*\.test\.tsx?$|-bcd-e\.test\.tsx?$/
// 재실측 「이름 규칙의 해석」의 모양 검사 — `<대상모듈>` 또는 `<대상모듈>.<관점-kebab>`.
const NAME_SHAPE = /^[A-Za-z][A-Za-z0-9]*(\.[a-z0-9]+(-[a-z0-9]+)*)?\.test\.tsx?$/
// 도메인 폴더 아래는 평평하다(재실측 1절 — 소스의 하위 폴더는 비추지 않는다).
const DOMAIN_LAYOUT = /^(main|renderer|shared)\/(\d\d_[A-Za-z]+)\/[^/]+$/
const HELPER_LAYOUT = /^(main|renderer|shared)\/00_Helpers\/[^/]+$/

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walk(full, acc)
      continue
    }
    if (entry.isFile()) acc.push(path.relative(TESTS_ROOT, full).split(path.sep).join('/'))
  }
  return acc.sort()
}

const isCollected = (rel: string): boolean => COLLECTED_SUFFIXES.some((s) => rel.endsWith(s))
const isStay = (rel: string): boolean =>
  STAY_ROOT_FILES.has(rel) || STAY_DIR_PREFIXES.some((p) => rel.startsWith(p))
const baseName = (rel: string): string => rel.slice(rel.lastIndexOf('/') + 1)

function sourceDomainExists(processName: string, domain: string): boolean {
  const base = processName === 'renderer' ? path.join(SOURCE_ROOT, 'renderer', 'src') : path.join(SOURCE_ROOT, processName)
  return fs.existsSync(path.join(base, domain))
}

const allFiles = walk(TESTS_ROOT).filter((rel) => !rel.startsWith('e2e/') && !rel.startsWith('fixtures/'))
const collected = allFiles.filter(isCollected)
const placed = collected.filter((rel) => !isStay(rel))

describe('테스트 배치 가드 (M05 G12)', () => {
  it('제자리 항목이 실제로 있다 — 가드가 빈 집합으로 통과하지 않는다', () => {
    for (const rel of STAY_ROOT_FILES) expect(collected, `제자리 루트 파일 ${rel}`).toContain(rel)
    expect(placed.length).toBeGreaterThan(0)
  })

  it('작업 ID로 시작하는 테스트 파일 이름이 0개다', () => {
    const offenders = collected.filter((rel) => TASK_ID_PREFIX.test(baseName(rel)))
    expect(offenders, `작업 ID 접두 ${offenders.length}개`).toEqual([])
  })

  it('끝에 작업 ID가 붙은 테스트 파일 이름이 0개다', () => {
    const offenders = collected.filter((rel) => TASK_ID_SUFFIX.test(baseName(rel)))
    expect(offenders, `끝 작업 ID ${offenders.length}개`).toEqual([])
  })

  it('제자리 밖의 테스트는 모두 소스에 있는 <프로세스>/NN_Domain/ 바로 아래에 있다', () => {
    const offenders = placed.filter((rel) => {
      const m = DOMAIN_LAYOUT.exec(rel)
      if (!m) return true
      if (m[2] === '00_Helpers') return true
      return !sourceDomainExists(m[1], m[2])
    })
    expect(offenders, `자리 밖 ${offenders.length}개`).toEqual([])
  })

  it('제자리 밖의 테스트 이름은 <대상모듈>.<관점-kebab>.test.ts(x) 꼴이다', () => {
    const offenders = placed.filter((rel) => !NAME_SHAPE.test(baseName(rel)))
    expect(offenders, `이름 꼴 밖 ${offenders.length}개`).toEqual([])
  })

  it('테스트가 아닌 파일(헬퍼)은 <프로세스>/00_Helpers/ 바로 아래에 있다', () => {
    const procFiles = allFiles.filter((rel) => /^(main|renderer|shared|agents)\//.test(rel))
    const offenders = procFiles.filter((rel) => !isCollected(rel) && !HELPER_LAYOUT.test(rel))
    expect(offenders, `헬퍼 자리 밖 ${offenders.length}개`).toEqual([])
  })

  it('01_TestCode/agents/ 아래에 테스트가 없다 — main/03_Agent·04_Claude로 옮겼다', () => {
    const offenders = collected.filter((rel) => rel.startsWith('agents/'))
    expect(offenders, `agents/ 아래 ${offenders.length}개`).toEqual([])
  })
})
