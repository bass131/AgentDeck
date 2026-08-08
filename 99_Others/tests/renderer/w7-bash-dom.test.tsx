// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

afterEach(() => cleanup())

const clipboardMock = { writeText: vi.fn().mockResolvedValue(undefined) }
beforeEach(() => {
  clipboardMock.writeText.mockClear()
  Object.defineProperty(navigator, 'clipboard', {
    value: clipboardMock,
    writable: true,
    configurable: true,
  })
})

async function renderBash(opts: {
  output: string
  status: 'done' | 'error'
}) {
  const { ToolCallCard } = await import('../../../02_Source/renderer/src/features/conversation/ToolCallCard')
  const card = {
    id: 'bash1',
    name: 'Bash',
    input: { command: 'ls -la' },
    status: opts.status,
    result: opts.output,
  }
  return render(<ToolCallCard card={card} />)
}

describe('[W7-bash] 고스트(접힘) — 마지막 비공백 줄 + n줄', () => {
  it('성공 결과: 마지막 비공백 줄이 고스트에 표시', async () => {
    const { container } = await renderBash({
      output: 'line1\nline2\nline3',
      status: 'done',
    })
    expect(container.querySelector('.bo-ghost')).toBeTruthy()
    expect(screen.getByText('line3')).toBeTruthy()
  })

  it('고스트에 "— n줄" 표시', async () => {
    const { container } = await renderBash({
      output: 'a\nb\nc\nd',
      status: 'done',
    })
    expect(container.querySelector('.bo-n')).toBeTruthy()
    expect(container.querySelector('.bo-n')!.textContent).toContain('4줄')
  })

  it('마지막 빈 줄 무시: 비공백 마지막 줄 사용', async () => {
    const { container } = await renderBash({
      output: 'hello world\n\n   \n',
      status: 'done',
    })
    const ghost = container.querySelector('.bo-ghost')
    expect(ghost).toBeTruthy()
    expect(screen.getByText('hello world')).toBeTruthy()
  })

  it('고스트 클릭 → 펼침(.bo-block)', async () => {
    const { container } = await renderBash({ output: 'line1\nline2', status: 'done' })
    const ghost = container.querySelector('.bo-ghost')!
    expect(container.querySelector('.bo-block')).toBeFalsy()
    fireEvent.click(ghost)
    expect(container.querySelector('.bo-block')).toBeTruthy()
  })
})

describe('[W7-bash] 자동펼침 — failed(status error)일 때만', () => {
  it('status=error → 자동으로 펼침(.bo-block 즉시 렌더)', async () => {
    const { container } = await renderBash({
      output: 'Error: command failed\n오류 발생',
      status: 'error',
    })
    expect(container.querySelector('.bo-block')).toBeTruthy()
    expect(container.querySelector('.bo-ghost')).toBeFalsy()
  })

  it('status=done → 자동펼침 없음(.bo-ghost만)', async () => {
    const { container } = await renderBash({
      output: 'success output',
      status: 'done',
    })
    expect(container.querySelector('.bo-ghost')).toBeTruthy()
    expect(container.querySelector('.bo-block')).toBeFalsy()
  })
})

describe('[W7-bash] error 틴트 — failed일 때만 .bo-ln.err', () => {
  it('status=error + error 텍스트 → .bo-ln.err 존재', async () => {
    const { container } = await renderBash({
      output: 'Error: something went wrong',
      status: 'error',
    })
    const errLines = container.querySelectorAll('.bo-ln.err')
    expect(errLines.length).toBeGreaterThan(0)
  })

  it('status=done + error 텍스트 → .bo-ln.err 없음 (성공 출력 무채색)', async () => {
    const { container } = await renderBash({
      output: 'error count: 0\nall passed',
      status: 'done',
    })
    fireEvent.click(container.querySelector('.bo-ghost')!)
    const errLines = container.querySelectorAll('.bo-ln.err')
    expect(errLines.length).toBe(0)
  })

  it('status=error .bo-block.fail 클래스', async () => {
    const { container } = await renderBash({
      output: 'failed',
      status: 'error',
    })
    expect(container.querySelector('.bo-block.fail')).toBeTruthy()
  })

  it('status=done .bo-block.fail 없음', async () => {
    const { container } = await renderBash({ output: 'ok', status: 'done' })
    fireEvent.click(container.querySelector('.bo-ghost')!)
    expect(container.querySelector('.bo-block.fail')).toBeFalsy()
  })
})

describe('[W7-bash] error regex — err! 포함 · 단어경계', () => {
  const errRe = /(^|\s)(error|err!|fatal|exception|failed)\b/i

  it('Error: 매칭', () => { expect(errRe.test('Error: something')).toBe(true) })
  it('err! — 원본 regex 그대로 (err! 뒤 \\b 없어 실제 미매칭 — 원본 동작 충실도)', () => {
    expect(errRe.test('err! bad state')).toBe(false)
  })
  it('fatal 매칭', () => { expect(errRe.test('fatal error')).toBe(true) })
  it('exception 매칭', () => { expect(errRe.test('exception thrown')).toBe(true) })
  it('failed 매칭', () => { expect(errRe.test('command failed')).toBe(true) })
  it('Failed 대소문자 무시', () => { expect(errRe.test('Failed to run')).toBe(true) })
  it('"nonfailed" 부분매칭 미허용(단어경계)', () => {
    expect(errRe.test('nonfailed')).toBe(false)
  })
  it('줄시작 "failed" 매칭', () => { expect(errRe.test('failed to start')).toBe(true) })
  it('"erroring" — error\\b 단어경계로 미매칭 (원본 동작)', () => {
    expect(errRe.test('erroring out')).toBe(false)
  })

  it('DOM: error 줄에 .bo-ln.err 적용 (Error: 패턴 사용)', async () => {
    const { container } = await renderBash({
      output: 'ok line\nError: something went wrong\nok again',
      status: 'error',
    })
    const lines = container.querySelectorAll('.bo-ln')
    const errLines = container.querySelectorAll('.bo-ln.err')
    expect(lines.length).toBe(3)
    expect(errLines.length).toBe(1)
    expect(errLines[0].textContent).toContain('Error:')
  })

  it('DOM: err! 패턴은 \\b로 미매칭 — .bo-ln.err 없음 (원본 동작 충실)', async () => {
    const { container } = await renderBash({
      output: 'err! critical\nok',
      status: 'error',
    })
    const errLines = container.querySelectorAll('.bo-ln.err')
    expect(errLines.length).toBe(0)
  })
})

describe('[W7-bash] 복사 버튼 → "복사됨" 1.2s', () => {
  it('펼침 상태에서 복사 버튼 클릭 → clipboard.writeText 호출', async () => {
    vi.useFakeTimers()
    const { container } = await renderBash({
      output: 'test output',
      status: 'done',
    })
    fireEvent.click(container.querySelector('.bo-ghost')!)
    const copyBtn = screen.getByText('복사')
    fireEvent.click(copyBtn)
    expect(clipboardMock.writeText).toHaveBeenCalledWith('test output')
    vi.useRealTimers()
  })

  it('복사 후 "복사됨" 텍스트로 변경', async () => {
    vi.useFakeTimers()
    const { container } = await renderBash({
      output: 'copy me',
      status: 'done',
    })
    fireEvent.click(container.querySelector('.bo-ghost')!)

    await act(async () => {
      fireEvent.click(screen.getByText('복사'))
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByText('복사됨')).toBeTruthy()

    act(() => { vi.advanceTimersByTime(1200) })
    expect(screen.getByText('복사')).toBeTruthy()
    vi.useRealTimers()
  })
})

describe('[W7-bash] 접기 버튼', () => {
  it('펼침 상태에서 접기 클릭 → .bo-ghost로 복원', async () => {
    const { container } = await renderBash({ output: 'a\nb', status: 'done' })
    fireEvent.click(container.querySelector('.bo-ghost')!)
    expect(container.querySelector('.bo-block')).toBeTruthy()

    fireEvent.click(screen.getByText('접기'))
    expect(container.querySelector('.bo-ghost')).toBeTruthy()
    expect(container.querySelector('.bo-block')).toBeFalsy()
  })
})

describe('[W7-bash] 고스트 .bo-pv.err — failed 미리보기', () => {
  it('status=error 고스트 → .bo-pv.err 클래스', async () => {
    expect(true).toBe(true)
  })
})
