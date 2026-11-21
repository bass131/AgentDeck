import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { bundledClaudeExecutable, captureSupportedCommands, withClaudeExecutable } from '@main/04_Claude/queryFn'
import type { QueryFn } from '@main/04_Claude/queryFn'
import type { SlashCommandInfo } from '@shared/ipcContract'

describe('설치본의 번들 SDK 실행 파일 경로 (M13 G1)', () => {
  const env = { isPackaged: true, resourcesPath: 'C:/Apps/agentdeck/resources', platform: 'win32', arch: 'x64' }

  it('패키징본이면 asar 밖(app.asar.unpacked)의 플랫폼 패키지 실행 파일을 가리킨다', () => {
    expect(bundledClaudeExecutable(env)).toBe(
      join('C:/Apps/agentdeck/resources', 'app.asar.unpacked', 'node_modules', '@anthropic-ai', 'claude-agent-sdk-win32-x64', 'claude.exe'),
    )
    expect(bundledClaudeExecutable({ ...env, platform: 'linux', arch: 'arm64' })).toMatch(/claude-agent-sdk-linux-arm64[\\/]claude$/)
  })

  it('개발 실행본이면 지정하지 않는다(SDK 기본 경로)', () => {
    expect(bundledClaudeExecutable({ ...env, isPackaged: false })).toBeNull()
  })

  it('경로를 옵션에 넣되 호출자가 준 값과 다른 옵션은 그대로 둔다', () => {
    const seen: unknown[] = []
    const query: QueryFn = (p) => { seen.push(p.options); return { async *[Symbol.asyncIterator]() { } } }
    const wrapped = withClaudeExecutable(query, 'X:/claude.exe')
    wrapped({ prompt: 'a', options: { model: 'm' } })
    wrapped({ prompt: 'b' })
    wrapped({ prompt: 'c', options: { pathToClaudeCodeExecutable: 'Y:/own.exe' } })
    expect(seen).toEqual([
      { model: 'm', pathToClaudeCodeExecutable: 'X:/claude.exe' },
      { pathToClaudeCodeExecutable: 'X:/claude.exe' },
      { pathToClaudeCodeExecutable: 'Y:/own.exe' },
    ])
    expect(withClaudeExecutable(query, null)).toBe(query)
  })
})

function mkHandle(result: unknown): AsyncIterable<unknown> & { supportedCommands?: () => Promise<unknown> } {
  return {
    async *[Symbol.asyncIterator]() { },
    supportedCommands: async () => result,
  }
}

describe('captureSupportedCommands()', () => {
  it('supportedCommands 결과 → SlashCommandInfo[]로 정규화해 콜백 호출', async () => {
    let captured: SlashCommandInfo[] | null = null
    const handle = mkHandle([
      { name: 'loop', description: 'run loop', argumentHint: '<n>' },
      { name: 'goal', description: null },
    ])
    captureSupportedCommands(handle, (cmds) => { captured = cmds })
    await new Promise((r) => setTimeout(r, 10))
    expect(captured).not.toBeNull()
    expect(captured!).toEqual([
      { name: 'loop', description: 'run loop', scope: 'builtin', argHint: '<n>' },
      { name: 'goal', description: '', scope: 'builtin' },
    ])
  })

  it('onCaptured=null → no-op (콜백 미호출)', async () => {
    const handle = mkHandle([{ name: 'x' }])
    expect(() => captureSupportedCommands(handle, null)).not.toThrow()
    await new Promise((r) => setTimeout(r, 10))
  })

  it('supportedCommands 메서드 없음 → no-op', async () => {
    let called = false
    const handle = { async *[Symbol.asyncIterator]() {} } as AsyncIterable<unknown>
    captureSupportedCommands(handle, () => { called = true })
    await new Promise((r) => setTimeout(r, 10))
    expect(called).toBe(false)
  })

  it('name 없는 항목은 건너뜀', async () => {
    let captured: SlashCommandInfo[] | null = null
    const handle = mkHandle([{ description: 'no name' }, { name: 'ok' }])
    captureSupportedCommands(handle, (cmds) => { captured = cmds })
    await new Promise((r) => setTimeout(r, 10))
    expect(captured!).toEqual([{ name: 'ok', description: '', scope: 'builtin' }])
  })

  it('supportedCommands throw → 콜백 미호출(graceful)', async () => {
    let called = false
    const handle = {
      async *[Symbol.asyncIterator]() {},
      supportedCommands: async () => { throw new Error('boom') },
    } as AsyncIterable<unknown> & { supportedCommands: () => Promise<unknown> }
    captureSupportedCommands(handle, () => { called = true })
    await new Promise((r) => setTimeout(r, 10))
    expect(called).toBe(false)
  })
})
