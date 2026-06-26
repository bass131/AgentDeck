// @vitest-environment jsdom
/**
 * composer-disabled.test.tsx — Composer disabled prop 단위 테스트 (TDD: 선 실패).
 *
 * 검증 항목:
 *   1. disabled=true → textarea disabled 속성 존재
 *   2. disabled=true → 전송 버튼 disabled
 *   3. disabled=true → 이미지 첨부 버튼 disabled
 *   4. disabled=true → 힌트 텍스트 렌더
 *   5. disabled=true + Enter → onSend 미호출
 *   6. disabled=false (기본) → textarea 활성, onSend 호출 가능
 *   7. disabled 미전달 → 기존 동작 100% 유지(하위호환)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Composer } from '../../src/renderer/src/components/01_conversation/Composer'

afterEach(() => cleanup())

function renderComposer(over: Partial<Parameters<typeof Composer>[0]> = {}) {
  const props = {
    value: '',
    onChange: vi.fn(),
    onSend: vi.fn(),
    onAbort: vi.fn(),
    isRunning: false,
    ...over,
  }
  return { props, ...render(<Composer {...props} />) }
}

describe('Composer — disabled=true (워크스페이스 미설정)', () => {
  it('textarea에 disabled 속성이 부여된다', () => {
    const { container } = renderComposer({ disabled: true })
    const ta = container.querySelector('textarea')
    expect(ta).toBeTruthy()
    expect((ta as HTMLTextAreaElement).disabled).toBe(true)
  })

  it('전송 버튼이 disabled 상태다', () => {
    const { container } = renderComposer({ disabled: true })
    // 전송 버튼: aria-label="전송" 또는 send 클래스
    const sendBtn = container.querySelector('button.send') as HTMLButtonElement | null
    expect(sendBtn).toBeTruthy()
    expect(sendBtn!.disabled).toBe(true)
  })

  it('이미지 첨부 버튼(cm-icon)이 disabled 상태다', () => {
    const { container } = renderComposer({ disabled: true })
    const attachBtn = container.querySelector('button.cm-icon') as HTMLButtonElement | null
    expect(attachBtn).toBeTruthy()
    expect(attachBtn!.disabled).toBe(true)
  })

  it('composer-disabled-hint 힌트 텍스트가 렌더된다', () => {
    const { container } = renderComposer({ disabled: true })
    const hint = container.querySelector('.composer-disabled-hint')
    expect(hint).toBeTruthy()
    // 텍스트 내용 포함 확인 (정확한 문자열은 구현에 맞게)
    expect(hint!.textContent).toMatch(/프로젝트 폴더/)
  })

  it('disabled=true 상태에서 textarea 포커스 후 Enter를 눌러도 onSend가 호출되지 않는다', () => {
    const { props, container } = renderComposer({ disabled: true, value: 'hi' })
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    // disabled textarea에는 keydown이 발생하지 않지만, onKeyDown 가드도 검증
    fireEvent.keyDown(ta, { key: 'Enter' })
    expect(props.onSend).not.toHaveBeenCalled()
  })

  it('disabled=true 시 placeholder가 비활성 안내 문구로 바뀐다', () => {
    const { container } = renderComposer({ disabled: true })
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(ta.placeholder).toMatch(/폴더/)
  })
})

describe('Composer — disabled=false 또는 미전달 (하위호환)', () => {
  it('disabled 미전달 → textarea 활성(not disabled)', () => {
    const { container } = renderComposer()
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(ta.disabled).toBe(false)
  })

  it('disabled=false → textarea 활성', () => {
    const { container } = renderComposer({ disabled: false })
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(ta.disabled).toBe(false)
  })

  it('disabled=false → 힌트 미렌더', () => {
    const { container } = renderComposer({ disabled: false })
    expect(container.querySelector('.composer-disabled-hint')).toBeNull()
  })

  it('disabled 미전달, value 있음 → 전송 버튼 클릭 → onSend 호출', () => {
    const { props } = renderComposer({ value: 'hello' })
    fireEvent.click(screen.getByLabelText('전송'))
    expect(props.onSend).toHaveBeenCalled()
  })

  it('disabled=false + Enter → onSend 호출', () => {
    const { props, container } = renderComposer({ disabled: false, value: 'hi' })
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.keyDown(ta, { key: 'Enter' })
    expect(props.onSend).toHaveBeenCalled()
  })
})
