// @vitest-environment jsdom
/**
 * phase13-multiworkspace-refactor.test.tsx
 * Phase 13: MultiWorkspace.tsx 분해 회귀 테스트.
 *
 * 대상: PanelPicker / PanelComposer / PanelView / useMultiPersist.
 * (패널 루프 훅 검증은 LR3-03에서 제거됨 — 그 훅 자체가 폐기됨, PanelView가 send/abort 직접 위임.)
 * 목적: 순수 리팩토링 — 추출 후 각 모듈이 정상 임포트되고 공개 API가 유지됨을 검증.
 * 시각 불변(1픽셀)은 영호가 앱 실행으로 직접 확인(ui-visual 트랙).
 *
 * CRITICAL: renderer untrusted — window.api mock 필요. 이 파일은 jsdom 환경.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'

// ── window.api mock (renderer IPC 의존 컴포넌트 공통) ────────────────────────
beforeEach(() => {
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: {
      multiSessionLoad: vi.fn().mockResolvedValue({ state: null }),
      multiSessionSave: vi.fn().mockResolvedValue({ ok: true }),
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

// ── PanelPicker: UsagePill + RunPickers 익스포트 검증 ─────────────────────────

describe('PanelPicker 모듈', () => {
  it('UsagePill을 임포트할 수 있다', async () => {
    const mod = await import('../../../02.Source/renderer/src/components/00_shell/panel/PanelPicker')
    expect(typeof mod.UsagePill).toBe('function')
  })

  it('RunPickers를 임포트할 수 있다', async () => {
    const mod = await import('../../../02.Source/renderer/src/components/00_shell/panel/PanelPicker')
    expect(typeof mod.RunPickers).toBe('function')
  })

  it('UsagePill — pct=null이면 "—" 렌더', async () => {
    const { render } = await import('@testing-library/react')
    const { UsagePill } = await import('../../../02.Source/renderer/src/components/00_shell/panel/PanelPicker')
    const { getByText } = render(React.createElement(UsagePill, { label: '5시간 한도', pct: null }))
    expect(getByText('—')).toBeTruthy()
  })

  it('UsagePill — pct=50이면 "50%" 렌더', async () => {
    const { render } = await import('@testing-library/react')
    const { UsagePill } = await import('../../../02.Source/renderer/src/components/00_shell/panel/PanelPicker')
    const { getByText } = render(React.createElement(UsagePill, { label: '주간 한도', pct: 50 }))
    expect(getByText('50%')).toBeTruthy()
  })
})

// ── PanelComposer: 모듈 정의 검증 ────────────────────────────────────────────

describe('PanelComposer 모듈', () => {
  it('PanelComposer를 임포트할 수 있다', async () => {
    const mod = await import('../../../02.Source/renderer/src/components/00_shell/panel/PanelComposer')
    expect(typeof mod.PanelComposer).toBe('function')
  })
})

// ── useMultiPersist: 훅 + SLOTS 정의 검증 ─────────────────────────────────────

describe('useMultiPersist 훅', () => {
  it('useMultiPersist를 임포트할 수 있다', async () => {
    const mod = await import('../../../02.Source/renderer/src/hooks/useMultiPersist')
    expect(typeof mod.useMultiPersist).toBe('function')
  })

  it('SLOTS=[0,1,2,3,4,5]를 익스포트한다', async () => {
    const { SLOTS } = await import('../../../02.Source/renderer/src/hooks/useMultiPersist')
    expect(SLOTS).toEqual([0, 1, 2, 3, 4, 5])
  })
})

// ── PanelView: 기존 임포트 경로(MultiWorkspace 재익스포트) 검증 ──────────────

describe('PanelView 재익스포트', () => {
  it('MultiWorkspace에서 PanelView를 여전히 임포트할 수 있다', async () => {
    const mod = await import('../../../02.Source/renderer/src/components/00_shell/MultiWorkspace')
    // memo()는 React.MemoExoticComponent를 반환 — typeof 'object'이지만 React 컴포넌트로 유효하다.
    expect(mod.PanelView).toBeDefined()
    expect(mod.PanelView).not.toBeNull()
  })
})
