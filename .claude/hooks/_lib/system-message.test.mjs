import assert from 'node:assert/strict'
import test from 'node:test'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { systemMessageJson } from './system-message.mjs'

const MODULE_PATH = fileURLToPath(new URL('./system-message.mjs', import.meta.url))

test('systemMessageJson — 따옴표·개행·이모지 라운드트립', () => {
  const msg = '🚩 깃발 [ harness ] — "CRITICAL" 준수\n둘째 줄'
  const parsed = JSON.parse(systemMessageJson(msg))
  assert.deepEqual(parsed, { systemMessage: msg })
})

test('systemMessageJson — 비문자열 입력도 문자열로 강제', () => {
  assert.deepEqual(JSON.parse(systemMessageJson(42)), { systemMessage: '42' })
})

test('CLI — stdin 파이프 → stdout에 JSON 단독 출력', async () => {
  const msg = '⚠️ convention-size: 900줄 (임계 800)'
  const stdout = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MODULE_PATH])
    let out = ''
    child.stdout.on('data', (d) => { out += d })
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`exit ${code}`))))
    child.stdin.end(msg)
  })
  assert.deepEqual(JSON.parse(stdout), { systemMessage: msg })
})
