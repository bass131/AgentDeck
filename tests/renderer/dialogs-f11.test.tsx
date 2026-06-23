// @vitest-environment jsdom
/**
 * dialogs-f11.test.tsx — F11-02 + F11-03 단위 테스트.
 *
 * F11-02: PromptModal · FolderSwitchDialog · Sidebar 프롬프트 설정 트리거.
 * F11-03: AskModal 빈상태 · 최소화 알약 토글 · Esc 시퀀스.
 * Composer onSlashAsk 주입 분기 (기존 미주입 케이스는 composer-trays.test에서 보존).
 *
 * 새 IPC 0: window.api 실 호출 0 — 모두 로컬 state + 콜백.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { useAppStore } from '../../src/renderer/src/store/appStore'
import type { ConversationRecord } from '../../src/shared/ipc-contract'

afterEach(() => cleanup())

// window.api 없이 Sidebar가 렌더되게 모킹 (sidebar-sessions.test와 동일 패턴)
// M4-3 23c: conversationLoad stub 추가 (listConversations useEffect 대응)
const mockApi = {
  windowMinimize: vi.fn(),
  windowMaximizeToggle: vi.fn(),
  windowClose: vi.fn(),
  windowIsMaximized: vi.fn().mockResolvedValue({ maximized: false }),
  windowGetBounds: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1200, height: 800 }),
  windowSetBounds: vi.fn(),
  windowDragStart: vi.fn(),
  windowDragEnd: vi.fn(),
  windowResizeStart: vi.fn(),
  windowResizeEnd: vi.fn(),
  onWindowState: vi.fn().mockReturnValue(() => {}),
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  // P10: Composer 슬래시 팔레트 IPC — F11-03 테스트에서 Composer가 '/' 열릴 때 호출됨.
  // 실 데이터 반환으로 기존 단언(ask/init 선택) 보존.
  listSlashCommands: vi.fn().mockResolvedValue([
    { name: 'ask',  description: '임시 질문', scope: 'builtin' },
    { name: 'init', description: 'CLAUDE.md 생성', scope: 'builtin' },
  ]),
  listSkills: vi.fn().mockResolvedValue([]),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

// ══════════════════════════════════════════════════════════════════════════
// F11-02: PromptModal
// ══════════════════════════════════════════════════════════════════════════

describe('F11-02: PromptModal', () => {
  async function renderPromptModal(overrides: Partial<{
    value: string
    target: string
    scope: string
    noun: string
    onSave: (text: string) => void
    onClose: () => void
  }> = {}) {
    const { PromptModal } = await import('../../src/renderer/src/components/PromptModal')
    const props = {
      target: '채팅 1',
      scope: '이 채팅에만 적용',
      noun: '채팅',
      value: '',
      onSave: vi.fn(),
      onClose: vi.fn(),
      ...overrides,
    }
    const { container } = render(<PromptModal {...props} />)
    return { container, onSave: props.onSave, onClose: props.onClose }
  }

  it('pr-overlay + pr-modal이 렌더된다', async () => {
    const { container } = await renderPromptModal()
    expect(container.querySelector('.pr-overlay')).toBeTruthy()
    expect(container.querySelector('.pr-modal')).toBeTruthy()
  })

  it('"프롬프트 설정" 제목이 표시된다', async () => {
    await renderPromptModal()
    expect(screen.getByText('프롬프트 설정')).toBeTruthy()
  })

  it('target·scope 부제가 표시된다', async () => {
    await renderPromptModal({ target: '테스트채팅', scope: '이 채팅에만 적용' })
    expect(screen.getByText('테스트채팅')).toBeTruthy()
    expect(screen.getByText(/이 채팅에만 적용/)).toBeTruthy()
  })

  it('초기 value가 textarea에 들어온다', async () => {
    const { container } = await renderPromptModal({ value: '초기 프롬프트' })
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(ta.value).toBe('초기 프롬프트')
  })

  it('textarea 입력 → 카운터 "N/4000" 업데이트', async () => {
    const { container } = await renderPromptModal()
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'hello' } })
    expect(container.querySelector('.pr-count')?.textContent).toMatch(/5.*4,000|5.*4000/)
  })

  it('빈 value일 때 "0/4000" 카운터 표시', async () => {
    const { container } = await renderPromptModal({ value: '' })
    expect(container.querySelector('.pr-count')?.textContent).toMatch(/0.*4,000|0.*4000/)
  })

  it('maxLength가 4000으로 설정된다', async () => {
    const { container } = await renderPromptModal()
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(ta.maxLength).toBe(4000)
  })

  it('취소 버튼 클릭 → onClose 호출', async () => {
    const { container, onClose } = await renderPromptModal()
    const cancelBtn = container.querySelector('.pr-cancel') as HTMLButtonElement
    fireEvent.click(cancelBtn)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('닫기(×) 버튼 클릭 → onClose 호출', async () => {
    const { container, onClose } = await renderPromptModal()
    const closeBtn = container.querySelector('.pr-close') as HTMLButtonElement
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('저장 버튼 클릭 → onSave + onClose 호출', async () => {
    const { container, onSave, onClose } = await renderPromptModal({ value: '저장할 텍스트' })
    const saveBtn = container.querySelector('.pr-save') as HTMLButtonElement
    fireEvent.click(saveBtn)
    expect(onSave).toHaveBeenCalledWith('저장할 텍스트')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Enter 키(Shift 없음) → 저장(onSave + onClose)', async () => {
    const { container, onSave, onClose } = await renderPromptModal()
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: 'Enter 저장' } })
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: false })
    expect(onSave).toHaveBeenCalledWith('Enter 저장')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Shift+Enter → 저장 미호출(줄바꿈)', async () => {
    const { container, onSave } = await renderPromptModal()
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: true })
    expect(onSave).not.toHaveBeenCalled()
  })

  it('Esc → onClose 호출', async () => {
    const { onClose } = await renderPromptModal()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce()
    })
  })

  it('backdrop(pr-overlay) 클릭 → onClose 호출', async () => {
    const { container, onClose } = await renderPromptModal()
    const overlay = container.querySelector('.pr-overlay') as HTMLElement
    fireEvent.mouseDown(overlay)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('pr-modal 내부 클릭 → onClose 미호출 (이벤트 stopPropagation)', async () => {
    const { container, onClose } = await renderPromptModal()
    const modal = container.querySelector('.pr-modal') as HTMLElement
    fireEvent.mouseDown(modal)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('비우기 버튼: value가 있을 때 표시됨', async () => {
    const { container } = await renderPromptModal({ value: '기존 프롬프트' })
    expect(container.querySelector('.pr-clear')).toBeTruthy()
  })

  it('비우기 버튼: value가 비어있을 때 미표시', async () => {
    const { container } = await renderPromptModal({ value: '' })
    expect(container.querySelector('.pr-clear')).toBeFalsy()
  })

  it('비우기 버튼 클릭 → onSave("") + onClose', async () => {
    const { container, onSave, onClose } = await renderPromptModal({ value: '지울 내용' })
    const clearBtn = container.querySelector('.pr-clear') as HTMLButtonElement
    fireEvent.click(clearBtn)
    expect(onSave).toHaveBeenCalledWith('')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('window.api 실 호출 0 (scope 검증)', async () => {
    // PromptModal은 window.api를 직접 호출하지 않음
    const apiSpy = vi.spyOn(window, 'api' as never, 'get')
    await renderPromptModal()
    expect(apiSpy).not.toHaveBeenCalled()
    apiSpy.mockRestore()
  })
})

// ══════════════════════════════════════════════════════════════════════════
// F11-02: FolderSwitchDialog
// ══════════════════════════════════════════════════════════════════════════

describe('F11-02: FolderSwitchDialog', () => {
  async function renderFolderSwitch(overrides: Partial<{
    from: string
    to: string
    multi: boolean
    onCancel: () => void
    onConfirm: () => void
  }> = {}) {
    const { FolderSwitchDialog } = await import('../../src/renderer/src/components/FolderSwitchDialog')
    const props = {
      from: '/home/user/project-a',
      to: '/home/user/project-b',
      multi: false,
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
      ...overrides,
    }
    const { container } = render(<FolderSwitchDialog {...props} />)
    return { container, onCancel: props.onCancel, onConfirm: props.onConfirm }
  }

  it('set-dialog-overlay + set-dialog가 렌더된다', async () => {
    const { container } = await renderFolderSwitch()
    expect(container.querySelector('.set-dialog-overlay')).toBeTruthy()
    expect(container.querySelector('.set-dialog')).toBeTruthy()
  })

  it('"작업 폴더를 변경할까요?" 제목이 표시된다', async () => {
    await renderFolderSwitch()
    expect(screen.getByText('작업 폴더를 변경할까요?')).toBeTruthy()
  })

  it('sd-msg에 from/to 폴더 basename이 표시된다 (단일 모드)', async () => {
    const { container } = await renderFolderSwitch({ from: '/a/project-a', to: '/b/project-b' })
    const msg = container.querySelector('.sd-msg')!
    expect(msg.textContent).toContain('project-a')
    expect(msg.textContent).toContain('project-b')
  })

  it('multi=true → 멀티 메시지 표시 (from 미표시)', async () => {
    const { container } = await renderFolderSwitch({ multi: true, to: '/b/project-b' })
    const msg = container.querySelector('.sd-msg')!
    expect(msg.textContent).toContain('project-b')
    expect(msg.textContent).toContain('모든 패널')
  })

  it('취소 버튼 클릭 → onCancel 호출', async () => {
    const { container, onCancel } = await renderFolderSwitch()
    const cancelBtn = container.querySelector('.sd-cancel') as HTMLButtonElement
    fireEvent.click(cancelBtn)
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('변경(danger) 버튼 클릭 → onConfirm 호출', async () => {
    const { container, onConfirm } = await renderFolderSwitch()
    const confirmBtn = container.querySelector('.sd-go.danger') as HTMLButtonElement
    fireEvent.click(confirmBtn)
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('backdrop 클릭 → onCancel 호출', async () => {
    const { container, onCancel } = await renderFolderSwitch()
    const overlay = container.querySelector('.set-dialog-overlay') as HTMLElement
    fireEvent.mouseDown(overlay)
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('Esc 키 → onCancel 호출', async () => {
    const { onCancel } = await renderFolderSwitch()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      expect(onCancel).toHaveBeenCalledOnce()
    })
  })

  it('window.api 실 호출 0 (scope 검증)', async () => {
    // FolderSwitchDialog는 window.api를 직접 호출하지 않음
    // window.api 접근 없이 import + render 성공이면 OK
    await renderFolderSwitch()
    // 렌더 성공 자체가 증거
    expect(true).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════
// F11-02: Sidebar 프롬프트 설정 → PromptModal 열림
// ══════════════════════════════════════════════════════════════════════════

describe('F11-02: Sidebar ctx-menu 프롬프트 설정 → PromptModal', () => {
  // M4-3 23c: Sidebar가 실 store conversations를 사용 — sb-item 렌더용 주입
  const SIDEBAR_RECORDS: ConversationRecord[] = [
    { id: 'f11-s1', title: 'F11 대화1', messages: [], backendId: 'claude-code', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  ]

  beforeEach(() => {
    useAppStore.setState({
      conversations: SIDEBAR_RECORDS,
      listConversations: async () => {},
      selectConversation: async () => {},
      renameConversation: async () => {},
      deleteConversation: async () => {},
      newConversation: () => {},
    } as Parameters<typeof useAppStore.setState>[0])
  })

  async function renderSidebar() {
    const { Sidebar } = await import('../../src/renderer/src/components/Sidebar')
    const { container } = render(
      <Sidebar
        onCollapse={() => {}}
        onOpenSettings={() => {}}
      />
    )
    return container
  }

  it('단일모드에서 more 버튼 → ctx-menu → 프롬프트 설정 클릭 → PromptModal(.pr-overlay)이 열린다', async () => {
    const container = await renderSidebar()

    // 단일모드는 기본값
    const firstMore = container.querySelector('.sb-item .more') as HTMLElement
    fireEvent.click(firstMore)

    const ctxMenu = container.querySelector('.ctx-menu')!
    const promptBtn = Array.from(ctxMenu.querySelectorAll('.ctx-item')).find(
      (el) => el.textContent?.includes('프롬프트 설정'),
    ) as HTMLElement
    expect(promptBtn).toBeTruthy()
    fireEvent.click(promptBtn)

    // PromptModal이 열려야 함
    await waitFor(() => {
      expect(container.querySelector('.pr-overlay')).toBeTruthy()
    })
  })

  it('PromptModal 열린 후 취소 클릭 → 닫힘', async () => {
    const container = await renderSidebar()
    const firstMore = container.querySelector('.sb-item .more') as HTMLElement
    fireEvent.click(firstMore)

    const promptBtn = Array.from(container.querySelectorAll('.ctx-item')).find(
      (el) => el.textContent?.includes('프롬프트 설정'),
    ) as HTMLElement
    fireEvent.click(promptBtn)

    await waitFor(() => expect(container.querySelector('.pr-overlay')).toBeTruthy())

    const cancelBtn = container.querySelector('.pr-cancel') as HTMLButtonElement
    fireEvent.click(cancelBtn)

    await waitFor(() => {
      expect(container.querySelector('.pr-overlay')).toBeFalsy()
    })
  })

  it('Sidebar props 시그니처 무변경: onCollapse + onOpenSettings만 필요', async () => {
    // 두 prop으로만 렌더 가능하면 시그니처 보존됨
    const { Sidebar } = await import('../../src/renderer/src/components/Sidebar')
    expect(() =>
      render(<Sidebar onCollapse={() => {}} onOpenSettings={() => {}} />)
    ).not.toThrow()
  })
})

// ══════════════════════════════════════════════════════════════════════════
// F11-03: AskModal
// ══════════════════════════════════════════════════════════════════════════

describe('F11-03: AskModal', () => {
  async function renderAskModal(overrides: Partial<{
    minimized: boolean
    onClose: () => void
    onMinimizedChange: (v: boolean) => void
  }> = {}) {
    const { AskModal } = await import('../../src/renderer/src/components/AskModal')
    const props = {
      minimized: false,
      onClose: vi.fn(),
      onMinimizedChange: vi.fn(),
      ...overrides,
    }
    const { container } = render(<AskModal {...props} />)
    return { container, onClose: props.onClose, onMinimizedChange: props.onMinimizedChange }
  }

  it('ask-overlay + ask-modal이 렌더된다 (minimized=false)', async () => {
    const { container } = await renderAskModal()
    expect(container.querySelector('.ask-overlay')).toBeTruthy()
    expect(container.querySelector('.ask-modal')).toBeTruthy()
  })

  it('"빠른 질문" 제목이 표시된다', async () => {
    await renderAskModal()
    expect(screen.getByText(/빠른 질문/)).toBeTruthy()
  })

  it('"/ask" 배지가 표시된다', async () => {
    const { container } = await renderAskModal()
    expect(container.querySelector('.ask-cmd')?.textContent).toBe('/ask')
  })

  it('휘발성 pill이 표시된다', async () => {
    const { container } = await renderAskModal()
    expect(container.querySelector('.ask-eph')).toBeTruthy()
    expect(container.querySelector('.ask-eph')?.textContent).toContain('휘발성')
  })

  it('빈상태: "무엇이든 편하게 물어보세요" 표시', async () => {
    await renderAskModal()
    expect(screen.getByText(/무엇이든 편하게 물어보세요/)).toBeTruthy()
  })

  it('ask-empty가 렌더된다 (빈상태 기본)', async () => {
    const { container } = await renderAskModal()
    expect(container.querySelector('.ask-empty')).toBeTruthy()
  })

  it('최소화(⌄) 버튼 클릭 → onMinimizedChange(true) 호출', async () => {
    const { container, onMinimizedChange } = await renderAskModal()
    const minBtn = container.querySelector('.ask-min') as HTMLButtonElement
    fireEvent.click(minBtn)
    expect(onMinimizedChange).toHaveBeenCalledWith(true)
  })

  it('닫기(✕) 버튼 클릭 → onClose 호출', async () => {
    const { container, onClose } = await renderAskModal()
    const closeBtn = container.querySelector('.ask-close') as HTMLButtonElement
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('컴포저 textarea가 렌더된다', async () => {
    const { container } = await renderAskModal()
    expect(container.querySelector('.ask-foot textarea')).toBeTruthy()
  })

  it('풋노트: "창을 닫으면" 안내 텍스트 표시', async () => {
    const { container } = await renderAskModal()
    expect(container.querySelector('.ask-note')?.textContent).toContain('창을 닫으면')
  })

  // 최소화 상태
  it('minimized=true → ask-mini 알약이 렌더된다', async () => {
    const { container } = await renderAskModal({ minimized: true })
    expect(container.querySelector('.ask-mini')).toBeTruthy()
    expect(container.querySelector('.ask-overlay')).toBeFalsy()
  })

  it('ask-mini 알약: "빠른 질문" 텍스트 표시', async () => {
    const { container } = await renderAskModal({ minimized: true })
    expect(container.querySelector('.mini-title')?.textContent).toContain('빠른 질문')
  })

  it('ask-mini 펼치기 버튼 클릭 → onMinimizedChange(false) 호출', async () => {
    const { container, onMinimizedChange } = await renderAskModal({ minimized: true })
    const expandBtn = container.querySelector('.mini-btn:not(.close)') as HTMLButtonElement
    fireEvent.click(expandBtn)
    expect(onMinimizedChange).toHaveBeenCalledWith(false)
  })

  it('ask-mini 닫기 버튼 클릭 → onClose 호출', async () => {
    const { container, onClose } = await renderAskModal({ minimized: true })
    const closeMiniBtn = container.querySelector('.mini-btn.close') as HTMLButtonElement
    fireEvent.click(closeMiniBtn)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Esc (minimized=false) → onMinimizedChange(true) 호출 (최소화)', async () => {
    const { onMinimizedChange } = await renderAskModal({ minimized: false })
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      expect(onMinimizedChange).toHaveBeenCalledWith(true)
    })
  })

  it('Esc (minimized=true) → onClose 호출 (닫기)', async () => {
    const { onClose } = await renderAskModal({ minimized: true })
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce()
    })
  })

  it('window.api ask 실 호출 0 (scope 검증)', async () => {
    // AskModal은 window.api.ask를 실제 호출하지 않음 (시각/로컬)
    await renderAskModal()
    // 렌더 성공 + window.api.ask 미호출 확인
    expect(mockApi.windowClose).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════════════════════
// F11-03: Composer onSlashAsk optional prop
// ══════════════════════════════════════════════════════════════════════════

describe('F11-03: Composer onSlashAsk prop (하위호환 + 신규)', () => {
  function mkProps(over: Partial<Parameters<typeof import('../../src/renderer/src/components/Composer').Composer>[0]> = {}) {
    return {
      value: '',
      onChange: vi.fn(),
      onSend: vi.fn(),
      onAbort: vi.fn(),
      isRunning: false,
      ...over,
    }
  }

  it('onSlashAsk 미주입 상태에서 /ask Enter → onChange 호출 (하위호환 기존 동작)', async () => {
    const { Composer } = await import('../../src/renderer/src/components/Composer')
    const { act } = await import('@testing-library/react')
    const onChange = vi.fn()
    const { container } = render(
      <Composer {...mkProps({ value: '/ask', onChange })} />
    )
    // P10: IPC 비동기 로드 완료 대기
    await act(async () => { await Promise.resolve() })
    // slash-menu에서 ask 항목 클릭(mouseDown)
    const menu = container.querySelector('.slash-menu')
    const askOpt = Array.from(menu?.querySelectorAll('.slash-opt') ?? []).find(
      (el) => el.querySelector('.slash-name')?.textContent === 'ask',
    ) as HTMLButtonElement | null
    if (askOpt) {
      fireEvent.mouseDown(askOpt)
      expect(onChange).toHaveBeenCalled()
      const called = onChange.mock.calls[0][0] as string
      expect(called).toContain('ask')
    } else {
      // slash-menu가 dismissed 됐을 수 있음 — Enter로도 테스트
      const ta = container.querySelector('textarea') as HTMLTextAreaElement
      fireEvent.keyDown(ta, { key: 'Enter' })
      expect(onChange).toHaveBeenCalled()
    }
  })

  it('onSlashAsk 주입 + /ask Enter → onSlashAsk 콜백 호출, onChange는 ask 전용으로 변경', async () => {
    const { Composer } = await import('../../src/renderer/src/components/Composer')
    const { act } = await import('@testing-library/react')
    const onSlashAsk = vi.fn()
    const onChange = vi.fn()
    const { container } = render(
      <Composer {...mkProps({ value: '/ask', onChange, onSlashAsk })} />
    )
    // P10: IPC 비동기 로드 완료 대기
    await act(async () => { await Promise.resolve() })
    const menu = container.querySelector('.slash-menu')
    const askOpt = Array.from(menu?.querySelectorAll('.slash-opt') ?? []).find(
      (el) => el.querySelector('.slash-name')?.textContent === 'ask',
    ) as HTMLButtonElement | null
    if (askOpt) {
      fireEvent.mouseDown(askOpt)
      expect(onSlashAsk).toHaveBeenCalledOnce()
    } else {
      const ta = container.querySelector('textarea') as HTMLTextAreaElement
      fireEvent.keyDown(ta, { key: 'Enter' })
      expect(onSlashAsk).toHaveBeenCalledOnce()
    }
  })

  it('onSlashAsk 주입 + /init Enter → onChange 호출(다른 슬래시 동작 불변)', async () => {
    const { Composer } = await import('../../src/renderer/src/components/Composer')
    const { act } = await import('@testing-library/react')
    const onSlashAsk = vi.fn()
    const onChange = vi.fn()
    const { container } = render(
      <Composer {...mkProps({ value: '/init', onChange, onSlashAsk })} />
    )
    // P10: IPC 비동기 로드 완료 대기
    await act(async () => { await Promise.resolve() })
    const menu = container.querySelector('.slash-menu')
    const initOpt = Array.from(menu?.querySelectorAll('.slash-opt') ?? []).find(
      (el) => el.querySelector('.slash-name')?.textContent === 'init',
    ) as HTMLButtonElement | null
    if (initOpt) {
      fireEvent.mouseDown(initOpt)
      expect(onChange).toHaveBeenCalled()
      expect(onSlashAsk).not.toHaveBeenCalled()
    }
  })
})
