// 가드 spawn 공통 격리 헬퍼 (M02 Phase 1 Step 11) — 가드를 spawn하는 자체 테스트는 이 모듈만 쓴다.
//
// 규율 하나: 실저장소의 98_Management/01_GateState/를 절대 건드리지 않는다. 호출마다 OS 임시 폴더에
// 미러를 만들고, 가드를 CLAUDE_PROJECT_DIR=<미러>로 구동하며, payload의 session_id·agent_id는 합성값이다.
// 훅이 남기는 로그·상태는 전부 미러 안에서 나고 죽는다 — live hook-log에 합성 줄이 0건이어야 한다
// (Phase 1 DoD). Phase 2가 기존 dangerous-cmd-guard.test.mjs를 이 헬퍼로 옮긴다.
//
// 판정 축 정규화 — 두 가드의 표기가 다르므로 한 축으로 접는다.
//   deny  : exit 2 (AgentDeck의 block) 또는 permissionDecision "deny" (Moodie 원본)
//   ask   : permissionDecision "ask" (AgentDeck의 비가역 질의)
//   allow : exit 0 + 무출력
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
export const SYNTHETIC = { session: 'synthetic-cmd-guard-p1', agentId: 'synthetic-agent-p1', agentType: 'worker' }

function toVerdict(res) {
  if (res.code === 2) return 'deny'
  const out = (res.stdout || '').trim()
  if (out) {
    try {
      const decision = JSON.parse(out)?.hookSpecificOutput?.permissionDecision
      return decision || 'unknown-json'
    } catch {
      return 'unparsable-stdout'
    }
  }
  return res.code === 0 ? 'allow' : `exit${res.code}`
}

// hook — 이 저장소 `.claude/hooks/` 안의 파일명(미러로 복사해 실행) 또는 절대 경로(제자리 실행).
// 절대 경로 모드는 원본 저장소 가드의 교차 구동용이다 — 그 저장소에는 아무것도 쓰지 않는다.
export function createGuardHarness(hook) {
  const mirror = mkdtempSync(join(tmpdir(), 'agentdeck-guard-'))
  mkdirSync(join(mirror, '98_Management', '01_GateState'), { recursive: true })
  mkdirSync(join(mirror, '.claude', 'hooks'), { recursive: true })
  let script
  if (isAbsolute(hook)) {
    script = hook
  } else {
    script = join(mirror, '.claude', 'hooks', basename(hook))
    cpSync(join(REPO_ROOT, '.claude', 'hooks', hook), script)
  }
  const logFile = join(mirror, '98_Management', '01_GateState', 'hook-log.jsonl')

  function spawn(input) {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: mirror }
    delete env.MOODIE_SESSION_ROLE // 역할 신호 오염 방지 — 합성 입력만이 판정 근거다
    const p = spawnSync(process.execPath, [script], { input, cwd: mirror, env, encoding: 'utf8' })
    return { code: p.status, stdout: p.stdout ?? '', stderr: p.stderr ?? '' }
  }
  const basePayload = (command) => ({
    session_id: SYNTHETIC.session,
    agent_id: SYNTHETIC.agentId,
    agent_type: SYNTHETIC.agentType,
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    cwd: mirror,
    tool_input: { command },
  })

  return {
    mirror,
    script,
    run: (command) => spawn(JSON.stringify(basePayload(command))),
    verdict: (command) => toVerdict(spawn(JSON.stringify(basePayload(command)))),
    verdictPayload: (patch) => toVerdict(spawn(JSON.stringify({ ...basePayload(''), ...patch }))),
    verdictRaw: (raw) => toVerdict(spawn(raw)),
    logLines: () => {
      try {
        return readFileSync(logFile, 'utf8').split('\n').filter((l) => l.trim() !== '')
          .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
      } catch {
        return []
      }
    },
    cleanup: () => rmSync(mirror, { recursive: true, force: true }),
  }
}
