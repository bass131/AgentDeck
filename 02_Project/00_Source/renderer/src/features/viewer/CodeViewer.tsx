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
import type { LspSemanticTokens } from '../../../../shared/ipcContract'
import { loadEditorFont, saveEditorFont, nextEditorFont } from '../../lib/editorFont'
import './CodeViewer.css'

function toLspPos(view: EditorView, offset: number): { line: number; character: number } {
  const line = view.state.doc.lineAt(offset)
  return { line: line.number - 1, character: offset - line.from }
}

export function semClass(type: string): string {
  return `sem-${type}`
}

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

const setSemanticTokens = StateEffect.define<DecorationSet>()

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

export interface CodeViewerProps {
  content: string
  language: string
  filePath?: string
  rootId?: string
  relPath?: string
  line?: number
  onAskSelection?: (args: import('./SelectionAskBar').AskSelectionArgs) => void
}

interface LspRefs {
  rootId: string | undefined
  relPath: string | undefined
  status: string
  openFile: (relPath: string, rootId?: string) => Promise<void>
}

function buildBaseExtensions(
  language: string,
  lspRefs: React.MutableRefObject<LspRefs>,
  hasLsp: boolean
): Extension[] {
  const langExtension = getLanguageExtension(language)

  const hoverExt = hasLsp
    ? hoverTooltip(
        async (view: EditorView, pos: number) => {
          const refs = lspRefs.current
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
                if (!locs || locs.length === 0) return
                const loc = locs[0]
                void openFile(loc.relPath, rootId)
              })
              .catch(() => {})

            return true
          },
        },
      ])
    : null

  return [
    EditorState.readOnly.of(true),
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    drawSelection(),
    ...(langExtension ? [langExtension] : []),
    indentOnInput(),
    bracketMatching(),
    foldGutter(),
    highlightSelectionMatches(),
    history(),
    search(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    ...(f12Keymap ? [f12Keymap] : []),
    darculaTheme,
    darculaHighlighting,
    semanticTokenField,
    ...(hoverExt ? [hoverExt] : []),
  ]
}

function buildSemanticDecorations(
  tokens: LspSemanticTokens,
  doc: EditorView['state']['doc']
): DecorationSet {
  const decoded = decodeSemanticTokens(tokens.data, tokens.types, tokens.mods)
  const ranges: Array<ReturnType<ReturnType<typeof Decoration.mark>['range']>> = []

  for (const tok of decoded) {
    const lineNum = tok.line + 1
    if (lineNum > doc.lines) continue
    const line = doc.line(lineNum)
    const from = line.from + tok.startChar
    const to = from + tok.length
    if (to > line.to) continue

    const cls = semClass(tok.type)
    ranges.push(Decoration.mark({ class: cls }).range(from, to))
  }

  ranges.sort((a, b) => a.from - b.from)
  return Decoration.set(ranges)
}

import React from 'react'
import { SelectionAskBar } from './SelectionAskBar'
import './SelectionAskBar.css'

function CodeViewerInner({ content, language, filePath, rootId, relPath, line, onAskSelection }: CodeViewerProps): JSX.Element {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const openFile = useAppStore((s) => s.openFile)

  const [fontSize, setFontSize] = useState<number>(() => loadEditorFont())

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!e.ctrlKey) return
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

  const hasLsp = Boolean(rootId && relPath)

  const lspRefs = useRef<LspRefs>({
    rootId,
    relPath,
    status: '',
    openFile,
  })

  lspRefs.current.rootId = rootId
  lspRefs.current.relPath = relPath
  lspRefs.current.openFile = openFile

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

  useEffect(() => {
    if (line === undefined) return
    const view = viewRef.current
    if (!view) return
    if (!Number.isInteger(line) || line < 1 || line > view.state.doc.lines) return
    view.dispatch({
      effects: EditorView.scrollIntoView(view.state.doc.line(line).from, { y: 'center' }),
    })
  }, [content, language, line])

  useEffect(() => {
    if (!hasLsp || !rootId || !relPath) return

    let cancelled = false

    const run = async (): Promise<void> => {
      let status: string
      try {
        status = await window.api.lsp.status({ rootId, relPath })
      } catch {
        return
      }

      if (cancelled) return

      lspRefs.current.status = status

      if (status !== 'ready') return

      const view = viewRef.current
      if (!view) return

      let cached: LspSemanticTokens | null = null
      try {
        cached = await window.api.lsp.cachedTokens({ rootId, relPath })
      } catch {
      }

      if (cancelled) return

      if (cached && view) {
        try {
          const decoSet = buildSemanticDecorations(cached, view.state.doc)
          view.dispatch({ effects: [setSemanticTokens.of(decoSet)] })
        } catch {
        }
      }

      let live: LspSemanticTokens | null = null
      try {
        live = await window.api.lsp.semanticTokens({ rootId, relPath })
      } catch {
      }

      if (cancelled) return

      if (live && view) {
        try {
          const decoSet = buildSemanticDecorations(live, view.state.doc)
          view.dispatch({ effects: [setSemanticTokens.of(decoSet)] })
        } catch {
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
      <div
        className="code-viewer-editor"
        ref={editorRef}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        style={{ fontSize: `${fontSize}px` }}
      />
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
