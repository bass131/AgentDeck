#!/usr/bin/env node
// 가드도 다른 훅처럼 hook-log.jsonl에 여섯 필드(hook·event·session·agent_id·verdict·rule) 줄을 남겨, 무엇이 왜 막혔는지 사후에 읽힌다.
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
  const deny = probe('① deny(`rm -rf dist`)', 'deny', () => h.verdict('rm -rf dist'))
  r.check('① deny 줄의 rule이 발동 규칙 id다', typeof deny?.rule === 'string' && deny.rule.length > 0, String(deny?.rule))
  r.check('① deny 줄의 session이 합성값이다', deny?.session === SYNTHETIC.session, String(deny?.session))
  r.check('① deny 줄의 agent_id가 합성값이다', deny?.agent_id === SYNTHETIC.agentId, String(deny?.agent_id))

  const allow = probe('② allow(`git status`)', 'allow', () => h.verdict('git status'))
  r.check('② allow 줄의 rule은 null이다 (발동 규칙 없음)', allow?.rule === null, String(allow?.rule))

  // 일반 push는 무출력이라 질의 줄은 `master`가 보이는 push로 겨눈다
  const askLine = probe('③ ask(`git push origin master`)', 'ask', () => h.verdict('git push origin master'))
  r.check('③ ask 줄의 rule이 발동 규칙 id다', typeof askLine?.rule === 'string' && askLine.rule.length > 0, String(askLine?.rule))

  const bare = probe('④ session·agent_id 부재 payload', 'allow',
    () => h.verdictRaw(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' } })))
  r.check('④ session이 null로 기록된다', bare?.session === null, String(bare?.session))
  r.check('④ agent_id가 null로 기록된다', bare?.agent_id === null, String(bare?.agent_id))

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
