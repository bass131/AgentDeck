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
  it('UsagePill을 임포트할 수 있다', async () => {
    const mod = await import('../../../02_Source/renderer/src/features/shell/panel/PanelPicker')
    expect(typeof mod.UsagePill).toBe('function')
  })

  it('RunPickers를 임포트할 수 있다', async () => {
    const mod = await import('../../../02_Source/renderer/src/features/shell/panel/PanelPicker')
    expect(typeof mod.RunPickers).toBe('function')
  })

  it('UsagePill — pct=null이면 "—" 렌더', async () => {
    const { render } = await import('@testing-library/react')
    const { UsagePill } = await import('../../../02_Source/renderer/src/features/shell/panel/PanelPicker')
    const { getByText } = render(React.createElement(UsagePill, { label: '5시간 한도', pct: null }))
    expect(getByText('—')).toBeTruthy()
  })

  it('UsagePill — pct=50이면 "50%" 렌더', async () => {
    const { render } = await import('@testing-library/react')
    const { UsagePill } = await import('../../../02_Source/renderer/src/features/shell/panel/PanelPicker')
    const { getByText } = render(React.createElement(UsagePill, { label: '주간 한도', pct: 50 }))
    expect(getByText('50%')).toBeTruthy()
  })
})

describe('PanelComposer 모듈', () => {
  it('PanelComposer를 임포트할 수 있다', async () => {
    const mod = await import('../../../02_Source/renderer/src/features/shell/panel/PanelComposer')
    expect(typeof mod.PanelComposer).toBe('function')
  })
})

describe('useMultiPersist 훅', () => {
  it('useMultiPersist를 임포트할 수 있다', async () => {
    const mod = await import('../../../02_Source/renderer/src/hooks/useMultiPersist')
    expect(typeof mod.useMultiPersist).toBe('function')
  })

  it('SLOTS=[0,1,2,3,4,5]를 익스포트한다', async () => {
    const { SLOTS } = await import('../../../02_Source/renderer/src/hooks/useMultiPersist')
    expect(SLOTS).toEqual([0, 1, 2, 3, 4, 5])
  })
})

describe('PanelView 재익스포트', () => {
  it('MultiWorkspace에서 PanelView를 여전히 임포트할 수 있다', async () => {
    const mod = await import('../../../02_Source/renderer/src/features/shell/MultiWorkspace')
    expect(mod.PanelView).toBeDefined()
    expect(mod.PanelView).not.toBeNull()
  })
})
