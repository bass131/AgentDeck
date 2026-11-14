// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, resolve } from 'path'
import { render, renderHook, act, cleanup } from '@testing-library/react'
import { convKey, panelKey } from '@renderer/03_Agent/state/sessionKeys'
import type { FolderSwitchMessage } from '@renderer/07_Workspace/file'

// G9c — 'multi'/'single' 분기를 화면 배치(12_Window) 밖에서 키·포트로 옮겼다. 값은 그대로다(P4 포함).

const SRC_ROOT = resolve(__dirname, '../../00_Source/renderer/src')

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) sourceFiles(full, acc)
    else if (/\.(ts|tsx)$/.test(name)) acc.push(full)
  }
  return acc
}

afterEach(() => cleanup())

describe('G9c 분기 정리 — 12_Window 밖에 단일·멀티 분기가 남지 않는다', () => {
  // 모드 분기의 표식 — 배치 상태·selector·판정 함수 이름(대소문자 무시)과 'multi'·"multi"·'single'·"single" 리터럴.
  const MODE_MARK = /workspaceMode|selectWorkspaceMode|isConversationLayout|['"](multi|single)['"]/i
  // 줄 단위 예외 꼴 — 서브에이전트 메시지 묶음의 종류 kind: 'single' / kind === 'single'(작업 공간 모드와 무관).
  // 이 꼴만 지우고 다시 검사하므로, 같은 줄이나 같은 파일에 진짜 모드 분기가 있으면 걸린다.
  const KIND_SINGLE = /\bkind\s*(?::|===)\s*['"]single['"]/g
  // 위치별 허용 목록 — 파일과 줄 내용(앞뒤 공백 제외)이 정확히 같을 때만 허용한다.
  const ALLOWED_LINES: Array<{ file: string; line: string; why: string }> = [
    {
      file: '00_App/state/selector.ts',
      line: "export { selectWorkspaceMode } from '@renderer/12_Window/windowMode'",
      why: '기존 import 경로(@renderer/00_App/appStore)를 위한 재수출일 뿐이고, 정의와 분기는 12_Window에 있다',
    },
  ]

  function modeHitsOutsideWindow(): string[] {
    const hits: string[] = []
    for (const file of sourceFiles(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file).split('\\').join('/')
      if (rel.startsWith('12_Window/')) continue
      readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
        if (!MODE_MARK.test(line.replace(KIND_SINGLE, ''))) return
        if (ALLOWED_LINES.some((a) => a.file === rel && a.line === line.trim())) return
        hits.push(`${rel}:${i + 1}: ${line.trim()}`)
      })
    }
    return hits
  }

  // 반대 동작 확인(검수 경미 1, 2026-11-14): subagentChat.ts 끝에 `m === "multi"` 분기를 임시로 넣자 이 테스트가
  // 그 줄을 짚어 실패했고(옛 파일 단위 예외였다면 통과했을 자리), 원복 뒤 통과했다.
  it("12_Window 밖에 모드 분기 표식이 없다 — 예외는 줄 단위 kind: 'single' 꼴과 위치별 허용 목록뿐이다", () => {
    expect(modeHitsOutsideWindow()).toEqual([])
  })

  it('검사기는 대소문자·큰따옴표·같은 파일 안의 진짜 분기를 놓치지 않는다', () => {
    const probe = (line: string): boolean => MODE_MARK.test(line.replace(KIND_SINGLE, ''))
    expect(probe("const m = useAppStore(selectWorkspaceMode)")).toBe(true)
    expect(probe('if (isConversationLayout(mode)) restore()')).toBe(true)
    expect(probe('const mode = s.WorkspaceMode')).toBe(true)
    expect(probe('if (mode === "multi") return')).toBe(true)
    expect(probe("if (mode === 'single') return")).toBe(true)
    expect(probe("groups.push({ kind: 'single', item })")).toBe(false)
    expect(probe("if (g.kind === 'single' && mode === 'multi') return")).toBe(true)
    // 허용 목록에 근거가 빠진 항목이 없다.
    expect(ALLOWED_LINES.every((a) => a.why.length > 0)).toBe(true)
  })
})

describe('G9c P4 — 기본 모드 값은 그대로다(대화 auto, 패널 bypass)', () => {
  it('기본 모드 상수는 대화·패널 이름으로 바뀌었고 값은 auto / bypass다', async () => {
    const mod = await import('@renderer/03_Agent/pickerOptions')
    expect(mod.DEFAULT_MODE_CONVERSATION).toBe('auto')
    expect(mod.DEFAULT_MODE_PANEL).toBe('bypass')
    const { DEFAULT_PICKER } = await import('@renderer/03_Agent/multiAgentDefaults')
    expect(DEFAULT_PICKER.mode).toBe('bypass')
    const { createComposerSlice } = await import('@renderer/05_Conversation/state/composer')
    const slice = createComposerSlice(() => {}, () => ({}) as never, {} as never)
    expect(slice.pickerMode).toBe('auto')
  })
})

describe('G9c UltraCode 범위 — 대화도 세션 레지스트리 키를 쓴다', () => {
  beforeEach(async () => {
    const { __resetUltracodeToggleForTests } = await import('@renderer/03_Agent/state/ultracodeToggle')
    __resetUltracodeToggleForTests()
  })

  it('새 대화(초안)의 범위는 convKey(null)이고 id가 생기면 rekey로 옮겨 간다', async () => {
    const { useUltracodeToggle, rekeyUltracodeScope } = await import('@renderer/03_Agent/state/ultracodeToggle')
    const draft = renderHook(() => useUltracodeToggle(convKey(null)))
    act(() => draft.result.current[1](false))
    act(() => rekeyUltracodeScope(convKey(null), convKey('c1')))
    const issued = renderHook(() => useUltracodeToggle(convKey('c1')))
    draft.rerender()
    expect(issued.result.current[0]).toBe(false)
    expect(draft.result.current[0]).toBe(true)
  })

  it('패널 범위 키는 그대로 multi:<id>:slot:<n>이고 대화 키와 섞이지 않는다', async () => {
    const { useUltracodeToggle } = await import('@renderer/03_Agent/state/ultracodeToggle')
    const panel = renderHook(() => useUltracodeToggle(panelKey('s', 0)))
    const conv = renderHook(() => useUltracodeToggle(convKey(null)))
    act(() => panel.result.current[1](false))
    conv.rerender()
    expect(conv.result.current[0]).toBe(true)
  })

  it('대화 삭제의 범위 정리는 그 대화 키만 지운다', async () => {
    const { useUltracodeToggle, pruneConversationScope } = await import('@renderer/03_Agent/state/ultracodeToggle')
    const a = renderHook(() => useUltracodeToggle(convKey('a')))
    const b = renderHook(() => useUltracodeToggle(convKey('b')))
    act(() => { a.result.current[1](false); b.result.current[1](false) })
    act(() => pruneConversationScope('a'))
    expect(a.result.current[0]).toBe(true)
    expect(b.result.current[0]).toBe(false)
  })
})

describe('G9c 단일 입력창 — UltraCode 범위 키는 convKey(conversationId)다', () => {
  it('초안에서 끈 토글은 id가 생긴 뒤에도 꺼져 있고, 다음 새 대화(초안)는 다시 켜진다', async () => {
    const { __resetUltracodeToggleForTests, useUltracodeToggle } = await import('@renderer/03_Agent/state/ultracodeToggle')
    __resetUltracodeToggleForTests()
    const { useAppStore } = await import('@renderer/00_App/appStore')
    const { Composer } = await import('@renderer/05_Conversation/Composer')
    useAppStore.setState({ conversationId: null })
    const view = render(<Composer value="" onChange={() => {}} onSend={() => {}} onAbort={() => {}} isRunning={false} />)
    const toggle = (): HTMLElement => view.container.querySelector('[aria-label="UltraCode 모드 토글"]') as HTMLElement
    act(() => { toggle().click() })
    expect(toggle().getAttribute('aria-pressed')).toBe('false')
    act(() => { useAppStore.setState({ conversationId: 'issued' }) })
    expect(toggle().getAttribute('aria-pressed')).toBe('false')
    const issued = renderHook(() => useUltracodeToggle(convKey('issued')))
    expect(issued.result.current[0]).toBe(false)
    act(() => { useAppStore.setState({ conversationId: null }) })
    expect(toggle().getAttribute('aria-pressed')).toBe('true')
  })
})

describe('G9c 패널 키 — usePanelSlot이 자기 키를 돌려준다', () => {
  it('key는 레지스트리 키이자 REPL 세션키인 multi:<id>:slot:<n>이다', async () => {
    Object.defineProperty(window, 'api', { value: { onAgentEvent: vi.fn(() => () => {}) }, writable: true, configurable: true })
    const { usePanelSlot, __resetPanelSessionManagerForTests } = await import('@renderer/03_Agent/state/panelSession')
    const { result, rerender } = renderHook(({ id }) => usePanelSlot(id, 2), { initialProps: { id: 'ms' } })
    expect(result.current.key).toBe(panelKey('ms', 2))
    rerender({ id: 'ms2' })
    expect(result.current.key).toBe(panelKey('ms2', 2))
    __resetPanelSessionManagerForTests()
  })
})

describe('G9c PanelView — UltraCode 범위는 세션이 돌려준 키를 쓴다', () => {
  async function renderPanel(sessionKey?: string) {
    const noop = (): void => {}
    const noopAsync = async (): Promise<void> => {}
    const { makePanelInitialState } = await import('@renderer/03_Agent/state/panelSession')
    const { PanelView } = await import('@renderer/05_Conversation/PanelView')
    const session = {
      ...(sessionKey ? { key: sessionKey } : {}),
      state: makePanelInitialState(),
      send: noopAsync, abort: noopAsync, interrupt: noopAsync, restore: noop, dismissLoopsStopped: noop,
      respondPermission: noopAsync, respondQuestion: noopAsync, setReplMode: noop, dismissGoalStale: noop,
      clear: noop, enqueue: noop, dequeue: () => undefined, removeQueued: noop,
    }
    return render(
      <PanelView slot={1} panel={{ title: 'p', status: 'idle', cwd: 'C:/w', ctxPct: 0 }} session={session as never}
        workspaceRoot="C:/w" onExpand={noop} onPrompt={noop} onPickFolder={noop} />
    )
  }

  it('session.key가 있으면 그 키, 없으면(하네스 가짜 세션) 활성 멀티 세션과 슬롯으로 만든 패널 키다', async () => {
    const { __resetUltracodeToggleForTests, useUltracodeToggle } = await import('@renderer/03_Agent/state/ultracodeToggle')
    __resetUltracodeToggleForTests()
    const { useAppStore } = await import('@renderer/00_App/appStore')
    useAppStore.setState({ activeMultiSessionId: 'active' })
    const btn = (c: HTMLElement): HTMLElement => c.querySelector('[aria-label="UltraCode 모드 토글"]') as HTMLElement
    const withKey = await renderPanel(panelKey('own', 1))
    act(() => { btn(withKey.container).click() })
    expect(renderHook(() => useUltracodeToggle(panelKey('own', 1))).result.current[0]).toBe(false)
    expect(renderHook(() => useUltracodeToggle(panelKey('active', 1))).result.current[0]).toBe(true)
    withKey.unmount()
    const noKey = await renderPanel()
    act(() => { btn(noKey.container).click() })
    expect(renderHook(() => useUltracodeToggle(panelKey('active', 1))).result.current[0]).toBe(false)
  })
})

describe('G9c 폴더 변경 창 — 본문은 호출부가 넘긴다', () => {
  it('message를 넘기면 그 본문을 그리고, 없으면 대화 문구를 그린다', async () => {
    const { FolderSwitchDialog } = await import('@renderer/07_Workspace/file')
    const custom = render(
      <FolderSwitchDialog from="/a/x" to="/b/y" onCancel={() => {}} onConfirm={() => {}} message={({ to }) => <>패널 {to}</>} />
    )
    expect(custom.container.querySelector('.sd-msg')?.textContent).toBe('패널 y')
    custom.unmount()
    const names = vi.fn<FolderSwitchMessage>(() => null)
    const probe = render(<FolderSwitchDialog from="C:\\a\\from-dir" to="/b/to-dir/" onCancel={() => {}} onConfirm={() => {}} message={names} />)
    expect(names).toHaveBeenCalledWith({ from: 'from-dir', to: 'to-dir' })
    probe.unmount()
    const dflt = render(<FolderSwitchDialog from="/a/x" to="/b/y" onCancel={() => {}} onConfirm={() => {}} />)
    expect(dflt.container.querySelector('.sd-msg')?.textContent).toBe(
      '대화는 폴더 단위로 이어지기 때문에 x → y(으)로 바꾸면 현재 대화 내용이 지워지고 새 대화로 시작됩니다.'
    )
  })
})

describe('G9c 시작 복원 — main은 12_Window의 함수만 부른다', () => {
  it('저장된 모드를 store에 넣고, 대화 배치일 때만 마지막 대화를 복원한다', async () => {
    Object.defineProperty(window, 'api', {
      value: { getUiPrefs: vi.fn().mockResolvedValue({}), setUiPref: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })
    const prefs = await import('@renderer/11_Settings/prefs')
    await prefs.loadPrefs()
    const { useAppStore } = await import('@renderer/00_App/appStore')
    const { restoreSavedWorkspace } = await import('@renderer/12_Window/restoreWorkspace')
    const restore = vi.fn(async () => {})
    useAppStore.setState({ restoreLastActiveConversation: restore } as never)
    prefs.setPref('workspace.mode', 'multi')
    restoreSavedWorkspace()
    expect(useAppStore.getState().workspaceMode).toBe('multi')
    expect(restore).not.toHaveBeenCalled()
    prefs.setPref('workspace.mode', 'single')
    restoreSavedWorkspace()
    expect(useAppStore.getState().workspaceMode).toBe('single')
    expect(restore).toHaveBeenCalledTimes(1)
  })

  it('화면 배치 슬라이스는 12_Window에 있고 store 필드 이름(workspaceMode)과 기본값은 그대로다', async () => {
    const { createWindowModeSlice, isConversationLayout, selectWorkspaceMode } = await import('@renderer/12_Window/windowMode')
    const slice = createWindowModeSlice(() => {}, () => ({}) as never, {} as never)
    expect(slice.workspaceMode).toBe('single')
    expect(isConversationLayout('single')).toBe(true)
    expect(isConversationLayout('multi')).toBe(false)
    const app = await import('@renderer/00_App/appStore')
    expect(app.selectWorkspaceMode).toBe(selectWorkspaceMode)
  })

  it('main.tsx에는 작업 공간 모드 분기가 없다', () => {
    const main = readFileSync(join(SRC_ROOT, 'main.tsx'), 'utf8')
    expect(main).toContain('restoreSavedWorkspace()')
    expect(main).not.toMatch(/'(multi|single)'/)
  })
})
