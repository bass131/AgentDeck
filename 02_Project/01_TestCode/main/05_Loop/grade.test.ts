// M09 G1 등급 규칙 — 실행기가 변경 통계로 계산한다. 앱 소스 변경 줄 수가 템플릿의 문턱 이상이면 강,
// 템플릿이 적은 보호 경로를 건드리면 강, 판단할 정보가 없거나 애매하면 강이다.
import { describe, it, expect } from 'vitest'
import { computeGrade, normalizePath, type FileChange } from '@main/05_Loop/grade'
import type { GradingPolicy } from '@main/05_Loop/template'
import { loaded } from '../00_Helpers/loopFakes'

const policy = (): GradingPolicy => loaded().template.grading
const src = (path: string, added: number | null, removed: number | null = 0): FileChange => ({ path, added, removed })

describe('등급 규칙 (실제 템플릿의 문턱 50, 앱 소스 src/)', () => {
  it('앱 소스 49줄은 약, 50줄은 강이다 — 더한 줄과 지운 줄을 함께 센다', () => {
    expect(computeGrade(policy(), [src('src/a.ts', 30, 19)]).grade).toBe('weak')
    expect(computeGrade(policy(), [src('src/a.ts', 30, 20)]).grade).toBe('strong')
    expect(computeGrade(policy(), [src('src/a.ts', 25), src('src/b.ts', 25)]).grade).toBe('strong')
  })

  it('앱 소스 밖(문서·시험 폴더)의 줄은 세지 않는다', () => {
    const r = computeGrade(policy(), [src('src/a.ts', 10), src('docs/guide.md', 400), src('test/a.test.ts', 300)])
    expect(r.grade).toBe('weak')
  })

  it('보호 경로를 건드리면 줄 수와 관계없이 강이다 — 역슬래시 경로도 같다', () => {
    expect(computeGrade(policy(), [src('.github/workflows/ci.yml', 1)]).grade).toBe('strong')
    expect(computeGrade(policy(), [src('.github\\workflows\\ci.yml', 1)]).grade).toBe('strong')
    expect(computeGrade(policy(), [src('package.json', 1)]).grade).toBe('strong')
    expect(computeGrade(policy(), [src('./.github/CODEOWNERS', 1)]).reason).toContain('보호 경로')
    expect(computeGrade(policy(), [src('package-lock.json', 1)]).grade).toBe('strong')
  })

  it('파일 이름만 비슷한 경로는 보호 경로가 아니다', () => {
    expect(computeGrade(policy(), [src('package.json.bak', 1)]).grade).toBe('weak')
    expect(computeGrade(policy(), [src('src/package.json', 1)]).grade).toBe('weak')
  })

  it('통계가 없거나(오류), 변경이 비었거나, 줄 수를 모르는 파일(바이너리)이 있으면 강이다', () => {
    expect(computeGrade(policy(), null).grade).toBe('strong')
    expect(computeGrade(policy(), []).grade).toBe('strong')
    expect(computeGrade(policy(), [src('src/logo.png', null, null)]).grade).toBe('strong')
  })

  it('문턱은 템플릿이 정한다', () => {
    const p = { ...policy(), strongLineThreshold: 10 }
    expect(computeGrade(p, [src('src/a.ts', 10)]).grade).toBe('strong')
    expect(computeGrade(p, [src('src/a.ts', 9)]).grade).toBe('weak')
  })

  it('앱 소스 경로를 적지 않으면 모든 파일을 센다', () => {
    const p = { ...policy(), appSourcePaths: [] }
    expect(computeGrade(p, [src('lib/a.js', 60)]).grade).toBe('strong')
  })

  it('경로는 / 로 정규화한다', () => {
    expect(normalizePath('.\\src\\a.ts')).toBe('src/a.ts')
  })
})
