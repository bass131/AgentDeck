// @vitest-environment jsdom
/**
 * subagent-cell.test.tsx — GAP1 P14 sub-B: SubAgent 스플릿 그리드 셀 컴포넌트화.
 *
 * 대상:
 *   - SubAgentChatStream(신규 추출 조각) — SubAgentFullscreen 본문(패널 3단 셸 +
 *     task/tool/thinking/text 채팅 렌더)을 풀스크린/셀이 공동 소비하는 단일 소유 지점.
 *     DOM 문법은 기존 풀스크린과 동일해야 한다(.saf-msg--* · .toollog · .ma-p-messages.saf-convo
 *     — subagent-fullscreen.test.tsx가 풀스크린 쪽 회귀를 잠그고, 여기선 조각 단독 계약).
 *   - SubAgentCell(신규) — 스플릿 그리드 셀. 표시 전용(P14 함정: 셀별 입력/abort/세션
 *     조작 발명 금지): 헤더(dot+displayName+상태 pill+활성/비활성 토글) + 도구요약 +
 *     채팅 스트림. disabled=true는 "표시 정지"(freeze — 이후 store 갱신을 화면에 반영하지
 *     않음) + dim 처리이며, 데이터 구독 차단이 아니다.
 *
 * SC1: SubAgentChatStream — 3단 셸 + task/text/thinking/toollog 렌더(풀스크린 문법 동형)
 * SC2: SubAgentCell 헤더 — .ma-panel 카드 셸 + dot/title/pill + 토글 버튼(aria-label)
 * SC3: displayName 우선(?? name 폴백)
 * SC4: 토글 버튼 클릭 → onToggle 1회 호출
 * SC5: disabled=true — 루트 상태 클래스 + aria-pressed=false + 본문 freeze(갱신 미반영,
 *      재활성화 시 최신 내용으로 복귀)
 * SC6: 도구요약(.ma-p-scope) — 있는 데이터만(tools=[] → 미렌더)
 * SC7: running — 진행중 표시(.saf-running) + dot working(패널 LiveStatus 매핑 동형)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { SubAgentInfo } from '../../../02.Source/renderer/src/lib/agentSampleData'
import { SubAgentChatStream } from '../../../02.Source/renderer/src/components/05_agent/SubAgentChatStream'
import { SubAgentCell } from '../../../02.Source/renderer/src/components/05_agent/SubAgentCell'

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

describe('SC1 — SubAgentChatStream: 풀스크린 본문과 동형의 채팅 스트림 조각', () => {
  it('패널 3단 셸(.ma-p-body/.ma-p-thread/.ma-p-messages.saf-convo) 렌더', () => {
    const { container } = render(<SubAgentChatStream agent={mockAgent} />)
    expect(container.querySelector('.ma-p-body')).toBeTruthy()
    expect(container.querySelector('.ma-p-thread')).toBeTruthy()
    expect(container.querySelector('.ma-p-messages.saf-convo')).toBeTruthy()
  })

  it('task → .saf-msg--task / text → .saf-msg--agent / thinking → .saf-msg--thinking / tool → .toollog .t-row', () => {
    const { container } = render(<SubAgentChatStream agent={mockAgent} />)
    expect(container.querySelector('.saf-msg--task')?.textContent).toContain('코드 구조 분석')
    const agents = container.querySelectorAll('.saf-msg--agent')
    expect(Array.from(agents).some((e) => e.textContent?.includes('탐색 시작합니다.'))).toBe(true)
    expect(container.querySelector('.saf-msg--thinking')?.textContent).toContain('파일 구조 분석 중')
    expect(container.querySelector('.toollog .t-row')).toBeTruthy()
    expect(container.querySelector('.t-target')?.textContent).toContain('src/main.ts')
  })

  it('빈 transcript + activity 없음 → "아직 대화가 없어요"', () => {
    const agent: SubAgentInfo = { ...mockAgent, transcript: [], activity: undefined }
    render(<SubAgentChatStream agent={agent} />)
    expect(screen.getByText('아직 대화가 없어요')).toBeTruthy()
  })
})

describe('SC2 — SubAgentCell 헤더: 카드 셸 + dot/title/pill + 토글 버튼', () => {
  it('.ma-panel 카드 셸 + .ma-p-row1 안에 dot(done)/이름/상태 pill', () => {
    const { container } = render(
      <SubAgentCell agent={mockAgent} disabled={false} onToggle={() => {}} />
    )
    expect(container.querySelector('.ma-panel')).toBeTruthy()
    expect(container.querySelector('.ma-p-row1 .ma-p-dot.done')).toBeTruthy()
    expect(container.querySelector('.ma-p-row1 .ma-p-title')?.textContent).toBe('탐색 에이전트')
    expect(container.querySelector('.ma-status.done')?.textContent).toContain('완료')
  })

  it('활성 상태 → 토글 버튼 aria-label="창 비활성화" + aria-pressed=true', () => {
    render(<SubAgentCell agent={mockAgent} disabled={false} onToggle={() => {}} />)
    const btn = screen.getByRole('button', { name: '창 비활성화' })
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })

  it('비활성 상태 → 토글 버튼 aria-label="창 활성화" + aria-pressed=false', () => {
    render(<SubAgentCell agent={mockAgent} disabled={true} onToggle={() => {}} />)
    const btn = screen.getByRole('button', { name: '창 활성화' })
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })
})

describe('SC3 — displayName 우선(?? name 폴백)', () => {
  it('displayName 있으면 헤더 제목에 displayName', () => {
    const agent: SubAgentInfo = { ...mockAgent, name: 'general-purpose', displayName: '소네트 셀 1' }
    const { container } = render(<SubAgentCell agent={agent} disabled={false} onToggle={() => {}} />)
    expect(container.querySelector('.ma-p-title')?.textContent).toBe('소네트 셀 1')
  })

  it('displayName 없으면 name 폴백', () => {
    const { container } = render(
      <SubAgentCell agent={{ ...mockAgent, displayName: undefined }} disabled={false} onToggle={() => {}} />
    )
    expect(container.querySelector('.ma-p-title')?.textContent).toBe('탐색 에이전트')
  })
})

describe('SC4 — 토글 버튼 클릭 → onToggle', () => {
  it('클릭 1회 → 핸들러 1회 호출(셀은 정책을 소유하지 않는다 — 표시만)', () => {
    const onToggle = vi.fn()
    render(<SubAgentCell agent={mockAgent} disabled={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: '창 비활성화' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})

describe('SC5 — disabled: 표시 정지(freeze) + dim 상태 클래스', () => {
  it('disabled=true → 루트에 .sac-off(dim은 CSS 소유 — 클래스만 계약)', () => {
    const { container } = render(
      <SubAgentCell agent={mockAgent} disabled={true} onToggle={() => {}} />
    )
    expect(container.querySelector('.ma-panel.sac-off')).toBeTruthy()
  })

  it('freeze 중 store 갱신은 본문에 미반영, 재활성화 시 최신으로 복귀', () => {
    // status='done'으로 고정 — running이면 마지막 text 버블이 SmoothMarkdown(스트리밍
    // 커서, rAF 점진 표출)이라 jsdom 동기 단언이 불안정. freeze 계약은 status와 무관.
    const v1: SubAgentInfo = {
      ...mockAgent,
      status: 'done',
      activity: undefined,
      tools: [],
      transcript: [{ kind: 'text', text: '하나' }],
    }
    const v2: SubAgentInfo = {
      ...v1,
      transcript: [{ kind: 'text', text: '하나' }, { kind: 'text', text: ' 둘' }],
    }
    const { container, rerender } = render(
      <SubAgentCell agent={v1} disabled={false} onToggle={() => {}} />
    )
    expect(container.querySelector('.ma-p-messages')?.textContent).toContain('하나')

    // 비활성화(freeze 진입) — 이 시점 내용은 유지.
    rerender(<SubAgentCell agent={v1} disabled={true} onToggle={() => {}} />)
    // freeze 중 도착한 갱신(v2)은 화면에 반영되지 않는다(표시 정책 — 데이터는 store에 누적).
    rerender(<SubAgentCell agent={v2} disabled={true} onToggle={() => {}} />)
    expect(container.querySelector('.ma-p-messages')?.textContent).not.toContain('둘')

    // 재활성화 → 최신 내용으로 복귀.
    rerender(<SubAgentCell agent={v2} disabled={false} onToggle={() => {}} />)
    expect(container.querySelector('.ma-p-messages')?.textContent).toContain('둘')
  })

  it('freeze 중에도 헤더(상태 pill)는 라이브 — 본문만 정지', () => {
    const v1: SubAgentInfo = { ...mockAgent, status: 'running' }
    const v2: SubAgentInfo = { ...mockAgent, status: 'done' }
    const { container, rerender } = render(
      <SubAgentCell agent={v1} disabled={true} onToggle={() => {}} />
    )
    expect(container.querySelector('.ma-status.working')).toBeTruthy()
    rerender(<SubAgentCell agent={v2} disabled={true} onToggle={() => {}} />)
    expect(container.querySelector('.ma-status.done')).toBeTruthy()
  })
})

describe('SC6 — 도구요약(.ma-p-scope): 있는 데이터만', () => {
  it('tools 있으면 "도구 완료/전체" 표시', () => {
    const { container } = render(
      <SubAgentCell agent={mockAgent} disabled={false} onToggle={() => {}} />
    )
    expect(container.querySelector('.ma-p-scope')?.textContent).toContain('도구 1/1')
  })

  it('tools=[] → .ma-p-scope 미렌더(자리 예약 발명 금지)', () => {
    const agent: SubAgentInfo = { ...mockAgent, tools: [], transcript: [] }
    const { container } = render(<SubAgentCell agent={agent} disabled={false} onToggle={() => {}} />)
    expect(container.querySelector('.ma-p-scope')).toBeNull()
  })
})

describe('SC7 — running: 진행중 표시 + dot working(패널 매핑 동형)', () => {
  it('.saf-running + .ma-p-dot.working', () => {
    const agent: SubAgentInfo = { ...mockAgent, status: 'running' }
    const { container } = render(<SubAgentCell agent={agent} disabled={false} onToggle={() => {}} />)
    expect(container.querySelector('.saf-running')).toBeTruthy()
    expect(container.querySelector('.ma-p-dot.working')).toBeTruthy()
  })
})
