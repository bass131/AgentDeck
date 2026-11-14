// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

afterEach(() => cleanup())

describe('mcpToolLabel — mcp__server__tool → "서버 · 도구" 파싱 (순수)', () => {
  it('mcp__claude_ai_Notion__notion-search → "claude_ai_Notion · notion-search"', async () => {
    const { mcpToolLabel } = await import('@renderer/03_Agent/toolKind')
    expect(mcpToolLabel('mcp__claude_ai_Notion__notion-search')).toBe('claude_ai_Notion · notion-search')
  })

  it('도구명에 __가 더 있어도(예: mcp__srv__a__b) 서버 1개 + 나머지는 도구로 합침', async () => {
    const { mcpToolLabel } = await import('@renderer/03_Agent/toolKind')
    expect(mcpToolLabel('mcp__srv__a__b')).toBe('srv · a__b')
  })

  it('mcp 패턴이 아니면 원본 그대로(판별 실패 시 안전 폴백)', async () => {
    const { mcpToolLabel } = await import('@renderer/03_Agent/toolKind')
    expect(mcpToolLabel('Bash')).toBe('Bash')
    expect(mcpToolLabel('mcp__onlyserver')).toBe('mcp__onlyserver')
    expect(mcpToolLabel('')).toBe('')
  })
})

describe('toolMetaFor — mcp 분기가 mcpToolLabel을 verb로 사용', () => {
  it('원시 mcp__ 도구명 → verb가 "서버 · 도구" 라벨', async () => {
    const { toolMetaFor } = await import('@renderer/03_Agent/toolKind')
    const m = toolMetaFor('mcp__claude_ai_Notion__notion-search')
    expect(m.kind).toBe('mcp')
    expect(m.verb).toBe('claude_ai_Notion · notion-search')
  })
})

describe('ToolCallCard — 접힘 한 줄(.t-verb)에 MCP 라벨 노출', () => {
  it('mcp__ 도구 카드 → .t-verb가 raw 전체 이름이 아니라 "서버 · 도구"', async () => {
    const { ToolCallCard } = await import('@renderer/05_Conversation/ToolCallCard')
    const card = {
      id: 'mcp1',
      name: 'mcp__claude_ai_Notion__notion-search',
      input: { query: 'meeting notes' },
      status: 'done' as const,
      result: '{}',
    }
    const { container } = render(<ToolCallCard card={card} />)
    const verbEl = container.querySelector('.t-verb')
    expect(verbEl?.textContent).toBe('claude_ai_Notion · notion-search')
    expect(verbEl?.textContent).not.toContain('mcp__claude_ai_Notion__notion-search')
  })
})

describe('SubAgentInline — 실행 중 도구 활동 행에 MCP 라벨 노출', () => {
  it('runningTool.verb가 raw mcp 이름이어도 활동 행은 "서버 · 도구" 표시', async () => {
    const { SubAgentInline } = await import('@renderer/03_Agent/SubAgentInline')
    const agent = {
      id: 'sa1',
      name: 'explorer',
      role: '탐색',
      status: 'running' as const,
      tools: [
        { id: 'tl1', verb: 'mcp__claude_ai_notion__notion-search', target: 'query', status: 'running' as const },
      ],
    }
    const { container } = render(<SubAgentInline agent={agent} onOpen={() => {}} />)
    const activity = container.querySelector('.sa-inline-activity')
    expect(activity?.textContent).toContain('claude_ai_notion · notion-search')
    expect(activity?.textContent).not.toContain('mcp__claude_ai_notion__notion-search')
  })
})

describe('PermissionCard — 권한 카드(.perm-card-tool)에 MCP 라벨 노출', () => {
  it('pending.toolName이 raw mcp 이름이어도 카드는 "서버 · 도구" 표시', async () => {
    const { PermissionCard } = await import('@renderer/10_Engine')
    const pending = {
      runId: 'r1',
      requestId: 'q1',
      toolName: 'mcp__claude_ai_Notion__notion-search',
      summary: 'Notion 검색',
    }
    const { container } = render(<PermissionCard pending={pending} onRespond={() => {}} />)
    const toolEl = container.querySelector('.perm-card-tool')
    expect(toolEl?.textContent).toBe('claude_ai_Notion · notion-search')
  })

  it('일반 도구(Bash)는 그대로(회귀 0)', async () => {
    const { PermissionCard } = await import('@renderer/10_Engine')
    const pending = { runId: 'r1', requestId: 'q1', toolName: 'Bash', summary: 'ls -la' }
    const { container } = render(<PermissionCard pending={pending} onRespond={() => {}} />)
    expect(container.querySelector('.perm-card-tool')?.textContent).toBe('Bash')
  })
})
