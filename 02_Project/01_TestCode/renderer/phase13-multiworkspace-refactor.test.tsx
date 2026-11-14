// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'

beforeEach(() => {
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: {
      multiSessionLoad: vi.fn().mockResolvedValue({ state: null }),
      pickFolder: vi.fn().mockResolvedValue({ path: null }),
      onAgentEvent: vi.fn().mockReturnValue(() => {}),
      agentRun: vi.fn().mockResolvedValue({ runId: 'test-run' }),
      agentAbort: vi.fn().mockResolvedValue({}),
      agentInterrupt: vi.fn().mockResolvedValue({}),
      getUsage: vi.fn().mockResolvedValue({ fiveHour: null, weekly: null }),
      getProfile: vi.fn().mockResolvedValue({}),
      listSlashCommands: vi.fn().mockResolvedValue([]),
      listSkills: vi.fn().mockResolvedValue([]),
      readDir: vi.fn().mockResolvedValue([]),
    },
  })
})

describe('PanelPicker 모듈', () => {
  it('RunPickers를 임포트할 수 있다', async () => {
    const mod = await import('@renderer/05_Conversation/PanelPicker')
    expect(typeof mod.RunPickers).toBe('function')
  })
})

// G9b: UsagePill은 멀티 헤더 전용이라 12_Window로 옮겼다 — 선택기 사본(PanelPicker)과 수명이 갈린다.
describe('UsagePill 모듈(12_Window)', () => {
  it('UsagePill을 12_Window에서 임포트할 수 있다', async () => {
    const mod = await import('@renderer/12_Window/UsagePill')
    expect(typeof mod.UsagePill).toBe('function')
  })

  it('MultiWorkspace는 UsagePill을 선택기 사본(PanelPicker)이 아니라 12_Window에서 가져온다', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../00_Source/renderer/src/12_Window/MultiWorkspace.tsx'),
      'utf-8'
    )
    expect(src).not.toMatch(/from '@renderer\/05_Conversation\/PanelPicker'/)
    expect(src).toMatch(/import \{ UsagePill \} from '\.\/UsagePill'/)
  })

  it('UsagePill — pct=null이면 "—" 렌더', async () => {
    const { render } = await import('@testing-library/react')
    const { UsagePill } = await import('@renderer/12_Window/UsagePill')
    const { getByText } = render(React.createElement(UsagePill, { label: '5시간 한도', pct: null }))
    expect(getByText('—')).toBeTruthy()
  })

  it('UsagePill — pct=50이면 "50%" 렌더', async () => {
    const { render } = await import('@testing-library/react')
    const { UsagePill } = await import('@renderer/12_Window/UsagePill')
    const { getByText } = render(React.createElement(UsagePill, { label: '주간 한도', pct: 50 }))
    expect(getByText('50%')).toBeTruthy()
  })
})

describe('PanelComposer 모듈', () => {
  it('PanelComposer를 임포트할 수 있다', async () => {
    const mod = await import('@renderer/05_Conversation/PanelComposer')
    expect(typeof mod.PanelComposer).toBe('function')
  })
})

describe('useMultiPersist 훅', () => {
  it('useMultiPersist를 임포트할 수 있다', async () => {
    const mod = await import('@renderer/06_Sessions/hooks/useMultiPersist')
    expect(typeof mod.useMultiPersist).toBe('function')
  })

  it('SLOTS=[0,1,2,3,4,5]를 익스포트한다', async () => {
    const { SLOTS } = await import('@renderer/06_Sessions/hooks/useMultiPersist')
    expect(SLOTS).toEqual([0, 1, 2, 3, 4, 5])
  })
})

describe('PanelView 재익스포트', () => {
  it('MultiWorkspace에서 PanelView를 여전히 임포트할 수 있다', async () => {
    const mod = await import('@renderer/12_Window/MultiWorkspace')
    expect(mod.PanelView).toBeDefined()
    expect(mod.PanelView).not.toBeNull()
  })
})
