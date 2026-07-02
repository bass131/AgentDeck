// @vitest-environment jsdom
/**
 * ComposerBar.test.tsx — 컴포저 하단 도구 모음 하위 컴포넌트 렌더 테스트.
 * Composer.tsx Phase 14 분해: 하단 도구 모음 JSX를 ComposerBar.tsx로 추출.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { ComposerBar } from '../../../02.Source/renderer/src/components/01_conversation/ComposerBar'
import { MODES, DEFAULT_MODEL, DEFAULT_EFFORT } from '../../../02.Source/renderer/src/lib/pickerOptions'

function mkProps(over: Partial<Parameters<typeof ComposerBar>[0]> = {}) {
  return {
    disabled: false,
    isRunning: false,
    value: '',
    attachedImages: [],
    model: DEFAULT_MODEL,
    setModel: vi.fn(),
    effort: DEFAULT_EFFORT,
    setEffort: vi.fn(),
    mode: MODES[0].id,
    setMode: vi.fn(),
    orchestration: false,
    setOrchestration: vi.fn(),
    replMode: true,
    setReplMode: vi.fn(),
    replLit: false,
    doSend: vi.fn(),
    onAbort: vi.fn(),
    onAttachButton: vi.fn(),
    ...over,
  }
}

describe('ComposerBar', () => {
  it('isRunning=false → 전송 버튼(.send) 렌더', () => {
    const { container } = render(<ComposerBar {...mkProps()} />)
    expect(container.querySelector('button.send')).toBeTruthy()
    expect(container.querySelector('button.send.stop')).toBeFalsy()
  })

  it('isRunning=true + value="" → 중단 버튼(.send.stop) 렌더', () => {
    const { container } = render(<ComposerBar {...mkProps({ isRunning: true })} />)
    expect(container.querySelector('button.send.stop')).toBeTruthy()
  })

  it('isRunning=true + value 있음 → 예약 버튼(.send.schedule) 렌더', () => {
    const { container } = render(<ComposerBar {...mkProps({ isRunning: true, value: 'hi' })} />)
    expect(container.querySelector('button.send.schedule')).toBeTruthy()
  })

  it('피커 3개(.pick) 렌더', () => {
    const { container } = render(<ComposerBar {...mkProps()} />)
    expect(container.querySelectorAll('.pick').length).toBe(3)
  })

  it('이미지 첨부 버튼(cm-icon) 렌더', () => {
    const { container } = render(<ComposerBar {...mkProps()} />)
    expect(container.querySelector('button.cm-icon')).toBeTruthy()
  })

  it('UltraCode 토글 버튼 렌더', () => {
    const { container } = render(<ComposerBar {...mkProps()} />)
    const btns = Array.from(container.querySelectorAll('.orch-toggle')).map((b) => b.textContent)
    expect(btns.some((t) => t?.includes('UltraCode'))).toBe(true)
  })

  // LR3-06(영호 조정 2026-07-03): REPL 상태 표시등 — .orch-toggle과 분리된 .repl-toggle,
  // 점등은 replLit prop만으로(ComposerBar는 순수 렌더러 — 판정은 상위 resolveReplLit,
  // 이제 replMode 자체와 동일 의미: ON=상시 점등).
  it('REPL 버튼 렌더 — .repl-toggle(.orch-toggle 아님), replLit=false면 .repl-lit 미부착', () => {
    const { container } = render(<ComposerBar {...mkProps({ replLit: false })} />)
    const replBtn = container.querySelector('.repl-toggle')
    expect(replBtn).toBeTruthy()
    expect(replBtn?.classList.contains('orch-toggle')).toBe(false)
    expect(replBtn?.classList.contains('repl-lit')).toBe(false)
    expect(replBtn?.textContent).toContain('REPL')
  })

  it('replLit=true → .repl-lit 부착(ComposerBar는 prop만 렌더 — replMode와의 정합은 상위 책임)', () => {
    const { container } = render(<ComposerBar {...mkProps({ replMode: true, replLit: true })} />)
    expect(container.querySelector('.repl-toggle.repl-lit')).toBeTruthy()
  })

  it('REPL 버튼 클릭 → setReplMode(!replMode) 호출(표시등 재정의 후에도 토글 기능 유지)', () => {
    const setReplMode = vi.fn()
    const { container } = render(<ComposerBar {...mkProps({ replMode: true, setReplMode })} />)
    const replBtn = Array.from(container.querySelectorAll('.repl-toggle')).find((b) => b.textContent?.includes('REPL'))
    fireEvent.click(replBtn as HTMLButtonElement)
    expect(setReplMode).toHaveBeenCalledWith(false)
  })

  it('전송 버튼 클릭 → doSend 호출', () => {
    const doSend = vi.fn()
    const { container } = render(<ComposerBar {...mkProps({ value: 'hi', doSend })} />)
    fireEvent.click(container.querySelector('button.send') as HTMLButtonElement)
    expect(doSend).toHaveBeenCalled()
  })

  it('중단 버튼 클릭 → onAbort 호출', () => {
    const onAbort = vi.fn()
    const { container } = render(
      <ComposerBar {...mkProps({ isRunning: true, onAbort })} />
    )
    fireEvent.click(container.querySelector('button.send.stop') as HTMLButtonElement)
    expect(onAbort).toHaveBeenCalled()
  })

  it('disabled=true → 전송 버튼 disabled', () => {
    const { container } = render(<ComposerBar {...mkProps({ disabled: true })} />)
    const btn = container.querySelector('button.send') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })
})
