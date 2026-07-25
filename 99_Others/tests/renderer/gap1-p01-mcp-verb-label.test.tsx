// @vitest-environment jsdom
/**
 * gap1-p01-mcp-verb-label.test.tsx — GAP1 P01(c) MCP 도구 verb 사람읽기 라벨.
 *
 * TDD RED: `mcp__server__tool` 원시 이름을 '서버 · 도구' 형태로 정규화한다.
 * 노출 지점 전수(함정 — 배지 3번째 지점 누락 교훈): toolKind.mcpToolLabel(순수 함수) +
 * 소비처 3곳(ToolCallCard 접힘 한 줄 · SubAgentInline 활동 행 · SubAgentModal 펼침
 * 도구 행 · PermissionCard 권한 카드) 전부 grep 전수 후 일괄 적용.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

afterEach(() => cleanup())

// ── (1) 순수 함수: mcpToolLabel ──────────────────────────────────────────────

describe('mcpToolLabel — mcp__server__tool → "서버 · 도구" 파싱 (순수)', () => {
  it('mcp__claude_ai_Notion__notion-search → "claude_ai_Notion · notion-search"', async () => {
    const { mcpToolLabel } = await import('../../../02.Source/renderer/src/lib/toolKind')
    expect(mcpToolLabel('mcp__claude_ai_Notion__notion-search')).toBe('claude_ai_Notion · notion-search')
  })

  it('도구명에 __가 더 있어도(예: mcp__srv__a__b) 서버 1개 + 나머지는 도구로 합침', async () => {
    const { mcpToolLabel } = await import('../../../02.Source/renderer/src/lib/toolKind')
    expect(mcpToolLabel('mcp__srv__a__b')).toBe('srv · a__b')
  })

  it('mcp 패턴이 아니면 원본 그대로(판별 실패 시 안전 폴백)', async () => {
    const { mcpToolLabel } = await import('../../../02.Source/renderer/src/lib/toolKind')
    expect(mcpToolLabel('Bash')).toBe('Bash')
    expect(mcpToolLabel('mcp__onlyserver')).toBe('mcp__onlyserver')
    expect(mcpToolLabel('')).toBe('')
  })
})

describe('toolMetaFor — mcp 분기가 mcpToolLabel을 verb로 사용', () => {
  it('원시 mcp__ 도구명 → verb가 "서버 · 도구" 라벨', async () => {
    const { toolMetaFor } = await import('../../../02.Source/renderer/src/lib/toolKind')
    const m = toolMetaFor('mcp__claude_ai_Notion__notion-search')
    expect(m.kind).toBe('mcp')
    expect(m.verb).toBe('claude_ai_Notion · notion-search')
  })
})

// ── (2) ToolCallCard 접힘 한 줄(.t-verb) ─────────────────────────────────────

describe('ToolCallCard — 접힘 한 줄(.t-verb)에 MCP 라벨 노출', () => {
  it('mcp__ 도구 카드 → .t-verb가 raw 전체 이름이 아니라 "서버 · 도구"', async () => {
    const { ToolCallCard } = await import('../../../02.Source/renderer/src/components/01_conversation/ToolCallCard')
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

// ── (3) SubAgentInline 활동 행 ────────────────────────────────────────────────

describe('SubAgentInline — 실행 중 도구 활동 행에 MCP 라벨 노출', () => {
  it('runningTool.verb가 raw mcp 이름이어도 활동 행은 "서버 · 도구" 표시', async () => {
    const { SubAgentInline } = await import('../../../02.Source/renderer/src/components/05_agent/SubAgentInline')
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

// ── (4) SubAgentModal 펼침 도구 행 ────────────────────────────────────────────

describe('SubAgentModal — 펼침 도구 행(.sa-tool-verb)에 MCP 라벨 노출', () => {
  it('t.verb가 raw mcp 이름이어도 .sa-tool-verb는 "서버 · 도구" 표시', async () => {
    const { SubAgentModal } = await import('../../../02.Source/renderer/src/components/05_agent/SubAgentModal')
    const agent = {
      id: 'sa1',
      name: 'explorer',
      role: '탐색',
      status: 'done' as const,
      tools: [
        { id: 'tl1', verb: 'mcp__claude_ai_notion__notion-search', target: 'query', status: 'done' as const },
      ],
    }
    const { container } = render(<SubAgentModal agent={agent} onClose={() => {}} />)
    const verbEl = container.querySelector('.sa-tool-verb')
    expect(verbEl?.textContent).toBe('claude_ai_notion · notion-search')
  })
})

// ── (5) PermissionCard 권한 카드 ──────────────────────────────────────────────

describe('PermissionCard — 권한 카드(.perm-card-tool)에 MCP 라벨 노출', () => {
  it('pending.toolName이 raw mcp 이름이어도 카드는 "서버 · 도구" 표시', async () => {
    const { PermissionCard } = await import('../../../02.Source/renderer/src/components/07_notice/PermissionCard')
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
    const { PermissionCard } = await import('../../../02.Source/renderer/src/components/07_notice/PermissionCard')
    const pending = { runId: 'r1', requestId: 'q1', toolName: 'Bash', summary: 'ls -la' }
    const { container } = render(<PermissionCard pending={pending} onRespond={() => {}} />)
    expect(container.querySelector('.perm-card-tool')?.textContent).toBe('Bash')
  })
})
