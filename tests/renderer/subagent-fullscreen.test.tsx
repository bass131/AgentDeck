// @vitest-environment jsdom
/**
 * subagent-fullscreen.test.tsx — Phase 37 #3: SubAgentFullscreen 컴포넌트 TDD
 *
 * R2 검증:
 *   SF1: agent=null → null 반환(미렌더)
 *   SF2: agent 있으면 FullscreenOverlay 래핑(fs-overlay DOM)
 *   SF3: activity 섹션 렌더(sa-card-md)
 *   SF4: 도구 섹션 렌더(sa-tool)
 *   SF5: transcript 타임라인 렌더 — text/thinking/tool 항목
 *   SF6: transcript 빈 배열 → "아직 기록이 없어요" 표시
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { SubAgentInfo } from '../../src/renderer/src/lib/agentSampleData'

vi.mock('../../src/renderer/src/components/icons', () => ({
  IconCheck: () => null,
  IconClose: () => null,
  IconSearch: () => null,
  IconFile: () => null,
  IconBot: () => null,
}))

vi.mock('../../src/renderer/src/components/FullscreenOverlay', () => ({
  FullscreenOverlay: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div className="fs-overlay" data-testid="fs-overlay" data-title={title}>
      <div className="fs-panel">
        <div className="fs-head">{title}</div>
        <div className="fs-body">{children}</div>
      </div>
    </div>
  ),
  default: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div className="fs-overlay" data-testid="fs-overlay" data-title={title}>
      <div className="fs-panel">
        <div className="fs-head">{title}</div>
        <div className="fs-body">{children}</div>
      </div>
    </div>
  ),
}))

vi.mock('../../src/renderer/src/components/SubAgentFullscreen.css', () => ({}))

import React from 'react'
import { SubAgentFullscreen } from '../../src/renderer/src/components/SubAgentFullscreen'

afterEach(() => { cleanup() })

const mockAgent: SubAgentInfo = {
  id: 'toolu_sa1',
  name: '탐색 에이전트',
  role: 'explorer',
  status: 'done',
  activity: '파일을 탐색했습니다.',
  tools: [
    { id: 'tool-1', verb: 'read', target: 'src/main.ts', status: 'done' },
    { id: 'tool-2', verb: 'bash', target: 'ls', status: 'running' },
  ],
  transcript: [
    { kind: 'text', text: '탐색 시작합니다.' },
    { kind: 'thinking', text: '파일 구조 분석 중' },
    { kind: 'tool', verb: 'read', target: 'src/main.ts', status: 'done', id: 'tool-1' },
  ],
}

describe('SF1 — agent=null → null 반환', () => {
  it('agent=null이면 아무것도 렌더하지 않음', () => {
    const { container } = render(
      <SubAgentFullscreen agent={null} onClose={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('SF2 — agent 있으면 FullscreenOverlay 래핑', () => {
  it('fs-overlay DOM 렌더됨', () => {
    render(<SubAgentFullscreen agent={mockAgent} onClose={() => {}} />)
    expect(screen.getByTestId('fs-overlay')).toBeTruthy()
  })

  it('제목에 에이전트 이름 포함', () => {
    render(<SubAgentFullscreen agent={mockAgent} onClose={() => {}} />)
    const overlay = screen.getByTestId('fs-overlay')
    expect(overlay.getAttribute('data-title')).toContain('탐색 에이전트')
  })
})

describe('SF3 — activity 섹션 렌더', () => {
  it('sa-card-md 클래스 엘리먼트에 activity 텍스트 표시', () => {
    const { container } = render(
      <SubAgentFullscreen agent={mockAgent} onClose={() => {}} />
    )
    const md = container.querySelector('.sa-card-md')
    expect(md).toBeTruthy()
    expect(md!.textContent).toContain('파일을 탐색했습니다.')
  })

  it('activity 없으면 sa-card-md 미렌더', () => {
    const agentNoActivity: SubAgentInfo = { ...mockAgent, activity: undefined }
    const { container } = render(
      <SubAgentFullscreen agent={agentNoActivity} onClose={() => {}} />
    )
    const md = container.querySelector('.sa-card-md')
    expect(md).toBeNull()
  })
})

describe('SF4 — 도구 섹션 렌더', () => {
  it('sa-tool 엘리먼트가 tools 수만큼 렌더됨', () => {
    const { container } = render(
      <SubAgentFullscreen agent={mockAgent} onClose={() => {}} />
    )
    const tools = container.querySelectorAll('.sa-tool')
    expect(tools.length).toBe(2)
  })

  it('도구 없으면 "사용한 도구가 없어요" 표시', () => {
    const agentNoTools: SubAgentInfo = { ...mockAgent, tools: [] }
    render(<SubAgentFullscreen agent={agentNoTools} onClose={() => {}} />)
    expect(screen.getByText('사용한 도구가 없어요')).toBeTruthy()
  })
})

describe('SF5 — transcript 타임라인 렌더', () => {
  it('saf-tr-text 클래스 항목이 text transcript 렌더', () => {
    const { container } = render(
      <SubAgentFullscreen agent={mockAgent} onClose={() => {}} />
    )
    const textItems = container.querySelectorAll('.saf-tr-text')
    expect(textItems.length).toBe(1)
    expect(textItems[0].textContent).toContain('탐색 시작합니다.')
  })

  it('saf-tr-thinking 클래스 항목이 thinking transcript 렌더', () => {
    const { container } = render(
      <SubAgentFullscreen agent={mockAgent} onClose={() => {}} />
    )
    const thinkingItems = container.querySelectorAll('.saf-tr-thinking')
    expect(thinkingItems.length).toBe(1)
    expect(thinkingItems[0].textContent).toContain('파일 구조 분석 중')
  })

  it('saf-tr-tool 클래스 항목이 tool transcript 렌더', () => {
    const { container } = render(
      <SubAgentFullscreen agent={mockAgent} onClose={() => {}} />
    )
    const toolItems = container.querySelectorAll('.saf-tr-tool')
    expect(toolItems.length).toBe(1)
  })

  it('transcript 3개 → saf-transcript 컨테이너 내부 항목 3개', () => {
    const { container } = render(
      <SubAgentFullscreen agent={mockAgent} onClose={() => {}} />
    )
    const transcriptContainer = container.querySelector('.saf-transcript')
    expect(transcriptContainer).toBeTruthy()
    expect(transcriptContainer!.children.length).toBe(3)
  })
})

describe('SF6 — transcript 빈 배열 → 기록 없음 표시', () => {
  it('transcript=[] → "아직 기록이 없어요" 표시', () => {
    const agentNoTranscript: SubAgentInfo = { ...mockAgent, transcript: [] }
    const { container } = render(
      <SubAgentFullscreen agent={agentNoTranscript} onClose={() => {}} />
    )
    const emptyMsgs = container.querySelectorAll('.ag-empty')
    const texts = Array.from(emptyMsgs).map(el => el.textContent)
    expect(texts.some(t => t === '아직 기록이 없어요')).toBe(true)
  })

  it('transcript 미지정(undefined) → 빈 배열로 처리 → "아직 기록이 없어요"', () => {
    const agentUndefinedTranscript: SubAgentInfo = { ...mockAgent, transcript: undefined }
    const { container } = render(
      <SubAgentFullscreen agent={agentUndefinedTranscript} onClose={() => {}} />
    )
    const emptyMsgs = container.querySelectorAll('.ag-empty')
    const texts = Array.from(emptyMsgs).map(el => el.textContent)
    expect(texts.some(t => t === '아직 기록이 없어요')).toBe(true)
  })
})
