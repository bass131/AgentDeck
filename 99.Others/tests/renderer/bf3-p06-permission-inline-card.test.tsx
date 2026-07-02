// @vitest-environment jsdom
/**
 * bf3-p06-permission-inline-card.test.tsx — PermissionCard 컴포넌트 단위 테스트
 * (BF3 Phase 06, ADR-030 — 권한 요청 인라인 카드 전환).
 *
 * 검증 범위:
 *   (1) pending=null → null 렌더(.perm-card 없음)
 *   (2) pending 있음 → .perm-card[role=group][aria-label] 렌더, role="dialog" 아님(모달 아님)
 *   (3) toolName/summary 텍스트 렌더
 *   (4) 3버튼(allow/allow_always/deny) 클릭 → onRespond(choice) 호출
 *   (5) q-num 배경 인라인 style 예외(F8 avatarColor 예외와 동일 근거)
 *   (6) 카드 컨테이너 keydown: 숫자 1·2·3 → onRespond, Esc → onRespond('deny')
 *   (7) 컴포저 타이핑 안전성: 카드 밖 textarea에 숫자키 입력 → onRespond 미호출
 *       (카드가 window/document 전역 리스너가 아니라 컨테이너 스코프 리스너이므로 구조적으로 보장)
 *   (8) 멀티 인스턴스 격리: 카드 2개 동시 마운트 시, 한쪽 컨테이너에 dispatch한 keydown은
 *       그 카드의 onRespond만 호출(다른 카드 인스턴스는 무영향) — "포커스 패널만 반응" 계약
 */
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
    const { PermissionCard } = await import('../../../02.Source/renderer/src/components/07_notice/PermissionCard')
    const { container } = render(<PermissionCard pending={null} onRespond={vi.fn()} />)
    expect(container.querySelector('.perm-card')).toBeFalsy()
  })
})

describe('PermissionCard — pending 있음: 렌더 계약', () => {
  it('.perm-card[role=group][aria-label] 렌더, role="dialog" 아님', async () => {
    const { PermissionCard } = await import('../../../02.Source/renderer/src/components/07_notice/PermissionCard')
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={vi.fn()} />)
    const card = container.querySelector('.perm-card')
    expect(card).toBeTruthy()
    expect(card?.getAttribute('role')).toBe('group')
    expect(card?.hasAttribute('aria-label')).toBe(true)
    expect(container.querySelector('.perm-card[role="dialog"]')).toBeFalsy()
  })

  // reviewer 🟡 봉합 #3: aria-live="polite" — 카드 등장을 스크린리더에 통지.
  it('카드 루트에 aria-live="polite" 부여', async () => {
    const { PermissionCard } = await import('../../../02.Source/renderer/src/components/07_notice/PermissionCard')
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={vi.fn()} />)
    expect(container.querySelector('.perm-card')?.getAttribute('aria-live')).toBe('polite')
  })

  // reviewer 🟡 봉합 #1: "항상 허용"의 세션-스코프 설명 복원(informed consent).
  it('allow_always 버튼 title/aria-label에 세션-스코프 힌트 포함', async () => {
    const { PermissionCard } = await import('../../../02.Source/renderer/src/components/07_notice/PermissionCard')
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={vi.fn()} />)
    const btn = container.querySelector('.perm-card-opt[data-perm-choice="allow_always"]') as HTMLElement
    expect(btn.getAttribute('title')).toContain('세션')
    expect(btn.getAttribute('aria-label')).toContain('세션')
  })

  it('각 버튼에 라벨 아래 보조 캡션(.perm-card-opt-desc)이 시각적으로도 렌더됨', async () => {
    const { PermissionCard } = await import('../../../02.Source/renderer/src/components/07_notice/PermissionCard')
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={vi.fn()} />)
    const descs = container.querySelectorAll('.perm-card-opt-desc')
    expect(descs.length).toBe(3)
    expect(descs[1].textContent).toContain('세션')
  })

  it('toolName + summary 텍스트 렌더', async () => {
    const { PermissionCard } = await import('../../../02.Source/renderer/src/components/07_notice/PermissionCard')
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={vi.fn()} />)
    expect(container.textContent).toContain('Bash')
    expect(container.textContent).toContain('rm -rf /tmp/test')
  })

  it('perm-card-opt 3개 렌더(allow/allow_always/deny 순서)', async () => {
    const { PermissionCard } = await import('../../../02.Source/renderer/src/components/07_notice/PermissionCard')
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={vi.fn()} />)
    const opts = container.querySelectorAll('.perm-card-opt')
    expect(opts.length).toBe(3)
    expect(opts[0].getAttribute('data-perm-choice')).toBe('allow')
    expect(opts[1].getAttribute('data-perm-choice')).toBe('allow_always')
    expect(opts[2].getAttribute('data-perm-choice')).toBe('deny')
  })

  it('q-num 배경이 인라인 style로 설정됨(q-num 예외 허용)', async () => {
    const { PermissionCard } = await import('../../../02.Source/renderer/src/components/07_notice/PermissionCard')
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={vi.fn()} />)
    const numEl = container.querySelector('.q-num') as HTMLElement
    expect(numEl.style.background).toBeTruthy()
  })
})

describe('PermissionCard — 클릭 → onRespond', () => {
  it('allow 버튼 클릭 → onRespond("allow")', async () => {
    const { PermissionCard } = await import('../../../02.Source/renderer/src/components/07_notice/PermissionCard')
    const onRespond = vi.fn()
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={onRespond} />)
    const opts = container.querySelectorAll('.perm-card-opt')
    fireEvent.click(opts[0])
    expect(onRespond).toHaveBeenCalledWith('allow')
  })

  it('allow_always 버튼 클릭 → onRespond("allow_always")', async () => {
    const { PermissionCard } = await import('../../../02.Source/renderer/src/components/07_notice/PermissionCard')
    const onRespond = vi.fn()
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={onRespond} />)
    const opts = container.querySelectorAll('.perm-card-opt')
    fireEvent.click(opts[1])
    expect(onRespond).toHaveBeenCalledWith('allow_always')
  })

  it('deny 버튼 클릭 → onRespond("deny")', async () => {
    const { PermissionCard } = await import('../../../02.Source/renderer/src/components/07_notice/PermissionCard')
    const onRespond = vi.fn()
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={onRespond} />)
    const opts = container.querySelectorAll('.perm-card-opt')
    fireEvent.click(opts[2])
    expect(onRespond).toHaveBeenCalledWith('deny')
  })
})

describe('PermissionCard — 카드 컨테이너 keydown(전역 리스너 아님)', () => {
  it('카드 컨테이너에 숫자 1 → onRespond("allow")', async () => {
    const { PermissionCard } = await import('../../../02.Source/renderer/src/components/07_notice/PermissionCard')
    const onRespond = vi.fn()
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={onRespond} />)
    const card = container.querySelector('.perm-card') as HTMLElement
    await act(async () => {
      fireEvent.keyDown(card, { key: '1' })
    })
    expect(onRespond).toHaveBeenCalledWith('allow')
  })

  it('카드 컨테이너에 숫자 2 → onRespond("allow_always")', async () => {
    const { PermissionCard } = await import('../../../02.Source/renderer/src/components/07_notice/PermissionCard')
    const onRespond = vi.fn()
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={onRespond} />)
    const card = container.querySelector('.perm-card') as HTMLElement
    await act(async () => {
      fireEvent.keyDown(card, { key: '2' })
    })
    expect(onRespond).toHaveBeenCalledWith('allow_always')
  })

  it('카드 컨테이너에 숫자 3 → onRespond("deny")', async () => {
    const { PermissionCard } = await import('../../../02.Source/renderer/src/components/07_notice/PermissionCard')
    const onRespond = vi.fn()
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={onRespond} />)
    const card = container.querySelector('.perm-card') as HTMLElement
    await act(async () => {
      fireEvent.keyDown(card, { key: '3' })
    })
    expect(onRespond).toHaveBeenCalledWith('deny')
  })

  it('카드 컨테이너에 Esc → onRespond("deny")', async () => {
    const { PermissionCard } = await import('../../../02.Source/renderer/src/components/07_notice/PermissionCard')
    const onRespond = vi.fn()
    const { container } = render(<PermissionCard pending={SAMPLE_PENDING} onRespond={onRespond} />)
    const card = container.querySelector('.perm-card') as HTMLElement
    await act(async () => {
      fireEvent.keyDown(card, { key: 'Escape' })
    })
    expect(onRespond).toHaveBeenCalledWith('deny')
  })

  it('마운트 시 다른 입력 미포커스면 카드가 자동 포커스된다(클릭 없이 숫자키 가능)', async () => {
    const { PermissionCard } = await import('../../../02.Source/renderer/src/components/07_notice/PermissionCard')
    const { container } = await act(async () =>
      render(<PermissionCard pending={SAMPLE_PENDING} onRespond={vi.fn()} />)
    )
    const card = container.querySelector('.perm-card') as HTMLElement
    expect(document.activeElement).toBe(card)
  })
})

describe('PermissionCard — 컴포저 타이핑 안전성(오발동 0)', () => {
  // 구현 메모: 컴포저가 "이미 포커스를 쥔 채로" 카드가 나타나는 상황(22d 예약 큐 타이핑
  // 도중 권한 요청 도착)을 재현하려면 textarea와 카드를 "같은 커밋"에서 렌더해야 한다 —
  // React는 (커밋 단계에서 처리되는) autoFocus를 카드의 useEffect(패시브 이펙트, 커밋 이후)
  // 보다 먼저 적용하므로, 카드의 마운트 이펙트가 실행되는 시점엔 이미 textarea가 활성
  // 요소다. (별도 render() 호출로 나눠 중간에 수동 .focus()를 끼워 넣으면 테스트 렌더러의
  // 재커밋 타이밍에 따라 activeElement가 일시적으로 body로 리셋되는 경우가 있어 신뢰 불가
  // — 실 앱 동작과 무관한 테스트 아티팩트라 이 패턴은 피한다.)
  it('컴포저(이미 포커스)가 있는 채로 카드가 뜨면 자동 포커스를 뺏지 않고, 컴포저 숫자키도 오발동 0', async () => {
    const { PermissionCard } = await import('../../../02.Source/renderer/src/components/07_notice/PermissionCard')
    const onRespond = vi.fn()

    const { container } = render(
      <div>
        {/* autoFocus는 테스트 전용: "이미 타이핑 중" 재현(위 구현 메모 참조) */}
        <textarea autoFocus data-testid="composer" />
        <PermissionCard pending={SAMPLE_PENDING} onRespond={onRespond} />
      </div>
    )

    const textarea = container.querySelector('[data-testid="composer"]') as HTMLTextAreaElement
    // 카드 마운트 이펙트가 돌고 난 뒤에도 컴포저가 여전히 포커스를 쥐고 있어야 한다
    // (자동 포커스 가드 — ADR-030 "모달의 강제 집중력 상실" 완화책).
    expect(document.activeElement).toBe(textarea)

    await act(async () => {
      fireEvent.keyDown(textarea, { key: '1' })
    })
    expect(onRespond).not.toHaveBeenCalled()
  })
})

describe('PermissionCard — 멀티 인스턴스 격리(포커스 패널만 반응)', () => {
  it('카드 2개 동시 마운트 — A 컨테이너에 dispatch한 keydown은 A만 반응(B 무영향)', async () => {
    const { PermissionCard } = await import('../../../02.Source/renderer/src/components/07_notice/PermissionCard')
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
