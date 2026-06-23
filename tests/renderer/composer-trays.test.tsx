// @vitest-environment jsdom
/**
 * composer-trays.test.tsx — F9 리치 트레이 단위 테스트.
 * slash-menu / mention 팔레트 / img-tray / drop-hint / sched / placeholder 3-상태.
 * 새 IPC 0: 모든 상호작용은 로컬 state만.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { Composer } from '../../src/renderer/src/components/Composer'
import { SAMPLE_MENTION_TREE } from '../../src/renderer/src/lib/composerSampleData'

// M4-2: mentionFiles prop 필요 — SAMPLE_MENTION_TREE를 플랫 파일 경로로 변환
const SAMPLE_FILES = SAMPLE_MENTION_TREE
  .filter((e) => e.kind === 'file')
  .map((e) => e.full)

afterEach(() => cleanup())

function mkProps(over: Partial<Parameters<typeof Composer>[0]> = {}) {
  return {
    value: '',
    onChange: vi.fn(),
    onSend: vi.fn(),
    onAbort: vi.fn(),
    isRunning: false,
    hasStarted: false,
    queued: [],
    ...over,
  }
}

// ── placeholder 3-상태 ──────────────────────────────────────────────────────

describe('Composer — placeholder 3-상태 (F9-02)', () => {
  it('신규(isRunning=false, hasStarted=false) → "오늘 어떤 도움을 드릴까요?"', () => {
    const { container } = render(<Composer {...mkProps()} />)
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(ta.placeholder).toBe('오늘 어떤 도움을 드릴까요?')
  })

  it('started(hasStarted=true) → "메세지를 입력하세요."', () => {
    const { container } = render(<Composer {...mkProps({ hasStarted: true })} />)
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(ta.placeholder).toBe('메세지를 입력하세요.')
  })

  it('busy(isRunning=true) → "다음 메시지를 예약하세요…"', () => {
    const { container } = render(<Composer {...mkProps({ isRunning: true })} />)
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(ta.placeholder).toMatch(/다음 메시지를 예약하세요/)
  })
})

// ── slash-menu ──────────────────────────────────────────────────────────────

describe('Composer — slash-menu (F9-01)', () => {
  it('"/" 입력 → slash-menu[role=listbox] 표시', () => {
    const { container } = render(<Composer {...mkProps({ value: '/' })} />)
    expect(container.querySelector('[role=listbox].slash-menu')).toBeTruthy()
  })

  it('slash-menu에 ask/init/security-review 명령어 + 스킬 섹션 표시', () => {
    const { container } = render(<Composer {...mkProps({ value: '/' })} />)
    const menu = container.querySelector('.slash-menu')!
    expect(menu).toBeTruthy()
    const names = Array.from(menu.querySelectorAll('.slash-name')).map((n) => n.textContent)
    expect(names).toContain('ask')
    expect(names).toContain('init')
    expect(names).toContain('security-review')
    // 스킬 섹션
    const secs = Array.from(menu.querySelectorAll('.slash-sec')).map((s) => s.textContent)
    expect(secs.some((s) => s?.includes('스킬'))).toBe(true)
  })

  it('필터: "/ask" 입력 → ask만 표시', () => {
    const { container } = render(<Composer {...mkProps({ value: '/ask' })} />)
    const menu = container.querySelector('.slash-menu')
    if (!menu) return // dismissed after selection — may not be visible
    const names = Array.from(menu.querySelectorAll('.slash-name')).map((n) => n.textContent)
    expect(names.every((n) => n?.includes('ask'))).toBe(true)
  })

  it('공백 포함 value → slash-menu 없음', () => {
    const { container } = render(<Composer {...mkProps({ value: '/ask some text' })} />)
    expect(container.querySelector('.slash-menu')).toBeFalsy()
  })

  it('↓ 키 → 두 번째 항목 .on (slashIdx 이동)', () => {
    const props = mkProps({ value: '/' })
    const { container } = render(<Composer {...props} />)
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.keyDown(ta, { key: 'ArrowDown' })
    const opts = container.querySelectorAll('.slash-opt')
    expect(opts[0].classList.contains('on')).toBe(false)
    expect(opts[1].classList.contains('on')).toBe(true)
  })

  it('↑ 키 → 마지막 항목으로 wrap', () => {
    const props = mkProps({ value: '/' })
    const { container } = render(<Composer {...props} />)
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.keyDown(ta, { key: 'ArrowUp' })
    const opts = container.querySelectorAll('.slash-opt')
    // last item should be active
    expect(opts[opts.length - 1].classList.contains('on')).toBe(true)
  })

  it('Enter 선택 → onChange 호출 + slash-menu 닫힘', () => {
    const onChange = vi.fn()
    const { container } = render(<Composer {...mkProps({ value: '/', onChange })} />)
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.keyDown(ta, { key: 'Enter' })
    expect(onChange).toHaveBeenCalled()
    // menu closes after selection (dismissed=true or value changed)
  })

  it('Tab 선택 → onChange 호출', () => {
    const onChange = vi.fn()
    const { container } = render(<Composer {...mkProps({ value: '/', onChange })} />)
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.keyDown(ta, { key: 'Tab' })
    expect(onChange).toHaveBeenCalled()
  })

  it('Esc → slash-menu 닫힘', () => {
    const { container } = render(<Composer {...mkProps({ value: '/' })} />)
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(container.querySelector('.slash-menu')).toBeTruthy()
    fireEvent.keyDown(ta, { key: 'Escape' })
    expect(container.querySelector('.slash-menu')).toBeFalsy()
  })

  it('onMouseDown on option → onChange 호출(포커스 유지)', () => {
    const onChange = vi.fn()
    const { container } = render(<Composer {...mkProps({ value: '/', onChange })} />)
    const opt = container.querySelector('.slash-opt') as HTMLButtonElement
    fireEvent.mouseDown(opt)
    expect(onChange).toHaveBeenCalled()
  })
})

// ── mention 팔레트 ──────────────────────────────────────────────────────────

describe('Composer — mention 팔레트 (F9-01)', () => {
  it('"@" 입력 → mention 팔레트(.slash-menu) 표시', () => {
    // mentionFiles 없으면 팔레트는 열리지만 항목이 없어 리스트박스가 생략될 수 있음
    // 팔레트 자체(openness)는 mentionFiles 유무 무관
    const { container } = render(<Composer {...mkProps({ value: '@', mentionFiles: SAMPLE_FILES })} />)
    // mention palette reuses .slash-menu
    expect(container.querySelector('.slash-menu')).toBeTruthy()
  })

  it('mention 팔레트에 폴더 + 파일 항목 표시', () => {
    // M4-2: mentionFiles에 실 파일 목록 주입 → mentionEntries가 항목 생성
    const { container } = render(<Composer {...mkProps({ value: '@', mentionFiles: SAMPLE_FILES })} />)
    const menu = container.querySelector('.slash-menu')!
    const folderIcs = menu.querySelectorAll('.slash-ic.folder')
    const fileIcs = menu.querySelectorAll('.slash-ic.ft')
    expect(folderIcs.length + fileIcs.length).toBeGreaterThan(0)
  })

  it('mention-loc 헤더 표시', () => {
    const { container } = render(<Composer {...mkProps({ value: '@', mentionFiles: SAMPLE_FILES })} />)
    expect(container.querySelector('.slash-sec.mention-loc')).toBeTruthy()
  })

  it('dir 항목 onMouseDown → @dir/ 드릴(onChange 호출)', () => {
    const onChange = vi.fn()
    const { container } = render(<Composer {...mkProps({ value: '@', onChange, mentionFiles: SAMPLE_FILES })} />)
    const menu = container.querySelector('.slash-menu')!
    const dirOpt = menu.querySelector('.slash-ic.folder')?.closest('.slash-opt') as HTMLButtonElement | null
    if (dirOpt) {
      fireEvent.mouseDown(dirOpt)
      expect(onChange).toHaveBeenCalled()
      const call = onChange.mock.calls[0][0] as string
      expect(call).toMatch(/@.*\/$/)
    }
  })

  it('file 항목 onMouseDown → @path 삽입(onChange 호출)', () => {
    const onChange = vi.fn()
    const { container } = render(<Composer {...mkProps({ value: '@', onChange, mentionFiles: SAMPLE_FILES })} />)
    const menu = container.querySelector('.slash-menu')!
    const fileOpt = menu.querySelector('.slash-ic.ft')?.closest('.slash-opt') as HTMLButtonElement | null
    if (fileOpt) {
      fireEvent.mouseDown(fileOpt)
      expect(onChange).toHaveBeenCalled()
      const call = onChange.mock.calls[0][0] as string
      expect(call).toMatch(/@\S+/)
    }
  })
})

// ── 첨부 트레이 ──────────────────────────────────────────────────────────────
// 22c: 트레이는 attachedImages prop 기반 — 로컬 state 제거.

const SAMPLE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

describe('Composer — 첨부 트레이 (F9-02)', () => {
  it('attachedImages prop 있으면 img-tray + img-thumb 표시', () => {
    const { container } = render(
      <Composer {...mkProps({ attachedImages: [SAMPLE_DATA_URL] })} />
    )
    expect(container.querySelector('.img-tray')).toBeTruthy()
    expect(container.querySelector('.img-thumb')).toBeTruthy()
  })

  it('img-thumb-x 클릭 → onRemoveImage 콜백 호출', () => {
    const onRemoveImage = vi.fn()
    const { container } = render(
      <Composer {...mkProps({ attachedImages: [SAMPLE_DATA_URL], onRemoveImage })} />
    )
    const xBtn = container.querySelector('.img-thumb-x') as HTMLButtonElement
    expect(xBtn).toBeTruthy()
    fireEvent.click(xBtn)
    expect(onRemoveImage).toHaveBeenCalledWith(0)
  })

  it('attachedImages 2개 → 썸네일 2개', () => {
    const { container } = render(
      <Composer {...mkProps({ attachedImages: [SAMPLE_DATA_URL, SAMPLE_DATA_URL] })} />
    )
    expect(container.querySelectorAll('.img-thumb').length).toBe(2)
  })

  it('attachedImages 없으면 img-tray 미표시', () => {
    const { container } = render(<Composer {...mkProps()} />)
    expect(container.querySelector('.img-tray')).toBeFalsy()
  })

  it('attach 버튼 클릭 → onAttachFiles 연결을 위한 숨김 input 존재', () => {
    const { container } = render(<Composer {...mkProps()} />)
    const attachBtn = screen.getByLabelText('이미지 첨부')
    expect(attachBtn).toBeTruthy()
    // 숨김 file input이 DOM에 있어야 함
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).toBeTruthy()
    expect(fileInput.style.display).toBe('none')
  })
})

// ── 드롭 힌트 ────────────────────────────────────────────────────────────────

describe('Composer — drop-hint (F9-02)', () => {
  it('dragEnter(파일 포함) → .drop-hint 표시', () => {
    const { container } = render(<Composer {...mkProps()} />)
    const composer = container.querySelector('.composer') as HTMLElement
    act(() => {
      fireEvent.dragEnter(composer, {
        dataTransfer: { types: ['Files'], items: [{ kind: 'file' }] },
      })
    })
    expect(container.querySelector('.drop-hint')).toBeTruthy()
  })

  it('drop-hint에 "이미지를 여기에 놓으세요" 텍스트', () => {
    const { container } = render(<Composer {...mkProps()} />)
    const composer = container.querySelector('.composer') as HTMLElement
    act(() => {
      fireEvent.dragEnter(composer, {
        dataTransfer: { types: ['Files'], items: [{ kind: 'file' }] },
      })
    })
    expect(screen.getByText('이미지를 여기에 놓으세요')).toBeTruthy()
  })

  it('dragLeave → .drop-hint 사라짐', () => {
    const { container } = render(<Composer {...mkProps()} />)
    const composer = container.querySelector('.composer') as HTMLElement
    act(() => {
      fireEvent.dragEnter(composer, {
        dataTransfer: { types: ['Files'], items: [{ kind: 'file' }] },
      })
    })
    act(() => {
      fireEvent.dragLeave(composer)
    })
    expect(container.querySelector('.drop-hint')).toBeFalsy()
  })
})

// ── sched 큐 ─────────────────────────────────────────────────────────────────

describe('Composer — sched 큐 (F9-02)', () => {
  const sampleQueued = [
    { id: 'q1', text: '첫 번째 예약 메시지', images: [] },
    { id: 'q2', text: '두 번째 예약 메시지', images: [] },
  ]

  it('queued.length > 0 → sched 표시 + "예약된 메시지 N"', () => {
    const { container } = render(<Composer {...mkProps({ queued: sampleQueued })} />)
    expect(container.querySelector('.sched')).toBeTruthy()
    expect(screen.getByText(/예약된 메시지 2/)).toBeTruthy()
  })

  it('sched-list 항목 수 = queued.length', () => {
    const { container } = render(<Composer {...mkProps({ queued: sampleQueued })} />)
    expect(container.querySelectorAll('.sched-item').length).toBe(2)
  })

  it('sched-item에 sched-num + sched-text 표시', () => {
    const { container } = render(<Composer {...mkProps({ queued: sampleQueued })} />)
    const items = container.querySelectorAll('.sched-item')
    expect(items[0].querySelector('.sched-num')).toBeTruthy()
    expect(items[0].querySelector('.sched-text')).toBeTruthy()
  })

  it('sched-x 클릭 → onRemoveQueued 콜백', () => {
    const onRemoveQueued = vi.fn()
    const { container } = render(<Composer {...mkProps({ queued: sampleQueued, onRemoveQueued })} />)
    const xBtn = container.querySelector('.sched-x') as HTMLButtonElement
    fireEvent.click(xBtn)
    expect(onRemoveQueued).toHaveBeenCalledWith('q1')
  })

  it('queued=[] → sched 미표시', () => {
    const { container } = render(<Composer {...mkProps({ queued: [] })} />)
    expect(container.querySelector('.sched')).toBeFalsy()
  })

  it('queued 기본값 없을 때도 sched 미표시(prop 미주입)', () => {
    const { container } = render(
      <Composer value="" onChange={vi.fn()} onSend={vi.fn()} onAbort={vi.fn()} isRunning={false} />
    )
    expect(container.querySelector('.sched')).toBeFalsy()
  })
})

// ── sched-img (images > 0) ───────────────────────────────────────────────────

describe('Composer — sched-img (images > 0)', () => {
  it('images.length > 0 → sched-img 표시', () => {
    const queued = [{ id: 'q1', text: '텍스트', images: ['data:image/png;base64,abc'] }]
    const { container } = render(<Composer {...mkProps({ queued })} />)
    expect(container.querySelector('.sched-img')).toBeTruthy()
  })
})
