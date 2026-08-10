#!/usr/bin/env node
// 상태 파일 동시 쓰기 재실측·수리 (M02 Phase 3 Step 8·9 · 완료선 셋째 조항).
//
// M01 Phase 5는 동시 쓰기 무손실을 「7분 간격 순차 기록 관찰 + spawnSync 직렬 러너」로만 증거를 댔고,
// 사용자가 그 증거 한계를 명시 채택했다 (M01 05_Phase_5 USER-INPUT 13:38). 여기서는 seam 장벽으로
// 두 프로세스를 임계구간 문턱에 세워 함께 들여보내, 겹침 자체를 만들어 놓고 판정한다.
//
// 산출물은 Red와 Green을 상충 없이 나눠 담는다 —
//   Red  (post-read): 보호 없는 read→write 임계구간이 겹치고, 마지막-쓰기-승으로 상대 세션 엔트리가
//                     사라진다. 생존 구간 겹침만으로는 증거로 인정하지 않는다.
//   Green(pre-lock) : 생존 구간(잠금 대기 포함)은 여전히 겹치되 보호 임계구간은 겹치지 않고(직렬화),
//                     상태 파일 전 스코프가 무손실이다.
// 여기에 잠금 자체의 두 절차 — 획득 timeout과 stale-lock 회수 — 를 단위로 실측한다.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRunner } from './_lib/runner.mjs'
import { createGateHarness } from './_lib/gate-harness.mjs'

const r = createRunner('상태 동시 쓰기 재실측 (post-read Red · pre-lock Green · 잠금 절차)')
const H = createGateHarness()
const RUNNER = join(H.mirror, '.claude', 'hooks', 'fixtures', 'race-concurrent', 'run.cjs')

function race(mode) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: H.mirror }
  delete env.MOODIE_SESSION_ROLE
  const p = spawnSync(process.execPath, [RUNNER, mode], { cwd: H.mirror, env, encoding: 'utf8' })
  let summary = null
  try { summary = JSON.parse(p.stdout) } catch { /* 아래 판정에서 잡힌다 */ }
  // 실측치를 통과·실패와 무관하게 남긴다 — 검증 기록에 옮겨 적는 수치의 출처다
  if (summary) {
    console.log(`  [${mode}] 생존구간 겹침 ${Math.round(summary.liveOverlapMs)}ms · 임계구간 겹침 ${summary.criticalOverlapMs === null ? '판정불능' : Math.round(summary.criticalOverlapMs) + 'ms'}`
      + ` · 생존 ${JSON.stringify(summary.survivors)} · 손실 ${JSON.stringify(summary.lost)} · global ${summary.globalSurvived}`)
  }
  return { code: p.status, summary, stdout: p.stdout ?? '', stderr: p.stderr ?? '' }
}

try {
  // ---- Step 8 Red — 보호 없는 경로에서 겹침과 손실이 함께 관측된다 --------
  {
    const c = race('post-read')
    const s = c.summary || {}
    r.check('RC-01 post-read 대본이 두 프로세스를 함께 들여보낸다', s.readyObserved === 2,
      `실측 ready ${s.readyObserved} · exit ${c.code} · ${(c.stderr || '').slice(0, 120)}`)
    r.check('RC-02 보호 없는 임계구간이 실제로 겹친다', s.criticalOverlap === true,
      `실측 겹침 ${s.criticalOverlapMs}ms`)
    r.check('RC-03 마지막-쓰기-승으로 엔트리가 사라진다', Array.isArray(s.lost) && s.lost.length >= 1,
      `실측 생존 ${JSON.stringify(s.survivors)} · 손실 ${JSON.stringify(s.lost)}`)
    r.check('RC-04 post-read 대본이 Red 성립으로 끝난다 (겹침 + 손실)', c.code === 0 && s.pass === true,
      `실측 exit ${c.code} · pass ${s.pass}`)
  }

  // ---- Step 9 Green — 잠금 아래에서 직렬화되고 아무것도 잃지 않는다 -------
  {
    const c = race('pre-lock')
    const s = c.summary || {}
    r.check('RC-05 pre-lock 대본이 교착 없이 완주한다', c.code === 0 && s.timedOut === false,
      `실측 exit ${c.code} · timedOut ${s.timedOut} · ${(c.stderr || '').slice(0, 120)}`)
    r.check('RC-06 생존 구간은 여전히 겹친다 (진짜 동시 실행)', s.liveOverlap === true,
      `실측 겹침 ${s.liveOverlapMs}ms`)
    r.check('RC-07 보호 임계구간은 겹치지 않는다 (직렬화 실측)', s.criticalOverlap === false,
      `실측 겹침 ${s.criticalOverlapMs}ms`)
    r.check('RC-08 상태 파일 전 스코프가 무손실이다', Array.isArray(s.lost) && s.lost.length === 0 && s.globalSurvived === true,
      `실측 생존 ${JSON.stringify(s.survivors)} · 손실 ${JSON.stringify(s.lost)} · global ${s.globalSurvived}`)
  }

  // ---- Step 9 배선 — 33·40·50이 공통 헬퍼로만 상태를 쓴다 ----------------
  // 한 훅이라도 자체 tmp+rename 경로를 남겨 두면 그 훅의 쓰기는 잠금 밖이라 무손실이 깨진다.
  for (const hook of ['33_tdd-guard.cjs', '40_pass-watcher.cjs', '50_stop-gate.cjs']) {
    const src = readFileSync(join(H.mirror, '.claude', 'hooks', hook), 'utf8')
    r.check(`WR-${hook.slice(0, 2)} ${hook}가 공통 상태 헬퍼를 쓴다`, src.includes("_lib/state-store.cjs"),
      '실측 require 없음')
    r.check(`WR-${hook.slice(0, 2)}b ${hook}에 자체 rename 상태 쓰기가 남아 있지 않다`, !/fs\.renameSync\(/.test(src),
      '실측 renameSync 잔존 — 잠금 밖 쓰기 경로다')
  }

  // ---- Step 9 잠금 절차 — 획득 timeout과 stale-lock 회수 -----------------
  {
    const require_ = createRequire(import.meta.url)
    const store = require_(join(H.mirror, '.claude', 'hooks', '_lib', 'state-store.cjs'))
    const dir = mkdtempSync(join(tmpdir(), 'agentdeck-lock-'))
    const file = join(dir, 'probe.state.json')
    try {
      // (a) 살아 있는 소유자의 잠금 — 획득이 timeout으로 실패해야 한다
      writeFileSync(store.lockPathOf(file), JSON.stringify({ pid: process.pid, at: Date.now() }))
      process.env.AGENTDECK_STATE_LOCK_TIMEOUT = '250'
      let code = null
      const t0 = Date.now()
      try { store.acquireLock(file) } catch (e) { code = e && e.code }
      const waited = Date.now() - t0
      r.check('LK-01 살아 있는 소유자의 잠금은 획득 timeout으로 실패한다', code === 'ELOCKTIMEOUT',
        `실측 code ${code} · 대기 ${waited}ms`)
      r.check('LK-02 획득 대기가 설정한 상한을 지킨다', waited >= 200 && waited < 3000, `실측 ${waited}ms`)

      // (b) 죽은 pid의 잠금 — 고아로 판정해 회수한 뒤 획득해야 한다
      const dead = spawnSync(process.execPath, ['-e', 'process.exit(0)'])
      const deadPid = dead.pid
      writeFileSync(store.lockPathOf(file), JSON.stringify({ pid: deadPid, at: Date.now() }))
      r.check('LK-03 죽은 pid의 잠금은 stale로 판정된다', store.isStale(store.lockPathOf(file), 15000) === true,
        `실측 pid ${deadPid}`)
      const lock = store.acquireLock(file)
      r.check('LK-04 stale 잠금을 회수하고 획득한다', lock && lock.recovered >= 1, `실측 recovered ${lock && lock.recovered}`)
      store.releaseLock(lock)
      r.check('LK-05 해제하면 잠금 파일이 사라진다', !existsSync(store.lockPathOf(file)), '실측 잔존')

      // (c) 나이 초과 잠금 — 소유자 판독이 안 돼도 나이로 회수한다
      writeFileSync(store.lockPathOf(file), 'not-json')
      const old = new Date(Date.now() - 60000)
      utimesSync(store.lockPathOf(file), old, old)
      r.check('LK-06 나이 초과 잠금은 소유자 판독 없이도 stale이다', store.isStale(store.lockPathOf(file), 15000) === true)
      const lock2 = store.acquireLock(file)
      r.check('LK-07 나이 초과 잠금도 회수하고 획득한다', lock2 && lock2.recovered >= 1, `실측 recovered ${lock2 && lock2.recovered}`)
      store.releaseLock(lock2)
    } finally {
      delete process.env.AGENTDECK_STATE_LOCK_TIMEOUT
      rmSync(dir, { recursive: true, force: true })
    }
  }
} finally {
  H.cleanup()
}

process.exit(r.summary())
