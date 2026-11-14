// @vitest-environment jsdom
// M05 G9b — 입력창 하나. 이름 Composer는 단일 store 어댑터로 남고, 순수 본체 ComposerView를
// 단일과 멀티 패널이 같이 쓴다(G9a 코어·어댑터 구도와 같다).
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'

afterEach(() => cleanup())

beforeEach(() => {
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: {
      listSlashCommands: vi.fn().mockResolvedValue([]),
      listSkills: vi.fn().mockResolvedValue([]),
    },
  })
})

function viewProps(over: Record<string, unknown> = {}) {
  return {
    value: '',
    onChange: vi.fn(),
    onSend: vi.fn(),
    onAbort: vi.fn(),
    isRunning: false,
    model: 'claude-opus-4-7',
    setModel: vi.fn(),
    effort: 'high',
    setEffort: vi.fn(),
    mode: 'plan',
    setMode: vi.fn(),
    orchestration: false,
    setOrchestration: vi.fn(),
    replMode: false,
    setReplMode: vi.fn(),
    replLit: false,
    ...over,
  }
}

describe('ComposerView — store 없는 입력창 본체', () => {
  it('선택기 값은 store가 아니라 props에서 읽는다', async () => {
    const { useAppStore } = await import('@renderer/00_App/appStore')
    useAppStore.setState({ pickerMode: 'auto' })
    const { ComposerView } = await import('@renderer/05_Conversation/ComposerView')
    const { container } = render(<ComposerView {...viewProps({ mode: 'plan' })} />)
    const modeBtn = container.querySelector('[aria-label="모드 선택"]') as HTMLElement
    const { MODES } = await import('@renderer/03_Agent/pickerOptions')
    expect(modeBtn.querySelector('.pick-val')?.textContent).toBe(MODES.find((m) => m.id === 'plan')!.label)
  })

  it('전송은 props의 선택기 값을 onSend로 넘긴다', async () => {
    const { ComposerView } = await import('@renderer/05_Conversation/ComposerView')
    const props = viewProps({ value: '안녕', mode: 'plan', orchestration: true })
    const { getByLabelText } = render(<ComposerView {...props} />)
    fireEvent.click(getByLabelText('전송'))
    expect(props.onSend).toHaveBeenCalledWith({ model: 'claude-opus-4-7', effort: 'high', mode: 'plan', orchestration: true })
  })

  it('Composer(단일 어댑터)는 같은 본체를 그린다 — .composer-wrap 하나, aria 「메시지 입력」 textarea 하나', async () => {
    const { Composer } = await import('@renderer/05_Conversation/Composer')
    const { container } = render(
      <Composer value="" onChange={vi.fn()} onSend={vi.fn()} onAbort={vi.fn()} isRunning={false} />,
    )
    expect(container.querySelectorAll('.composer-wrap').length).toBe(1)
    expect(container.querySelectorAll('textarea[aria-label="메시지 입력"]').length).toBe(1)
  })
})

describe('Composer — 단일 store 어댑터', () => {
  it('store pickerMode를 본체 모드 선택기에 넘긴다', async () => {
    const { useAppStore } = await import('@renderer/00_App/appStore')
    const { MODES } = await import('@renderer/03_Agent/pickerOptions')
    useAppStore.setState({ pickerMode: 'acceptEdits' })
    const { Composer } = await import('@renderer/05_Conversation/Composer')
    const { container } = render(
      <Composer value="" onChange={vi.fn()} onSend={vi.fn()} onAbort={vi.fn()} isRunning={false} />,
    )
    const val = container.querySelector('[aria-label="모드 선택"] .pick-val')?.textContent
    expect(val).toBe(MODES.find((m) => m.id === 'acceptEdits')!.label)
  })
})

describe('엔진 프롬프트 계산 하나(Backlog 47 일부)', () => {
  it('단일 Conversation은 엔진 프롬프트를 G9a 코어 enginePromptFor로 계산한다(입력창 사본 없음)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../00_Source/renderer/src/05_Conversation/Conversation.tsx'),
      'utf-8',
    )
    expect(src).toMatch(/enginePromptFor\(/)
    expect(src).not.toMatch(/buildEnginePrompt\(/)
    expect(src).not.toMatch(/extractMentions\(/)
  })
})
