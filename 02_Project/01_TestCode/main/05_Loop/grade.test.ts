// M09 G1 등급 규칙 — 실행기가 변경 통계로 계산한다. 세지 않는 것(템플릿의 문서 *.md, 실행기 껍질이 빼는 루트 .agentdeck/)만 빼고 모든 변경 줄을 세어
// 템플릿의 문턱 이상이면 강, 시험·설정·CI 같은 보호 경로를 건드리면 강, 판단할 정보가 없거나 애매하면 강이다.
// 허용 목록(src/만 셈)이 아니라 금지 목록인 이유: 시험·설정만 바꾸거나 소스를 다른 폴더로 옮겨 검수를 끄지 못하게.
import { describe, it, expect } from 'vitest'
import { computeGrade, matchesPath, normalizePath, type FileChange } from '@main/05_Loop/grade'
import type { GradingPolicy } from '@main/05_Loop/template'
import { loaded } from '../00_Helpers/loopFakes'

const policy = (): GradingPolicy => loaded().template.grading
const ch = (path: string, added: number | null, removed: number | null = 0): FileChange => ({ path, added, removed })

describe('등급 규칙 (실제 템플릿의 문턱 50)', () => {
  it('49줄은 약, 50줄은 강이다 — 더한 줄과 지운 줄을 함께 센다', () => {
    expect(computeGrade(policy(), [ch('src/a.ts', 30, 19)]).grade).toBe('weak')
    expect(computeGrade(policy(), [ch('src/a.ts', 30, 20)]).grade).toBe('strong')
    expect(computeGrade(policy(), [ch('src/a.ts', 25), ch('lib/b.ts', 25)]).grade).toBe('strong')
  })

  it('템플릿이 세지 않는 것은 문서(*.md)뿐이다 — src/ 밖의 코드도 센다', () => {
    expect(computeGrade(policy(), [ch('src/a.ts', 10), ch('docs/guide.md', 400), ch('README.md', 300)]).grade).toBe('weak')
    expect(computeGrade(policy(), [ch('lib/a.js', 60)]).grade).toBe('strong')
    expect(computeGrade(policy(), [ch('scripts/build.mjs', 50)]).grade).toBe('strong')
  })

  it('중첩된 .agentdeck/ 폴더는 세지 않는 경로가 아니다 — 루트의 실행기 몫만 실행기 껍질이 뺀다', () => {
    expect(computeGrade(policy(), [ch('src/.agentdeck/big.ts', 2000), ch('src/index.ts', 1)]).grade).toBe('strong')
    expect(policy().uncountedPaths).not.toContain('.agentdeck/')
  })

  it('시험·설정·CI 경로를 건드리면 줄 수와 관계없이 강이다', () => {
    for (const path of [
      '.github/workflows/ci.yml', 'package.json', 'package-lock.json', 'src/package.json', 'tsconfig.json',
      'tsconfig.build.json', 'vitest.config.ts', 'test/a.ts', 'tests/a.ts', 'src/tests/b.ts', 'src/a.test.ts', 'a.spec.js',
      'vite.config.ts', 'jest.config.js', 'src/__tests__/a.ts', 'spec/a.ts',
    ]) {
      const r = computeGrade(policy(), [ch(path, 1)])
      expect(r.grade, path).toBe('strong')
      expect(r.reason, path).toContain('보호 경로')
    }
    expect(computeGrade(policy(), [ch('.github\\workflows\\ci.yml', 1)]).grade).toBe('strong')
    expect(computeGrade(policy(), [ch('./.github/CODEOWNERS', 1)]).reason).toContain('보호 경로')
  })

  it('이름만 비슷한 경로는 보호 경로가 아니다', () => {
    for (const path of ['package.json.bak', 'src/contest/a.ts', 'src/latest.ts', 'src/testing.ts', 'tsconfig/x.ts']) {
      expect(computeGrade(policy(), [ch(path, 1)]).grade, path).toBe('weak')
    }
  })

  it('통계가 없거나(오류), 변경이 비었거나, 줄 수를 모르는 파일(바이너리)이 있으면 강이다', () => {
    expect(computeGrade(policy(), null).grade).toBe('strong')
    expect(computeGrade(policy(), []).grade).toBe('strong')
    expect(computeGrade(policy(), [ch('src/logo.png', null, null)]).grade).toBe('strong')
  })

  it('문턱은 템플릿이 정한다', () => {
    const p = { ...policy(), strongLineThreshold: 10 }
    expect(computeGrade(p, [ch('src/a.ts', 10)]).grade).toBe('strong')
    expect(computeGrade(p, [ch('src/a.ts', 9)]).grade).toBe('weak')
  })

  it('세지 않는 목록을 비우면 문서도 센다', () => {
    const p = { ...policy(), uncountedPaths: [] }
    expect(computeGrade(p, [ch('docs/guide.md', 60)]).grade).toBe('strong')
  })

  it('경로 꼴 — /로 끝나면 어느 깊이든 그 폴더, / 없는 꼴은 파일 이름, **/는 0개 이상의 폴더', () => {
    expect(normalizePath('.\\src\\a.ts')).toBe('src/a.ts')
    expect(matchesPath('src/tests/a.ts', 'tests/')).toBe(true)
    expect(matchesPath('src/contests/a.ts', 'tests/')).toBe(false)
    expect(matchesPath('a/b/c.test.tsx', '**/*.test.*')).toBe(true)
    expect(matchesPath('c.test.tsx', '**/*.test.*')).toBe(true)
    expect(matchesPath('docs/a.md', '*.md')).toBe(true)
    expect(matchesPath('docs/a.mdx', '*.md')).toBe(false)
  })
})
