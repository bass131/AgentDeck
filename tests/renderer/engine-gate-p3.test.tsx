// @vitest-environment jsdom
/**
 * engine-gate-p3.test.tsx — P3 EngineGate 적응 TDD (실패 먼저)
 *
 * 검증 대상:
 *   1. profile 있음 + authed true  → Shell(.win) 표시.
 *   2. profile 있음 + authed false → EngineGate(.eg-auth-dialog) 표시.
 *   3. profile 있음 + available false → EngineGate 표시.
 *   4. EngineGate 재확인 버튼 → authed true 시 Shell 전환.
 *   5. EngineGate 계속 진행 버튼 → Shell 진입.
 *   6. 기존 boot-gate 회귀: profile null → 온보딩 (authed true 기본 mock).
 *   7. 기존 boot-gate 회귀: profile 있음 + authed true → Shell 바로 진입.
 *   8. EngineGate: version 표시(있으면).
 *   9. EngineGate: available false 전용 안내 메시지.
 *
 * 신뢰경계: renderer untrusted.
 *   - window.api.getEngineState (기존 노출 채널) mock만 사용.
 *   - EngineState = { available, authed, version } — 토큰/키 0.
 * 회귀 0: authed=true mock이면 기존 Shell 진입과 동일.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, screen, fireEvent, cleanup } from '@testing-library/react'

// ── 최소 window.api mock ──────────────────────────────────────────────────────
const mockGetProfile = vi.fn()
const mockSetProfile = vi.fn().mockResolvedValue({ ok: true })
const mockGetEngineState = vi.fn()

const baseApi = {
  getProfile: mockGetProfile,
  setProfile: mockSetProfile,
  getEngineState: mockGetEngineState,
  // Shell 마운트용 (기존 의존성)
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
  windowMinimize: vi.fn(),
  windowMaximizeToggle: vi.fn().mockResolvedValue({ maximized: false }),
  windowClose: vi.fn(),
  windowIsMaximized: vi.fn().mockResolvedValue({ maximized: false }),
  windowGetBounds: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1200, height: 800 }),
  windowSetBounds: vi.fn(),
  windowDragStart: vi.fn(),
  windowDragEnd: vi.fn(),
  windowResizeStart: vi.fn(),
  windowResizeEnd: vi.fn(),
  onWindowState: vi.fn().mockReturnValue(() => {}),
  fsRead: vi.fn().mockResolvedValue({ content: '' }),
  workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
  listFiles: vi.fn().mockResolvedValue({ files: [] }),
  pathForFile: vi.fn().mockReturnValue(''),
  saveImageData: vi.fn().mockResolvedValue({ path: '' }),
  referenceAdd: vi.fn().mockResolvedValue({ reference: null }),
  referenceList: vi.fn().mockResolvedValue({ references: [] }),
  referenceTree: vi.fn().mockResolvedValue({ tree: null }),
  git: { root: vi.fn().mockResolvedValue(null) },
  conversationRename: vi.fn().mockResolvedValue({ ok: true }),
  conversationDelete: vi.fn().mockResolvedValue({ ok: true }),
  getUiPrefs: vi.fn().mockResolvedValue({}),
  setUiPref: vi.fn().mockResolvedValue({ ok: true }),
  getUsage: vi.fn().mockResolvedValue({ fiveHour: null, weekly: null }),
  permissionRespond: vi.fn().mockResolvedValue({ ok: true }),
  questionRespond: vi.fn().mockResolvedValue({ ok: true }),
  // P4: 부트 자동 트리거 — 빈 버전 반환 → decideStartupModal null → 모달 자동 표시 없음
  getAppVersion: vi.fn().mockResolvedValue(''),
}

Object.defineProperty(window, 'api', { value: baseApi, writable: true, configurable: true })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// ══════════════════════════════════════════════════════════════════════════════
// 1. profile 있음 + authed true → Shell 직접 진입 (engine 체크 통과)
// ══════════════════════════════════════════════════════════════════════════════

describe('AppGate engine 체크 — authed true', () => {
  beforeEach(() => {
    mockGetProfile.mockResolvedValue({ nickname: '개발자', color: '#6366f1' })
    mockGetEngineState.mockResolvedValue({ available: true, authed: true, version: '1.2.3' })
  })

  it('profile 있음 + authed true → Shell(.win) 표시', async () => {
    vi.resetModules()
    const { AppGate } = await import('../../src/renderer/src/AppGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<AppGate />)
      container = result.container
    })

    expect(container.querySelector('.win')).toBeTruthy()
  })

  it('profile 있음 + authed true → EngineGate(.eg-auth-dialog) 미표시', async () => {
    vi.resetModules()
    const { AppGate } = await import('../../src/renderer/src/AppGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<AppGate />)
      container = result.container
    })

    expect(container.querySelector('.eg-auth-dialog')).toBeFalsy()
  })

  it('profile 있음 + authed true → getEngineState 1회 호출', async () => {
    vi.resetModules()
    const { AppGate } = await import('../../src/renderer/src/AppGate')

    await act(async () => {
      render(<AppGate />)
    })

    expect(mockGetEngineState).toHaveBeenCalledTimes(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. profile 있음 + authed false → EngineGate 표시
// ══════════════════════════════════════════════════════════════════════════════

describe('AppGate engine 체크 — authed false', () => {
  beforeEach(() => {
    mockGetProfile.mockResolvedValue({ nickname: '개발자', color: '#6366f1' })
    mockGetEngineState.mockResolvedValue({ available: true, authed: false, version: '1.2.3' })
  })

  it('profile 있음 + authed false → EngineGate 표시(.eg-auth-dialog)', async () => {
    vi.resetModules()
    const { AppGate } = await import('../../src/renderer/src/AppGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<AppGate />)
      container = result.container
    })

    expect(container.querySelector('.eg-auth-dialog')).toBeTruthy()
  })

  it('profile 있음 + authed false → Shell(.win) 미표시', async () => {
    vi.resetModules()
    const { AppGate } = await import('../../src/renderer/src/AppGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<AppGate />)
      container = result.container
    })

    expect(container.querySelector('.win')).toBeFalsy()
  })

  it('EngineGate에 인증 안내 메시지 표시', async () => {
    vi.resetModules()
    const { AppGate } = await import('../../src/renderer/src/AppGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<AppGate />)
      container = result.container
    })

    // 인증 안내 키워드 — ic-title에서 확인
    const title = container.querySelector('.ic-title')
    expect(title?.textContent).toContain('인증')
  })

  it('EngineGate에 버전 표시 (version 있음)', async () => {
    vi.resetModules()
    const { AppGate } = await import('../../src/renderer/src/AppGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<AppGate />)
      container = result.container
    })

    // version 표시 (ic-ver 클래스 또는 텍스트로)
    expect(container.textContent).toContain('1.2.3')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 3. available false → EngineGate 표시
// ══════════════════════════════════════════════════════════════════════════════

describe('AppGate engine 체크 — available false', () => {
  beforeEach(() => {
    mockGetProfile.mockResolvedValue({ nickname: '개발자', color: '#6366f1' })
    mockGetEngineState.mockResolvedValue({ available: false, authed: false, version: null })
  })

  it('available false → EngineGate 표시', async () => {
    vi.resetModules()
    const { AppGate } = await import('../../src/renderer/src/AppGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<AppGate />)
      container = result.container
    })

    expect(container.querySelector('.eg-auth-dialog')).toBeTruthy()
  })

  it('available false → Shell(.win) 미표시', async () => {
    vi.resetModules()
    const { AppGate } = await import('../../src/renderer/src/AppGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<AppGate />)
      container = result.container
    })

    expect(container.querySelector('.win')).toBeFalsy()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 4. EngineGate 재확인 버튼 → authed true 시 Shell 전환
// ══════════════════════════════════════════════════════════════════════════════

describe('EngineGate 재확인 버튼', () => {
  it('재확인 클릭 → authed true 응답 시 Shell(.win) 전환', async () => {
    mockGetProfile.mockResolvedValue({ nickname: '개발자', color: '#6366f1' })
    // 첫 호출: authed false, 두 번째(재확인): authed true
    mockGetEngineState
      .mockResolvedValueOnce({ available: true, authed: false, version: '1.2.3' })
      .mockResolvedValueOnce({ available: true, authed: true, version: '1.2.3' })

    vi.resetModules()
    const { AppGate } = await import('../../src/renderer/src/AppGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<AppGate />)
      container = result.container
    })

    // EngineGate 표시 확인
    expect(container.querySelector('.eg-auth-dialog')).toBeTruthy()

    // 재확인 버튼 클릭
    const retryBtn = screen.getByRole('button', { name: /재확인/ })
    await act(async () => {
      fireEvent.click(retryBtn)
    })

    // Shell 전환 확인
    expect(container.querySelector('.win')).toBeTruthy()
    expect(container.querySelector('.eg-auth-dialog')).toBeFalsy()
  })

  it('재확인 클릭 → authed still false → EngineGate 유지', async () => {
    mockGetProfile.mockResolvedValue({ nickname: '개발자', color: '#6366f1' })
    mockGetEngineState.mockResolvedValue({ available: true, authed: false, version: '1.2.3' })

    vi.resetModules()
    const { AppGate } = await import('../../src/renderer/src/AppGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<AppGate />)
      container = result.container
    })

    const retryBtn = screen.getByRole('button', { name: /재확인/ })
    await act(async () => {
      fireEvent.click(retryBtn)
    })

    // 여전히 EngineGate 표시
    expect(container.querySelector('.eg-auth-dialog')).toBeTruthy()
    expect(container.querySelector('.win')).toBeFalsy()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 5. EngineGate 계속 진행 버튼 → Shell 진입 (우회 허용)
// ══════════════════════════════════════════════════════════════════════════════

describe('EngineGate 계속 진행 버튼', () => {
  it('계속 진행 클릭 → Shell(.win) 진입', async () => {
    mockGetProfile.mockResolvedValue({ nickname: '개발자', color: '#6366f1' })
    mockGetEngineState.mockResolvedValue({ available: true, authed: false, version: '1.2.3' })

    vi.resetModules()
    const { AppGate } = await import('../../src/renderer/src/AppGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<AppGate />)
      container = result.container
    })

    expect(container.querySelector('.eg-auth-dialog')).toBeTruthy()

    const continueBtn = screen.getByRole('button', { name: /계속 진행/ })
    await act(async () => {
      fireEvent.click(continueBtn)
    })

    expect(container.querySelector('.win')).toBeTruthy()
    expect(container.querySelector('.eg-auth-dialog')).toBeFalsy()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 6 & 7. 기존 boot-gate 회귀 (authed true 기본 mock)
// ══════════════════════════════════════════════════════════════════════════════

describe('기존 boot-gate 회귀 — profile null (authed true mock)', () => {
  beforeEach(() => {
    mockGetProfile.mockResolvedValue(null)
    // profile null이면 engine 체크 도달 안 함 → mock 불필요하지만 안전하게 설정
    mockGetEngineState.mockResolvedValue({ available: true, authed: true, version: '1.2.3' })
  })

  it('profile null → 온보딩(.login-body) 표시 (engine 체크 없이)', async () => {
    vi.resetModules()
    const { AppGate } = await import('../../src/renderer/src/AppGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<AppGate />)
      container = result.container
    })

    expect(container.querySelector('.login-body')).toBeTruthy()
    expect(container.querySelector('.win')).toBeFalsy()
  })

  it('profile null → getEngineState 호출 안 됨', async () => {
    vi.resetModules()
    const { AppGate } = await import('../../src/renderer/src/AppGate')

    await act(async () => {
      render(<AppGate />)
    })

    // profile null이면 onboarding으로 가고 engine 체크 없음
    expect(mockGetEngineState).not.toHaveBeenCalled()
  })
})

describe('기존 boot-gate 회귀 — profile 있음 + authed true', () => {
  beforeEach(() => {
    mockGetProfile.mockResolvedValue({ nickname: '개발자', color: '#6366f1' })
    mockGetEngineState.mockResolvedValue({ available: true, authed: true, version: '1.2.3' })
  })

  it('profile 있음 + authed true → Shell(.win) 진입 (기존 P2와 동일)', async () => {
    vi.resetModules()
    const { AppGate } = await import('../../src/renderer/src/AppGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<AppGate />)
      container = result.container
    })

    expect(container.querySelector('.win')).toBeTruthy()
    expect(container.querySelector('.login-body')).toBeFalsy()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 8. EngineGate 독립 컴포넌트 단위 테스트
// ══════════════════════════════════════════════════════════════════════════════

describe('EngineGate 컴포넌트 단위 — authed 안내 모드', () => {
  it('open=true, available=true, authed=false → eg-auth-dialog 표시', async () => {
    vi.resetModules()
    const { EngineGate } = await import('../../src/renderer/src/components/EngineGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(
        <EngineGate
          open={true}
          available={true}
          authed={false}
          onRetry={vi.fn()}
          onSkip={vi.fn()}
        />
      )
      container = result.container
    })

    expect(container.querySelector('.eg-auth-dialog')).toBeTruthy()
  })

  it('open=false → null 반환', async () => {
    vi.resetModules()
    const { EngineGate } = await import('../../src/renderer/src/components/EngineGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(
        <EngineGate
          open={false}
          available={true}
          authed={false}
          onRetry={vi.fn()}
          onSkip={vi.fn()}
        />
      )
      container = result.container
    })

    expect(container.firstChild).toBeNull()
  })

  it('version 있음 → version 텍스트 표시', async () => {
    vi.resetModules()
    const { EngineGate } = await import('../../src/renderer/src/components/EngineGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(
        <EngineGate
          open={true}
          available={true}
          authed={false}
          version="2.1.0"
          onRetry={vi.fn()}
          onSkip={vi.fn()}
        />
      )
      container = result.container
    })

    expect(container.textContent).toContain('2.1.0')
  })

  it('available=false → SDK 미사용 안내 메시지 포함', async () => {
    vi.resetModules()
    const { EngineGate } = await import('../../src/renderer/src/components/EngineGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(
        <EngineGate
          open={true}
          available={false}
          authed={false}
          onRetry={vi.fn()}
          onSkip={vi.fn()}
        />
      )
      container = result.container
    })

    // ic-title에서 SDK 키워드 확인
    const title = container.querySelector('.ic-title')
    expect(title?.textContent).toContain('SDK')
  })

  it('onRetry 콜백 — 재확인 버튼 클릭 시 호출', async () => {
    vi.resetModules()
    const { EngineGate } = await import('../../src/renderer/src/components/EngineGate')
    const onRetry = vi.fn()

    await act(async () => {
      render(
        <EngineGate
          open={true}
          available={true}
          authed={false}
          onRetry={onRetry}
          onSkip={vi.fn()}
        />
      )
    })

    const retryBtn = screen.getByRole('button', { name: /재확인/ })
    fireEvent.click(retryBtn)

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('onSkip 콜백 — 계속 진행 버튼 클릭 시 호출', async () => {
    vi.resetModules()
    const { EngineGate } = await import('../../src/renderer/src/components/EngineGate')
    const onSkip = vi.fn()

    await act(async () => {
      render(
        <EngineGate
          open={true}
          available={true}
          authed={false}
          onRetry={vi.fn()}
          onSkip={onSkip}
        />
      )
    })

    const skipBtn = screen.getByRole('button', { name: /계속 진행/ })
    fireEvent.click(skipBtn)

    expect(onSkip).toHaveBeenCalledTimes(1)
  })
})
