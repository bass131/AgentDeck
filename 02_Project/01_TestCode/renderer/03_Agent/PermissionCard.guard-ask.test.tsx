// M06 G3 — 가드가 물은 호출의 승인 카드: 명령 전문, 가드 사유, 「항상 허용」 없음.
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, act, fireEvent } from '@testing-library/react'

afterEach(() => cleanup())

const GUARD_REASON =
  '비가역 작업 — master가 보이는 git push (master 진입 시도). 승인하면 실행되고, 거부하면 실행되지 않습니다.'
const LONG_CMD =
  'git -c core.quotepath=false -c color.ui=never -c advice.pushUpdateRejected=false push --verbose --no-progress origin HEAD:master'
const VERY_LONG_CMD = `git ${'-c color.ui=never '.repeat(20)}push origin HEAD:master`

function guardPending(command: string) {
  return {
    runId: 'run-g3',
    requestId: 'perm-1',
    toolName: 'Bash',
    summary: `명령 실행: ${command}`,
    askReason: GUARD_REASON,
  }
}

describe('PermissionCard — 가드 질문', () => {
  it('명령 전문과 가드 사유가 카드 글자에 보인다', async () => {
    const { PermissionCard } = await import('@renderer/10_Engine')
    const { container } = render(<PermissionCard pending={guardPending(LONG_CMD)} onRespond={vi.fn()} />)
    const text = container.textContent ?? ''
    expect(text).toContain(LONG_CMD)
    expect(text).toContain('push')
    expect(text).toContain('HEAD:master')
    expect(container.querySelector('[data-ask-reason]')?.textContent).toContain(GUARD_REASON)
  })

  it('「항상 허용」 버튼이 없고 허용·거부 둘만 있다', async () => {
    const { PermissionCard } = await import('@renderer/10_Engine')
    const { container } = render(<PermissionCard pending={guardPending(LONG_CMD)} onRespond={vi.fn()} />)
    expect(container.querySelector('[data-perm-choice="allow_always"]')).toBeNull()
    expect(container.textContent).not.toContain('항상 허용')
    const keys = Array.from(container.querySelectorAll('.perm-card-opt')).map((b) => b.getAttribute('data-perm-choice'))
    expect(keys).toEqual(['allow', 'deny'])
  })

  it('숫자 키 2는 거부다(항상 허용이 빠진 자리)', async () => {
    const { PermissionCard } = await import('@renderer/10_Engine')
    const onRespond = vi.fn()
    const { container } = render(<PermissionCard pending={guardPending(LONG_CMD)} onRespond={onRespond} />)
    const card = container.querySelector('.perm-card') as HTMLElement
    await act(async () => {
      fireEvent.keyDown(card, { key: '2' })
    })
    expect(onRespond).toHaveBeenCalledWith('deny')
    expect(onRespond).not.toHaveBeenCalledWith('allow_always')
  })

  it('보통 길이 명령에는 접기 토글이 없다', async () => {
    const { PermissionCard } = await import('@renderer/10_Engine')
    const { container } = render(<PermissionCard pending={guardPending(LONG_CMD)} onRespond={vi.fn()} />)
    expect(container.querySelector('[data-cmd-toggle]')).toBeNull()
  })

  it('아주 긴 명령은 접힌 채로 시작하고 펼칠 수 있다 — 접힘 클래스가 실제로 바뀌고, 접혀도 전문은 DOM에 남는다', async () => {
    const { PermissionCard } = await import('@renderer/10_Engine')
    const { container } = render(<PermissionCard pending={guardPending(VERY_LONG_CMD)} onRespond={vi.fn()} />)
    const toggle = container.querySelector('[data-cmd-toggle]') as HTMLElement
    expect(toggle).toBeTruthy()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    const cmd = container.querySelector('[data-cmd-full]') as HTMLElement
    expect(cmd.classList.contains('collapsed')).toBe(true)
    expect(cmd.textContent).toContain(VERY_LONG_CMD)
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const opened = container.querySelector('[data-cmd-full]') as HTMLElement
    expect(opened.classList.contains('collapsed')).toBe(false)
    expect(opened.textContent).toContain(VERY_LONG_CMD)
    fireEvent.click(toggle)
    expect((container.querySelector('[data-cmd-full]') as HTMLElement).classList.contains('collapsed')).toBe(true)
  })

  it('숫자 키 3은 아무것도 하지 않는다(선택지가 둘뿐)', async () => {
    const { PermissionCard } = await import('@renderer/10_Engine')
    const onRespond = vi.fn()
    const { container } = render(<PermissionCard pending={guardPending(LONG_CMD)} onRespond={onRespond} />)
    const card = container.querySelector('.perm-card') as HTMLElement
    await act(async () => {
      fireEvent.keyDown(card, { key: '3' })
    })
    expect(onRespond).not.toHaveBeenCalled()
  })
})

describe('PermissionCard — 접힌 긴 명령은 펼치기 전에 허용할 수 없다', () => {
  it('접힌 동안 허용 버튼이 비활성이고 펼치라는 안내가 보인다. 클릭해도 응답하지 않는다', async () => {
    const { PermissionCard } = await import('@renderer/10_Engine')
    const onRespond = vi.fn()
    const { container } = render(<PermissionCard pending={guardPending(VERY_LONG_CMD)} onRespond={onRespond} />)
    const allow = container.querySelector('[data-perm-choice="allow"]') as HTMLButtonElement
    expect(allow.disabled).toBe(true)
    expect(container.querySelector('[data-allow-locked]')?.textContent).toContain('펼친 뒤')
    fireEvent.click(allow)
    expect(onRespond).not.toHaveBeenCalled()
    const deny = container.querySelector('[data-perm-choice="deny"]') as HTMLButtonElement
    expect(deny.disabled).toBe(false)
  })

  it('접힌 동안 숫자 키 1은 아무것도 하지 않고, 2(거부)와 Esc는 그대로다', async () => {
    const { PermissionCard } = await import('@renderer/10_Engine')
    const onRespond = vi.fn()
    const { container } = render(<PermissionCard pending={guardPending(VERY_LONG_CMD)} onRespond={onRespond} />)
    const card = container.querySelector('.perm-card') as HTMLElement
    await act(async () => {
      fireEvent.keyDown(card, { key: '1' })
    })
    expect(onRespond).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.keyDown(card, { key: '2' })
    })
    expect(onRespond).toHaveBeenLastCalledWith('deny')
    await act(async () => {
      fireEvent.keyDown(card, { key: 'Escape' })
    })
    expect(onRespond).toHaveBeenCalledTimes(2)
    expect(onRespond).not.toHaveBeenCalledWith('allow')
  })

  it('200자 이하라도 다섯 줄 명령은 줄 수로 접히고 허용이 잠긴다', async () => {
    const { PermissionCard } = await import('@renderer/10_Engine')
    const multi = ['git status --short', 'git log -1 --oneline', 'git branch --show-current', 'git fetch --dry-run', 'git push origin HEAD:master'].join('\n')
    expect(`명령 실행: ${multi}`.length).toBeLessThanOrEqual(200)
    const { container } = render(<PermissionCard pending={guardPending(multi)} onRespond={vi.fn()} />)
    expect((container.querySelector('[data-cmd-full]') as HTMLElement).classList.contains('collapsed')).toBe(true)
    expect((container.querySelector('[data-perm-choice="allow"]') as HTMLButtonElement).disabled).toBe(true)
  })

  it('펼친 뒤에는 허용 버튼과 숫자 키 1이 다시 허용을 낸다', async () => {
    const { PermissionCard } = await import('@renderer/10_Engine')
    const onRespond = vi.fn()
    const { container } = render(<PermissionCard pending={guardPending(VERY_LONG_CMD)} onRespond={onRespond} />)
    fireEvent.click(container.querySelector('[data-cmd-toggle]') as HTMLElement)
    const allow = container.querySelector('[data-perm-choice="allow"]') as HTMLButtonElement
    expect(allow.disabled).toBe(false)
    expect(container.querySelector('[data-allow-locked]')).toBeNull()
    const card = container.querySelector('.perm-card') as HTMLElement
    await act(async () => {
      fireEvent.keyDown(card, { key: '1' })
    })
    expect(onRespond).toHaveBeenLastCalledWith('allow')
    fireEvent.click(allow)
    expect(onRespond).toHaveBeenCalledTimes(2)
  })

  // M11 G2 — M06 Backlog 12. 펼친 전문도 높이 상한(320px) 아래에서 스크롤된다 — 꼬리를 보기 전에는 허용을 잠근다.
  it('펼친 전문이 상자보다 길면 끝까지 스크롤한 뒤에야 허용이 풀린다', async () => {
    const { PermissionCard } = await import('@renderer/10_Engine')
    const onRespond = vi.fn()
    const { container } = render(<PermissionCard pending={guardPending(VERY_LONG_CMD)} onRespond={onRespond} />)
    const box = container.querySelector('[data-cmd-full]') as HTMLElement
    Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(box, 'clientHeight', { configurable: true, value: 320 })
    fireEvent.click(container.querySelector('[data-cmd-toggle]') as HTMLElement)
    const allow = container.querySelector('[data-perm-choice="allow"]') as HTMLButtonElement
    expect(allow.disabled).toBe(true)
    const card = container.querySelector('.perm-card') as HTMLElement
    await act(async () => {
      fireEvent.keyDown(card, { key: '1' })
    })
    expect(onRespond).not.toHaveBeenCalled()
    box.scrollTop = 680
    fireEvent.scroll(box)
    expect(allow.disabled).toBe(false)
  })

  it('뒤에 줄 선 요청이 있으면 그 수를 보인다', async () => {
    const { PermissionCard } = await import('@renderer/10_Engine')
    const pending = { ...guardPending(LONG_CMD), behind: [{ ...guardPending('ls'), requestId: 'perm-2' }] }
    const { container } = render(<PermissionCard pending={pending} onRespond={vi.fn()} />)
    expect(container.querySelector('[data-perm-behind]')?.textContent).toContain('1')
  })
})

describe('PermissionCard — 사유 없이 올라온 확인 요청 (fail-closed 경로)', () => {
  function escalatedNoReason(command: string) {
    return { runId: 'r', requestId: 'p', toolName: 'Bash', summary: `명령 실행: ${command}`, escalated: true as const }
  }

  it('사유가 없어도 「항상 허용」이 없고, 중립 라벨과 대체 문구가 보인다', async () => {
    const { PermissionCard } = await import('@renderer/10_Engine')
    const { container } = render(<PermissionCard pending={escalatedNoReason('gh release --help')} onRespond={vi.fn()} />)
    expect(container.querySelector('[data-perm-choice="allow_always"]')).toBeNull()
    const reason = container.querySelector('[data-ask-reason]') as HTMLElement
    expect(reason.textContent).toContain('확인이 필요한 이유')
    expect(reason.textContent).toContain('사유를 보내지 않았')
    expect(reason.textContent).not.toContain('가드 사유')
    expect(container.querySelector('[data-cmd-full]')?.textContent).toContain('gh release --help')
  })

  it('escalated 표지가 있고 사유가 있으면 둘 다 반영된다 — 「항상 허용」 없음, 사유 원문 표시', async () => {
    const { PermissionCard } = await import('@renderer/10_Engine')
    const pending = { ...guardPending(LONG_CMD), escalated: true as const }
    const { container } = render(<PermissionCard pending={pending} onRespond={vi.fn()} />)
    expect(container.querySelector('[data-perm-choice="allow_always"]')).toBeNull()
    expect(container.querySelector('[data-ask-reason]')?.textContent).toContain(GUARD_REASON)
    expect(container.querySelector('[data-guard-ask]')).toBeTruthy()
  })

  it('사유가 있으면 같은 중립 라벨 아래 사유 원문을 보인다 — 「가드 사유」라고 부르지 않는다', async () => {
    const { PermissionCard } = await import('@renderer/10_Engine')
    const { container } = render(<PermissionCard pending={guardPending(LONG_CMD)} onRespond={vi.fn()} />)
    const reason = container.querySelector('[data-ask-reason]') as HTMLElement
    expect(reason.textContent).toContain('확인이 필요한 이유')
    expect(reason.textContent).toContain(GUARD_REASON)
    expect(reason.textContent).not.toContain('가드 사유')
  })
})

describe('PermissionCard — 일반 질의는 그대로', () => {
  it('askReason 없는 카드는 「항상 허용」을 포함한 세 선택지를 낸다', async () => {
    const { PermissionCard } = await import('@renderer/10_Engine')
    const pending = { runId: 'r', requestId: 'p', toolName: 'Bash', summary: '명령 실행: ls' }
    const { container } = render(<PermissionCard pending={pending} onRespond={vi.fn()} />)
    expect(container.querySelector('[data-perm-choice="allow_always"]')).toBeTruthy()
    expect(container.querySelector('[data-ask-reason]')).toBeNull()
  })
})
