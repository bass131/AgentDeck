// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, act, fireEvent } from '@testing-library/react'

afterEach(() => cleanup())

const SAMPLE_PENDING = {
  runId: 'run-1',
  requestId: 'req-1',
  toolName: 'Bash',
  summary: 'rm -rf /tmp/test',
}

describe('PermissionCard — pending=null', () => {
  it('null 렌더 — .perm-card 없음', async () => {
    const { PermissionCard } = await import('../../../02_Project/00_Source/renderer/src/features/notice')
    const { container } = render(<PermissionCard pending={null} onRespond={vi.fn()} />)
    expect(container.querySelector('.perm-card')).toBeFalsy()
  })
})

describe('PermissionCard — pending 있음: 렌더 계약', () => {
  it('.perm-card[role=group][aria-label] 렌더, role="dialog" 아님', async () => {
    const { PermissionCard } = await import('../../../02_Project/00_Source/renderer/src/features/notice')
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={vi.fn()} />)
    const card = container.querySelector('.perm-card')
    expect(card).toBeTruthy()
    expect(card?.getAttribute('role')).toBe('group')
    expect(card?.hasAttribute('aria-label')).toBe(true)
    expect(container.querySelector('.perm-card[role="dialog"]')).toBeFalsy()
  })

  it('카드 루트에 aria-live="polite" 부여', async () => {
    const { PermissionCard } = await import('../../../02_Project/00_Source/renderer/src/features/notice')
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={vi.fn()} />)
    expect(container.querySelector('.perm-card')?.getAttribute('aria-live')).toBe('polite')
  })

  it('allow_always 버튼 title/aria-label에 세션-스코프 힌트 포함', async () => {
    const { PermissionCard } = await import('../../../02_Project/00_Source/renderer/src/features/notice')
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={vi.fn()} />)
    const btn = container.querySelector('.perm-card-opt[data-perm-choice="allow_always"]') as HTMLElement
    expect(btn.getAttribute('title')).toContain('세션')
    expect(btn.getAttribute('aria-label')).toContain('세션')
  })

  it('각 버튼에 라벨 아래 보조 캡션(.perm-card-opt-desc)이 시각적으로도 렌더됨', async () => {
    const { PermissionCard } = await import('../../../02_Project/00_Source/renderer/src/features/notice')
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={vi.fn()} />)
    const descs = container.querySelectorAll('.perm-card-opt-desc')
    expect(descs.length).toBe(3)
    expect(descs[1].textContent).toContain('세션')
  })

  it('toolName + summary 텍스트 렌더', async () => {
    const { PermissionCard } = await import('../../../02_Project/00_Source/renderer/src/features/notice')
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={vi.fn()} />)
    expect(container.textContent).toContain('Bash')
    expect(container.textContent).toContain('rm -rf /tmp/test')
  })

  it('perm-card-opt 3개 렌더(allow/allow_always/deny 순서)', async () => {
    const { PermissionCard } = await import('../../../02_Project/00_Source/renderer/src/features/notice')
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={vi.fn()} />)
    const opts = container.querySelectorAll('.perm-card-opt')
    expect(opts.length).toBe(3)
    expect(opts[0].getAttribute('data-perm-choice')).toBe('allow')
    expect(opts[1].getAttribute('data-perm-choice')).toBe('allow_always')
    expect(opts[2].getAttribute('data-perm-choice')).toBe('deny')
  })

  it('q-num 배경이 인라인 style로 설정됨(q-num 예외 허용)', async () => {
    const { PermissionCard } = await import('../../../02_Project/00_Source/renderer/src/features/notice')
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={vi.fn()} />)
    const numEl = container.querySelector('.q-num') as HTMLElement
    expect(numEl.style.background).toBeTruthy()
  })
})

describe('PermissionCard — 클릭 → onRespond', () => {
  it('allow 버튼 클릭 → onRespond("allow")', async () => {
    const { PermissionCard } = await import('../../../02_Project/00_Source/renderer/src/features/notice')
    const onRespond = vi.fn()
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={onRespond} />)
    const opts = container.querySelectorAll('.perm-card-opt')
    fireEvent.click(opts[0])
    expect(onRespond).toHaveBeenCalledWith('allow')
  })

  it('allow_always 버튼 클릭 → onRespond("allow_always")', async () => {
    const { PermissionCard } = await import('../../../02_Project/00_Source/renderer/src/features/notice')
    const onRespond = vi.fn()
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={onRespond} />)
    const opts = container.querySelectorAll('.perm-card-opt')
    fireEvent.click(opts[1])
    expect(onRespond).toHaveBeenCalledWith('allow_always')
  })

  it('deny 버튼 클릭 → onRespond("deny")', async () => {
    const { PermissionCard } = await import('../../../02_Project/00_Source/renderer/src/features/notice')
    const onRespond = vi.fn()
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={onRespond} />)
    const opts = container.querySelectorAll('.perm-card-opt')
    fireEvent.click(opts[2])
    expect(onRespond).toHaveBeenCalledWith('deny')
  })
})

describe('PermissionCard — 카드 컨테이너 keydown(전역 리스너 아님)', () => {
  it('카드 컨테이너에 숫자 1 → onRespond("allow")', async () => {
    const { PermissionCard } = await import('../../../02_Project/00_Source/renderer/src/features/notice')
    const onRespond = vi.fn()
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={onRespond} />)
    const card = container.querySelector('.perm-card') as HTMLElement
    await act(async () => {
      fireEvent.keyDown(card, { key: '1' })
    })
    expect(onRespond).toHaveBeenCalledWith('allow')
  })

  it('카드 컨테이너에 숫자 2 → onRespond("allow_always")', async () => {
    const { PermissionCard } = await import('../../../02_Project/00_Source/renderer/src/features/notice')
    const onRespond = vi.fn()
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={onRespond} />)
    const card = container.querySelector('.perm-card') as HTMLElement
    await act(async () => {
      fireEvent.keyDown(card, { key: '2' })
    })
    expect(onRespond).toHaveBeenCalledWith('allow_always')
  })

  it('카드 컨테이너에 숫자 3 → onRespond("deny")', async () => {
    const { PermissionCard } = await import('../../../02_Project/00_Source/renderer/src/features/notice')
    const onRespond = vi.fn()
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={onRespond} />)
    const card = container.querySelector('.perm-card') as HTMLElement
    await act(async () => {
      fireEvent.keyDown(card, { key: '3' })
    })
    expect(onRespond).toHaveBeenCalledWith('deny')
  })

  it('카드 컨테이너에 Esc → onRespond("deny")', async () => {
    const { PermissionCard } = await import('../../../02_Project/00_Source/renderer/src/features/notice')
    const onRespond = vi.fn()
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={onRespond} />)
    const card = container.querySelector('.perm-card') as HTMLElement
    await act(async () => {
      fireEvent.keyDown(card, { key: 'Escape' })
    })
    expect(onRespond).toHaveBeenCalledWith('deny')
  })

  it('마운트 시 다른 입력 미포커스면 카드가 자동 포커스된다(클릭 없이 숫자키 가능)', async () => {
    const { PermissionCard } = await import('../../../02_Project/00_Source/renderer/src/features/notice')
    const { container } = await act(async () =>
      render(<PermissionCard pending={SAMPLE_PENDING} onRespond={vi.fn()} />)
    )
    const card = container.querySelector('.perm-card') as HTMLElement
    expect(document.activeElement).toBe(card)
  })
})

describe('PermissionCard — 컴포저 타이핑 안전성(오발동 0)', () => {
  it('컴포저(이미 포커스)가 있는 채로 카드가 뜨면 자동 포커스를 뺏지 않고, 컴포저 숫자키도 오발동 0', async () => {
    const { PermissionCard } = await import('../../../02_Project/00_Source/renderer/src/features/notice')
    const onRespond = vi.fn()

    const { container } = render(
      <div>
        <textarea autoFocus data-testid="composer" />
        <PermissionCard pending={SAMPLE_PENDING} onRespond={onRespond} />
      </div>
    )

    const textarea = container.querySelector('[data-testid="composer"]') as HTMLTextAreaElement
    expect(document.activeElement).toBe(textarea)

    await act(async () => {
      fireEvent.keyDown(textarea, { key: '1' })
    })
    expect(onRespond).not.toHaveBeenCalled()
  })
})

describe('PermissionCard — 멀티 인스턴스 격리(포커스 패널만 반응)', () => {
  it('카드 2개 동시 마운트 — A 컨테이너에 dispatch한 keydown은 A만 반응(B 무영향)', async () => {
    const { PermissionCard } = await import('../../../02_Project/00_Source/renderer/src/features/notice')
    const onRespondA = vi.fn()
    const onRespondB = vi.fn()

    const wrapper = document.createElement('div')
    document.body.appendChild(wrapper)
    const slotA = document.createElement('div')
    const slotB = document.createElement('div')
    wrapper.appendChild(slotA)
    wrapper.appendChild(slotB)

    render(
      <PermissionCard pending={{ ...SAMPLE_PENDING, runId: 'run-a', requestId: 'req-a' }} onRespond={onRespondA} />,
      { container: slotA }
    )
    render(
      <PermissionCard pending={{ ...SAMPLE_PENDING, runId: 'run-b', requestId: 'req-b' }} onRespond={onRespondB} />,
      { container: slotB }
    )

    const cardA = slotA.querySelector('.perm-card') as HTMLElement
    const cardB = slotB.querySelector('.perm-card') as HTMLElement
    expect(cardA).toBeTruthy()
    expect(cardB).toBeTruthy()

    await act(async () => {
      fireEvent.keyDown(cardA, { key: '1' })
    })
    expect(onRespondA).toHaveBeenCalledWith('allow')
    expect(onRespondB).not.toHaveBeenCalled()

    onRespondA.mockClear()
    await act(async () => {
      fireEvent.keyDown(cardB, { key: '3' })
    })
    expect(onRespondB).toHaveBeenCalledWith('deny')
    expect(onRespondA).not.toHaveBeenCalled()

    document.body.removeChild(wrapper)
  })
})
