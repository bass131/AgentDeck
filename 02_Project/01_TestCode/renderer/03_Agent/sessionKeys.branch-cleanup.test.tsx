// 작업 ID: g9c · 옛 이름 g9c-branch-cleanup.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, resolve } from 'path'
import { render, renderHook, act, cleanup } from '@testing-library/react'
import { convKey, panelKey } from '@renderer/03_Agent/state/sessionKeys'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

// G9c — 단일·멀티 분기를 화면 배치(12_Window) 밖에서 키·포트로 옮겼다. 값은 그대로다(P4 포함).
// M10 G1 — 멀티 에이전트 모드를 지워 모드는 「채팅(single) · 작업(work)」 둘이다.

const SRC_ROOT = resolve(__dirname, '../../../00_Source/renderer/src')

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
  // 모드 분기의 표식 — 배치 상태·selector·판정 함수 이름(대소문자 무시)과 모드 값 리터럴('single'·'work', 큰따옴표 포함).
  // M10 G1에서 모드가 「채팅(single) · 작업(work)」이 되어 'work'를 더했고, 옛 값 리터럴도 계속 잡는다.
  const MODE_MARK = /workspaceMode|selectWorkspaceMode|isConversationLayout|['"](multi|single|work)['"]/i
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
    expect(probe('if (mode === "work") return')).toBe(true)
    expect(probe("if (mode === 'single') return")).toBe(true)
    expect(probe("groups.push({ kind: 'single', item })")).toBe(false)
    expect(probe("if (g.kind === 'single' && mode === 'work') return")).toBe(true)
    // 허용 목록에 근거가 빠진 항목이 없다.
    expect(ALLOWED_LINES.every((a) => a.why.length > 0)).toBe(true)
  })
})

describe('G9c P4 — 대화 기본 모드 값은 그대로다(auto)', () => {
  it('대화 기본 모드 상수는 auto이고, 패널 기본 모드는 패널 코드와 함께 없어졌다', async () => {
    const mod = await import('@renderer/03_Agent/pickerOptions')
    expect(mod.DEFAULT_MODE_CONVERSATION).toBe('auto')
    expect('DEFAULT_MODE_PANEL' in mod).toBe(false)
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

describe('[M10 Backlog 3] 그리는 곳이 없던 패널 코드가 없다', () => {
  it('PanelView·panelSession·multiAgentDefaults 파일이 없고, renderer 소스가 그 이름을 import하지 않는다', () => {
    const gone = ['05_Conversation/PanelView.tsx', '03_Agent/state/panelSession.ts', '03_Agent/multiAgentDefaults.ts']
    expect(gone.filter((f) => existsSync(join(SRC_ROOT, f)))).toEqual([])
    const importer = /(?:from|import\()\s*'[^']*\/(?:PanelView|panelSession|multiAgentDefaults)'/
    const hits = sourceFiles(SRC_ROOT).filter((f) => importer.test(readFileSync(f, 'utf8')))
    expect(hits.map((f) => relative(SRC_ROOT, f))).toEqual([])
  })

  it('e2e 하네스도 지운 모듈을 import하지 않는다(e2e는 vitest가 돌리지 않아 import 실패가 늦게 드러난다)', () => {
    const e2eRoot = resolve(__dirname, '../../e2e')
    const importer = /(?:from|import\()\s*'[^']*\/(?:PanelView|panelSession|multiAgentDefaults)'/
    const hits = sourceFiles(e2eRoot).filter((f) => importer.test(readFileSync(f, 'utf8')))
    expect(hits.map((f) => relative(e2eRoot, f))).toEqual([])
  })

  it('renderer 소스와 CSS가 지운 이름(PanelView·panelSession·multiAgentDefaults·DEFAULT_MODE_PANEL)을 주석에서도 부르지 않는다', () => {
    const name = /\b(?:PanelView|panelSession|multiAgentDefaults|DEFAULT_MODE_PANEL)\b/
    const css = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? css(join(dir, e.name)) : e.name.endsWith('.css') ? [join(dir, e.name)] : [])
    const hits = [...sourceFiles(SRC_ROOT), ...css(SRC_ROOT)].filter((f) => name.test(readFileSync(f, 'utf8')))
    expect(hits.map((f) => relative(SRC_ROOT, f))).toEqual([])
  })
})

describe('G9c 시작 복원 — main은 12_Window의 함수만 부른다', () => {
  // M10 G3(Backlog 6) — 두 모드의 복원. 작업 모드로 켜도 채팅의 마지막 대화를 store에 복원해 둔다 — 채팅 모드로 돌아가면
  // 그 대화로 뜬다(옛 동작은 대화 배치일 때만 복원해, 작업 모드로 끈 뒤 켜면 채팅이 빈 화면이었다). 작업 폴더의 복원은 Shell 몫이다.
  it('저장된 모드를 store에 넣고, 어느 모드로 켜든 마지막 대화를 한 번 복원한다', async () => {
    Object.defineProperty(window, 'api', {
      value: adaptFlatApi({ getUiPrefs: vi.fn().mockResolvedValue({}), setUiPref: vi.fn().mockResolvedValue(undefined) }),
      writable: true,
      configurable: true,
    })
    const prefs = await import('@renderer/11_Settings/prefs')
    await prefs.loadPrefs()
    const { useAppStore } = await import('@renderer/00_App/appStore')
    const { restoreSavedWorkspace } = await import('@renderer/12_Window/restoreWorkspace')
    const restore = vi.fn(async () => {})
    useAppStore.setState({ restoreLastActiveConversation: restore } as never)
    prefs.setPref('workspace.mode', 'work')
    restoreSavedWorkspace()
    expect(useAppStore.getState().workspaceMode).toBe('work')
    expect(restore).toHaveBeenCalledTimes(1)
    prefs.setPref('workspace.mode', 'single')
    restoreSavedWorkspace()
    expect(useAppStore.getState().workspaceMode).toBe('single')
    expect(restore).toHaveBeenCalledTimes(2)
  })

  // M10 G1 — 멀티 에이전트 모드를 지웠다. 옛 저장값 'multi'와 모르는 값은 「채팅」으로 읽고, 저장 파일은 고치지 않는다.
  it("저장된 'multi'나 모르는 값으로 켜면 「채팅」(single)으로 뜨고 마지막 대화를 복원한다", async () => {
    Object.defineProperty(window, 'api', {
      value: adaptFlatApi({ getUiPrefs: vi.fn().mockResolvedValue({}), setUiPref: vi.fn().mockResolvedValue(undefined) }),
      writable: true,
      configurable: true,
    })
    const prefs = await import('@renderer/11_Settings/prefs')
    await prefs.loadPrefs()
    const { useAppStore } = await import('@renderer/00_App/appStore')
    const { restoreSavedWorkspace } = await import('@renderer/12_Window/restoreWorkspace')
    for (const saved of ['multi', 'grid', 42, null]) {
      const restore = vi.fn(async () => {})
      useAppStore.setState({ workspaceMode: 'work', restoreLastActiveConversation: restore } as never)
      prefs.setPref('workspace.mode', saved)
      restoreSavedWorkspace()
      expect(useAppStore.getState().workspaceMode).toBe('single')
      expect(restore).toHaveBeenCalledTimes(1)
    }
  })

  it('parseWorkspaceMode는 work만 그대로 두고 나머지를 single로 읽는다', async () => {
    const { parseWorkspaceMode } = await import('@renderer/12_Window/windowMode')
    expect(parseWorkspaceMode('work')).toBe('work')
    expect(parseWorkspaceMode('single')).toBe('single')
    expect(parseWorkspaceMode('multi')).toBe('single')
    expect(parseWorkspaceMode(undefined)).toBe('single')
    expect(parseWorkspaceMode({ mode: 'work' })).toBe('single')
  })

  it('화면 배치 슬라이스는 12_Window에 있고 store 필드 이름(workspaceMode)과 기본값은 그대로다', async () => {
    const { createWindowModeSlice, isConversationLayout, selectWorkspaceMode } = await import('@renderer/12_Window/windowMode')
    const slice = createWindowModeSlice(() => {}, () => ({}) as never, {} as never)
    expect(slice.workspaceMode).toBe('single')
    expect(isConversationLayout('single')).toBe(true)
    expect(isConversationLayout('work')).toBe(false)
    const app = await import('@renderer/00_App/appStore')
    expect(app.selectWorkspaceMode).toBe(selectWorkspaceMode)
  })

  it('main.tsx에는 작업 공간 모드 분기가 없다', () => {
    const main = readFileSync(join(SRC_ROOT, 'main.tsx'), 'utf8')
    expect(main).toContain('restoreSavedWorkspace()')
    expect(main).not.toMatch(/'(multi|single|work)'/)
  })
})
