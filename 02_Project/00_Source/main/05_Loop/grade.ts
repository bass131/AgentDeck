// M09 G1 — goal 등급 규칙. 실행기가 git 포트의 변경 통계로 계산한다(헌법 2조의 강·약 기준을 앱 쪽으로 옮긴 것).
// 강: 앱 소스 변경 줄 수(더한 줄 + 지운 줄)가 템플릿의 문턱 이상, 템플릿이 적은 보호 경로를 건드림,
//     판단할 정보가 없거나 애매함(통계 없음·오류, 변경 없음, 줄 수를 모르는 파일). 그 밖은 약.
// 분해 노드가 goal 문서에 적은 등급 표시는 읽지 않는다 — 등급은 이 함수만 정한다.
import type { Grade, GradingPolicy } from './template'

// added·removed가 null이면 줄 수를 모르는 파일(바이너리 등)이다.
export interface FileChange { path: string; added: number | null; removed: number | null }
export interface GradeResult { grade: Grade; reason: string }

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^(\.\/)+/, '')
}

// 접두가 /로 끝나면 폴더, 아니면 그 파일 자체나 그 이름의 폴더 아래.
function under(path: string, prefix: string): boolean {
  const p = normalizePath(prefix)
  return p.endsWith('/') ? path.startsWith(p) : path === p || path.startsWith(`${p}/`)
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0
const strong = (reason: string): GradeResult => ({ grade: 'strong', reason })

export function computeGrade(policy: GradingPolicy, changes: readonly FileChange[] | null): GradeResult {
  if (changes === null) return strong('변경 통계를 얻지 못했다 — 판단할 정보가 없으면 강')
  if (changes.length === 0) return strong('변경이 없다고 나왔다 — 애매하면 강')
  const files = changes.map((c) => ({ ...c, path: normalizePath(c.path) }))
  const touched = files.find((f) => policy.protectedPaths.some((p) => under(f.path, p)))
  if (touched) return strong(`보호 경로 ${touched.path}를 건드렸다`)
  const counted = policy.appSourcePaths.length === 0
    ? files
    : files.filter((f) => policy.appSourcePaths.some((p) => under(f.path, p)))
  const unknown = counted.find((f) => !isCount(f.added) || !isCount(f.removed))
  if (unknown) return strong(`${unknown.path}의 변경 줄 수를 모른다 — 애매하면 강`)
  const lines = counted.reduce((n, f) => n + (f.added as number) + (f.removed as number), 0)
  const t = policy.strongLineThreshold
  if (lines >= t) return strong(`앱 소스 ${lines}줄 변경 — 문턱 ${t} 이상`)
  return { grade: 'weak', reason: `앱 소스 ${lines}줄 변경 — 문턱 ${t} 미만` }
}
