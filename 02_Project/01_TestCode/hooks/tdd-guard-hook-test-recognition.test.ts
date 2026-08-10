// tdd-guard 테스트 인정 규칙 — `.claude/hooks/*.test.mjs` 편집이 「테스트 동반」으로 판정되는가
// (M02 Phase 1 Step 6·7, Backlog 11번 전반부).
//
// 자충수 구조: 훅을 수리할 때 동반 테스트는 `.claude/hooks/*.test.mjs`에 두는데, tdd-guard는
// `02_Project/01_TestCode/`만 테스트로 인정한다. 그래서 훅 테스트를 아무리 손질해도 미동반
// 카운터가 리셋되지 않고, 훅 소스 편집 3회째가 차단된다 — 하네스 수리 자체가 막힌다.
//
// 격리 규율: 이 테스트는 실저장소의 98_Management/01_GateState/를 건드리지 않는다. mkdtemp 미러를
// 만들어 CLAUDE_PROJECT_DIR로 주고, payload에는 합성 session_id·agent_id를 넣는다 — live hook-log에
// 합성 줄이 0건이어야 한다 (Phase 1 DoD).
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const HOOK_REL = path.join('.claude', 'hooks', '33_tdd-guard.cjs')
const GATE_REL = path.join('98_Management', '01_GateState')
const TARGET_REL = path.join('.claude', 'hooks', 'sample.test.mjs')
const SID = 'synthetic-tdd-recognition-p1'

type LogLine = { hook?: string; verdict?: string; rule?: string; duty?: string }

function makeMirror(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'agentdeck-tdd-recog-'))
  mkdirSync(path.join(dir, '.claude', 'hooks'), { recursive: true })
  mkdirSync(path.join(dir, GATE_REL), { recursive: true })
  cpSync(path.join(REPO_ROOT, HOOK_REL), path.join(dir, HOOK_REL))
  writeFileSync(path.join(dir, TARGET_REL), '// 합성 훅 테스트 파일 (미러 안에서만 존재한다)\n')
  return dir
}

function logLines(dir: string): LogLine[] {
  try {
    return readFileSync(path.join(dir, GATE_REL, 'hook-log.jsonl'), 'utf8')
      .split('\n')
      .filter((l) => l.trim() !== '')
      .map((l) => {
        try { return JSON.parse(l) as LogLine } catch { return null }
      })
      .filter((l): l is LogLine => l !== null)
  } catch {
    return []
  }
}

function runHook(dir: string, event: string) {
  const before = logLines(dir).length
  const env = { ...process.env, CLAUDE_PROJECT_DIR: dir }
  delete env.MOODIE_SESSION_ROLE // 역할 신호 오염 방지 — 합성 입력만이 판정 근거다
  const r = spawnSync(process.execPath, [path.join(dir, HOOK_REL)], {
    input: JSON.stringify({
      session_id: SID,
      agent_id: 'synthetic-agent-p1',
      agent_type: 'worker',
      hook_event_name: event,
      tool_name: 'Edit',
      tool_input: {
        file_path: path.join(dir, TARGET_REL),
        old_string: '미러',
        new_string: '미러(손질)',
      },
    }),
    cwd: dir,
    env,
    encoding: 'utf8',
  })
  return {
    code: r.status,
    stdout: r.stdout ?? '',
    added: logLines(dir).slice(before).filter((l) => l.hook === 'tdd-guard'),
  }
}

describe('tdd-guard 테스트 인정 규칙', () => {
  it('훅 테스트 편집(PostToolUse)은 미동반 카운터를 리셋한다', () => {
    const dir = makeMirror()
    try {
      const r = runHook(dir, 'PostToolUse')
      const seen = r.added.map((l) => `${l.verdict}/${l.rule}`).join(', ') || '무발화'
      expect(r.code, `exit ${r.code} · ${seen}`).toBe(0)
      expect(seen).toContain('리셋/테스트-편집')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('카운터 장전 상태에서도 훅 테스트 편집(PreToolUse)은 차단되지 않는다', () => {
    const dir = makeMirror()
    try {
      writeFileSync(
        path.join(dir, GATE_REL, 'tdd-guard.state.json'),
        JSON.stringify({ schema: 2, global: null, sessions: { [SID]: { streak: 2, at: Date.now() } } }, null, 2) + '\n',
      )
      const r = runHook(dir, 'PreToolUse')
      const seen = r.added.map((l) => `${l.verdict}/${l.rule}`).join(', ') || '무발화'
      expect(r.stdout, `차단 출력이 있다 · ${seen}`).toBe('')
      expect(seen).not.toContain('deny/테스트-미동반-차단')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
