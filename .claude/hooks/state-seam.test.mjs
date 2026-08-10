#!/usr/bin/env node
// 상태 파일 쓰기 경로의 테스트 전용 seam (M02 Phase 3 Step 6·7).
//
// 왜 필요한가: 33·40·50이 공유하는 상태 파일의 동시 쓰기 무손실은 M01 Phase 5에서 「7분 간격 순차
// 기록 관찰 + spawnSync 직렬 러너」로만 증거를 댔고, 사용자가 그 한계를 명시 채택했다 (M01 05_Phase_5
// 검증 기록 USER-INPUT 13:38). 진짜 동시 실행을 결정론적으로 만들려면 두 프로세스를 임계구간 문턱에서
// 만나게 하는 장벽이 필요하다 — 그 장벽이 seam이다.
//
// 계약:
//   AGENTDECK_STATE_SEAM=<mode>:<장벽 디렉터리>   mode ∈ post-read | pre-lock
//   AGENTDECK_STATE_SEAM_TIMEOUT=<ms>            기본 10000
//   미설정이면 코드 경로가 무동작이다 (장벽 파일도 타임라인도 만들지 않는다).
//   프로세스는 장벽 지점에서 `ready.<pid>`를 만들고 `go`가 생길 때까지 멈춘다.
//   `go`가 timeout 안에 오지 않으면 `timeout.<pid>`를 남기고 비정상 종료(exit 97)한다.
//   장벽 디렉터리에 `timeline.<pid>.json`을 남긴다 — read·lock·write·rename 시각을 단조 고해상도로 담는다.
//
// 두 모드로 나누는 이유는 교착 회피다: 배타 잠금 아래에서 post-read 장벽을 쓰면 첫 프로세스가 잠금을
// 쥔 채 go를 기다리고 둘째는 잠금에 막혀 ready를 못 낸다 — 러너가 영원히 대기한다. 그래서 post-read는
// 보호 없는 read→write 경로(수리 전 의미론 그대로)를 재현하는 모드이고, pre-lock은 잠금 획득 시도
// 전에서 만나는 모드다.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRunner } from './_lib/runner.mjs'
import { createGateHarness, VITEST_FULL_GREEN } from './_lib/gate-harness.mjs'

const r = createRunner('상태 쓰기 seam (post-read · pre-lock · timeout · 무동작)')
const H = createGateHarness()
const HOOK = join(H.mirror, '.claude', 'hooks', '33_tdd-guard.cjs')
const STATE = join(H.gateDir, 'tdd-guard.state.json')

const sleep = (ms) => new Promise((res) => setTimeout(res, ms))
async function waitUntil(fn, ms, step = 10) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (fn()) return true; await sleep(step) }
  return fn()
}
function barrier() {
  const dir = mkdtempSync(join(tmpdir(), 'agentdeck-seam-'))
  return {
    dir,
    ls: () => { try { return readdirSync(dir) } catch { return [] } },
    ready: () => (() => { try { return readdirSync(dir).filter((n) => n.startsWith('ready.')) } catch { return [] } })(),
    timeouts: () => (() => { try { return readdirSync(dir).filter((n) => n.startsWith('timeout.')) } catch { return [] } })(),
    go: () => writeFileSync(join(dir, 'go'), ''),
    timelines: () => (() => {
      try {
        return readdirSync(dir).filter((n) => n.startsWith('timeline.')).map((n) => {
          try { return JSON.parse(readFileSync(join(dir, n), 'utf8')) } catch { return null }
        }).filter(Boolean)
      } catch { return [] }
    })(),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}
// 훅 1건을 비동기로 띄운다 — 장벽에 걸려 멈춰 있는 동안 러너가 관측할 수 있어야 한다
function launch(session, env) {
  const payload = {
    session_id: session, hook_event_name: 'PostToolUse', tool_name: 'Bash', cwd: H.mirror,
    tool_input: { command: 'npm run test' }, tool_response: { stdout: VITEST_FULL_GREEN },
  }
  const childEnv = { ...process.env, CLAUDE_PROJECT_DIR: H.mirror, ...env }
  delete childEnv.MOODIE_SESSION_ROLE
  const child = spawn(process.execPath, [HOOK], { env: childEnv, cwd: H.mirror, stdio: ['pipe', 'pipe', 'pipe'] })
  child.stdin.end(JSON.stringify(payload))
  const done = new Promise((res) => child.on('close', (code) => res(code)))
  return { child, done }
}
function resetState() { writeFileSync(STATE, JSON.stringify({ schema: 2, global: null, sessions: {} }, null, 2) + '\n') }
function hasSession(sid) {
  try { return !!JSON.parse(readFileSync(STATE, 'utf8')).sessions?.[sid] } catch { return false }
}

try {
  // ---- SM-01 post-read 장벽: read 직후에 서고, go 전에는 쓰지 않는다 -------
  {
    const b = barrier()
    resetState()
    const p = launch('seam-postread', { AGENTDECK_STATE_SEAM: `post-read:${b.dir}`, AGENTDECK_STATE_SEAM_TIMEOUT: '8000' })
    const arrived = await waitUntil(() => b.ready().length === 1, 6000)
    r.check('SM-01 post-read — read 직후 ready.<pid>가 생긴다', arrived, `실측 장벽 파일 ${JSON.stringify(b.ls())}`)
    const wroteEarly = hasSession('seam-postread')
    r.check('SM-01b post-read — go 전에는 상태를 쓰지 않는다', arrived && !wroteEarly,
      `실측 ready=${arrived} · 조기기록=${wroteEarly}`)
    b.go()
    const code = await p.done
    r.check('SM-01c post-read — go 뒤에 정상 종료하고 상태를 쓴다', code === 0 && hasSession('seam-postread'),
      `실측 exit ${code} · 기록=${hasSession('seam-postread')}`)
    const tl = b.timelines()[0] || {}
    r.check('SM-01d post-read — 타임라인이 read→ready→go→write 순서다',
      [tl.readAt, tl.readyAt, tl.goAt, tl.writeAt].every((v) => typeof v === 'number')
      && tl.readAt <= tl.readyAt && tl.readyAt <= tl.goAt && tl.goAt <= tl.writeAt,
      `실측 ${JSON.stringify({ readAt: tl.readAt, readyAt: tl.readyAt, goAt: tl.goAt, writeAt: tl.writeAt })}`)
    p.child.kill()
    b.cleanup()
  }

  // ---- SM-02 pre-lock 장벽: 잠금 획득 시도 전에 선다 ----------------------
  {
    const b = barrier()
    resetState()
    const p = launch('seam-prelock', { AGENTDECK_STATE_SEAM: `pre-lock:${b.dir}`, AGENTDECK_STATE_SEAM_TIMEOUT: '8000' })
    const arrived = await waitUntil(() => b.ready().length === 1, 6000)
    r.check('SM-02 pre-lock — 잠금 시도 전에 ready.<pid>가 생긴다', arrived, `실측 장벽 파일 ${JSON.stringify(b.ls())}`)
    const wroteEarly = hasSession('seam-prelock')
    r.check('SM-02b pre-lock — go 전에는 상태를 쓰지 않는다', arrived && !wroteEarly,
      `실측 ready=${arrived} · 조기기록=${wroteEarly}`)
    b.go()
    const code = await p.done
    r.check('SM-02c pre-lock — go 뒤에 정상 종료하고 상태를 쓴다', code === 0 && hasSession('seam-prelock'),
      `실측 exit ${code} · 기록=${hasSession('seam-prelock')}`)
    const tl = b.timelines()[0] || {}
    r.check('SM-02d pre-lock — 잠금 획득이 go 이후다 (ready ≤ go ≤ lock ≤ write)',
      [tl.readyAt, tl.goAt, tl.lockAt, tl.writeAt].every((v) => typeof v === 'number')
      && tl.readyAt <= tl.goAt && tl.goAt <= tl.lockAt && tl.lockAt <= tl.writeAt,
      `실측 ${JSON.stringify({ readyAt: tl.readyAt, goAt: tl.goAt, lockAt: tl.lockAt, writeAt: tl.writeAt })}`)
    p.child.kill()
    b.cleanup()
  }

  // ---- SM-03 timeout: go가 오지 않으면 비정상 종료한다 --------------------
  {
    const b = barrier()
    resetState()
    const p = launch('seam-timeout', { AGENTDECK_STATE_SEAM: `post-read:${b.dir}`, AGENTDECK_STATE_SEAM_TIMEOUT: '1200' })
    const code = await p.done
    r.check('SM-03 timeout — go 부재 시 비정상 종료한다', code !== 0, `실측 exit ${code}`)
    r.check('SM-03b timeout — timeout.<pid> 표식을 남긴다', b.timeouts().length === 1, `실측 ${JSON.stringify(b.ls())}`)
    r.check('SM-03c timeout — 상태를 쓰지 않는다', !hasSession('seam-timeout'), '실측 기록됨')
    b.cleanup()
  }

  // ---- SM-04 회귀 불변식: 환경변수 미설정이면 무동작 ----------------------
  // Red이 아니다 — seam 없는 현행 코드에서도 참이고, seam 도입 뒤에도 참이어야 한다.
  {
    const b = barrier()
    resetState()
    const p = launch('seam-off', { AGENTDECK_STATE_SEAM: undefined })
    const code = await p.done
    r.check('SM-04 미설정 — 정상 종료하고 상태를 쓴다', code === 0 && hasSession('seam-off'),
      `실측 exit ${code} · 기록=${hasSession('seam-off')}`)
    r.check('SM-04b 미설정 — 장벽 디렉터리에 아무것도 만들지 않는다', b.ls().length === 0,
      `실측 ${JSON.stringify(b.ls())}`)
    r.check('SM-04c 미설정 — 잠금 파일이 남지 않는다', !existsSync(STATE + '.lock'), '실측 잠금 파일 잔존')
    b.cleanup()
  }
} finally {
  H.cleanup()
}

process.exit(r.summary())
