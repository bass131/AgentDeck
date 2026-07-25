/**
 * agent-model-canon.test.ts — 하네스 SubAgent 모델 정본 회귀 고정 (ADR-010 개정 1, HR2 P02).
 *
 * ── 이 테스트가 존재하는 이유 ──────────────────────────────────────────────
 * `.claude/CHANGELOG.md:80`(2026-07-03)은 *"Worker 5를 `claude-sonnet-5`로 명시 고정
 * (영호 '별칭 해석 모호성 제거')"* 라고 기록했다. 그런데 2026-07-25 디스크 실측 결과
 * 네 Worker는 전부 `sonnet` 별칭으로 **되돌아가 있었고**, qa는 `opus`로 어긋나 있었다
 * (총 5건 드리프트, 되돌아간 시점 기록 없음).
 *
 * 즉 full ID 규칙은 **문서 규범만으로는 유지되지 않는다**는 것이 이미 실증됐다.
 * 그래서 여기서 기계로 고정한다 — 다음 리팩터가 별칭으로 되돌리면 red가 난다.
 *
 * ── 별칭이 왜 위험한가 ────────────────────────────────────────────────────
 * `model: opus`는 **`claude-opus-4-8`로 스폰된다**(2026-07-24 secretary 3스폰
 * 트랜스크립트의 model 필드 실측). 별칭은 "현재 Opus 계열"을 가리키는 **이동 표적**이라
 * 특정 세대를 고정하지 못한다. C#의 `PackageReference Version="*"` vs 정확한 버전 고정과
 * 같은 트레이드오프 — 별칭은 자동 최신화를 얻고 재현성을 잃는다.
 *
 * 정본 = `00.Documents/adr/ADR-010-multiagent-coordinator-worker.md` 개정 1 (모델 티어 4층)
 * 운영 표 = `.claude/policies/execution-owner.md` §3
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 99.Others/tests/agents → repo root (3단계 위 — 폴더 개명에도 깊이는 불변)
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const AGENTS_DIR = path.join(REPO_ROOT, '.claude', 'agents')

/** ADR-010 개정 1 티어 4층 — 역할별 기대 모델. */
const EXPECTED_MODEL: Record<string, string> = {
  // 도메인 Worker (구현)
  'main-process': 'claude-sonnet-5',
  'agent-backend': 'claude-sonnet-5',
  renderer: 'claude-sonnet-5',
  'shared-ipc': 'claude-sonnet-5',
  // 판정 렌즈·격리
  qa: 'claude-opus-5',
  reviewer: 'claude-opus-5',
  'plan-auditor': 'claude-opus-5',
  coordinator: 'claude-opus-5',
  secretary: 'claude-opus-5',
  // 최상위 판단 (HR2 P03에서 신설 — 파일이 아직 없으면 그 항목은 건너뛴다)
  'chief-tech-operator': 'claude-fable-5',
}

/** 별칭 = 세대를 고정하지 못하는 이동 표적. frontmatter에 쓰면 안 된다. */
const ALIAS_RE = /^(opus|sonnet|haiku|fable|inherit|default)$/i

/** full ID 형식. 끝에 날짜 접미사(-20251001 등)를 붙이지 않는다. */
const FULL_ID_RE = /^claude-[a-z0-9]+(?:-[a-z0-9]+)*$/
const DATE_SUFFIX_RE = /-\d{8}$/

interface AgentDef {
  name: string
  file: string
  model: string | null
}

/** `.claude/agents/*.md`를 읽어 frontmatter의 model 값을 뽑는다(`_`로 시작하는 문서는 제외). */
function readAgentDefs(): AgentDef[] {
  const out: AgentDef[] = []
  for (const entry of fs.readdirSync(AGENTS_DIR)) {
    if (!entry.endsWith('.md')) continue
    if (entry.startsWith('_')) continue // _routing.md·_escalation.md = 에이전트 정의가 아닌 문서
    const full = path.join(AGENTS_DIR, entry)
    const text = fs.readFileSync(full, 'utf8')
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
    const model = fm ? (/^model:\s*(.+?)\s*$/m.exec(fm[1])?.[1] ?? null) : null
    out.push({ name: entry.replace(/\.md$/, ''), file: entry, model })
  }
  return out
}

describe('[하네스] SubAgent 모델 정본 — ADR-010 개정 1 티어 4층', () => {
  it('에이전트 정의 파일이 하나 이상 발견된다 (경로 드리프트 감지)', () => {
    // 폴더가 옮겨졌는데 이 테스트만 조용히 0건을 통과하는 fail-open을 막는다.
    expect(readAgentDefs().length).toBeGreaterThan(0)
  })

  it('⭐ 별칭(opus·sonnet·…) 잔존 0건 — 별칭은 세대를 고정하지 못한다', () => {
    const offenders = readAgentDefs()
      .filter((a) => a.model !== null && ALIAS_RE.test(a.model))
      .map((a) => `${a.file}: model: ${a.model}`)
    expect(offenders).toEqual([])
  })

  it('model 값은 full ID 형식이고 날짜 접미사가 없다', () => {
    const bad = readAgentDefs()
      .filter((a) => a.model !== null)
      .filter((a) => !FULL_ID_RE.test(a.model as string) || DATE_SUFFIX_RE.test(a.model as string))
      .map((a) => `${a.file}: model: ${a.model}`)
    expect(bad).toEqual([])
  })

  it('역할별 모델이 티어 4층과 문자열로 일치한다', () => {
    const defs = new Map(readAgentDefs().map((a) => [a.name, a]))
    const mismatches: string[] = []
    for (const [role, expected] of Object.entries(EXPECTED_MODEL)) {
      const def = defs.get(role)
      if (!def) continue // 아직 신설되지 않은 역할(P03의 chief-tech-operator)은 건너뛴다
      if (def.model !== expected) {
        mismatches.push(`${def.file}: expected "${expected}", got "${def.model}"`)
      }
    }
    expect(mismatches).toEqual([])
  })

  it('티어 표에 등록되지 않은 에이전트가 없다 (신설 시 표 갱신 강제)', () => {
    // 새 역할을 추가하면서 execution-owner.md §3 표를 안 고치는 드리프트를 여기서 잡는다.
    const unregistered = readAgentDefs()
      .filter((a) => a.model !== null)
      .filter((a) => !(a.name in EXPECTED_MODEL))
      .map((a) => a.file)
    expect(unregistered).toEqual([])
  })
})
