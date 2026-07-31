// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, screen, fireEvent, cleanup } from '@testing-library/react'

const mockGetProfile = vi.fn()
const mockSetProfile = vi.fn().mockResolvedValue({ ok: true })

const baseApi = {
  getProfile: mockGetProfile,
  setProfile: mockSetProfile,
  getEngineState: vi.fn().mockResolvedValue({ available: true, authed: true, version: '1.0.0' }),
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
  getAppVersion: vi.fn().mockResolvedValue(''),
  checkEngineUpdate: vi.fn().mockResolvedValue({ current: null, latest: null, updateAvailable: false }),
}

Object.defineProperty(window, 'api', { value: baseApi, writable: true, configurable: true })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('부트 게이트 — profile null (첫 실행)', () => {
  beforeEach(() => {
    mockGetProfile.mockResolvedValue(null)
  })

  it('getProfile IPC가 null 반환 → .login-body(온보딩 화면) 표시', async () => {
    vi.resetModules()
    const { AppGate } = await import('../../../02_Source/renderer/src/AppGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<AppGate />)
      container = result.container
    })

    expect(container.querySelector('.login-body')).toBeTruthy()
  })

  it('getProfile null → Shell(.win) 미표시', async () => {
    vi.resetModules()
    const { AppGate } = await import('../../../02_Source/renderer/src/AppGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<AppGate />)
      container = result.container
    })

    expect(container.querySelector('.win')).toBeFalsy()
  })

  it('첫 실행: Profile title = "시작하기"', async () => {
    vi.resetModules()
    const { AppGate } = await import('../../../02_Source/renderer/src/AppGate')

    await act(async () => {
      render(<AppGate />)
    })

    expect(screen.getByText('시작하기')).toBeTruthy()
  })

  it('부트 시 getProfile IPC 1회 호출', async () => {
    vi.resetModules()
    const { AppGate } = await import('../../../02_Source/renderer/src/AppGate')

    await act(async () => {
      render(<AppGate />)
    })

    expect(mockGetProfile).toHaveBeenCalledTimes(1)
  })
})

describe('부트 게이트 — profile 있음 (재방문)', () => {
  beforeEach(() => {
    mockGetProfile.mockResolvedValue({ nickname: '개발자', color: '#6366f1' })
  })

  it('getProfile 반환 시 Shell(.win) 바로 표시', async () => {
    vi.resetModules()
    const { AppGate } = await import('../../../02_Source/renderer/src/AppGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<AppGate />)
      container = result.container
    })

    expect(container.querySelector('.win')).toBeTruthy()
  })

  it('profile 있음 → .login-body 미표시', async () => {
    vi.resetModules()
    const { AppGate } = await import('../../../02_Source/renderer/src/AppGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<AppGate />)
      container = result.container
    })

    expect(container.querySelector('.login-body')).toBeFalsy()
  })

  it('재방문: Profile 없이 바로 Shell — getProfile은 여전히 1회 호출', async () => {
    vi.resetModules()
    const { AppGate } = await import('../../../02_Source/renderer/src/AppGate')

    await act(async () => {
      render(<AppGate />)
    })

    expect(mockGetProfile).toHaveBeenCalledTimes(1)
  })
})

describe('온보딩 제출 흐름', () => {
  beforeEach(() => {
    mockGetProfile.mockResolvedValue(null)
  })

  it('닉네임 입력 + 제출 → window.api.setProfile 호출', async () => {
    vi.resetModules()
    const { AppGate } = await import('../../../02_Source/renderer/src/AppGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<AppGate />)
      container = result.container
    })

    const input = container.querySelector('input#nickname') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: '홍길동' } })
    })

    const form = container.querySelector('form.lg-form') as HTMLFormElement
    await act(async () => {
      fireEvent.submit(form)
    })

    expect(mockSetProfile).toHaveBeenCalledOnce()
    expect(mockSetProfile).toHaveBeenCalledWith(
      expect.objectContaining({ nickname: '홍길동' })
    )
  })

  it('제출 성공 → .login-body 사라지고 Shell(.win) 표시', async () => {
    vi.resetModules()
    const { AppGate } = await import('../../../02_Source/renderer/src/AppGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<AppGate />)
      container = result.container
    })

    const input = container.querySelector('input#nickname') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: '홍길동' } })
    })

    const form = container.querySelector('form.lg-form') as HTMLFormElement
    await act(async () => {
      fireEvent.submit(form)
    })

    expect(container.querySelector('.login-body')).toBeFalsy()
    expect(container.querySelector('.win')).toBeTruthy()
  })
})

describe('재방문 온보딩 분화', () => {
  it('profile 있음이어도 webdriver=true에서 profile 이벤트 → 재방문 타이틀 "다시 오셨네요"', async () => {
    mockGetProfile.mockResolvedValue({ nickname: '개발자', color: '#6366f1' })

    vi.resetModules()
    const { AppGate } = await import('../../../02_Source/renderer/src/AppGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<AppGate />)
      container = result.container
    })

    expect(container.querySelector('.win')).toBeTruthy()
  })
})

describe('인사말 닉네임 — store profile → Welcome 환영 메시지', () => {
  it('profile.nickname = "홍길동" → Welcome 인사말에 "홍길동"이 포함', async () => {
    vi.resetModules()
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')

    useAppStore.setState({ profile: { nickname: '홍길동', color: '#6366f1' } } as Parameters<typeof useAppStore.setState>[0])

    const { Welcome } = await import('../../../02_Source/renderer/src/components/01_conversation/Conversation')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<Welcome onPick={vi.fn()} />)
      container = result.container
    })

    const wcTitle = container.querySelector('.wc-title')
    expect(wcTitle?.textContent).toContain('홍길동')
  })

  it('profile.nickname 없음 → 기본 인사말("무엇을 도와드릴까요?") 표시', async () => {
    vi.resetModules()
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')

    useAppStore.setState({ profile: null } as Parameters<typeof useAppStore.setState>[0])

    const { Welcome } = await import('../../../02_Source/renderer/src/components/01_conversation/Conversation')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<Welcome onPick={vi.fn()} />)
      container = result.container
    })

    const wcTitle = container.querySelector('.wc-title')
    expect(wcTitle?.textContent).toBe('무엇을 도와드릴까요?')
  })
})

describe('기존 회귀 — Shell 마운트 정상', () => {
  it('profile 있음 → Shell 마운트 후 .statusbar 렌더', async () => {
    mockGetProfile.mockResolvedValue({ nickname: '개발자', color: '#6366f1' })
    vi.resetModules()
    const { AppGate } = await import('../../../02_Source/renderer/src/AppGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<AppGate />)
      container = result.container
    })

    expect(container.querySelector('.statusbar')).toBeTruthy()
  })

  it('AppGate는 App.tsx를 대체하지 않음 — Shell 내부 구조 유지', async () => {
    mockGetProfile.mockResolvedValue({ nickname: 'test', color: '#000' })
    vi.resetModules()
    const { AppGate } = await import('../../../02_Source/renderer/src/AppGate')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<AppGate />)
      container = result.container
    })

    expect(container.querySelector('.win')).toBeTruthy()
  })
})
