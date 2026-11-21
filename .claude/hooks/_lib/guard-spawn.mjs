// 가드를 OS 임시 폴더의 미러에서 CLAUDE_PROJECT_DIR=<미러>로 구동한다 — 실저장소의 01_GateState와 live hook-log를 건드리지 않는다.
// 두 가드의 표기를 한 판정 축으로 접는다: deny는 exit 2 또는 permissionDecision "deny"(Moodie 원본), ask는 "ask", allow는 exit 0 무출력.
// permissionDecision "allow"는 explicit-allow로 따로 센다 — AgentDeck 가드는 내지 않으므로, 무출력 allow로 접으면 잘못된 통과가 숨는다.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
export const SYNTHETIC = { session: 'synthetic-cmd-guard-p1', agentId: 'synthetic-agent-p1', agentType: 'worker' }

function toVerdict(res) {
  if (res.code === 2) return 'deny'
  const out = (res.stdout || '').trim()
  if (out) {
    try {
      const decision = JSON.parse(out)?.hookSpecificOutput?.permissionDecision
      return decision === 'allow' ? 'explicit-allow' : (decision || 'unknown-json')
    } catch {
      return 'unparsable-stdout'
    }
  }
  return res.code === 0 ? 'allow' : `exit${res.code}`
}

// hook은 `.claude/hooks/` 안의 파일명(미러로 복사해 실행)이거나, 원본 저장소 가드를 교차 구동할 절대 경로(제자리 실행, 그 저장소에는 쓰지 않는다)다.
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

  // 러너를 돌리는 셸의 GIT_*·XDG_CONFIG_HOME과 `~/.gitconfig`(HOME·USERPROFILE을 미러로)에 판정이 기대지 않게 끊는다.
  // 시험이 겨누는 값은 extraEnv로 명시해 넣는다.
  const cleanEnv = Object.fromEntries(Object.entries(process.env)
    .filter(([k]) => !/^GIT_/i.test(k) && !/^XDG_CONFIG_HOME$/i.test(k)))
  function spawn(input, extraEnv = {}) {
    const env = { ...cleanEnv, CLAUDE_PROJECT_DIR: mirror, HOME: mirror, USERPROFILE: mirror, ...extraEnv }
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

  // 미러 안의 진짜 git 저장소 — 가드가 현재 브랜치를 읽는 판정의 회귀 고정에 쓴다.
  const gitEnv = { ...cleanEnv, HOME: mirror, USERPROFILE: mirror }
  function git(cwd, ...args) {
    const p = spawnSync('git', args, { cwd, env: gitEnv, encoding: 'utf8', windowsHide: true })
    if (p.status !== 0) throw new Error(`git ${args.join(' ')} 실패(${p.status}): ${(p.stderr || '').trim()}`)
    return (p.stdout || '').trim()
  }
  function initRepo(dir, { head, branches = [] }) {
    // 기존 `.git`을 지우므로 미러 안의 경로만 받는다 — 미러 밖 저장소를 건드리는 사고를 막는다.
    const target = resolve(dir)
    if (target !== resolve(mirror) && !target.startsWith(resolve(mirror) + sep)) {
      throw new Error(`initRepo는 미러 안의 경로만 받는다: ${dir}`)
    }
    rmSync(join(dir, '.git'), { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    git(dir, 'init', '-q', `--initial-branch=${head}`)
    git(dir, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'seed')
    for (const b of branches) git(dir, 'branch', b)
    git(dir, 'remote', 'add', 'origin', 'https://example.invalid/r.git')
  }

  return {
    mirror,
    script,
    git,
    initRepo,
    run: (command) => spawn(JSON.stringify(basePayload(command))),
    // payload의 cwd만 바꾼다 — 가드가 현재 브랜치를 읽는 작업 폴더다. 미러 안 경로만 쓴다.
    runAt: (command, cwd) => spawn(JSON.stringify({ ...basePayload(command), cwd })),
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
