import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { appendGuardEvent, formatLine, redact, MAX_LOG_BYTES, MAX_DETAIL_CHARS } from './guard-log.mjs'

const MODULE_PATH = fileURLToPath(new URL('./guard-log.mjs', import.meta.url))

function tmpLog() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-log-'))
  return { dir, logFile: path.join(dir, 'state', 'guard-blocks.log') }
}

test('formatLine — "ISO시각 | 훅명 | action | 요지" 한 줄 + 개행', () => {
  const line = formatLine({ hook: 'supervisor-guard', action: 'block', detail: '하네스 편집 차단', at: new Date('2026-07-12T03:00:00Z') })
  assert.equal(line, '2026-07-12T03:00:00.000Z | supervisor-guard | block | 하네스 편집 차단\n')
})

test('formatLine — detail 개행·CR 제거(라인 원장 보전) + 길이 상한', () => {
  const line = formatLine({ hook: 'h', action: 'notify', detail: `줄1\r\n줄2\n${'x'.repeat(1000)}` })
  const body = line.slice(0, -1)
  assert.ok(!/[\r\n]/.test(body))
  const detail = body.split(' | ')[3]
  assert.ok(detail.length <= MAX_DETAIL_CHARS)
})

test('formatLine — action은 block 외 전부 notify로 정규화', () => {
  assert.match(formatLine({ hook: 'h', action: 'block', detail: 'd' }), / \| block \| /)
  assert.match(formatLine({ hook: 'h', action: 'notify', detail: 'd' }), / \| notify \| /)
  assert.match(formatLine({ hook: 'h', action: 'weird', detail: 'd' }), / \| notify \| /)
})

test('redact — 키=값 형태 민감값 마스킹', () => {
  const out = redact('ANTHROPIC_API_KEY=sk-ant-abc123 password: hunter2 token=deadbeef99')
  assert.ok(!out.includes('sk-ant-abc123'))
  assert.ok(!out.includes('hunter2'))
  assert.ok(!out.includes('deadbeef99'))
  assert.ok(out.includes('[redacted]'))
})

test('redact — 키 프리픽스(sk-/ghp-)·JWT류 단독 등장도 마스킹', () => {
  const out = redact('발견: sk-ant-api03-verylongkeyvalue 그리고 ghp_abcdefgh12345678 그리고 eyJhbGciOiJIUzI1NiJ9.payload')
  assert.ok(!out.includes('verylongkeyvalue'))
  assert.ok(!out.includes('ghp_abcdefgh12345678'))
  assert.ok(!out.includes('eyJhbGciOiJIUzI1NiJ9'))
})

test('appendGuardEvent — 파일·디렉토리 없으면 생성 후 1라인 append', () => {
  const { logFile } = tmpLog()
  appendGuardEvent({ hook: 'tdd-guard', action: 'notify', detail: '경고 모드', logFile })
  const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean)
  assert.equal(lines.length, 1)
  assert.match(lines[0], /^\d{4}-\d{2}-\d{2}T.*Z \| tdd-guard \| notify \| 경고 모드$/)
})

test('appendGuardEvent — 상한 초과 시 .1로 로테이션 후 새 파일에 append', () => {
  const { logFile } = tmpLog()
  fs.mkdirSync(path.dirname(logFile), { recursive: true })
  fs.writeFileSync(logFile, 'x'.repeat(MAX_LOG_BYTES + 1))
  appendGuardEvent({ hook: 'h', action: 'block', detail: 'rotate', logFile })
  assert.ok(fs.existsSync(`${logFile}.1`))
  assert.equal(fs.statSync(`${logFile}.1`).size, MAX_LOG_BYTES + 1)
  const fresh = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean)
  assert.equal(fresh.length, 1)
  assert.match(fresh[0], / \| h \| block \| rotate$/)
})

test('CLI — CLAUDE_PROJECT_DIR 기준 .claude/state/guard-blocks.log에 append', async () => {
  const { dir } = tmpLog()
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MODULE_PATH, 'dangerous-cmd-guard', 'block', 'git reset --hard 차단'], {
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    })
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
  })
  const logFile = path.join(dir, '.claude', 'state', 'guard-blocks.log')
  const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean)
  assert.equal(lines.length, 1)
  assert.match(lines[0], / \| dangerous-cmd-guard \| block \| git reset --hard 차단$/)
})

test('로테이션 락 보유 중이면 회전 생략(원장 클로버 방지) — append는 계속', () => {
  // Sol 리뷰 [P2]: 경쟁자가 방금 아카이브된 512KB 원장을 신생 파일로 덮어쓰는 사고 차단.
  const { logFile } = tmpLog()
  fs.mkdirSync(path.dirname(logFile), { recursive: true })
  fs.writeFileSync(logFile, 'x'.repeat(MAX_LOG_BYTES + 1))
  fs.mkdirSync(`${logFile}.rotate-lock`) // 타 프로세스가 회전 중인 상황 재현
  appendGuardEvent({ hook: 'h', action: 'notify', detail: '락 보유 중', logFile })
  assert.ok(!fs.existsSync(`${logFile}.1`), '락 보유 중엔 회전하면 안 됨')
  assert.ok(fs.statSync(logFile).size > MAX_LOG_BYTES + 1, 'append 자체는 계속돼야 함')
  fs.rmdirSync(`${logFile}.rotate-lock`)
})

test('스테일 락(크래시 잔재)은 정리되고 다음 append가 회전 재개', () => {
  const { logFile } = tmpLog()
  fs.mkdirSync(path.dirname(logFile), { recursive: true })
  fs.writeFileSync(logFile, 'x'.repeat(MAX_LOG_BYTES + 1))
  fs.mkdirSync(`${logFile}.rotate-lock`)
  const old = new Date(Date.now() - 60_000)
  fs.utimesSync(`${logFile}.rotate-lock`, old, old) // 60초 전 잔재로 위장
  appendGuardEvent({ hook: 'h', action: 'notify', detail: '스테일 정리 턴', logFile })
  appendGuardEvent({ hook: 'h', action: 'notify', detail: '회전 재개 턴', logFile })
  assert.ok(fs.existsSync(`${logFile}.1`), '스테일 락 정리 후 회전이 재개돼야 함')
})

test('상한 미만 파일은 절대 회전되지 않는다(락 안 재확인)', () => {
  const { logFile } = tmpLog()
  appendGuardEvent({ hook: 'h', action: 'notify', detail: '작은 원장', logFile })
  appendGuardEvent({ hook: 'h', action: 'notify', detail: '둘째 줄', logFile })
  assert.ok(!fs.existsSync(`${logFile}.1`))
  assert.equal(fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).length, 2)
})

test('동시 append 20 프로세스 — 유실 0 + 전 라인 완전(4필드)', async () => {
  const { dir } = tmpLog()
  const N = 20
  await Promise.all(Array.from({ length: N }, (_, i) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MODULE_PATH, `hook-${i}`, 'notify', `동시성 ${i}`], {
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    })
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
  })))
  const logFile = path.join(dir, '.claude', 'state', 'guard-blocks.log')
  const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean)
  assert.equal(lines.length, N)
  for (const line of lines) assert.equal(line.split(' | ').length, 4)
})
