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
//   explicit-allow : permissionDecision "allow" — AgentDeck 가드는 어떤 명령에도 내지 않는다 (M04 · 사용자 판정
//     2026-11-13). 무출력 allow와 따로 세어 두는 것은, 그 값이 나오면 테스트가 회귀로 잡게 하려는 것이다.
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
      // 명시적 통과(권한 창 생략)는 무출력 allow와 다른 판정이다 (M04) — 같은 이름으로 접으면 잘못된 통과가 숨는다.
      // AgentDeck 가드는 이 값을 내지 않는다. 나오면 회귀다.
      return decision === 'allow' ? 'explicit-allow' : (decision || 'unknown-json')
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

  // 러너를 돌리는 셸의 GIT_*·XDG_CONFIG_HOME은 물려주지 않는다 — 가드도, 미러 저장소를 세우는 git 호출도
  // 러너를 돌리는 사람의 환경에 기대지 않게 한다. 테스트가 겨누는 값은 extraEnv로 명시해 넣는다.
  const cleanEnv = Object.fromEntries(Object.entries(process.env)
    .filter(([k]) => !/^GIT_/i.test(k) && !/^XDG_CONFIG_HOME$/i.test(k)))
  function spawn(input, extraEnv = {}) {
    // HOME·USERPROFILE도 미러로 돌린다. 가드는 지금 저장소·git 설정을 읽지 않지만 (M04 · 사용자 판정
    // 2026-11-13), 러너를 돌리는 사람의 `~/.gitconfig`에 판정이 기대는 일이 다시 생기지 않게 격리를 유지한다.
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

  // 미러 안에 진짜 git 저장소를 세운다 (M04) — 작업 브랜치를 체크아웃한 저장소에서도 가드가 push를
  // 통과시키지 않는다는 회귀 고정에 쓴다. HOME을 미러로 돌려 러너를 돌리는 사람의 전역 설정과 끊는다.
  const gitEnv = { ...cleanEnv, HOME: mirror, USERPROFILE: mirror }
  function git(cwd, ...args) {
    const p = spawnSync('git', args, { cwd, env: gitEnv, encoding: 'utf8', windowsHide: true })
    if (p.status !== 0) throw new Error(`git ${args.join(' ')} 실패(${p.status}): ${(p.stderr || '').trim()}`)
    return (p.stdout || '').trim()
  }
  // head — 체크아웃할 브랜치 이름이다. 커밋 하나와 원격 origin을 둔다. branches는 추가로 만들 로컬 브랜치다.
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
