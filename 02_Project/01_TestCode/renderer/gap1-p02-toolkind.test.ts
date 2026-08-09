import { describe, it, expect } from 'vitest'
import { toolMetaFor } from '../../../02_Project/00_Source/renderer/src/lib/toolKind'

describe('toolMetaFor — 신형 SDK 도구 10종 (GAP1 P02 T-09)', () => {
  it('KillShell → bash, verb=Kill', () => {
    const m = toolMetaFor('KillShell')
    expect(m.kind).toBe('bash')
    expect(m.verb).toBe('Kill')
  })

  it('NotebookRead → read, verb=Notebook', () => {
    const m = toolMetaFor('NotebookRead')
    expect(m.kind).toBe('read')
    expect(m.verb).toBe('Notebook')
  })

  it('TaskStop → mcp, verb=Stop', () => {
    const m = toolMetaFor('TaskStop')
    expect(m.kind).toBe('mcp')
    expect(m.verb).toBe('Stop')
  })

  it('TaskGet → mcp, verb=Task', () => {
    const m = toolMetaFor('TaskGet')
    expect(m.kind).toBe('mcp')
    expect(m.verb).toBe('Task')
  })

  it('TaskOutput → mcp, verb=Output', () => {
    const m = toolMetaFor('TaskOutput')
    expect(m.kind).toBe('mcp')
    expect(m.verb).toBe('Output')
  })

  it('Monitor → mcp, verb=Monitor', () => {
    const m = toolMetaFor('Monitor')
    expect(m.kind).toBe('mcp')
    expect(m.verb).toBe('Monitor')
  })

  it('EnterWorktree → git(신규 kind), verb=Worktree', () => {
    const m = toolMetaFor('EnterWorktree')
    expect(m.kind).toBe('git')
    expect(m.verb).toBe('Worktree')
  })

  it('ExitWorktree → git(신규 kind), verb=Worktree', () => {
    const m = toolMetaFor('ExitWorktree')
    expect(m.kind).toBe('git')
    expect(m.verb).toBe('Worktree')
  })

  it('ToolSearch → search, verb=Tools', () => {
    const m = toolMetaFor('ToolSearch')
    expect(m.kind).toBe('search')
    expect(m.verb).toBe('Tools')
  })

  it('WaitForMcpServers → mcp, verb=MCP', () => {
    const m = toolMetaFor('WaitForMcpServers')
    expect(m.kind).toBe('mcp')
    expect(m.verb).toBe('MCP')
  })

  it('10종 전부 kind !== other (핵심 완료조건)', () => {
    const names = [
      'KillShell', 'NotebookRead', 'TaskStop', 'TaskGet', 'TaskOutput',
      'Monitor', 'EnterWorktree', 'ExitWorktree', 'ToolSearch', 'WaitForMcpServers',
    ]
    for (const n of names) {
      expect(toolMetaFor(n).kind).not.toBe('other')
    }
  })

  it('대소문자/구분자 변형에도 동일 매핑(정규화 회귀 방지)', () => {
    expect(toolMetaFor('Kill_Shell').kind).toBe('bash')
    expect(toolMetaFor('kill-shell').kind).toBe('bash')
    expect(toolMetaFor('enter_worktree').kind).toBe('git')
    expect(toolMetaFor('EXIT WORKTREE').kind).toBe('git')
    expect(toolMetaFor('tool_search').kind).toBe('search')
    expect(toolMetaFor('wait_for_mcp_servers').kind).toBe('mcp')
  })

  it('색은 var() 토큰(하드코딩 hex 0)', () => {
    const names = ['KillShell', 'EnterWorktree', 'ExitWorktree', 'Monitor', 'ToolSearch']
    for (const n of names) {
      expect(toolMetaFor(n).color).toMatch(/^var\(/)
    }
  })
})
