// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Composer } from '../../../02_Project/00_Source/renderer/src/features/conversation/Composer'
import { MODELS } from '../../../02_Project/00_Source/renderer/src/lib/pickerOptions'
import { __resetUltracodeToggleForTests } from '../../../02_Project/00_Source/renderer/src/store/ultracodeToggle'

beforeEach(() => {
  __resetUltracodeToggleForTests()
})
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
  it('모델 피커 클릭 → 메뉴 열림 + 옵션, 옵션 선택 → 트리거가 그 옵션 라벨로 갱신', () => {
    const { container } = renderComposer()
    const modelPick = screen.getByLabelText('모델 선택')
    const valueOf = (): string => modelPick.querySelector('.pick-val')?.textContent ?? ''

    expect(valueOf()).toBe(MODELS[0].label)

    fireEvent.click(modelPick)
    const menu = container.querySelector('.pick-menu')
    expect(menu).toBeTruthy()
    const opts = menu!.querySelectorAll('.pick-opt')
    expect(opts.length).toBe(MODELS.length)

    fireEvent.click(opts[1])
    expect(valueOf()).toBe(MODELS[1].label)
    expect(valueOf()).not.toBe(MODELS[0].label)
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

describe('Composer — UltraCode 토글 단일 진실원(UC1-P07, ADR-032 개정 v2)', () => {
  it('기본값은 ON이다(첫 실행부터 Workflow 경로 개방)', () => {
    const { container } = renderComposer()
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement
    expect(toggle.classList.contains('orch-on')).toBe(true)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
  })

  it('기본 ON 상태(클릭 없이) 전송 → onSend에 orchestration:true + 전송 후에도 ON 유지(지속)', () => {
    const { container, props } = renderComposer({ value: 'hello' })
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement
    expect(toggle.classList.contains('orch-on')).toBe(true)
    fireEvent.click(screen.getByLabelText('전송'))
    expect(props.onSend).toHaveBeenCalledWith(expect.objectContaining({ orchestration: true }))
    expect(toggle.classList.contains('orch-on')).toBe(true)
  })

  it('토글을 클릭해 명시적으로 OFF로 내린 뒤 전송 → orchestration:false, 토글 OFF 유지', () => {
    const { container, props } = renderComposer({ value: 'hi' })
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement
    expect(toggle.classList.contains('orch-on')).toBe(true)
    fireEvent.click(toggle)
    expect(toggle.classList.contains('orch-on')).toBe(false)
    fireEvent.click(screen.getByLabelText('전송'))
    expect(props.onSend).toHaveBeenCalledWith(expect.objectContaining({ orchestration: false }))
    expect(toggle.classList.contains('orch-on')).toBe(false)
  })

  it('토글 OFF + 본문에 "ultracode" 언급 → orchestration:false(키워드 비승격 — 진실원은 토글 단일)', () => {
    const { container, props } = renderComposer({ value: 'please ultracode this task' })
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement
    fireEvent.click(toggle)
    fireEvent.click(screen.getByLabelText('전송'))
    expect(props.onSend).toHaveBeenCalledWith(expect.objectContaining({ orchestration: false }))
  })

  it('토글 OFF + 본문에 "/workflows" 언급 → orchestration:false(키워드 비승격)', () => {
    const { container, props } = renderComposer({ value: 'run /workflows for me' })
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement
    fireEvent.click(toggle)
    fireEvent.click(screen.getByLabelText('전송'))
    expect(props.onSend).toHaveBeenCalledWith(expect.objectContaining({ orchestration: false }))
  })

  it('토글 ON(기본) + 본문에 "ultracode" 언급 → orchestration:true(토글 값 그대로, 키워드는 승격 요인 아님)', () => {
    const { props } = renderComposer({ value: 'please ultracode this task' })
    fireEvent.click(screen.getByLabelText('전송'))
    expect(props.onSend).toHaveBeenCalledWith(expect.objectContaining({ orchestration: true }))
  })
})

describe('Composer — 키워드 하이라이트 미러 오버레이 (UC1-P05)', () => {
  it('키워드 없는 텍스트 → 미러 오버레이 미마운트(네이티브 textarea 그대로)', () => {
    const { container } = renderComposer({ value: 'hello world' })
    expect(container.querySelector('.composer-ta-mirror')).toBeFalsy()
    expect(container.querySelector('.composer-ta--ghost')).toBeFalsy()
  })

  it('"ultracode" 포함 → 미러 오버레이 마운트 + textarea ghost 클래스 + .orch-kw span', () => {
    const { container } = renderComposer({ value: 'please ultracode this' })
    const mirror = container.querySelector('.composer-ta-mirror')
    expect(mirror).toBeTruthy()
    expect(container.querySelector('textarea.composer-ta--ghost')).toBeTruthy()
    const kw = mirror!.querySelector('.orch-kw')
    expect(kw?.textContent).toBe('ultracode')
  })

  it('"/workflows" 포함 → .orch-kw span에 원문 그대로("/workflows")', () => {
    const { container } = renderComposer({ value: 'run /workflows now' })
    const kw = container.querySelector('.composer-ta-mirror .orch-kw')
    expect(kw?.textContent).toBe('/workflows')
  })

  it('대소문자 혼합("UltraCode") → 원문 casing 그대로 하이라이트', () => {
    const { container } = renderComposer({ value: 'UltraCode 모드로' })
    const kw = container.querySelector('.composer-ta-mirror .orch-kw')
    expect(kw?.textContent).toBe('UltraCode')
  })

  it('오탐 배제("ultracoded") → 미러 오버레이 미마운트', () => {
    const { container } = renderComposer({ value: 'this is ultracoded already' })
    expect(container.querySelector('.composer-ta-mirror')).toBeFalsy()
  })

  it('compositionstart 중에는 키워드가 있어도 ghost 비활성(IME 어긋남 방지)', () => {
    const { container } = renderComposer({ value: 'ultracode 실행' })
    const ta = screen.getByLabelText('메시지 입력')
    expect(container.querySelector('.composer-ta-mirror')).toBeTruthy()
    fireEvent.compositionStart(ta)
    expect(container.querySelector('.composer-ta-mirror')).toBeFalsy()
    expect(container.querySelector('textarea.composer-ta--ghost')).toBeFalsy()
    fireEvent.compositionEnd(ta)
    expect(container.querySelector('.composer-ta-mirror')).toBeTruthy()
  })
})

describe('Composer — OFF 유도 힌트 + 뮤트 하이라이트 (UC1-P07, ADR-032 v2)', () => {
  it('토글 ON(기본) + 키워드 → 힌트 미표시, .orch-kw는 그라데이션(뮤트 클래스 없음, P05 그대로)', () => {
    const { container } = renderComposer({ value: 'please ultracode this' })
    expect(container.querySelector('.composer-orch-hint')).toBeFalsy()
    const kw = container.querySelector('.composer-ta-mirror .orch-kw')
    expect(kw).toBeTruthy()
    expect(kw?.classList.contains('orch-kw--muted')).toBe(false)
  })

  it('토글 OFF + 키워드 → 힌트 표시 + .orch-kw--muted(그라데이션 대신 뮤트 스타일)', () => {
    const { container } = renderComposer({ value: 'please ultracode this' })
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement
    fireEvent.click(toggle)
    const hint = container.querySelector('.composer-orch-hint')
    expect(hint).toBeTruthy()
    expect(hint?.textContent).toMatch(/UltraCode가 꺼져 있어요/)
    const kw = container.querySelector('.composer-ta-mirror .orch-kw')
    expect(kw).toBeTruthy()
    expect(kw?.classList.contains('orch-kw--muted')).toBe(true)
  })

  it('토글 OFF + 키워드 없음 → 힌트 미표시(빈 입력·일반 텍스트에 불필요한 힌트 0)', () => {
    const { container } = renderComposer({ value: 'hello world' })
    const toggle = container.querySelector('.orch-toggle') as HTMLButtonElement
    fireEvent.click(toggle)
    expect(container.querySelector('.composer-orch-hint')).toBeFalsy()
  })
})
