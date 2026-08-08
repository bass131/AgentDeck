// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { SubAgentInfo } from '../../../02_Source/renderer/src/lib/agentSampleData'

vi.mock('../../../02_Source/renderer/src/components/common/FullscreenOverlay', () => {
  const Shell = ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div className="fs-overlay" data-testid="fs-overlay" data-title={title}>
      <div className="fs-panel"><div className="fs-head">{title}</div><div className="fs-body">{children}</div></div>
    </div>
  )
  return { FullscreenOverlay: Shell, default: Shell }
})
vi.mock('../../../02_Source/renderer/src/features/agent/SubAgentFullscreen.css', () => ({}))

import React from 'react'
import { SubAgentFullscreen } from '../../../02_Source/renderer/src/features/agent/SubAgentFullscreen'

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
    expect(agents.length).toBeGreaterThanOrEqual(1)
    expect(Array.from(agents).some((e) => e.textContent?.includes('탐색 시작합니다.'))).toBe(true)
  })
  it('thinking → .saf-msg--thinking', () => {
    const { container } = render(<SubAgentFullscreen agent={mockAgent} onClose={() => {}} />)
    const th = container.querySelector('.saf-msg--thinking')
    expect(th).toBeTruthy()
    expect(th!.textContent).toContain('파일 구조 분석 중')
  })
  it('tool → ToolCallCard 재사용(.t-row) — FB1 P06', () => {
    const { container } = render(<SubAgentFullscreen agent={mockAgent} onClose={() => {}} />)
    expect(container.querySelector('.t-row')).toBeTruthy()
    expect(container.querySelector('.t-target')?.textContent).toContain('src/main.ts')
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

describe('CF8 — 모델 표기(FB2 P07 3단계 + 영호 배지 격상 2026-07-04)', () => {
  it('agent.model 있음 → 헤더에 모델 배지 렌더(role과 분리)', () => {
    const agent: SubAgentInfo = { ...mockAgent, model: 'claude-opus-4-8' }
    const { container } = render(<SubAgentFullscreen agent={agent} onClose={() => {}} />)
    const role = container.querySelector('.saf-role')
    expect(role).toBeTruthy()
    expect(role!.textContent).toBe('explorer: 코드 구조 분석')
    const badge = container.querySelector('.sa-model-badge')
    expect(badge).toBeTruthy()
    expect(badge!.textContent).toContain('Opus 4.8')
  })

  it('agent.model 없음(undefined) → 배지 미렌더, role만 표시', () => {
    const agent: SubAgentInfo = { ...mockAgent, model: undefined }
    const { container } = render(<SubAgentFullscreen agent={agent} onClose={() => {}} />)
    expect(container.querySelector('.saf-role')!.textContent).toBe('explorer: 코드 구조 분석')
    expect(container.querySelector('.sa-model-badge')).toBeNull()
  })

  it('미지 모델 ID → 배지에 원문 그대로(하드코딩 목록 밖 모델도 안 깨짐)', () => {
    const agent: SubAgentInfo = { ...mockAgent, model: 'future-model-x1' }
    const { container } = render(<SubAgentFullscreen agent={agent} onClose={() => {}} />)
    expect(container.querySelector('.sa-model-badge')!.textContent).toContain('future-model-x1')
  })

  it('실행 중(running) → 배지가 살아있는 느낌(.running, 기존 ag-pulse 재사용)', () => {
    const agent: SubAgentInfo = { ...mockAgent, model: 'claude-opus-4-8', status: 'running' }
    const { container } = render(<SubAgentFullscreen agent={agent} onClose={() => {}} />)
    expect(container.querySelector('.sa-model-badge.running')).toBeTruthy()
  })

  it('완료(done) → 배지는 정적으로 안착(.running 클래스 없음)', () => {
    const agent: SubAgentInfo = { ...mockAgent, model: 'claude-opus-4-8', status: 'done' }
    const { container } = render(<SubAgentFullscreen agent={agent} onClose={() => {}} />)
    expect(container.querySelector('.sa-model-badge')).toBeTruthy()
    expect(container.querySelector('.sa-model-badge.running')).toBeNull()
  })
})

describe('CF10 — 패널 카드 문법 이식(영호 지시 2026-07-04, 멀티워크스페이스 .ma-p-* 재사용)', () => {
  it('카드 셸(.ma-panel) 안에 패널 헤더(.ma-p-head/.ma-p-row1)와 이름(.ma-p-title.saf-name)', () => {
    const { container } = render(<SubAgentFullscreen agent={mockAgent} onClose={() => {}} />)
    expect(container.querySelector('.ma-panel')).toBeTruthy()
    expect(container.querySelector('.ma-p-head')).toBeTruthy()
    const nameEl = container.querySelector('.ma-p-row1 .ma-p-title.saf-name')
    expect(nameEl).toBeTruthy()
    expect(nameEl!.textContent).toBe('탐색 에이전트')
  })

  it('상태 표시는 패널 문법(.ma-p-dot/.ma-status) 재사용 — done', () => {
    const { container } = render(<SubAgentFullscreen agent={mockAgent} onClose={() => {}} />)
    expect(container.querySelector('.ma-p-dot.done')).toBeTruthy()
    expect(container.querySelector('.ma-status.done')).toBeTruthy()
  })

  it('상태 표시(.ma-p-dot/.ma-status) — running → working cls(패널 LiveStatus 매핑과 동형)', () => {
    const agent: SubAgentInfo = { ...mockAgent, status: 'running' }
    const { container } = render(<SubAgentFullscreen agent={agent} onClose={() => {}} />)
    expect(container.querySelector('.ma-p-dot.working')).toBeTruthy()
    expect(container.querySelector('.ma-status.working')).toBeTruthy()
  })

  it('role + 모델 배지는 .ma-p-row2 안에 나란히(name과 분리된 종속 부제, NG-1)', () => {
    const agent: SubAgentInfo = { ...mockAgent, model: 'claude-opus-4-8' }
    const { container } = render(<SubAgentFullscreen agent={agent} onClose={() => {}} />)
    const row2 = container.querySelector('.ma-p-row2')
    expect(row2).toBeTruthy()
    expect(row2!.querySelector('.saf-role')).toBeTruthy()
    expect(row2!.querySelector('.sa-model-badge')).toBeTruthy()
  })

  it('role/모델 둘 다 없으면 .ma-p-row2 자체 미렌더(자리 예약 발명 금지)', () => {
    const agent: SubAgentInfo = { ...mockAgent, role: '', model: undefined }
    const { container } = render(<SubAgentFullscreen agent={agent} onClose={() => {}} />)
    expect(container.querySelector('.ma-p-row2')).toBeNull()
  })

  it('도구 이력 요약(.ma-p-scope) — 완료/전체 개수 표시(있는 데이터만)', () => {
    const { container } = render(<SubAgentFullscreen agent={mockAgent} onClose={() => {}} />)
    const scope = container.querySelector('.ma-p-scope')
    expect(scope).toBeTruthy()
    expect(scope!.textContent).toContain('도구 1/1')
  })

  it('도구 이력 없음(tools=[]) → .ma-p-scope 미렌더', () => {
    const agent: SubAgentInfo = { ...mockAgent, tools: [], transcript: [] }
    const { container } = render(<SubAgentFullscreen agent={agent} onClose={() => {}} />)
    expect(container.querySelector('.ma-p-scope')).toBeNull()
  })

  it('인접 tool 2개 → 하나의 .toollog 런으로 그룹핑(본 채팅 ToolGroup 문법 재사용)', () => {
    const agent: SubAgentInfo = {
      ...mockAgent,
      transcript: [
        { kind: 'tool', verb: 'read', target: 'a.ts', status: 'done', id: 'ta' },
        { kind: 'tool', verb: 'read', target: 'b.ts', status: 'done', id: 'tb' },
      ],
    }
    const { container } = render(<SubAgentFullscreen agent={agent} onClose={() => {}} />)
    const groups = container.querySelectorAll('.toollog')
    expect(groups.length).toBe(1)
    expect(groups[0].querySelectorAll('.t-row').length).toBe(2)
  })

  it('대화 스트림은 패널 3단 셸(.ma-p-body/.ma-p-thread/.ma-p-messages) 재사용, .saf-convo는 마커로 병기', () => {
    const { container } = render(<SubAgentFullscreen agent={mockAgent} onClose={() => {}} />)
    expect(container.querySelector('.ma-p-body')).toBeTruthy()
    expect(container.querySelector('.ma-p-thread')).toBeTruthy()
    expect(container.querySelector('.ma-p-messages.saf-convo')).toBeTruthy()
  })
})

describe('CF11 — CP1 P07 displayName 소비 배선(CP1 렌더러 후속)', () => {
  it('displayName 있으면 제목(fs-overlay title)·헤더(.ma-p-title.saf-name)에 displayName 우선 노출', () => {
    const agent: SubAgentInfo = { ...mockAgent, name: 'general-purpose', displayName: '소네트 테스트 에이전트 1' }
    const { container } = render(<SubAgentFullscreen agent={agent} onClose={() => {}} />)
    expect(screen.getByTestId('fs-overlay').getAttribute('data-title')).toBe('소네트 테스트 에이전트 1')
    expect(container.querySelector('.ma-p-title.saf-name')?.textContent).toBe('소네트 테스트 에이전트 1')
  })

  it('displayName 없으면 기존대로 name 폴백(비파괴)', () => {
    const agent: SubAgentInfo = { ...mockAgent, displayName: undefined }
    const { container } = render(<SubAgentFullscreen agent={agent} onClose={() => {}} />)
    expect(container.querySelector('.ma-p-title.saf-name')?.textContent).toBe('탐색 에이전트')
  })

  it('displayName 있으면 서브에이전트 응답 버블(.saf-msg--agent)의 화자명도 displayName', () => {
    const agent: SubAgentInfo = { ...mockAgent, displayName: '소네트 테스트 에이전트 1' }
    const { container } = render(<SubAgentFullscreen agent={agent} onClose={() => {}} />)
    const bubble = container.querySelector('.saf-msg--agent')
    expect(bubble).toBeTruthy()
    expect(bubble!.textContent).toContain('소네트 테스트 에이전트 1')
  })

  it('[NG-1] displayName 표시 중에도 role/모델 배지와 혼입되지 않는다', () => {
    const agent: SubAgentInfo = {
      ...mockAgent,
      name: 'general-purpose',
      displayName: '소네트 테스트 에이전트 1',
      role: 'Sonnet 테스트 에이전트 1',
      model: 'claude-opus-4-8',
    }
    const { container } = render(<SubAgentFullscreen agent={agent} onClose={() => {}} />)
    const nameEl = container.querySelector('.saf-name')
    const roleEl = container.querySelector('.saf-role')
    const badgeEl = container.querySelector('.sa-model-badge')
    expect(nameEl?.textContent).toBe('소네트 테스트 에이전트 1')
    expect(roleEl?.textContent).toBe('Sonnet 테스트 에이전트 1')
    expect(badgeEl?.textContent).toContain('Opus 4.8')
    expect(nameEl?.textContent).not.toContain('Opus')
  })

  it('조기 별칭(model="opus", 버전 없음) → 모델 배지 미렌더(모델 미확정 취급)', () => {
    const agent: SubAgentInfo = { ...mockAgent, model: 'opus' }
    const { container } = render(<SubAgentFullscreen agent={agent} onClose={() => {}} />)
    expect(container.querySelector('.sa-model-badge')).toBeNull()
  })
})

describe('CF9 — [NG-1] 이름/role/모델 혼입 금지 회귀 잠금 (2026-07-04 영호 재육안)', () => {
  it('.saf-name=subagent_type 고정, .saf-role/배지와 절대 혼입되지 않음', () => {
    const agent: SubAgentInfo = {
      ...mockAgent,
      name: 'general-purpose',
      role: 'Sonnet 테스트 에이전트 1',
      model: 'claude-opus-4-8',
    }
    const { container } = render(<SubAgentFullscreen agent={agent} onClose={() => {}} />)
    const nameEl = container.querySelector('.saf-name')
    const roleEl = container.querySelector('.saf-role')
    const badgeEl = container.querySelector('.sa-model-badge')
    expect(nameEl?.textContent).toBe('general-purpose')
    expect(roleEl?.textContent).toBe('Sonnet 테스트 에이전트 1')
    expect(badgeEl?.textContent).toContain('Opus 4.8')
    expect(nameEl?.textContent).not.toContain('Sonnet')
    expect(nameEl?.textContent).not.toContain('테스트')
    expect(nameEl?.textContent).not.toContain('Opus')
  })
})
