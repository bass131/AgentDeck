// M09 G1 — goal 등급 규칙. 실행기가 git 포트의 변경 통계로 계산한다(헌법 2조의 강·약 기준을 앱 쪽으로 옮긴 것).
// 강: 세는 변경 줄 수(더한 줄 + 지운 줄)가 템플릿의 문턱 이상, 템플릿이 적은 보호 경로(시험·설정·CI 등)를 건드림,
//     판단할 정보가 없거나 애매함(통계 없음·오류, 변경 없음, 줄 수를 모르는 파일). 그 밖은 약.
// 세는 쪽은 금지 목록이다 — uncountedPaths(문서 등)에 맞는 파일만 빼고 모두 센다. 허용 목록(src/만 셈)이면
// 소스를 다른 폴더로 옮기거나 시험·설정만 바꿔 검수를 끌 수 있어서, 더 보수적인 쪽을 골랐다.
// 분해 노드가 goal 문서에 적은 등급 표시는 읽지 않는다 — 등급은 이 함수만 정한다.
//
// 경로 꼴(작은 glob): /로 끝나면 그 이름의 폴더(이름에 /가 없으면 어느 깊이든, 있으면 뿌리 기준),
//   / 없는 꼴은 어느 깊이든 파일 이름에 맞추고, / 있는 꼴은 뿌리 기준 전체 경로에 맞춘다.
//   *는 / 밖의 글자 0개 이상, **/는 폴더 0개 이상, ?는 / 밖의 글자 하나.
import type { Grade, GradingPolicy } from './template'

// added·removed가 null이면 줄 수를 모르는 파일(바이너리 등)이다.
export interface FileChange { path: string; added: number | null; removed: number | null }
export interface GradeResult { grade: Grade; reason: string }

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^(\.\/)+/, '')
}

function globRegex(glob: string): RegExp {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*' && glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2 }
    else if (c === '*' && glob[i + 1] === '*') { re += '.*'; i++ }
    else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

export function matchesPath(path: string, pattern: string): boolean {
  const file = normalizePath(path)
  const p = normalizePath(pattern)
  if (p.endsWith('/')) {
    const dir = p.slice(0, -1)
    if (dir.includes('/')) return file.startsWith(p)
    const parts = file.split('/').slice(0, -1)
    const rx = globRegex(dir)
    return parts.some((seg) => rx.test(seg))
  }
  if (!p.includes('/')) return globRegex(p).test(file.slice(file.lastIndexOf('/') + 1))
  return globRegex(p).test(file)
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0
const strong = (reason: string): GradeResult => ({ grade: 'strong', reason })

export function computeGrade(policy: GradingPolicy, changes: readonly FileChange[] | null): GradeResult {
  if (changes === null) return strong('변경 통계를 얻지 못했다 — 판단할 정보가 없으면 강')
  if (changes.length === 0) return strong('변경이 없다고 나왔다 — 애매하면 강')
  const files = changes.map((c) => ({ ...c, path: normalizePath(c.path) }))
  const touched = files.find((f) => policy.protectedPaths.some((p) => matchesPath(f.path, p)))
  if (touched) return strong(`보호 경로 ${touched.path}를 건드렸다`)
  const counted = files.filter((f) => !policy.uncountedPaths.some((p) => matchesPath(f.path, p)))
  const unknown = counted.find((f) => !isCount(f.added) || !isCount(f.removed))
  if (unknown) return strong(`${unknown.path}의 변경 줄 수를 모른다 — 애매하면 강`)
  const lines = counted.reduce((n, f) => n + (f.added as number) + (f.removed as number), 0)
  const t = policy.strongLineThreshold
  if (lines >= t) return strong(`세는 변경 ${lines}줄 — 문턱 ${t} 이상`)
  return { grade: 'weak', reason: `세는 변경 ${lines}줄 — 문턱 ${t} 미만` }
}
