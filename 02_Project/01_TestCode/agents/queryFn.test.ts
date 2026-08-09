import { describe, it, expect } from 'vitest'
import { captureSupportedCommands } from '../../../02_Project/00_Source/main/01_agents/queryFn'
import type { SlashCommandInfo } from '../../../02_Project/00_Source/shared/ipcContract'

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
