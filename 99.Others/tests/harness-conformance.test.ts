/**
 * harness-conformance.test.ts — CORE conformance 게이트의 회귀 안전망 (HR1 P06 재작업)
 *
 * 대상: 00.Documents/harness/conformance-check.mjs
 *   CORE.md ↔ core-manifest.json 정합(조항 양방향 일치·버전·impl 실재·verify 선언)을
 *   기계 검사하는 게이트. 이 스펙이 스크립트를 spawn 하므로 `npm run test` 가 곧 게이트다
 *   (수동 실행뿐이던 false-green 위험 봉합 — Codex Sol 리뷰 🔴#1).
 *
 * 설계:
 *   - 케이스 1(실 저장소 양성)은 `--root` 없이 실행 → 실제 CORE.md/manifest 검증.
 *     조항 수는 하드코딩하지 않는다(CORE-14 추가돼도 안 깨지게 — 🟡).
 *   - 케이스 2~10은 fs.mkdtempSync 로 임시 픽스처 루트를 만들고 `--root` 로 주입한 뒤,
 *     baseline(정상) 대비 결함 1개만 심어 해당 조항의 FAIL 사유가 뜨는지 확인한다.
 *   - 결정론: 네트워크/시간/랜덤 의존 없음. spawn 은 node 로 스크립트만 실행.
 *   - afterEach 가 생성한 임시 트리를 전부 정리한다.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

// ── 스크립트 경로 (테스트 파일 위치 기준 — cwd 비의존) ─────────────────────────
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url)) // 99.Others/tests → repo root
const SCRIPT = path.join(REPO_ROOT, '00.Documents', 'harness', 'conformance-check.mjs')

// ── 픽스처 타입 ────────────────────────────────────────────────────────────────
interface VerifyDecl {
  type: string
  ref?: string
  note?: string
}
interface AdapterDecl {
  impl: string[]
  verify: VerifyDecl[]
}
interface Clause {
  id: string
  v: number
  title: string
  claude: AdapterDecl
  codex: AdapterDecl
}
interface Manifest {
  manifestVersion: number
  core: string
  verifyTypes: string[]
  clauses: Clause[]
}
interface FixtureSpec {
  coreText: string
  manifest: Manifest
  files?: string[] // 루트 안에 만들어 둘 impl/ref 대상(빈 파일)
  packageScripts?: Record<string, string>
}

// ── 임시 트리 정리 ────────────────────────────────────────────────────────────
const tempParents: string[] = []
afterEach(() => {
  while (tempParents.length > 0) {
    const p = tempParents.pop()!
    fs.rmSync(p, { recursive: true, force: true })
  }
})

// ── 헬퍼: 픽스처 빌드 ─────────────────────────────────────────────────────────
// 루트를 <tempParent>/repo 로 만든다 → `..` 탈출이 tempParent(우리가 소유·정리) 안에
// 떨어져 케이스 7(루트 밖 impl)을 격리해서 다룰 수 있다.
function makeFixture(spec: FixtureSpec): { root: string; parent: string } {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-conf-'))
  tempParents.push(parent)
  const root = path.join(parent, 'repo')
  fs.mkdirSync(path.join(root, '00.Documents', 'harness'), { recursive: true })

  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'fx', scripts: spec.packageScripts ?? { typecheck: 'tsc', test: 'vitest' } }, null, 2),
  )
  fs.writeFileSync(path.join(root, '00.Documents', 'harness', 'CORE.md'), spec.coreText)
  fs.writeFileSync(
    path.join(root, '00.Documents', 'harness', 'core-manifest.json'),
    JSON.stringify(spec.manifest, null, 2),
  )
  for (const rel of spec.files ?? []) {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, '')
  }
  return { root, parent }
}

// ── 헬퍼: 스크립트 실행 ───────────────────────────────────────────────────────
function run(root?: string): { status: number | null; stdout: string; stderr: string } {
  const args = root ? [SCRIPT, '--root', root] : [SCRIPT]
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

// ── 헬퍼: 정상(baseline) 스펙 ─────────────────────────────────────────────────
// CORE-01·CORE-02 두 조항, 어댑터 매핑·impl 실재·verify 선언 모두 green.
function clause(id: string, v: number, over: Partial<Pick<Clause, 'claude' | 'codex'>> = {}): Clause {
  return {
    id,
    v,
    title: `t-${id}`,
    claude: over.claude ?? { impl: ['CLAUDE.md'], verify: [{ type: 'manual', note: 'r' }] },
    codex: over.codex ?? { impl: ['AGENTS.md'], verify: [{ type: 'manual', note: 'r' }] },
  }
}

const header = (id: string, title: string, v: number): string => `## ${id} ${title} — v${v}`

function coreDoc(...lines: string[]): string {
  return `# Harness Core — 테스트 픽스처\n\n${lines.map((l) => `${l}\n\n규칙 본문\n`).join('\n')}`
}

function manifest(clauses: Clause[], over: Partial<Manifest> = {}): Manifest {
  return {
    manifestVersion: 1,
    core: '00.Documents/harness/CORE.md',
    verifyTypes: ['test', 'hook', 'gate', 'manual'],
    clauses,
    ...over,
  }
}

function baseline(): FixtureSpec {
  return {
    coreText: coreDoc(header('CORE-01', '신뢰 경계', 1), header('CORE-02', '엔진 추상화', 1)),
    manifest: manifest([clause('CORE-01', 1), clause('CORE-02', 1)]),
    files: ['CLAUDE.md', 'AGENTS.md'],
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 케이스 1 — 실 저장소 양성 (게이트가 실제 계약에 물려 있는지)
// ══════════════════════════════════════════════════════════════════════════════
describe('[conformance] 실 저장소 양성', () => {
  it('--root 없이 실행 → exit 0 + CONFORMANCE: PASS (조항 수 비의존)', () => {
    const { status, stdout } = run()
    expect(status).toBe(0)
    expect(stdout).toContain('CONFORMANCE: PASS')
    // 조항 수는 하드코딩하지 않는다 — CORE-14가 추가돼도 이 케이스가 깨지면 안 됨.
    expect(stdout).not.toContain('CONFORMANCE: FAIL')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 케이스 2~10 — 픽스처 결함별 FAIL (baseline 대비 결함 1개)
// ══════════════════════════════════════════════════════════════════════════════
describe('[conformance] baseline sanity', () => {
  it('결함 없는 픽스처 → exit 0 + PASS (음성 케이스들의 기준선)', () => {
    const { root } = makeFixture(baseline())
    const { status, stdout } = run(root)
    expect(status).toBe(0)
    expect(stdout).toContain('CONFORMANCE: PASS')
  })
})

describe('[conformance] CORE.md 결함', () => {
  it('2) 조항 헤더 중복 → exit 1 + "중복"', () => {
    const spec = baseline()
    // CORE-01 헤더를 두 번 → 정본 판정 불능.
    spec.coreText = coreDoc(
      header('CORE-01', '신뢰 경계', 1),
      header('CORE-02', '엔진 추상화', 1),
      header('CORE-01', '신뢰 경계 중복', 1),
    )
    const { root } = makeFixture(spec)
    const { status, stdout } = run(root)
    expect(status).toBe(1)
    expect(stdout).toContain('중복')
    expect(stdout).toContain('CONFORMANCE: FAIL')
  })

  it('3) 비정규 헤더(형식 불일치) → exit 1 + "비정규 조항 헤더"', () => {
    const spec = baseline()
    // "## CORE-"로 시작하나 " — vN" 형식 아님 → 조용히 버리지 않고 FAIL.
    spec.coreText = coreDoc(
      header('CORE-01', '신뢰 경계', 1),
      header('CORE-02', '엔진 추상화', 1),
      '## CORE-03 미완성 헤더', // ← ` — vN` 없음
    )
    const { root } = makeFixture(spec)
    const { status, stdout } = run(root)
    expect(status).toBe(1)
    expect(stdout).toContain('비정규 조항 헤더')
  })
})

describe('[conformance] manifest ↔ CORE.md 정합', () => {
  it('4) 조항 버전 불일치(CORE v1 vs manifest v2) → exit 1 + "버전 불일치"', () => {
    const spec = baseline()
    // CORE.md는 CORE-01 v1인데 manifest는 v2 선언.
    spec.manifest = manifest([clause('CORE-01', 2), clause('CORE-02', 1)])
    const { root } = makeFixture(spec)
    const { status, stdout } = run(root)
    expect(status).toBe(1)
    expect(stdout).toContain('버전 불일치')
  })

  it('5) 미매핑(CORE.md에만) + 유령 매핑(manifest에만) → exit 1 + 두 메시지', () => {
    const spec = baseline()
    // CORE.md: CORE-01·02·03 / manifest: CORE-01·02·99
    spec.coreText = coreDoc(
      header('CORE-01', '신뢰 경계', 1),
      header('CORE-02', '엔진 추상화', 1),
      header('CORE-03', '미매핑 조항', 1),
    )
    spec.manifest = manifest([clause('CORE-01', 1), clause('CORE-02', 1), clause('CORE-99', 1)])
    const { root } = makeFixture(spec)
    const { status, stdout } = run(root)
    expect(status).toBe(1)
    expect(stdout).toContain('미매핑') // CORE-03: CORE.md에 있으나 manifest에 없음
    expect(stdout).toContain('유령 매핑') // CORE-99: manifest에 있으나 CORE.md에 없음
  })
})

describe('[conformance] impl 경로 검사', () => {
  it('6) impl 경로 실재하지 않음 → exit 1 + "실재하지 않음"', () => {
    const spec = baseline()
    spec.manifest = manifest([
      clause('CORE-01', 1, {
        claude: { impl: ['CLAUDE.md', 'does-not-exist.md'], verify: [{ type: 'manual', note: 'r' }] },
      }),
      clause('CORE-02', 1),
    ])
    // does-not-exist.md 는 files 에 넣지 않음 → 디스크에 없음.
    const { root } = makeFixture(spec)
    const { status, stdout } = run(root)
    expect(status).toBe(1)
    expect(stdout).toContain('실재하지 않음')
  })

  it('7) impl 경로 저장소 루트 밖(../escape.md, 실제 파일 존재) → exit 1 + "저장소 루트 밖"', () => {
    const spec = baseline()
    spec.manifest = manifest([
      clause('CORE-01', 1, {
        claude: { impl: ['../escape.md'], verify: [{ type: 'manual', note: 'r' }] },
      }),
      clause('CORE-02', 1),
    ])
    const { root, parent } = makeFixture(spec)
    // 루트 밖(부모 디렉토리)에 실제 파일을 둔다 — "실재하면 받아준다"가 아니라
    // 루트 밖이면 실재해도 증거 불인정임을 검증.
    fs.writeFileSync(path.join(parent, 'escape.md'), 'outside-but-real')
    const { status, stdout } = run(root)
    expect(status).toBe(1)
    expect(stdout).toContain('저장소 루트 밖')
  })
})

describe('[conformance] verify 선언 검사', () => {
  it('8) verify type 화이트리스트 밖 → exit 1 + "허용 목록"', () => {
    const spec = baseline()
    spec.manifest = manifest([
      clause('CORE-01', 1, {
        claude: { impl: ['CLAUDE.md'], verify: [{ type: 'bogus', note: 'r' }] },
      }),
      clause('CORE-02', 1),
    ])
    const { root } = makeFixture(spec)
    const { status, stdout } = run(root)
    expect(status).toBe(1)
    expect(stdout).toContain('허용 목록')
  })

  it('9) verify 부재(빈 배열) → exit 1 + "verify 부재"', () => {
    const spec = baseline()
    spec.manifest = manifest([
      clause('CORE-01', 1, {
        claude: { impl: ['CLAUDE.md'], verify: [] },
      }),
      clause('CORE-02', 1),
    ])
    const { root } = makeFixture(spec)
    const { status, stdout } = run(root)
    expect(status).toBe(1)
    expect(stdout).toContain('verify 부재')
  })

  it('10) gate ref "npm run <미존재>" → exit 1 + "package.json scripts에 없음"', () => {
    const spec = baseline()
    spec.manifest = manifest([
      clause('CORE-01', 1, {
        claude: { impl: ['CLAUDE.md'], verify: [{ type: 'gate', ref: 'npm run 없는스크립트' }] },
      }),
      clause('CORE-02', 1),
    ])
    // packageScripts 기본값에 '없는스크립트' 없음.
    const { root } = makeFixture(spec)
    const { status, stdout } = run(root)
    expect(status).toBe(1)
    expect(stdout).toContain('package.json scripts에 없음')
  })

  it('11) manifest이 verifyTypes를 재정의해 미인식 타입을 통과시키려 해도 FAIL (게이트 고정 allowlist, Sol 2차 리뷰)', () => {
    // bogus 타입을 clause와 manifest.verifyTypes 양쪽에 심어 자기 계약을 재정의하려는 시도.
    // 게이트가 verifyTypes를 manifest에서 읽으면 note/ref 없이 false-green이 된다.
    const spec = baseline()
    spec.manifest = manifest(
      [
        clause('CORE-01', 1, {
          claude: { impl: ['CLAUDE.md'], verify: [{ type: 'bogus' }] },
          codex: { impl: ['AGENTS.md'], verify: [{ type: 'bogus' }] },
        }),
        clause('CORE-02', 1),
      ],
      { verifyTypes: ['test', 'hook', 'gate', 'manual', 'bogus'] },
    )
    const { root } = makeFixture(spec)
    const { status, stdout } = run(root)
    expect(status).toBe(1)
    expect(stdout).toContain('미인식 타입')
  })
})
