/**
 * CodeViewer.tsx — CodeMirror 6 읽기전용 코드 뷰어 + LSP 통합 (Phase 27c, 갭 수정).
 *
 * - EditorState.readOnly.of(true) 읽기전용.
 * - 라인 번호 표시.
 * - language prop → CodeMirror 언어 확장 매핑.
 * - 다크 테마(darcula.ts — UI_GUIDE 팔레트 연계).
 * - 큰 파일도 안전(CodeMirror 내장 가상화).
 *
 * LSP 통합 (rootId+relPath 전달 시):
 * - status 게이트: hoverTooltip 핸들러가 statusRef를 읽어 'ready' 시에만 IPC 호출.
 * - hoverTooltip(300ms): LSP hover → 마크다운 카드.
 *   - 핸들러는 buildBaseExtensions에 포함 (버려지지 않음, 갭1 수정).
 *   - statusRef/rootIdRef/relPathRef로 EditorView 재생성 없이 동적 판단.
 * - 정의이동(F12): EditorView keymap.of([{key:'F12', run}]) 에디터 스코프 (갭2 수정).
 *   - 전역 document.addEventListener 제거 → 포커스된 에디터에서만 발화.
 *   - 여러 CodeViewer 동시 마운트 시 중복 등록 없음.
 * - 시맨틱 토큰(StateField): cachedTokens 즉시 → semanticTokens 갱신. 재생성 없음.
 *
 * plan-auditor 🟡-D 반영:
 * - StateField + StateEffect로 Decoration 갱신 (EditorView 전체 재생성 금지).
 * - [content, language] deps 유지 (내용/언어 변경 시 뷰 재생성 — 정상 동작).
 * - LSP 확장(hover) buildBaseExtensions에 포함, statusRef 런타임 게이트.
 *
 * CRITICAL: renderer untrusted — fs/proc/db/network 직접 0.
 * window.api.lsp.* IPC 경유만. relPath/rootId 절대경로 금지.
 * 인라인 색상 0 — CSS 클래스 토큰만.
 */
import { useEffect, useRef, useState, memo, useCallback, type JSX } from 'react'
import { EditorView, lineNumbers, highlightActiveLineGutter, hoverTooltip, Decoration, keymap } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import { EditorState, StateField, StateEffect } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches, search } from '@codemirror/search'
import { indentOnInput, foldGutter, bracketMatching } from '@codemirror/language'
import { drawSelection, highlightSpecialChars } from '@codemirror/view'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { darculaTheme, darculaHighlighting } from '../../theme/darcula'
import { useAppStore } from '../../store/appStore'
import type { LspSemanticTokens } from '../../../../shared/ipc-contract'
import { loadEditorFont, saveEditorFont, nextEditorFont } from '../../lib/editorFont'
import './CodeViewer.css'

// ── LSP 유틸 ────────────────────────────────────────────────────────────────

/**
 * CodeMirror offset → LSP 0-based {line, character}.
 * line: 0-based (CodeMirror는 1-based이므로 -1).
 * character: offset - line.from (UTF-16 code unit 오프셋 근사 — ASCII 범위 동일).
 */
function toLspPos(view: EditorView, offset: number): { line: number; character: number } {
  const line = view.state.doc.lineAt(offset)
  return { line: line.number - 1, character: offset - line.from }
}

/**
 * 시맨틱 토큰 타입 → CSS 클래스.
 * sem-<type> 패턴 (CodeViewer.css에서 정의).
 * 인라인 색상 0 — CSS 클래스만.
 */
export function semClass(type: string): string {
  return `sem-${type}`
}

/**
 * LSP 시맨틱 토큰 델타 인코딩 디코더.
 * 입력: data = [deltaLine, deltaChar, length, typeIdx, modsMask] × n (5개씩).
 * 출력: 절대 위치 레코드 배열.
 *
 * 디코딩 규칙 (LSP 표준):
 * - deltaLine > 0 이면 현재 라인 += deltaLine, startChar = deltaChar.
 * - deltaLine = 0 이면 startChar += deltaChar.
 */
export function decodeSemanticTokens(
  data: number[],
  types: string[],
  _mods: string[]
): Array<{ line: number; startChar: number; length: number; type: string }> {
  const result: Array<{ line: number; startChar: number; length: number; type: string }> = []
  let line = 0
  let startChar = 0

  for (let i = 0; i < data.length; i += 5) {
    const deltaLine = data[i]
    const deltaChar = data[i + 1]
    const length = data[i + 2]
    const typeIdx = data[i + 3]
    // modsMask = data[i + 4] — 현재 미사용 (스타일링은 타입만으로)

    if (deltaLine > 0) {
      line += deltaLine
      startChar = deltaChar
    } else {
      startChar += deltaChar
    }

    const type = types[typeIdx] ?? 'unknown'
    result.push({ line, startChar, length, type })
  }

  return result
}

// ── StateEffect + StateField (plan-auditor 🟡-D: 재생성 금지) ──────────────────

/** 시맨틱 토큰 Decoration 교체 Effect */
const setSemanticTokens = StateEffect.define<DecorationSet>()

/**
 * 시맨틱 토큰 Decoration StateField.
 * setSemanticTokens Effect 수신 시 Decoration 교체 (EditorView 재생성 없음).
 */
const semanticTokenField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(setSemanticTokens)) {
        deco = e.value
      }
    }
    return deco
  },
  provide(f) {
    return EditorView.decorations.from(f)
  },
})

// ── 언어 확장 매핑 ──────────────────────────────────────────────────────────────

/**
 * FsReadResponse.language 문자열 → CodeMirror 언어 확장.
 * MVP: js/ts/json/py/md/html/css/text. 알 수 없는 언어는 null(구문 없음).
 */
function getLanguageExtension(language: string) {
  const lang = language.toLowerCase()
  switch (lang) {
    case 'javascript':
    case 'js':
      return javascript()
    case 'typescript':
    case 'ts':
    case 'tsx':
    case 'jsx':
      return javascript({ typescript: true, jsx: true })
    case 'python':
    case 'py':
      return python()
    case 'json':
      return json()
    case 'markdown':
    case 'md':
      return markdown()
    case 'html':
      return html()
    case 'css':
      return css()
    default:
      return null
  }
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface CodeViewerProps {
  /** 표시할 파일 내용 */
  content: string
  /** 언어 힌트 (FsReadResponse.language — 확장자 기반) */
  language: string
  /** 파일 경로 (헤더 표시용 + SelectionAskBar 컨텍스트) */
  filePath?: string
  /**
   * 등록 루트 ID (WORKSPACE_ROOT_ID 또는 reference.add 발급 ID).
   * 제공 시 LSP 기능 활성화 시도 (status 게이트 통과 필요).
   * CRITICAL: 절대경로 아님 — main의 roots.ts 게이트 경유.
   */
  rootId?: string
  /**
   * 루트 기준 상대 경로 (untrusted).
   * rootId와 함께 제공 시에만 LSP 기능 활성화.
   * CRITICAL: '..'·절대경로 금지 — main의 resolveSafe 검증 통과 여부에 따라 처리.
   */
  relPath?: string
  /**
   * 선택 영역 질문 콜백 (W6b SelectionAskBar).
   * 코드 선택 후 "Claude에게 질문" 클릭 시 호출.
   * 신뢰경계: 선택 텍스트는 composer 텍스트로만 (eval 0).
   */
  onAskSelection?: (args: import('./SelectionAskBar').AskSelectionArgs) => void
}

// ── Ref 컨테이너 타입 (hover/F12 핸들러가 런타임 참조) ──────────────────────────

interface LspRefs {
  rootId: string | undefined
  relPath: string | undefined
  /** 'ready' | 'starting' | 'unsupported' | 'error' | '' */
  status: string
  openFile: (relPath: string, rootId?: string) => Promise<void>
}

// ── 기본 확장 세트 (읽기전용, 다크 테마) ────────────────────────────────────────

/**
 * buildBaseExtensions — LSP refs를 받아 hoverTooltip + F12 keymap을 포함한 확장 세트 반환.
 *
 * 갭1 수정: hoverTooltip을 buildBaseExtensions에서 직접 생성·포함.
 *   - 핸들러는 lspRefs.status를 런타임에 읽어 'ready'일 때만 IPC 호출.
 *   - EditorView 재생성 없이 status가 나중에 ready가 돼도 동작.
 *   - rootId/relPath가 없으면 즉시 null 반환 (LSP 비활성 경로).
 *
 * 갭2 수정: F12 keymap.of([{key:'F12', run}])로 에디터 스코프 등록.
 *   - document.addEventListener 전역 리스너 제거.
 *   - 여러 CodeViewer 동시 마운트 시 각자의 EditorView에만 존재 → 중복 없음.
 *   - run 함수는 lspRefs를 읽어 현재 rootId/relPath/status를 판단.
 *
 * @param language 언어 문자열
 * @param lspRefs LSP 런타임 상태 ref (마운트 후 갱신됨)
 * @param hasLsp LSP 활성 여부 (rootId+relPath 모두 있을 때 true)
 */
function buildBaseExtensions(
  language: string,
  lspRefs: React.MutableRefObject<LspRefs>,
  hasLsp: boolean
): Extension[] {
  const langExtension = getLanguageExtension(language)

  // 갭1: hoverTooltip 핸들러 — statusRef 런타임 게이트
  const hoverExt = hasLsp
    ? hoverTooltip(
        async (view: EditorView, pos: number) => {
          const refs = lspRefs.current
          // 런타임 게이트: rootId/relPath/status 모두 확인
          if (!refs.rootId || !refs.relPath || refs.status !== 'ready') return null

          const lspPos = toLspPos(view, pos)
          let result: { contents: string } | null = null
          try {
            result = await window.api.lsp.hover({ rootId: refs.rootId, relPath: refs.relPath, pos: lspPos })
          } catch {
            return null
          }
          if (!result || !result.contents) return null

          const md = result.contents
          return {
            pos,
            create() {
              const dom = document.createElement('div')
              dom.className = 'lsp-hover-card'
              // 마크다운 문자열을 pre 태그로 표시 (XSS 방지 — innerHTML 미사용)
              // jsdom 환경에서는 createRoot 미작동 → pre로 단순 렌더 (E2E에서는 react-markdown 사용 가능)
              const pre = document.createElement('pre')
              pre.className = 'lsp-hover-md'
              pre.textContent = md
              dom.appendChild(pre)
              return { dom }
            },
          }
        },
        { hoverTime: 300 }
      )
    : null

  // 갭2: F12 키맵 — EditorView keymap.of 에디터 스코프 등록
  // run 함수: lspRefs를 읽어 status='ready'일 때만 lsp.definition 호출
  const f12Keymap = hasLsp
    ? keymap.of([
        {
          key: 'F12',
          run: (view: EditorView): boolean => {
            const refs = lspRefs.current
            if (!refs.rootId || !refs.relPath || refs.status !== 'ready') return false

            const offset = view.state.selection.main.head
            const lspPos = toLspPos(view, offset)
            const { rootId, relPath, openFile } = refs

            void window.api.lsp
              .definition({ rootId, relPath, pos: lspPos })
              .then((locs) => {
                if (!locs || locs.length === 0) return // no-op
                const loc = locs[0]
                // openFile(relPath, rootId) — store 액션 경유 (IPC untrusted)
                void openFile(loc.relPath, rootId)
              })
              .catch(() => {})

            return true
          },
        },
      ])
    : null

  return [
    // 읽기전용
    EditorState.readOnly.of(true),
    // UI
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    drawSelection(),
    // 언어
    ...(langExtension ? [langExtension] : []),
    // 편의
    indentOnInput(),
    bracketMatching(),
    foldGutter(),
    highlightSelectionMatches(),
    history(),
    // CM6 검색 패널 (W6a): search() 확장 → Ctrl+F로 패널 열기 가능
    search(),
    // 키맵 (읽기전용이지만 스크롤/검색은 허용)
    // 갭2: F12 keymap은 hasLsp 시에만 포함 (EditorView 스코프)
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    ...(f12Keymap ? [f12Keymap] : []),
    // 테마
    darculaTheme,
    darculaHighlighting,
    // 시맨틱 토큰 StateField (항상 포함 — LSP 활성 시 dispatch로 채움)
    semanticTokenField,
    // 갭1: hoverTooltip 확장 (hasLsp 시에만, 버려지지 않음)
    ...(hoverExt ? [hoverExt] : []),
  ]
}

// ── 시맨틱 토큰 → Decoration 변환 ────────────────────────────────────────────

/**
 * LspSemanticTokens → CodeMirror DecorationSet.
 * 각 토큰을 sem-<type> 클래스 Decoration.mark로 변환.
 * doc을 참조하여 라인 offset → 절대 offset 계산.
 */
function buildSemanticDecorations(
  tokens: LspSemanticTokens,
  doc: EditorView['state']['doc']
): DecorationSet {
  const decoded = decodeSemanticTokens(tokens.data, tokens.types, tokens.mods)
  const ranges: Array<ReturnType<ReturnType<typeof Decoration.mark>['range']>> = []

  for (const tok of decoded) {
    // 1-based line (CodeMirror API)
    const lineNum = tok.line + 1
    if (lineNum > doc.lines) continue
    const line = doc.line(lineNum)
    const from = line.from + tok.startChar
    const to = from + tok.length
    if (to > line.to) continue // 라인 범위 초과 방지

    const cls = semClass(tok.type)
    ranges.push(Decoration.mark({ class: cls }).range(from, to))
  }

  // CodeMirror Decoration.set은 from 기준 오름차순 정렬 필요
  ranges.sort((a, b) => a.from - b.from)
  return Decoration.set(ranges)
}

// ── React import (JSX 사용) ───────────────────────────────────────────────────
import React from 'react'
import { SelectionAskBar } from './SelectionAskBar'
import './SelectionAskBar.css'

// ── CodeViewer ────────────────────────────────────────────────────────────────

function CodeViewerInner({ content, language, filePath, rootId, relPath, onAskSelection }: CodeViewerProps): JSX.Element {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const openFile = useAppStore((s) => s.openFile)

  // #6: 에디터 폰트 크기 상태 (localStorage 영속)
  const [fontSize, setFontSize] = useState<number>(() => loadEditorFont())

  // #6: Ctrl+= / Ctrl+- 키 핸들러 (에디터 컨테이너 스코프)
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!e.ctrlKey) return
    // Ctrl+= (키보드 '=' 또는 '+') → 키우기
    // Ctrl+- → 줄이기
    // 브라우저 기본 Ctrl+/-/= 줌 방지
    if (e.key === '=' || e.key === '+') {
      e.preventDefault()
      setFontSize((prev) => {
        const next = nextEditorFont(prev, 1)
        saveEditorFont(next)
        return next
      })
    } else if (e.key === '-') {
      e.preventDefault()
      setFontSize((prev) => {
        const next = nextEditorFont(prev, -1)
        saveEditorFont(next)
        return next
      })
    }
  }, [])

  // LSP 활성 여부: rootId + relPath 모두 있어야 활성화 시도
  const hasLsp = Boolean(rootId && relPath)

  /**
   * lspRefs: hover/F12 핸들러가 클로저로 참조하는 런타임 상태.
   * - EditorView 재생성 없이 status/rootId/relPath 변경에 대응.
   * - useRef로 stable reference → 핸들러가 항상 최신 값 읽음.
   */
  const lspRefs = useRef<LspRefs>({
    rootId,
    relPath,
    status: '',  // 초기: 미확인
    openFile,
  })

  // lspRefs를 prop/액션 변경에 동기화 (매 렌더마다)
  lspRefs.current.rootId = rootId
  lspRefs.current.relPath = relPath
  lspRefs.current.openFile = openFile

  // 마운트/언마운트 시 EditorView 생성/정리
  // content/language 변경 → 뷰 재생성 (기존 동작 유지)
  // hover/F12 확장은 buildBaseExtensions에 포함 — EditorView와 함께 생성됨
  useEffect(() => {
    if (!editorRef.current) return

    const state = EditorState.create({
      doc: content,
      extensions: buildBaseExtensions(language, lspRefs, hasLsp),
    })

    const view = new EditorView({
      state,
      parent: editorRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, language])

  // LSP 상태 확인 + semantic 확장 장착
  // status 게이트: 'ready'일 때만 semanticTokens 활성.
  // hoverTooltip 핸들러는 lspRefs.status를 직접 읽으므로 별도 장착 불필요.
  // StateEffect.of()로 dispatch → EditorView 재생성 없음 (🟡-D 준수).
  useEffect(() => {
    if (!hasLsp || !rootId || !relPath) return

    let cancelled = false

    const run = async (): Promise<void> => {
      // 1. status 게이트 — lspRefs에 기록해 hover/F12 핸들러도 사용
      let status: string
      try {
        status = await window.api.lsp.status({ rootId, relPath })
      } catch {
        return
      }

      if (cancelled) return

      // lspRefs.status 갱신 → hover/F12 핸들러가 즉시 참조
      lspRefs.current.status = status

      if (status !== 'ready') return // 'unsupported'·'starting'·'error' → semantic 비활성

      const view = viewRef.current
      if (!view) return

      // 2. cachedTokens 즉시 색칠
      let cached: LspSemanticTokens | null = null
      try {
        cached = await window.api.lsp.cachedTokens({ rootId, relPath })
      } catch {
        // 캐시 실패 무시
      }

      if (cancelled) return

      if (cached && view) {
        try {
          const decoSet = buildSemanticDecorations(cached, view.state.doc)
          view.dispatch({ effects: [setSemanticTokens.of(decoSet)] })
        } catch {
          // 변환 실패 무시
        }
      }

      // 3. semanticTokens 라이브 갱신 (ready 상태)
      let live: LspSemanticTokens | null = null
      try {
        live = await window.api.lsp.semanticTokens({ rootId, relPath })
      } catch {
        // 라이브 실패 무시
      }

      if (cancelled) return

      if (live && view) {
        try {
          const decoSet = buildSemanticDecorations(live, view.state.doc)
          view.dispatch({ effects: [setSemanticTokens.of(decoSet)] })
        } catch {
          // 변환 실패 무시
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [hasLsp, rootId, relPath])

  return (
    <div className="code-viewer" aria-label={filePath ? `코드 뷰어: ${filePath}` : '코드 뷰어'}>
      {filePath && (
        <div className="code-viewer-header">
          <span className="code-viewer-path" title={filePath}>{filePath}</span>
          <span className="code-viewer-lang">{language}</span>
        </div>
      )}
      {/* #6: onKeyDown으로 Ctrl+=/- 폰트 조절. fontSize 인라인(색 아님, 수치 인라인 허용).
          tabIndex=0으로 키보드 포커스 가능. 기존 CM6 내부 키맵과 충돌 없음
          (CM6 keymap은 cm-editor 내부 DOM에서 처리, 여기는 컨테이너 레벨). */}
      <div
        className="code-viewer-editor"
        ref={editorRef}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        style={{ fontSize: `${fontSize}px` }}
      />
      {/* W6b: SelectionAskBar — CM6 선택 시 부동 질문 툴바 */}
      {onAskSelection && (
        <SelectionAskBar
          viewRef={viewRef}
          filePath={filePath}
          onAskSelection={onAskSelection}
        />
      )}
    </div>
  )
}

export const CodeViewer = memo(CodeViewerInner)
export default CodeViewer
