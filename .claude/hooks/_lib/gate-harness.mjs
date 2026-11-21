// 게이트 훅을 OS 임시 폴더의 미러에서 CLAUDE_PROJECT_DIR=<미러>로 구동한다 — 실저장소의 01_GateState를 건드리지 않는다.
// guard-spawn과 나눈 이유: 저쪽은 가드 한 종을 판정 축(deny·ask·allow)으로 접고, 이쪽은 추가된 hook-log 줄로 판정한다.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

export function createGateHarness(opts = {}) {
  const mirror = mkdtempSync(join(tmpdir(), 'agentdeck-gate-'))
  const gateDir = join(mirror, '98_Management', '01_GateState')
  mkdirSync(gateDir, { recursive: true })
  cpSync(join(REPO_ROOT, '.claude', 'hooks'), join(mirror, '.claude', 'hooks'), { recursive: true })
  const logFile = join(gateDir, 'hook-log.jsonl')
  const configFile = join(gateDir, 'gate-config.json')
  if (opts.config) writeFileSync(configFile, JSON.stringify(opts.config, null, 2) + '\n')

  const lines = () => {
    try {
      return readFileSync(logFile, 'utf8').split('\n').filter((l) => l.trim() !== '')
        .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    } catch {
      return []
    }
  }

  // 판정 근거는 stdout과 이번 구동이 추가한 hook-log 줄뿐이다.
  function run(hookName, payload, extra = {}) {
    const before = lines().length
    const env = { ...process.env, CLAUDE_PROJECT_DIR: mirror, ...(extra.env || {}) }
    for (const [k, v] of Object.entries(extra.env || {})) if (v === undefined) delete env[k]
    const r = spawnSync(process.execPath, [join(mirror, '.claude', 'hooks', hookName), ...(extra.argv || [])], {
      input: payload === null ? '' : JSON.stringify(payload), cwd: mirror, env, encoding: 'utf8',
    })
    const added = lines().slice(before)
    return {
      code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '',
      added,
      of: (hook) => added.filter((l) => l.hook === hook),
      seen: (hook) => added.filter((l) => l.hook === hook).map((l) => `${l.verdict}/${l.rule}`).join(', ') || '무발화',
    }
  }

  return {
    mirror, gateDir, logFile, configFile, run, lines,
    path: (...p) => join(mirror, ...p),
    setConfig: (obj) => writeFileSync(configFile, JSON.stringify(obj, null, 2) + '\n'),
    readJson: (p) => JSON.parse(readFileSync(p, 'utf8')),
    writeJson: (p, o) => writeFileSync(p, JSON.stringify(o, null, 2) + '\n'),
    write: (p, text) => writeFileSync(p, text),
    cleanup: () => rmSync(mirror, { recursive: true, force: true }),
  }
}

// vitest 요약 줄의 원형 — 색상 제어 문자 포함본은 시험이 만든다
export const VITEST_FULL_GREEN = ' RUN  vitest\n\n Test Files  411 passed | 6 skipped (417)\n      Tests  5465 passed (5477)\n'
export const VITEST_FULL_RED = ' RUN  vitest\n\n Test Files  2 failed | 409 passed (411)\n      Tests  3 failed | 5462 passed\n'
export const VITEST_SINGLE_GREEN = ' RUN  vitest\n\n Test Files  1 passed (1)\n      Tests  2 passed (2)\n'
