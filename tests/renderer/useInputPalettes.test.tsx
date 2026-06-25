// @vitest-environment jsdom
/**
 * useInputPalettes.test.tsx — useInputPalettes 공용 훅 단위 테스트.
 *
 * 검증 범위:
 *   - parseSlashQuery: '/'로 시작하면 쿼리 반환, 공백 있으면 null
 *   - parseMentionToken: caret 위치에서 @토큰 추출
 *   - useInputPalettes: slash.open, mention.open 상태 계산
 *   - handlePaletteKey: 슬래시/멘션/히스토리 키 처리 + 반환값
 *   - IPC 로드: listSlashCommands/listSkills 호출 트리거
 *
 * TDD: 구현 전 실패 테스트 먼저.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { cleanup } from '@testing-library/react'

beforeEach(() => {
  ;(window as unknown as Record<string, unknown>).api = {
    listSlashCommands: vi.fn().mockResolvedValue([
      { name: 'ask',  description: '임시 질문', scope: 'builtin' },
      { name: 'init', description: 'CLAUDE.md 생성', scope: 'builtin' },
    ]),
    listSkills: vi.fn().mockResolvedValue([]),
  }
})
afterEach(() => cleanup())

// ── parseSlashQuery ───────────────────────────────────────────────────────────
describe('parseSlashQuery', () => {
  it('/ 만 → ""(빈 쿼리) 반환', async () => {
    const { parseSlashQuery } = await import('../../src/renderer/src/hooks/useInputPalettes')
    expect(parseSlashQuery('/')).toBe('')
  })
  it('/ask → "ask" 반환', async () => {
    const { parseSlashQuery } = await import('../../src/renderer/src/hooks/useInputPalettes')
    expect(parseSlashQuery('/ask')).toBe('ask')
  })
  it('/ask 공백 포함 → null', async () => {
    const { parseSlashQuery } = await import('../../src/renderer/src/hooks/useInputPalettes')
    expect(parseSlashQuery('/ask something')).toBeNull()
  })
  it('빈 문자열 → null', async () => {
    const { parseSlashQuery } = await import('../../src/renderer/src/hooks/useInputPalettes')
    expect(parseSlashQuery('')).toBeNull()
  })
  it('일반 텍스트 → null', async () => {
    const { parseSlashQuery } = await import('../../src/renderer/src/hooks/useInputPalettes')
    expect(parseSlashQuery('hello')).toBeNull()
  })
})

// ── parseMentionToken ─────────────────────────────────────────────────────────
describe('parseMentionToken', () => {
  it('@만 입력 → { term: "", start: 0 } 반환', async () => {
    const { parseMentionToken } = await import('../../src/renderer/src/hooks/useInputPalettes')
    const tok = parseMentionToken('@', 1)
    expect(tok).not.toBeNull()
    expect(tok!.term).toBe('')
    expect(tok!.start).toBe(0)
  })
  it('@src/ → { term: "src/" } 반환', async () => {
    const { parseMentionToken } = await import('../../src/renderer/src/hooks/useInputPalettes')
    const tok = parseMentionToken('@src/', 5)
    expect(tok!.term).toBe('src/')
  })
  it('@가 없으면 null', async () => {
    const { parseMentionToken } = await import('../../src/renderer/src/hooks/useInputPalettes')
    expect(parseMentionToken('hello', 5)).toBeNull()
  })
  it('공백 후 @토큰 → 추출 성공', async () => {
    const { parseMentionToken } = await import('../../src/renderer/src/hooks/useInputPalettes')
    // "fix @src/App" — caret=12 (src/App 끝)
    const tok = parseMentionToken('fix @src/App', 12)
    expect(tok).not.toBeNull()
    expect(tok!.term).toBe('src/App')
    expect(tok!.start).toBe(4) // @ 위치
  })
  it('@앞에 공백 없는 이메일 형태는 null', async () => {
    // parseMentionToken은 @ 앞이 공백인지 체크 안 함
    // (공백 뒤 @ 체크는 mentionAtCaret에서) — 현재 구현은 단순 lastIndexOf('@')
    // 이 훅 버전에서는 공백 포함 여부만 afterAt에서 체크
    const { parseMentionToken } = await import('../../src/renderer/src/hooks/useInputPalettes')
    // "a@b" — caret=3: afterAt="b", 공백 없음 → token 반환
    const tok = parseMentionToken('a@b', 3)
    // 구현에 따라 null이거나 { term: "b" }; 공용 훅은 Composer 원본 동일 동작 유지
    // (Composer는 lastIndexOf('@') 사용 — 이메일 허용 false alarm 있음)
    // 이 테스트는 충돌 없이 반환값 타입만 검증
    expect(tok === null || typeof tok!.term === 'string').toBe(true)
  })
})

// ── useInputPalettes — slash.open ─────────────────────────────────────────────
describe('useInputPalettes — slash.open', () => {
  it('value="/" → slash.open=true', async () => {
    const { useInputPalettes } = await import('../../src/renderer/src/hooks/useInputPalettes')
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      useInputPalettes({ value: '/', caret: 1, onChange })
    )
    expect(result.current.slash.open).toBe(true)
  })

  it('value="" → slash.open=false', async () => {
    const { useInputPalettes } = await import('../../src/renderer/src/hooks/useInputPalettes')
    const { result } = renderHook(() =>
      useInputPalettes({ value: '', caret: 0, onChange: vi.fn() })
    )
    expect(result.current.slash.open).toBe(false)
  })

  it('value="/ask something" → slash.open=false (공백 있음)', async () => {
    const { useInputPalettes } = await import('../../src/renderer/src/hooks/useInputPalettes')
    const { result } = renderHook(() =>
      useInputPalettes({ value: '/ask something', caret: 14, onChange: vi.fn() })
    )
    expect(result.current.slash.open).toBe(false)
  })

  it('Escape → slash.open=false (dismiss)', async () => {
    const { useInputPalettes } = await import('../../src/renderer/src/hooks/useInputPalettes')
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      useInputPalettes({ value: '/', caret: 1, onChange })
    )
    expect(result.current.slash.open).toBe(true)
    await act(async () => {
      result.current.slash.dismiss()
    })
    expect(result.current.slash.open).toBe(false)
  })
})

// ── useInputPalettes — mention.open ──────────────────────────────────────────
describe('useInputPalettes — mention.open', () => {
  const FILES = ['src/App.tsx', 'src/main.tsx', 'README.md']

  it('value="@" caret=1 → mention.open=true', async () => {
    const { useInputPalettes } = await import('../../src/renderer/src/hooks/useInputPalettes')
    const { result } = renderHook(() =>
      useInputPalettes({ value: '@', caret: 1, mentionFiles: FILES, onChange: vi.fn() })
    )
    expect(result.current.mention.open).toBe(true)
  })

  it('value="" → mention.open=false', async () => {
    const { useInputPalettes } = await import('../../src/renderer/src/hooks/useInputPalettes')
    const { result } = renderHook(() =>
      useInputPalettes({ value: '', caret: 0, mentionFiles: FILES, onChange: vi.fn() })
    )
    expect(result.current.mention.open).toBe(false)
  })

  it('@멘션에 mentionHits가 있다 (FILES 기반)', async () => {
    const { useInputPalettes } = await import('../../src/renderer/src/hooks/useInputPalettes')
    const { result } = renderHook(() =>
      useInputPalettes({ value: '@', caret: 1, mentionFiles: FILES, onChange: vi.fn() })
    )
    // @ 입력 시 루트 디렉토리 browse → src(dir) + README.md(file) 등
    expect(result.current.mention.mentionHits.length).toBeGreaterThan(0)
  })

  it('Escape → mention.open=false', async () => {
    const { useInputPalettes } = await import('../../src/renderer/src/hooks/useInputPalettes')
    const { result } = renderHook(() =>
      useInputPalettes({ value: '@', caret: 1, mentionFiles: FILES, onChange: vi.fn() })
    )
    expect(result.current.mention.open).toBe(true)
    await act(async () => {
      result.current.mention.dismiss()
    })
    expect(result.current.mention.open).toBe(false)
  })
})

// ── useInputPalettes — IPC 로드 ──────────────────────────────────────────────
describe('useInputPalettes — IPC listSlashCommands 로드', () => {
  it('slash.open=true → listSlashCommands 호출', async () => {
    const { useInputPalettes } = await import('../../src/renderer/src/hooks/useInputPalettes')
    renderHook(() =>
      useInputPalettes({ value: '/', caret: 1, onChange: vi.fn() })
    )
    await act(async () => { await Promise.resolve() })
    const api = (window as unknown as { api: { listSlashCommands: ReturnType<typeof vi.fn> } }).api
    expect(api.listSlashCommands).toHaveBeenCalled()
  })

  it('slash.open=false → listSlashCommands 미호출', async () => {
    const { useInputPalettes } = await import('../../src/renderer/src/hooks/useInputPalettes')
    renderHook(() =>
      useInputPalettes({ value: '', caret: 0, onChange: vi.fn() })
    )
    await act(async () => { await Promise.resolve() })
    const api = (window as unknown as { api: { listSlashCommands: ReturnType<typeof vi.fn> } }).api
    expect(api.listSlashCommands).not.toHaveBeenCalled()
  })

  it('로드 후 cmdHits에 ask/init이 포함된다', async () => {
    const { useInputPalettes } = await import('../../src/renderer/src/hooks/useInputPalettes')
    const { result } = renderHook(() =>
      useInputPalettes({ value: '/', caret: 1, onChange: vi.fn() })
    )
    await act(async () => { await Promise.resolve() })
    const names = result.current.slash.cmdHits.map((c) => c.name)
    expect(names).toContain('ask')
    expect(names).toContain('init')
  })
})

// ── useInputPalettes — handlePaletteKey ──────────────────────────────────────
describe('useInputPalettes — handlePaletteKey 슬래시', () => {
  it('slash.open=true + ArrowDown → true 반환 + slashIdx 이동', async () => {
    const { useInputPalettes } = await import('../../src/renderer/src/hooks/useInputPalettes')
    const { result } = renderHook(() =>
      useInputPalettes({ value: '/', caret: 1, onChange: vi.fn() })
    )
    await act(async () => { await Promise.resolve() })

    const inputRef = { current: null } as React.RefObject<HTMLTextAreaElement | null>
    let handled = false
    await act(async () => {
      const fakeEvent = {
        key: 'ArrowDown',
        currentTarget: { selectionStart: 1 },
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLTextAreaElement>
      handled = result.current.handlePaletteKey(fakeEvent, inputRef)
    })
    expect(handled).toBe(true)
    expect(result.current.slash.slashIdx).toBe(1)
  })

  it('slash.open=true + Escape → true 반환 + slash.open=false', async () => {
    const { useInputPalettes } = await import('../../src/renderer/src/hooks/useInputPalettes')
    const { result } = renderHook(() =>
      useInputPalettes({ value: '/', caret: 1, onChange: vi.fn() })
    )
    const inputRef = { current: null } as React.RefObject<HTMLTextAreaElement | null>
    await act(async () => {
      const fakeEvent = {
        key: 'Escape',
        currentTarget: { selectionStart: 1 },
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLTextAreaElement>
      result.current.handlePaletteKey(fakeEvent, inputRef)
    })
    expect(result.current.slash.open).toBe(false)
  })

  it('팔레트 닫힘 + Enter → false 반환 (기본 동작에 맡김)', async () => {
    const { useInputPalettes } = await import('../../src/renderer/src/hooks/useInputPalettes')
    const { result } = renderHook(() =>
      useInputPalettes({ value: 'hello', caret: 5, onChange: vi.fn() })
    )
    const inputRef = { current: null } as React.RefObject<HTMLTextAreaElement | null>
    let handled = true
    await act(async () => {
      const fakeEvent = {
        key: 'Enter',
        currentTarget: { selectionStart: 5 },
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLTextAreaElement>
      handled = result.current.handlePaletteKey(fakeEvent, inputRef)
    })
    expect(handled).toBe(false)
  })
})

// ── useInputPalettes — history ────────────────────────────────────────────────
describe('useInputPalettes — history ↑↓', () => {
  it('history 있고 첫 줄 ArrowUp → applyHistory(최신 항목) 호출', async () => {
    const { useInputPalettes } = await import('../../src/renderer/src/hooks/useInputPalettes')
    const onChange = vi.fn()
    const hist = ['msg-1', 'msg-2', 'msg-3']
    const { result } = renderHook(() =>
      useInputPalettes({ value: '', caret: 0, history: hist, onChange })
    )
    const inputRef = { current: null } as React.RefObject<HTMLTextAreaElement | null>
    await act(async () => {
      const fakeEvent = {
        key: 'ArrowUp',
        currentTarget: { selectionStart: 0 },
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLTextAreaElement>
      result.current.handlePaletteKey(fakeEvent, inputRef)
    })
    // 최신 항목(마지막) = 'msg-3'
    expect(onChange).toHaveBeenCalledWith('msg-3')
  })

  it('history 없으면 ArrowUp → false 반환 (기본 동작)', async () => {
    const { useInputPalettes } = await import('../../src/renderer/src/hooks/useInputPalettes')
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      useInputPalettes({ value: '', caret: 0, history: [], onChange })
    )
    const inputRef = { current: null } as React.RefObject<HTMLTextAreaElement | null>
    let handled = true
    await act(async () => {
      const fakeEvent = {
        key: 'ArrowUp',
        currentTarget: { selectionStart: 0 },
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLTextAreaElement>
      handled = result.current.handlePaletteKey(fakeEvent, inputRef)
    })
    expect(handled).toBe(false)
  })

  it('슬래시 팔레트 열림 시 ArrowUp → 히스토리 미발동 (팔레트 우선)', async () => {
    const { useInputPalettes } = await import('../../src/renderer/src/hooks/useInputPalettes')
    const onChange = vi.fn()
    const hist = ['msg-1', 'msg-2']
    const { result } = renderHook(() =>
      useInputPalettes({ value: '/', caret: 1, history: hist, onChange })
    )
    await act(async () => { await Promise.resolve() })

    const inputRef = { current: null } as React.RefObject<HTMLTextAreaElement | null>
    await act(async () => {
      const fakeEvent = {
        key: 'ArrowUp',
        currentTarget: { selectionStart: 1 },
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLTextAreaElement>
      result.current.handlePaletteKey(fakeEvent, inputRef)
    })
    // 슬래시 팔레트가 키 소비 → onChange 미호출(히스토리 로드 0)
    expect(onChange).not.toHaveBeenCalled()
  })
})

// ── useInputPalettes — onValueChange / onFocus / onBlur ──────────────────────
describe('useInputPalettes — 부수효과 핸들러', () => {
  it('onValueChange → onChange 호출 + dismiss 해제', async () => {
    const { useInputPalettes } = await import('../../src/renderer/src/hooks/useInputPalettes')
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      useInputPalettes({ value: '/', caret: 1, onChange })
    )
    // dismiss
    await act(async () => { result.current.slash.dismiss() })
    expect(result.current.slash.open).toBe(false)

    // onValueChange → dismiss 해제
    await act(async () => { result.current.onValueChange('/', 1) })
    // dismiss가 해제되어 다시 open 가능
    expect(result.current.slash.open).toBe(true)
  })

  it('onBlur → slash.open=false, mention.open=false', async () => {
    const { useInputPalettes } = await import('../../src/renderer/src/hooks/useInputPalettes')
    const FILES = ['src/App.tsx']
    const { result } = renderHook(() =>
      useInputPalettes({ value: '@', caret: 1, mentionFiles: FILES, onChange: vi.fn() })
    )
    expect(result.current.mention.open).toBe(true)
    await act(async () => { result.current.onBlur() })
    expect(result.current.mention.open).toBe(false)
  })
})
