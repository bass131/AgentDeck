/**
 * CodeViewer.tsx — CodeMirror 6 읽기전용 코드 뷰어.
 *
 * - EditorState.readOnly.of(true) 읽기전용.
 * - 라인 번호 표시.
 * - language prop → CodeMirror 언어 확장 매핑.
 * - 다크 테마(darcula.ts — UI_GUIDE 팔레트 연계).
 * - 큰 파일도 안전(CodeMirror 내장 가상화).
 *
 * CRITICAL: renderer untrusted — fs/Node/require 직접 호출 0.
 * Props로 content+language를 받아 순수 렌더. IPC 호출 0.
 * 인라인 색상 0 — CSS 클래스(darculaTheme 에디터 스타일) 사용.
 */
import { useEffect, useRef, memo, type JSX } from 'react'
import { EditorView, lineNumbers, highlightActiveLineGutter } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { indentOnInput, foldGutter, bracketMatching } from '@codemirror/language'
import { keymap, drawSelection, highlightSpecialChars } from '@codemirror/view'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { darculaTheme, darculaHighlighting } from '../theme/darcula'
import './CodeViewer.css'

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
  /** 파일 경로 (헤더 표시용, 선택) */
  filePath?: string
}

// ── 기본 확장 세트 (읽기전용, 다크 테마) ────────────────────────────────────────

function buildExtensions(language: string) {
  const langExtension = getLanguageExtension(language)

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
    // 키맵 (읽기전용이지만 스크롤/검색은 허용)
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    // 테마
    darculaTheme,
    darculaHighlighting,
  ]
}

// ── CodeViewer ────────────────────────────────────────────────────────────────

export function CodeViewer({ content, language, filePath }: CodeViewerProps): JSX.Element {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  // 마운트/언마운트 시 EditorView 생성/정리
  useEffect(() => {
    if (!editorRef.current) return

    const state = EditorState.create({
      doc: content,
      extensions: buildExtensions(language),
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
    // content/language가 바뀌면 뷰 재생성 (deps 의도적 고정)
  }, [content, language])

  return (
    <div className="code-viewer" aria-label={filePath ? `코드 뷰어: ${filePath}` : '코드 뷰어'}>
      {filePath && (
        <div className="code-viewer-header">
          <span className="code-viewer-path" title={filePath}>{filePath}</span>
          <span className="code-viewer-lang">{language}</span>
        </div>
      )}
      <div className="code-viewer-editor" ref={editorRef} />
    </div>
  )
}

export default memo(CodeViewer)
