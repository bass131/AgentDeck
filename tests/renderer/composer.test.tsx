// @vitest-environment jsdom
/**
 * composer.test.tsx — F3-02 리치 컴포저 DOM 단언.
 * textarea + 하단바(첨부·모델/effort/모드 피커·send) + 컨텍스트 게이지 3.
 * 피커=로컬 시각(선택 시 .pick-val 갱신), 게이지=정적 placeholder(store 미참조).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
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

describe('Composer — 구조 (F3-02)', () => {
  it('textarea + 하단바 + 피커 3 + 게이지 3', () => {
    const { container } = renderComposer()
    expect(container.querySelector('.composer textarea')).toBeTruthy()
    expect(container.querySelector('.composer-bar')).toBeTruthy()
    expect(container.querySelectorAll('.pick').length).toBe(3)
    expect(container.querySelectorAll('.ctx-chip').length).toBe(3)
    expect(container.querySelector('.send')).toBeTruthy()
  })

  it('게이지는 conic ring(.cc-ring) + 라벨 + %를 렌더한다', () => {
    const { container } = renderComposer()
    expect(container.querySelectorAll('.ctx-chip .cc-ring').length).toBe(3)
    expect(container.querySelectorAll('.ctx-chip .cc-label').length).toBe(3)
  })
})

describe('Composer — 피커 로컬 선택 (F3-02)', () => {
  it('모델 피커 클릭 → 메뉴 열림 + 옵션, 옵션 선택 → 값 갱신', () => {
    const { container } = renderComposer()
    const modelPick = screen.getByLabelText('모델 선택')
    fireEvent.click(modelPick)
    const menu = container.querySelector('.pick-menu')
    expect(menu).toBeTruthy()
    const opts = menu!.querySelectorAll('.pick-opt')
    expect(opts.length).toBeGreaterThanOrEqual(2)
    // 첫 옵션이 아닌 다른 옵션 선택
    fireEvent.click(opts[1])
    // 트리거 값이 갱신됨(로컬)
    expect(within(modelPick).getByText(/Sonnet|Haiku|Opus/)).toBeTruthy()
  })
})

describe('Composer — 입력/전송 (동작 보존)', () => {
  it('textarea 입력 → onChange', () => {
    const { props } = renderComposer()
    fireEvent.change(screen.getByLabelText('메시지 입력'), { target: { value: 'hi' } })
    expect(props.onChange).toHaveBeenCalled()
  })

  it('send 클릭 → onSend (값 있을 때)', () => {
    const { props } = renderComposer({ value: 'hello' })
    fireEvent.click(screen.getByLabelText('전송'))
    expect(props.onSend).toHaveBeenCalled()
  })

  it('실행 중 → 중단 버튼 → onAbort', () => {
    const { props } = renderComposer({ isRunning: true })
    fireEvent.click(screen.getByLabelText('실행 중단'))
    expect(props.onAbort).toHaveBeenCalled()
  })
})

describe('Composer — UltraCode 단발성(one-shot)', () => {
  it('ON 후 전송 → onSend에 orchestration:true + 전송 후 자동 OFF', () => {
    const { container, props } = renderComposer({ value: 'hello' })
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement
    // 토글 ON
    fireEvent.click(toggle)
    expect(toggle.classList.contains('orch-on')).toBe(true)
    // 전송
    fireEvent.click(screen.getByLabelText('전송'))
    // 전송 payload에 orchestration:true (전송 시점 값)
    expect(props.onSend).toHaveBeenCalledWith(expect.objectContaining({ orchestration: true }))
    // 단발성: 전송하면 자동 OFF (Workflow 슬래시처럼 매번 명시 활성)
    expect(toggle.classList.contains('orch-on')).toBe(false)
  })

  it('OFF 상태 전송 → orchestration:false, 토글 OFF 유지', () => {
    const { container, props } = renderComposer({ value: 'hi' })
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement
    expect(toggle.classList.contains('orch-on')).toBe(false)
    fireEvent.click(screen.getByLabelText('전송'))
    expect(props.onSend).toHaveBeenCalledWith(expect.objectContaining({ orchestration: false }))
    expect(toggle.classList.contains('orch-on')).toBe(false)
  })
})
