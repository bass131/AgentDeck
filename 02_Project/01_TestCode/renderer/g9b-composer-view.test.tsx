// @vitest-environment jsdom
// M05 G9b — 입력창 하나. 이름 Composer는 단일 store 어댑터로 남고, 순수 본체 ComposerView를
// 단일과 멀티 패널이 같이 쓴다(G9a 코어·어댑터 구도와 같다).
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import type { JSX } from 'react'

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

  it('onCycleMode가 있으면 Shift+Tab을 입력창이 처리하고, 없으면(단일) 전역 단축키에 맡긴다', async () => {
    const { ComposerView } = await import('@renderer/05_Conversation/ComposerView')
    const onCycleMode = vi.fn()
    const docSpy = vi.fn()
    document.addEventListener('keydown', docSpy)
    try {
      const a = render(<ComposerView {...viewProps({ onCycleMode })} />)
      fireEvent.keyDown(a.container.querySelector('textarea') as HTMLTextAreaElement, { key: 'Tab', shiftKey: true })
      expect(onCycleMode).toHaveBeenCalledTimes(1)
      expect(docSpy).not.toHaveBeenCalled()
      cleanup()
      const b = render(<ComposerView {...viewProps()} />)
      fireEvent.keyDown(b.container.querySelector('textarea') as HTMLTextAreaElement, { key: 'Tab', shiftKey: true })
      expect(docSpy).toHaveBeenCalledTimes(1)
    } finally {
      document.removeEventListener('keydown', docSpy)
    }
  })

  it('자동 높이(C5)는 밀도마다 줄 높이로 3줄 상한을 잰다 — compact 20px(60), 기본 22px(66)', async () => {
    const { ComposerView } = await import('@renderer/05_Conversation/ComposerView')
    const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', { configurable: true, get: () => 200 })
    try {
      const a = render(<ComposerView {...viewProps({ density: 'compact', value: '긴\n글\n여러\n줄\n입력' })} />)
      expect((a.container.querySelector('textarea') as HTMLTextAreaElement).style.height).toBe('60px')
      cleanup()
      const b = render(<ComposerView {...viewProps({ value: '긴\n글\n여러\n줄\n입력' })} />)
      expect((b.container.querySelector('textarea') as HTMLTextAreaElement).style.height).toBe('66px')
    } finally {
      delete (HTMLTextAreaElement.prototype as unknown as Record<string, unknown>).scrollHeight
      if (desc) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', desc)
    }
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

// ── 패널 입력창 — 같은 본체를 밀도 compact로 쓴다(C3 사용자 결정) ─────────────────────────
type Listener = (payload: { runId: string; event: { type: string } }) => void

function liveApi() {
  const listeners: Listener[] = []
  const api = {
    onAgentEvent: vi.fn((cb: Listener) => {
      listeners.push(cb)
      return () => {
        const i = listeners.indexOf(cb)
        if (i >= 0) listeners.splice(i, 1)
      }
    }),
    agentRun: vi.fn(async () => ({ runId: 'run-live' })),
    agentAbort: vi.fn(async () => ({ accepted: true })),
    agentInterrupt: vi.fn(async () => ({ accepted: true })),
    listSlashCommands: vi.fn().mockResolvedValue([]),
    listSkills: vi.fn().mockResolvedValue([]),
  }
  Object.defineProperty(window, 'api', { configurable: true, writable: true, value: api })
  const emit = (runId: string, event: { type: string }): void => {
    for (const l of [...listeners]) l({ runId, event })
  }
  return { api, emit }
}

async function renderLivePanel(extra: Record<string, unknown> = {}) {
  const { usePanelSlot, __resetPanelSessionManagerForTests } = await import('@renderer/03_Agent/state/panelSession')
  __resetPanelSessionManagerForTests()
  const { PanelView } = await import('@renderer/05_Conversation/PanelView')
  function Live(): JSX.Element {
    const session = usePanelSlot('sess-live', 0)
    return (
      <PanelView
        slot={0}
        panel={{ title: 'p', status: 'idle', cwd: 'C:/w', ctxPct: 0 }}
        session={session}
        workspaceRoot="C:/w"
        onExpand={() => {}}
        onPrompt={() => {}}
        onPickFolder={() => {}}
        {...extra}
      />
    )
  }
  return render(<Live />)
}

async function typeAndEnter(container: HTMLElement, text: string): Promise<void> {
  const ta = container.querySelector('textarea') as HTMLTextAreaElement
  await act(async () => {
    fireEvent.change(ta, { target: { value: text } })
  })
  await act(async () => {
    fireEvent.keyDown(ta, { key: 'Enter' })
  })
  // agentRun 응답(SET_RUN_ID)까지 흘려보낸다.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe('패널 입력창 — 공용 본체(compact)', () => {
  it('밀도 compact: .composer-wrap.composer--compact 하나, 사용량 띠(ContextStrip) 없음, 패널 링은 남음', async () => {
    liveApi()
    const { container } = await renderLivePanel()
    expect(container.querySelectorAll('.ma-p-foot .composer-wrap.composer--compact').length).toBe(1)
    expect(container.querySelector('.ctx-strip')).toBeNull()
    expect(container.querySelector('.ma-p-ctx .ma-ctx-ring')).toBeTruthy()
  })

  it('문구·아이콘은 단일 쪽: placeholder, 전송 버튼 .send, 첨부 버튼 .cm-icon', async () => {
    liveApi()
    const { container } = await renderLivePanel()
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(ta.className).toContain('composer-ta')
    expect(ta.getAttribute('placeholder')).toBe('오늘 어떤 도움을 드릴까요?')
    expect(container.querySelector('.ma-p-foot button.send[aria-label="전송"]')).toBeTruthy()
    expect(container.querySelector('.ma-p-foot button.cm-icon[aria-label="이미지 첨부"]')).toBeTruthy()
    expect(container.querySelector('.ma-composer-ta, .ma-send, .ma-attach, .ma-p-composer')).toBeNull()
  })

  it('비활성 문구는 단일 쪽(작업 폴더 없음)', async () => {
    liveApi()
    const { container } = await renderLivePanel({ workspaceRoot: null })
    expect(container.querySelector('.composer-disabled-hint')?.textContent).toBe('프로젝트 폴더를 열면 대화를 시작할 수 있어요')
    expect(container.querySelector('textarea')?.getAttribute('placeholder')).toBe('프로젝트 폴더를 먼저 열어주세요')
  })

  it('C1·C2: 실행 중 Enter는 중단이 아니라 예약이고 SchedStrip에 보인다. 끝나면 예약분이 전송된다', async () => {
    const { api, emit } = liveApi()
    const { container } = await renderLivePanel()
    await typeAndEnter(container, '첫 작업')
    expect(api.agentRun).toHaveBeenCalledTimes(1)
    await typeAndEnter(container, '둘째 작업')
    expect(api.agentRun).toHaveBeenCalledTimes(1)
    expect(api.agentAbort).not.toHaveBeenCalled()
    expect(container.querySelector('.sched .sched-item .sched-text')?.textContent).toBe('둘째 작업')
    await act(async () => {
      emit('run-live', { type: 'done' })
    })
    await act(async () => { await Promise.resolve() })
    expect(api.agentRun).toHaveBeenCalledTimes(2)
    const args = api.agentRun.mock.calls[1] as unknown as [{ messages: { role: string; content: string }[] }]
    expect(args[0].messages.at(-1)?.content).toBe('둘째 작업')
    expect(container.querySelector('.sched')).toBeNull()
  })

  it('실행 중 빈 입력이면 중단 버튼(aria 「실행 중단」)이 보이고, REPL이면 interrupt로 멈춘다(단일과 같음)', async () => {
    const { api } = liveApi()
    const { container } = await renderLivePanel()
    expect(container.querySelector('[aria-label="REPL 지속세션 모드 토글"]')?.getAttribute('aria-pressed')).toBe('true')
    await typeAndEnter(container, '작업')
    const stop = container.querySelector('.ma-p-foot button.send.stop[aria-label="실행 중단"]') as HTMLButtonElement
    expect(stop).toBeTruthy()
    await act(async () => {
      fireEvent.click(stop)
    })
    expect(api.agentInterrupt).toHaveBeenCalledWith({ runId: 'run-live' })
  })

  it('E9: 단발 모드에서 예약이 있는 채로 중단(abort)하면 예약도 지운다', async () => {
    const { api } = liveApi()
    const { container } = await renderLivePanel()
    await act(async () => {
      fireEvent.click(container.querySelector('[aria-label="REPL 지속세션 모드 토글"]') as HTMLElement)
    })
    await typeAndEnter(container, '작업')
    await typeAndEnter(container, '예약분')
    expect(container.querySelector('.sched')).toBeTruthy()
    await act(async () => {
      fireEvent.click(container.querySelector('button.send.stop') as HTMLButtonElement)
    })
    expect(api.agentAbort).toHaveBeenCalledWith({ runId: 'run-live' })
    expect(container.querySelector('.sched')).toBeNull()
  })

  it('C7·L2: /ask 전송은 엔진으로 가지 않고 onSlashAsk를 부른다', async () => {
    const { api } = liveApi()
    const onSlashAsk = vi.fn()
    const { container } = await renderLivePanel({ onSlashAsk })
    await typeAndEnter(container, '/ask 빠른 질문')
    expect(onSlashAsk).toHaveBeenCalledTimes(1)
    expect(api.agentRun).not.toHaveBeenCalled()
  })

  it('L2: MultiWorkspace가 Shell의 onSlashAsk를 패널까지 잇는다(펼친 패널 포함)', async () => {
    const { api } = liveApi()
    Object.assign(api, {
      multiSessionLoad: vi.fn().mockResolvedValue({ state: null }),
      pickFolder: vi.fn().mockResolvedValue({ path: null }),
      getUsage: vi.fn().mockResolvedValue({ fiveHour: null, weekly: null }),
    })
    const { useAppStore } = await import('@renderer/00_App/appStore')
    useAppStore.setState({ workspaceRoot: 'C:/w' })
    const onSlashAsk = vi.fn()
    const { MultiWorkspace } = await import('@renderer/12_Window/MultiWorkspace')
    const { container } = render(<MultiWorkspace onSlashAsk={onSlashAsk} />)
    const panel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    await typeAndEnter(panel, '/ask 질문')
    expect(onSlashAsk).toHaveBeenCalledTimes(1)
    expect(api.agentRun).not.toHaveBeenCalled()
  })

  it('C4: 첨부 썸네일을 누르면 onOpenImage로 이미지 뷰어를 연다', async () => {
    liveApi()
    const onOpenImage = vi.fn()
    const { container } = await renderLivePanel({ onOpenImage })
    const a = act
    class FR {
      result: string | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      readAsDataURL(): void {
        Promise.resolve().then(() => { this.result = 'data:image/png;base64,X'; this.onload?.() })
      }
    }
    const prevFR = global.FileReader
    // @ts-expect-error jsdom FileReader 교체
    global.FileReader = FR
    ;(window as unknown as { api: Record<string, unknown> }).api.pathForFile = vi.fn(() => '/tmp/a.png')
    try {
      const input = container.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement
      const file = { name: 'a.png', type: 'image/png', arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) }
      await a(async () => {
        Object.defineProperty(input, 'files', { value: [file], configurable: true })
        fireEvent.change(input)
      })
      await a(async () => { await new Promise((r) => setTimeout(r, 20)) })
      const thumb = container.querySelector('.img-thumb-open') as HTMLButtonElement
      expect(thumb).toBeTruthy()
      fireEvent.click(thumb)
      expect(onOpenImage).toHaveBeenCalledWith(['data:image/png;base64,X'], 0)
    } finally {
      global.FileReader = prevFR
    }
  })
})

describe('패널 질문 창(사용자 결정) — 단일과 같은 QuestionModal', () => {
  const QUESTIONS = [
    {
      header: '범위',
      question: '어느 파일을 고칠까요?',
      options: [
        { label: 'a.ts', description: '첫째' },
        { label: 'b.ts', description: '둘째' },
      ],
      multiSelect: false,
    },
  ]

  it('패널 run에 question_request가 오면 QuestionModal을 띄우고, 건너뛰기는 questionRespond(null)로 답한다', async () => {
    const { api, emit } = liveApi()
    const questionRespond = vi.fn(async () => undefined)
    Object.assign(api, { questionRespond })
    const { container } = await renderLivePanel()
    expect(document.querySelector('.q-overlay')).toBeNull()
    await typeAndEnter(container, '질문해 줘')
    await act(async () => {
      emit('run-live', { type: 'question_request', requestId: 'qr-1', questions: QUESTIONS } as never)
    })
    expect(document.querySelector('.q-overlay')?.textContent).toContain('어느 파일을 고칠까요?')
    await act(async () => {
      fireEvent.click(document.querySelector('.q-overlay .qm-close') as HTMLElement)
    })
    expect(questionRespond).toHaveBeenCalledWith({ runId: 'run-live', requestId: 'qr-1', answers: null })
    expect(document.querySelector('.q-overlay')).toBeNull()
  })

  it('질문이 대기 중이면 상태 라인(작업 중 표시)은 숨는다(단일과 같음)', async () => {
    const { makePanelInitialState } = await import('@renderer/03_Agent/state/panelSession')
    const { PanelView } = await import('@renderer/05_Conversation/PanelView')
    const noop = (): void => {}
    const session = {
      state: {
        ...makePanelInitialState(),
        thread: [{ kind: 'msg', id: 'u1', role: 'user', text: '질문' }],
        isRunning: true,
        currentRunId: 'r',
        pendingQuestion: { runId: 'r', requestId: 'q', questions: QUESTIONS },
      },
      respondQuestion: vi.fn(async () => undefined),
      setReplMode: noop,
    }
    render(
      <PanelView
        slot={0}
        panel={{ title: 'p', status: 'working', cwd: 'C:/w', ctxPct: 0 }}
        session={session as never}
        workspaceRoot="C:/w"
        onExpand={noop}
        onPrompt={noop}
        onPickFolder={noop}
      />,
    )
    expect(document.querySelector('.q-overlay')).toBeTruthy()
    expect(document.querySelector('.ma-p-messages .status-line, .ma-p-messages [data-testid="status-line"]')).toBeNull()
  })
})

// G9b 독립 검수 차단 1 — 질문 창은 창 전역 keydown으로 답을 받는다. 멀티 작업 공간 전체에서
// 키를 받는 질문 창은 한 번에 하나여야 하고, 그 창은 보여야 한다(가려진 패널의 질문은 미룬다).
describe('멀티 질문 창 — 한 번에 하나, 보이는 창만 키를 받는다', () => {
  const Q = (question: string) => [
    {
      header: '범위',
      question,
      options: [
        { label: 'a.ts', description: '첫째' },
        { label: 'b.ts', description: '둘째' },
      ],
      multiSelect: false,
    },
  ]

  async function renderLiveMulti() {
    const { api, emit } = liveApi()
    let n = 0
    api.agentRun.mockImplementation(async () => ({ runId: `run-${n++}` }))
    const questionRespond = vi.fn(async () => undefined)
    Object.assign(api, {
      questionRespond,
      multiSessionLoad: vi.fn().mockResolvedValue({ state: null }),
      multiCmdUpsert: vi.fn(async () => ({ ok: true })),
      pickFolder: vi.fn().mockResolvedValue({ path: null }),
      getUsage: vi.fn().mockResolvedValue({ fiveHour: null, weekly: null }),
    })
    const { __resetPanelSessionManagerForTests } = await import('@renderer/03_Agent/state/panelSession')
    __resetPanelSessionManagerForTests()
    const { useAppStore } = await import('@renderer/00_App/appStore')
    useAppStore.setState({ workspaceRoot: 'C:/w' })
    const { MultiWorkspace } = await import('@renderer/12_Window/MultiWorkspace')
    const { container } = render(<MultiWorkspace />)
    const panel = (slot: number) =>
      container.ownerDocument.querySelector(`.ma-panel[data-slot="${slot}"]:not(.ma-placeholder)`) as HTMLElement
    const ask = async (runId: string, requestId: string, question: string): Promise<void> => {
      await act(async () => {
        emit(runId, { type: 'question_request', requestId, questions: Q(question) } as never)
      })
    }
    return { questionRespond, panel, ask }
  }

  it('두 패널이 동시에 질문하면 패널 순서로 첫 질문 하나만 뜨고, 키 하나는 그 질문에만 답한다', async () => {
    const { questionRespond, panel, ask } = await renderLiveMulti()
    await typeAndEnter(panel(0), '첫 패널 작업')
    await typeAndEnter(panel(2), '셋째 패널 작업')
    await ask('run-0', 'qr-0', '첫 패널 질문')
    await ask('run-1', 'qr-2', '셋째 패널 질문')

    expect(document.querySelectorAll('.q-overlay').length).toBe(1)
    const overlay = document.querySelector('.q-overlay') as HTMLElement
    expect(overlay.textContent).toContain('첫 패널 질문')
    expect(overlay.querySelector('.qm-source')?.textContent).toBe('패널 1 · 새 작업')
    expect(panel(2).querySelector('.ma-p-qwait')?.textContent).toBe('질문 대기')
    expect(panel(0).querySelector('.ma-p-qwait')).toBeNull()

    await act(async () => {
      fireEvent.keyDown(window, { key: '1' })
    })
    expect(questionRespond).toHaveBeenCalledTimes(1)
    expect(questionRespond).toHaveBeenCalledWith({ runId: 'run-0', requestId: 'qr-0', answers: [['a.ts']] })

    // 첫 질문이 끝나면 대기하던 셋째 패널 질문이 뜬다.
    expect(document.querySelectorAll('.q-overlay').length).toBe(1)
    expect(document.querySelector('.q-overlay')?.textContent).toContain('셋째 패널 질문')
    expect(document.querySelector('.q-overlay .qm-source')?.textContent).toBe('패널 3 · 새 작업')
    expect(panel(2).querySelector('.ma-p-qwait')).toBeNull()
    await act(async () => {
      fireEvent.keyDown(window, { key: '2' })
    })
    expect(questionRespond).toHaveBeenCalledTimes(2)
    expect(questionRespond).toHaveBeenLastCalledWith({ runId: 'run-1', requestId: 'qr-2', answers: [['b.ts']] })
    expect(document.querySelector('.q-overlay')).toBeNull()
  })

  // 재검수 중요 1 — 열린 창은 그 질문이 끝날 때까지 유지한다(낮은 번호 패널의 새 질문이 가로채지 않는다).
  it('높은 번호 패널의 창이 열린 채 낮은 번호 패널의 질문이 와도 창·단계·직접 입력이 그대로이고 키도 그 창으로 간다', async () => {
    const { questionRespond, panel, ask } = await renderLiveMulti()
    await typeAndEnter(panel(0), '첫 패널 작업')
    await typeAndEnter(panel(2), '셋째 패널 작업')
    await ask('run-1', 'qr-2', '셋째 패널 질문')
    expect(document.querySelector('.q-overlay .qm-source')?.textContent).toBe('패널 3 · 새 작업')
    // 셋째 패널 창에서 「직접 입력」(3번)을 고르고 글을 쓰는 중이다.
    await act(async () => {
      fireEvent.keyDown(window, { key: '3' })
    })
    const input = document.querySelector('.q-overlay input.q-custom') as HTMLInputElement
    expect(input).toBeTruthy()
    await act(async () => {
      fireEvent.change(input, { target: { value: '직접 쓴 답' } })
    })

    await ask('run-0', 'qr-0', '첫 패널 질문')
    expect(document.querySelectorAll('.q-overlay').length).toBe(1)
    expect(document.querySelector('.q-overlay .qm-source')?.textContent).toBe('패널 3 · 새 작업')
    expect((document.querySelector('.q-overlay input.q-custom') as HTMLInputElement)?.value).toBe('직접 쓴 답')
    expect(panel(0).querySelector('.ma-p-qwait')?.textContent).toBe('질문 대기')
    expect(panel(2).querySelector('.ma-p-qwait')).toBeNull()

    await act(async () => {
      fireEvent.click(document.querySelector('.q-overlay .q-submit') as HTMLElement)
    })
    expect(questionRespond).toHaveBeenCalledTimes(1)
    expect(questionRespond).toHaveBeenCalledWith({ runId: 'run-1', requestId: 'qr-2', answers: [['직접 쓴 답']] })
    // 셋째 패널 질문이 끝나면 그때 대기하던 첫 패널 질문으로 넘어간다.
    expect(document.querySelector('.q-overlay .qm-source')?.textContent).toBe('패널 1 · 새 작업')
    expect(document.querySelector('.q-overlay')?.textContent).toContain('첫 패널 질문')
  })

  it('첫 질문을 내려두면 pill은 하나뿐이고, 대기 질문은 겹쳐 뜨지 않는다(pill 겹침 정리)', async () => {
    const { questionRespond, panel, ask } = await renderLiveMulti()
    await typeAndEnter(panel(0), '첫 패널 작업')
    await typeAndEnter(panel(1), '둘째 패널 작업')
    await ask('run-0', 'qr-0', '첫 패널 질문')
    await ask('run-1', 'qr-1', '둘째 패널 질문')
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(document.querySelectorAll('.q-mini-pill').length).toBe(1)
    expect(document.querySelector('.q-overlay')).toBeNull()
    expect(document.querySelector('.q-mini-pill .mini-sub')?.textContent).toContain('패널 1')
    expect(panel(1).querySelector('.ma-p-qwait')).toBeTruthy()
    // 내려둔 상태의 숫자 키는 어느 질문에도 답하지 않는다.
    await act(async () => {
      fireEvent.keyDown(window, { key: '1' })
    })
    expect(questionRespond).not.toHaveBeenCalled()
  })

  it('펼친 상태에서 가려진 격자 패널의 질문은 뜨지 않고 키를 못 받으며, 펼침을 닫으면 뜬다', async () => {
    const { questionRespond, panel, ask } = await renderLiveMulti()
    await typeAndEnter(panel(0), '펼칠 패널 작업')
    await typeAndEnter(panel(1), '격자 패널 작업')
    await act(async () => {
      fireEvent.click(panel(0).querySelector('.ma-p-zoom') as HTMLElement)
    })
    expect(document.querySelector('.ma-expand-overlay .ma-panel[data-slot="0"]')).toBeTruthy()

    await ask('run-1', 'qr-1', '가려진 패널 질문')
    expect(document.querySelector('.q-overlay')).toBeNull()
    expect(document.querySelector('.q-mini-pill')).toBeNull()
    expect(panel(1).querySelector('.ma-p-qwait')?.textContent).toBe('질문 대기')
    await act(async () => {
      fireEvent.keyDown(window, { key: '1' })
    })
    expect(questionRespond).not.toHaveBeenCalled()

    // 펼친 패널 자신의 질문은 펼침 위에 뜨고 키를 받는다.
    await ask('run-0', 'qr-0', '펼친 패널 질문')
    const overlay = document.querySelector('.ma-expand-overlay .q-overlay') as HTMLElement
    expect(overlay?.textContent).toContain('펼친 패널 질문')
    expect(document.querySelectorAll('.q-overlay').length).toBe(1)
    await act(async () => {
      fireEvent.keyDown(window, { key: '1' })
    })
    expect(questionRespond).toHaveBeenCalledTimes(1)
    expect(questionRespond).toHaveBeenCalledWith({ runId: 'run-0', requestId: 'qr-0', answers: [['a.ts']] })

    // 펼침을 닫으면 미뤘던 질문이 뜬다.
    await act(async () => {
      fireEvent.click(document.querySelector('.ma-expand-overlay [aria-label="닫기"]') as HTMLElement)
    })
    expect(document.querySelector('.ma-expand-overlay')).toBeNull()
    expect(document.querySelectorAll('.q-overlay').length).toBe(1)
    expect(document.querySelector('.q-overlay')?.textContent).toContain('가려진 패널 질문')
    expect(document.querySelector('.q-overlay .qm-source')?.textContent).toBe('패널 2 · 새 작업')
  })

  it('PanelView: questionActive=false면 질문 창 대신 머리에 「질문 대기」, 기본(true)이면 출처를 단 질문 창', async () => {
    const { makePanelInitialState } = await import('@renderer/03_Agent/state/panelSession')
    const { PanelView } = await import('@renderer/05_Conversation/PanelView')
    const noop = (): void => {}
    const session = {
      state: {
        ...makePanelInitialState(),
        pendingQuestion: { runId: 'r', requestId: 'q', questions: Q('대기 질문') },
      },
      respondQuestion: vi.fn(async () => undefined),
      setReplMode: noop,
    }
    const props = {
      slot: 3,
      panel: { title: '리팩터', status: 'working' as const, cwd: 'C:/w', ctxPct: 0 },
      session: session as never,
      workspaceRoot: 'C:/w',
      onExpand: noop,
      onPrompt: noop,
      onPickFolder: noop,
    }
    const a = render(<PanelView {...props} questionActive={false} />)
    expect(document.querySelector('.q-overlay')).toBeNull()
    expect(a.container.querySelector('.ma-p-head .ma-p-qwait')?.textContent).toBe('질문 대기')
    cleanup()
    const b = render(<PanelView {...props} />)
    expect(b.container.querySelector('.ma-p-qwait')).toBeNull()
    expect(document.querySelector('.q-overlay .qm-source')?.textContent).toBe('패널 4 · 리팩터')
  })

  // 재검수 중요 2 — 질문 창·pill이 떠 있으면 펼침 닫기 Esc는 손을 뗀다(Esc는 질문 창 쪽 동작만).
  it('펼친 패널의 질문 창에서 Esc는 내려두기만, pill에서 Esc는 건너뛰기만 하고 펼침은 닫히지 않는다', async () => {
    const { questionRespond, panel, ask } = await renderLiveMulti()
    await typeAndEnter(panel(0), '펼칠 패널 작업')
    await act(async () => {
      fireEvent.click(panel(0).querySelector('.ma-p-zoom') as HTMLElement)
    })
    await ask('run-0', 'qr-0', '펼친 패널 질문')
    expect(document.querySelector('.ma-expand-overlay .q-overlay')).toBeTruthy()

    // 창 → Esc → 내려두기(pill). 펼침은 그대로.
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(document.querySelector('.ma-expand-overlay')).toBeTruthy()
    expect(document.querySelector('.q-overlay')).toBeNull()
    expect(document.querySelectorAll('.q-mini-pill').length).toBe(1)
    expect(questionRespond).not.toHaveBeenCalled()

    // pill → Esc → 건너뛰기(respondQuestion(null)). 펼침은 그대로.
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(questionRespond).toHaveBeenCalledWith({ runId: 'run-0', requestId: 'qr-0', answers: null })
    expect(document.querySelector('.q-mini-pill')).toBeNull()
    expect(document.querySelector('.ma-expand-overlay')).toBeTruthy()

    // 질문이 없으면 Esc는 원래대로 펼침을 닫는다.
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(document.querySelector('.ma-expand-overlay')).toBeNull()
  })

  it('pickQuestionSlot: 펼침이 없으면 패널 순서로 첫 질문, 펼침이 있으면 펼친 패널의 질문만', async () => {
    const { pickQuestionSlot } = await import('@renderer/12_Window/MultiWorkspace')
    expect(pickQuestionSlot([], null, null)).toBeNull()
    expect(pickQuestionSlot([2, 0], null, null)).toBe(0)
    expect(pickQuestionSlot([1, 3], 3, null)).toBe(3)
    expect(pickQuestionSlot([1, 3], 0, null)).toBeNull()
    // 지금 키를 받는 슬롯은 그 질문이 남아 있는 동안 유지하고, 사라지면 슬롯 순서로 다음.
    expect(pickQuestionSlot([0, 2], null, 2)).toBe(2)
    expect(pickQuestionSlot([0, 3], null, 2)).toBe(0)
    // 펼침 규칙이 우선한다 — 펼친 동안에는 펼친 패널의 질문만.
    expect(pickQuestionSlot([0, 2], 0, 2)).toBe(0)
    expect(pickQuestionSlot([2], 1, 2)).toBeNull()
  })

  it('단일 질문 창은 출처 표시가 없다(source 미지정 → .qm-source 없음, 동작 그대로)', async () => {
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    const onAnswer = vi.fn()
    render(<QuestionModal open questions={Q('단일 질문')} onAnswer={onAnswer} onDismiss={vi.fn()} />)
    expect(document.querySelector('.q-overlay .qm-source')).toBeNull()
    await act(async () => {
      fireEvent.keyDown(window, { key: '2' })
    })
    expect(onAnswer).toHaveBeenCalledWith([['b.ts']])
  })

  // 재검수 경미 3 — 답하자마자 다음 패널 창이 같은 자리에 뜨므로, 길게 누른 키의 반복 입력은 답으로 받지 않는다.
  it('숫자·Enter 답 키는 반복 입력(e.repeat)이면 무시하고, 새로 누른 키만 답한다', async () => {
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    const onAnswer = vi.fn()
    render(<QuestionModal open questions={Q('반복 질문')} onAnswer={onAnswer} onDismiss={vi.fn()} />)
    await act(async () => {
      fireEvent.keyDown(window, { key: '1', repeat: true })
    })
    expect(onAnswer).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.keyDown(window, { key: '1' })
    })
    expect(onAnswer).toHaveBeenCalledWith([['a.ts']])
    cleanup()

    const multiQ = [{ ...Q('여러 개 질문')[0], multiSelect: true }]
    const onAnswer2 = vi.fn()
    render(<QuestionModal open questions={multiQ} onAnswer={onAnswer2} onDismiss={vi.fn()} />)
    await act(async () => {
      fireEvent.keyDown(window, { key: '2' })
    })
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter', repeat: true })
    })
    expect(onAnswer2).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    expect(onAnswer2).toHaveBeenCalledWith([['b.ts']])
  })

  it('멀티: 첫 패널에 답한 키를 길게 눌러도 반복 입력이 다음 패널 질문에 들어가지 않는다', async () => {
    const { questionRespond, panel, ask } = await renderLiveMulti()
    await typeAndEnter(panel(0), '첫 패널 작업')
    await typeAndEnter(panel(1), '둘째 패널 작업')
    await ask('run-0', 'qr-0', '첫 패널 질문')
    await ask('run-1', 'qr-1', '둘째 패널 질문')
    await act(async () => {
      fireEvent.keyDown(window, { key: '1' })
    })
    expect(questionRespond).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.q-overlay')?.textContent).toContain('둘째 패널 질문')
    await act(async () => {
      fireEvent.keyDown(window, { key: '1', repeat: true })
    })
    expect(questionRespond).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.q-overlay')?.textContent).toContain('둘째 패널 질문')
  })

  it('출처를 넘기면 머리와 내려둔 pill 모두에 어느 패널의 질문인지 보인다', async () => {
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    render(<QuestionModal open questions={Q('패널 질문')} onAnswer={vi.fn()} onDismiss={vi.fn()} source="패널 2 · 리팩터" />)
    expect(document.querySelector('.q-overlay .qm-source')?.textContent).toBe('패널 2 · 리팩터')
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(document.querySelector('.q-overlay')).toBeNull()
    expect(document.querySelector('.q-mini-pill .mini-sub')?.textContent).toBe('패널 2 · 리팩터 · 펼쳐서 답하기')
  })
})

describe('패널 /clear(C6, 사용자 결정) — 대화를 비우고 다음 전송은 새 엔진 세션', () => {
  it('usePanelSlot.clear: 스레드·이어갈 sessionId를 비우고 REPL 세션키로 살아 있는 run을 agentAbort로 끝낸다(replMode 유지)', async () => {
    const { api, emit } = liveApi()
    const { usePanelSlot, makePanelSlotKey, __resetPanelSessionManagerForTests } = await import('@renderer/03_Agent/state/panelSession')
    __resetPanelSessionManagerForTests()
    const { renderHook } = await import('@testing-library/react')
    const key = makePanelSlotKey('sess-clr', 0)
    api.agentRun.mockImplementation(async () => ({ runId: key }))
    const { result } = renderHook(() => usePanelSlot('sess-clr', 0))
    await act(async () => {
      await result.current.send('첫 대화')
    })
    await act(async () => {
      emit(key, { type: 'session', sessionId: 'sdk-1' } as never)
      emit(key, { type: 'done' })
    })
    expect(result.current.state.sessionId).toBe('sdk-1')
    expect(result.current.state.thread.length).toBeGreaterThan(0)
    const replBefore = result.current.state.replMode

    act(() => result.current.clear())
    expect(api.agentAbort).toHaveBeenCalledWith({ runId: key })
    expect(result.current.state.thread).toEqual([])
    expect(result.current.state.sessionId).toBeUndefined()
    expect(result.current.state.currentRunId).toBeNull()
    expect(result.current.state.replMode).toBe(replBefore)

    await act(async () => {
      await result.current.send('새 대화')
    })
    const req = (api.agentRun.mock.calls.at(-1) as unknown as [unknown])[0] as {
      resumeSessionId?: string
      sessionKey?: string
      messages: { content: string }[]
    }
    expect(req.resumeSessionId).toBeUndefined()
    expect(req.messages.map((m) => m.content)).toEqual(['새 대화'])
    if (replBefore) expect(req.sessionKey).toBe(key)
    expect(key.startsWith('multi:sess-clr:')).toBe(true)
  })

  it('패널 입력창의 /clear는 엔진으로 가지 않고 패널 대화를 비운다', async () => {
    const { api, emit } = liveApi()
    const { container } = await renderLivePanel()
    await typeAndEnter(container, '첫 작업')
    await act(async () => {
      emit('run-live', { type: 'done' })
    })
    expect(container.querySelector('.ma-p-messages')).toBeTruthy()
    const runs = api.agentRun.mock.calls.length
    // 팔레트에서 /clear를 고른 꼴(「/clear 」, 팔레트 닫힘) 그대로 전송한다.
    await typeAndEnter(container, '/clear ')
    expect(api.agentRun.mock.calls.length).toBe(runs)
    expect(container.querySelector('.ma-p-messages')).toBeNull()
    expect(container.querySelector('.ma-p-empty')).toBeTruthy()
  })

  it('지운 패널은 멀티 세션 저장에서 스냅숏이 빠진다(재시작 뒤 복원되지 않음)', async () => {
    const { api, emit } = liveApi()
    const upsert = vi.fn(async (s: { panels: { snapshot?: unknown }[] }) => ({
      ok: true,
      state: { version: 2, activeSessionId: 'sess-persist', sessions: [{ ...s, title: 't' }] },
    }))
    Object.assign(api, {
      multiSessionLoad: vi.fn().mockResolvedValue({ state: null }),
      multiCmdUpsert: upsert,
      pickFolder: vi.fn().mockResolvedValue({ path: null }),
      getUsage: vi.fn().mockResolvedValue({ fiveHour: null, weekly: null }),
    })
    const { __resetPanelSessionManagerForTests } = await import('@renderer/03_Agent/state/panelSession')
    __resetPanelSessionManagerForTests()
    const { useAppStore } = await import('@renderer/00_App/appStore')
    useAppStore.setState({ workspaceRoot: 'C:/w', activeMultiSessionId: 'sess-persist' } as never)
    const { MultiWorkspace } = await import('@renderer/12_Window/MultiWorkspace')
    const { container } = render(<MultiWorkspace />)
    const panel = container.querySelector('.ma-panel[data-slot="0"]') as HTMLElement
    await typeAndEnter(panel, '저장될 대화')
    await act(async () => {
      emit('run-live', { type: 'done' })
      await new Promise((r) => setTimeout(r, 650))
    })
    const withSnap = upsert.mock.calls.at(-1)?.[0]
    expect(withSnap?.panels[0].snapshot).toBeTruthy()

    await typeAndEnter(panel, '/clear ')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 650))
    })
    const cleared = upsert.mock.calls.at(-1)?.[0]
    expect(cleared?.panels[0].snapshot).toBeUndefined()
    useAppStore.setState({ activeMultiSessionId: '' } as never)
  }, 20000)
})

describe('CSS — 밀도 규칙과 죽은 패널 규칙', () => {
  async function css(rel: string): Promise<string> {
    const fs = await import('fs')
    const path = await import('path')
    return fs.readFileSync(path.resolve(__dirname, '../../00_Source/renderer/src', rel), 'utf-8')
  }

  it('Composer.css에 밀도 compact 규칙이 있고, 모든 선택자가 클래스 둘 이상(특이도 0,2,0 이상)이다', async () => {
    const text = (await css('05_Conversation/Composer.css')).replace(/\/\*[\s\S]*?\*\//g, '')
    const blocks = [...text.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => m[1].includes('composer--compact'))
    expect(blocks.length).toBeGreaterThan(0)
    for (const [, sel, body] of blocks) {
      for (const one of sel.split(',')) {
        const classes = (one.match(/\.[a-zA-Z_-][\w-]*/g) ?? []).length
        expect(classes, one.trim()).toBeGreaterThanOrEqual(2)
      }
      expect(body.includes('max-height'), sel.trim()).toBe(false)
    }
  })

  it('MultiWorkspace.css에 통합으로 죽은 패널 입력창·선택기 규칙이 없다', async () => {
    const text = await css('12_Window/MultiWorkspace.css')
    for (const dead of ['.ma-p-pickers', '.ma-p-composer', '.ma-composer-ta', '.ma-attach', '.ma-send']) {
      expect(text.includes(dead), dead).toBe(false)
    }
    expect(text).toMatch(/\.ma-p-foot\s*\{/)
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
