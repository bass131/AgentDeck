// 루프 세션을 열 때 두 거처(앱 데이터 폴더·작업 저장소)에서 Taste·헌장을 읽어 SDK 옵션에 싣는다. 채팅 세션은 읽지 않는다.
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ClaudeCodeBackend } from '@main/04_Claude/ClaudeCodeBackend'
import { writeGlobalTaste, writeProjectCharter, writeProjectTaste } from '@main/13_Taste/tasteStore'
import type { ControlsForRun } from '@main/04_Claude/permission/controlsStore'
import type { QueryFn } from '@main/04_Claude/queryFn'
import type { AgentRunInput } from '@main/03_Agent/AgentBackend'
import type { AgentEvent } from '@shared/agentEvents'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-run-taste-'))
let ud = ''
let ws = ''

beforeEach(async () => {
  ud = fs.mkdtempSync(path.join(root, 'ud-'))
  ws = fs.mkdtempSync(path.join(root, 'ws-'))
  await writeGlobalTaste(ud, [{ id: 'T1', title: '정보 밀도', fields: [{ name: '원칙', text: '전역 원칙 문장' }] }])
  await writeProjectCharter(ws, { goal: ['헌장 목표 문장'], nonGoals: null })
  await writeProjectTaste(ws, [{ id: 'T1', title: '화면 톤', fields: [{ name: '금지', text: '프로젝트 금지 문장' }] }])
})

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

const result = { type: 'result', subtype: 'success', is_error: false, usage: { input_tokens: 1, output_tokens: 1 }, modelUsage: {}, errors: [] }
const ok = (): ControlsForRun => ({ ok: true, nodes: [] })

async function optionsOf(req: Partial<AgentRunInput>): Promise<{ settingSources?: string[]; systemPrompt?: { append?: string } }> {
  let options: { settingSources?: string[]; systemPrompt?: { append?: string } } = {}
  const query: QueryFn = async function* (params: { prompt: string; options?: unknown }) {
    options = params.options as typeof options
    yield result
  }
  const backend = new ClaudeCodeBackend(query, undefined, undefined, { controlsAtRunStart: ok, engineLockDir: () => ud })
  const events: AgentEvent[] = []
  for await (const e of backend.start({ messages: [{ role: 'user', content: 'hi' }], workspaceRoot: ws, ...req }).events) events.push(e)
  expect(events[events.length - 1].type).toBe('done')
  return options
}

describe('루프 세션의 Taste·헌장 싣기', () => {
  it('loopLock이 있는 실행은 user 원천 없이 열고 덧붙임에 세 문서 원문을 싣는다', async () => {
    const opts = await optionsOf({ loopLock: { repoRoot: ws, appLoopDir: path.join(ud, 'loop') } })
    expect(opts.settingSources).toEqual(['project', 'local'])
    const append = opts.systemPrompt?.append ?? ''
    expect(append).toContain('[전역 Taste]\n# 전역 Taste')
    expect(append).toContain('전역 원칙 문장')
    expect(append).toContain('[프로젝트 헌장 — docs/agentdeck/헌장.md]\n# 프로젝트 헌장')
    expect(append).toContain('헌장 목표 문장')
    expect(append).toContain('[프로젝트 Taste — docs/agentdeck/Taste.md]\n# 프로젝트 Taste')
    expect(append).toContain('프로젝트 금지 문장')
  })

  it('이어지는(persistent) 루프 실행도 같은 옵션으로 연다', async () => {
    const opts = await optionsOf({ persistent: true, loopLock: { repoRoot: ws, appLoopDir: path.join(ud, 'loop') } })
    expect(opts.settingSources).toEqual(['project', 'local'])
    expect(opts.systemPrompt?.append).toContain('헌장 목표 문장')
  })

  it('채팅 세션은 같은 작업 폴더라도 세 원천 그대로이고 Taste·헌장을 싣지 않는다', async () => {
    const opts = await optionsOf({})
    expect(opts.settingSources).toEqual(['user', 'project', 'local'])
    expect(opts.systemPrompt?.append ?? '').not.toContain('Taste')
    expect(opts.systemPrompt?.append ?? '').not.toContain('헌장')
  })
})
