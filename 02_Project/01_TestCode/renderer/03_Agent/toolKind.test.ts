// 작업 ID: gap1-p02 · 옛 이름 toolKind.test.ts, gap1-p02-toolkind.test.ts
import { describe, it, expect } from 'vitest'
import { toolMetaFor, toolTarget } from '@renderer/03_Agent/toolKind'

describe('toolMetaFor', () => {
  it('대표 도구 매핑(kind/verb)', () => {
    expect(toolMetaFor('Read').kind).toBe('read')
    expect(toolMetaFor('Write').kind).toBe('write')
    expect(toolMetaFor('Edit').kind).toBe('edit')
    expect(toolMetaFor('Bash').kind).toBe('bash')
    expect(toolMetaFor('Grep').kind).toBe('search')
    expect(toolMetaFor('Glob').kind).toBe('search')
    expect(toolMetaFor('WebFetch').kind).toBe('web')
  })

  it('대소문자/구분자 무관', () => {
    expect(toolMetaFor('bash').kind).toBe('bash')
    expect(toolMetaFor('web_fetch').kind).toBe('web')
  })

  it('미지 도구 → other(verb=원본명)', () => {
    const m = toolMetaFor('CustomTool')
    expect(m.kind).toBe('other')
    expect(m.verb).toBe('CustomTool')
  })

  it('색은 oklch/var 토큰 (하드코딩 hex 0)', () => {
    for (const n of ['Read', 'Write', 'Bash', 'Grep', 'WebFetch', 'X']) {
      expect(toolMetaFor(n).color).toMatch(/^(var\(|oklch\()/)
    }
  })
})

describe('toolTarget', () => {
  it('file_path/path/command/pattern/url/query에서 추출', () => {
    expect(toolTarget({ file_path: 'src/a.ts' })).toBe('src/a.ts')
    expect(toolTarget({ command: 'ls -la' })).toBe('ls -la')
    expect(toolTarget({ pattern: 'foo.*' })).toBe('foo.*')
    expect(toolTarget({ url: 'http://x' })).toBe('http://x')
  })

  it('문자열 input은 그대로', () => {
    expect(toolTarget('plain')).toBe('plain')
  })

  it('null/대상없음 → 빈 문자열', () => {
    expect(toolTarget(null)).toBe('')
    expect(toolTarget({ other: 1 })).toBe('')
  })
})

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
