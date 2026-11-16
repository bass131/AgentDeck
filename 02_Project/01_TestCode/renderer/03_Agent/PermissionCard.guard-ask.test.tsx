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

  it('아주 긴 명령은 접힌 채로 시작하고 펼칠 수 있다 — 접혀도 전문은 DOM에 남는다', async () => {
    const { PermissionCard } = await import('@renderer/10_Engine')
    const { container } = render(<PermissionCard pending={guardPending(VERY_LONG_CMD)} onRespond={vi.fn()} />)
    const toggle = container.querySelector('[data-cmd-toggle]') as HTMLElement
    expect(toggle).toBeTruthy()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    const cmd = container.querySelector('[data-cmd-full]') as HTMLElement
    expect(cmd.textContent).toContain(VERY_LONG_CMD)
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect((container.querySelector('[data-cmd-full]') as HTMLElement).textContent).toContain(VERY_LONG_CMD)
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
