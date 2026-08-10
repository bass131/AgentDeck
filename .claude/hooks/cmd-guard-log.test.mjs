#!/usr/bin/env node
// 위험 명령 가드 — 판정 로그 픽스처 (M02 Phase 2 Step 8, Backlog 10).
//
// 종전 가드는 판정을 하나도 남기지 않았다. 다른 훅은 전부 hook-log.jsonl에 줄을 남기는데 가드만
// 관측 표면이 비어 있어, 무엇이 왜 막혔는지를 사후에 읽을 수 없었다.
// 요구 필드는 여섯이다 — `hook`·`event`·`session`·`agent_id`·`verdict`·`rule`(발동 규칙 id 또는 null).
// 로거는 CLAUDE_PROJECT_DIR 기준으로 경로를 잡는 독립 로거이고, 스키마는 기존 훅과 같다.
//
// 픽스처 다섯 — ① deny 줄 ② allow 줄 ③ ask 줄 ④ session·agent_id 부재 시 null 기록
//              ⑤ 격리 미러 뿌리에 기록되고 live 로그에는 남지 않는다.
//
// `--guard <절대경로>`로 다른 가드 구현을 겨눌 수 있다 — 수리 전 구현을 상대로 Red를 재현하는 영수증용이다.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRunner } from './_lib/runner.mjs'
import { createGuardHarness, REPO_ROOT, SYNTHETIC } from './_lib/guard-spawn.mjs'

const argIdx = process.argv.indexOf('--guard')
const GUARD = argIdx >= 0 ? process.argv[argIdx + 1] : 'dangerous-cmd-guard.mjs'

const REQUIRED = ['hook', 'event', 'session', 'agent_id', 'verdict', 'rule']
const r = createRunner(`cmd-guard 판정 로그 (${GUARD})`)
const h = createGuardHarness(GUARD)

// 이 명령의 판정 뒤 새로 붙은 cmd-guard 줄 하나를 돌려준다
function lastGuardLine(before) {
  const lines = h.logLines().filter((l) => l.hook === 'cmd-guard')
  return lines.length > before ? lines[lines.length - 1] : null
}
function probe(label, verdict, run) {
  const before = h.logLines().filter((l) => l.hook === 'cmd-guard').length
  const actual = run()
  const line = lastGuardLine(before)
  r.judge(`${label} — 훅 판정`, actual, verdict)
  if (!r.check(`${label} — 판정 줄이 남는다`, !!line, line ? '' : '새 cmd-guard 줄 없음')) return null
  r.judge(`${label} — 줄의 verdict`, line.verdict, verdict)
  const missing = REQUIRED.filter((k) => !(k in line))
  r.check(`${label} — 요구 필드 여섯이 전부 있다`, missing.length === 0, `누락 ${missing.join(', ') || '없음'}`)
  return line
}

try {
  // ── ①②③ 세 판정이 각각 줄로 남는다 ────────────────────────────────────────
  const deny = probe('① deny(`rm -rf dist`)', 'deny', () => h.verdict('rm -rf dist'))
  r.check('① deny 줄의 rule이 발동 규칙 id다', typeof deny?.rule === 'string' && deny.rule.length > 0, String(deny?.rule))
  r.check('① deny 줄의 session이 합성값이다', deny?.session === SYNTHETIC.session, String(deny?.session))
  r.check('① deny 줄의 agent_id가 합성값이다', deny?.agent_id === SYNTHETIC.agentId, String(deny?.agent_id))

  const allow = probe('② allow(`git status`)', 'allow', () => h.verdict('git status'))
  r.check('② allow 줄의 rule은 null이다 (발동 규칙 없음)', allow?.rule === null, String(allow?.rule))

  const askLine = probe('③ ask(`git push origin main`)', 'ask', () => h.verdict('git push origin main'))
  r.check('③ ask 줄의 rule이 발동 규칙 id다', typeof askLine?.rule === 'string' && askLine.rule.length > 0, String(askLine?.rule))

  // ── ④ payload에 session_id·agent_id가 없으면 null로 기록된다 ────────────────
  const bare = probe('④ session·agent_id 부재 payload', 'allow',
    () => h.verdictRaw(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' } })))
  r.check('④ session이 null로 기록된다', bare?.session === null, String(bare?.session))
  r.check('④ agent_id가 null로 기록된다', bare?.agent_id === null, String(bare?.agent_id))

  // ── ⑤ 기록 위치 — 미러 뿌리에만 남고 live 로그에는 남지 않는다 ──────────────
  r.check('⑤ 판정 줄이 격리 미러 뿌리에 기록된다',
    h.logLines().filter((l) => l.hook === 'cmd-guard').length >= 4 && !h.mirror.startsWith(REPO_ROOT), h.mirror)
  const liveLog = join(REPO_ROOT, '98_Management', '01_GateState', 'hook-log.jsonl')
  const liveHits = existsSync(liveLog)
    ? readFileSync(liveLog, 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter((l) => l && (l.session === SYNTHETIC.session || l.agent_id === SYNTHETIC.agentId)).length
    : 0
  r.check('⑤ live hook-log에 합성 session·agent_id 줄이 0건이다', liveHits === 0, `${liveHits}건`)
} finally {
  h.cleanup()
}

process.exit(r.summary())
