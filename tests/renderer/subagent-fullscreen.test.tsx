// @vitest-environment jsdom
/**
 * subagent-fullscreen.test.tsx — F-E 보강: SubAgentFullscreen 채팅 대화 뷰.
 *
 * 사용자 요구: SubAgent 클릭 → 상세를 Claude Code CLI처럼 채팅 대화 형태로 표현.
 * 평면 타임라인(saf-tr-*) → 대화 흐름(작업 지시 + 서브에이전트 메시지/사고/도구 + 최종 답변).
 *
 * CF1: agent=null → 미렌더
 * CF2: agent 있으면 FullscreenOverlay(fs-overlay) + 제목에 이름
 * CF3: role → 작업 메시지(.saf-msg--task)
 * CF4: transcript text → 에이전트 메시지(.saf-msg--agent), thinking → .saf-msg--thinking, tool → .saf-tool-row
 * CF5: activity(최종 답변, transcript 마지막 text와 다르면) → .saf-msg--agent 로 렌더(raw 아님)
 * CF6: transcript=[] + activity 있음(라이브 케이스) → 최종 답변만 대화로 표시
 * CF7: transcript=[] + activity 없음 → "아직 대화가 없어요"
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { SubAgentInfo } from '../../src/renderer/src/lib/agentSampleData'

vi.mock('../../src/renderer/src/components/common/icons', () => ({
  IconCheck: () => null, IconClose: () => null, IconSearch: () => null, IconFile: () => null, IconBot: () => null,
}))
vi.mock('../../src/renderer/src/components/common/FullscreenOverlay', () => {
  const Shell = ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div className="fs-overlay" data-testid="fs-overlay" data-title={title}>
      <div className="fs-panel"><div className="fs-head">{title}</div><div className="fs-body">{children}</div></div>
    </div>
  )
  return { FullscreenOverlay: Shell, default: Shell }
})
vi.mock('../../src/renderer/src/components/05_agent/SubAgentFullscreen.css', () => ({}))

import React from 'react'
import { SubAgentFullscreen } from '../../src/renderer/src/components/05_agent/SubAgentFullscreen'

afterEach(() => { cleanup() })

const mockAgent: SubAgentInfo = {
  id: 'toolu_sa1',
  name: '탐색 에이전트',
  role: 'explorer: 코드 구조 분석',
  status: 'done',
  activity: '분석을 마쳤습니다. 3개 모듈을 확인했습니다.',
  tools: [{ id: 'tool-1', verb: 'read', target: 'src/main.ts', status: 'done' }],
  transcript: [
    { kind: 'text', text: '탐색 시작합니다.' },
    { kind: 'thinking', text: '파일 구조 분석 중' },
    { kind: 'tool', verb: 'read', target: 'src/main.ts', status: 'done', id: 'tool-1' },
  ],
}

describe('CF1 — agent=null → 미렌더', () => {
  it('null이면 아무것도 안 그림', () => {
    const { container } = render(<SubAgentFullscreen agent={null} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('CF2 — FullscreenOverlay + 제목', () => {
  it('fs-overlay + 제목에 이름', () => {
    render(<SubAgentFullscreen agent={mockAgent} onClose={() => {}} />)
    expect(screen.getByTestId('fs-overlay')).toBeTruthy()
    expect(screen.getByTestId('fs-overlay').getAttribute('data-title')).toContain('탐색 에이전트')
  })
})

describe('CF3 — 작업 지시 메시지', () => {
  it('role → .saf-msg--task 에 표시', () => {
    const { container } = render(<SubAgentFullscreen agent={mockAgent} onClose={() => {}} />)
    const task = container.querySelector('.saf-msg--task')
    expect(task).toBeTruthy()
    expect(task!.textContent).toContain('코드 구조 분석')
  })
})

describe('CF4 — 대화 흐름(text/thinking/tool)', () => {
  it('transcript text → .saf-msg--agent', () => {
    const { container } = render(<SubAgentFullscreen agent={mockAgent} onClose={() => {}} />)
    const agents = container.querySelectorAll('.saf-msg--agent')
    // 최소 1개(transcript text). activity가 다르면 최종 답변까지 더해짐.
    expect(agents.length).toBeGreaterThanOrEqual(1)
    expect(Array.from(agents).some((e) => e.textContent?.includes('탐색 시작합니다.'))).toBe(true)
  })
  it('thinking → .saf-msg--thinking', () => {
    const { container } = render(<SubAgentFullscreen agent={mockAgent} onClose={() => {}} />)
    const th = container.querySelector('.saf-msg--thinking')
    expect(th).toBeTruthy()
    expect(th!.textContent).toContain('파일 구조 분석 중')
  })
  it('tool → .saf-tool-row', () => {
    const { container } = render(<SubAgentFullscreen agent={mockAgent} onClose={() => {}} />)
    expect(container.querySelector('.saf-tool-row')).toBeTruthy()
  })
})

describe('CF5 — 최종 답변(activity)을 대화 메시지로', () => {
  it('activity(마지막 text와 다름) → 대화에 표시(raw 아님)', () => {
    const { container } = render(<SubAgentFullscreen agent={mockAgent} onClose={() => {}} />)
    expect(container.textContent).toContain('분석을 마쳤습니다. 3개 모듈을 확인했습니다.')
  })
})

describe('CF6 — 빈 transcript + activity(라이브 케이스) → 답변만 대화로', () => {
  it('transcript=[] + activity → .saf-msg--agent 로 답변', () => {
    const agent: SubAgentInfo = { ...mockAgent, transcript: [], activity: 'ALPHA-BRAVO 결과입니다.' }
    const { container } = render(<SubAgentFullscreen agent={agent} onClose={() => {}} />)
    const agents = container.querySelectorAll('.saf-msg--agent')
    expect(agents.length).toBe(1)
    expect(agents[0].textContent).toContain('ALPHA-BRAVO 결과입니다.')
  })
})

describe('CF7 — 빈 transcript + activity 없음 → 빈 안내', () => {
  it('"아직 대화가 없어요"', () => {
    const agent: SubAgentInfo = { ...mockAgent, transcript: [], activity: undefined }
    render(<SubAgentFullscreen agent={agent} onClose={() => {}} />)
    expect(screen.getByText('아직 대화가 없어요')).toBeTruthy()
  })
})
