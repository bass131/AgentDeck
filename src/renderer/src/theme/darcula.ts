/**
 * darcula.ts — Darcula풍 CodeMirror 6 다크 테마.
 *
 * UI_GUIDE 팔레트 CSS 변수와 연계. 색상은 JS 리터럴이지만
 * UI_GUIDE의 다크 팔레트 값을 그대로 반영한다.
 *
 * 안티슬롭: 네온 글로우 0, 그라데이션 0.
 * 등폭: JetBrains Mono / Cascadia Code / Consolas (UI_GUIDE 타이포).
 */
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

// UI_GUIDE 팔레트 참조 (CSS var 동일 값 사용)
const BG_0 = '#0e0f12' // --bg-0
const BG_1 = '#16181d' // --bg-1 (거터)
const BG_2 = '#1e2127' // --bg-2 (선택)
const BORDER = '#2a2e37' // --border
const TEXT_0 = '#e6e8ec' // --text-0
const TEXT_1 = '#9aa0aa' // --text-1
const ACCENT = '#4c8dff' // --accent

// Darcula 토큰 색상 (JetBrains Darcula 기반)
const COLOR_KEYWORD = '#cc7832' // Darcula orange-ish keyword
const COLOR_STRING = '#6a8759' // Darcula green string
const COLOR_COMMENT = '#808080' // Darcula gray comment
const COLOR_NUMBER = '#6897bb' // Darcula blue number
const COLOR_FUNCTION = '#ffc66d' // Darcula yellow function name
const COLOR_TYPE = '#a9b7c6' // Darcula light type/class
const COLOR_OPERATOR = '#a9b7c6'
const COLOR_BUILTIN = '#8888c6' // Darcula purple builtin
const COLOR_VARIABLE = '#a9b7c6'
const COLOR_PROPERTY = '#9876aa' // Darcula field/property
const COLOR_PREPROCESSOR = '#bbb529' // Darcula preprocessor/decorator
const COLOR_INVALID = '#f85149' // --del

/** CodeMirror 에디터 DOM 스타일 (다크) */
export const darculaTheme = EditorView.theme(
  {
    '&': {
      color: TEXT_0,
      backgroundColor: BG_0,
      fontSize: '13px',
      fontFamily: "'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
      height: '100%',
    },
    '.cm-content': {
      caretColor: ACCENT,
      padding: '4px 0',
    },
    '.cm-cursor': {
      borderLeftColor: ACCENT,
    },
    '.cm-selectionBackground': {
      backgroundColor: BG_2,
    },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: '#214283',
    },
    '.cm-gutters': {
      backgroundColor: BG_1,
      color: TEXT_1,
      border: 'none',
      borderRight: `1px solid ${BORDER}`,
      minWidth: '48px',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      paddingLeft: '8px',
      paddingRight: '8px',
      minWidth: '40px',
      textAlign: 'right',
      fontSize: '12px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: BG_2,
    },
    '.cm-activeLine': {
      backgroundColor: 'transparent',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: BG_2,
      border: `1px solid ${BORDER}`,
      color: TEXT_1,
    },
    '.cm-tooltip': {
      backgroundColor: BG_1,
      border: `1px solid ${BORDER}`,
      color: TEXT_0,
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: "'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
    },
    '.cm-line': {
      padding: '0 8px 0 4px',
    },
  },
  { dark: true }
)

/** 구문 하이라이팅 — Darcula 색상 매핑 */
export const darculaHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: COLOR_KEYWORD, fontStyle: 'bold' },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: COLOR_VARIABLE },
  { tag: [t.propertyName], color: COLOR_PROPERTY },
  { tag: [t.function(t.variableName), t.labelName], color: COLOR_FUNCTION },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: COLOR_BUILTIN },
  { tag: [t.definition(t.name), t.separator], color: TEXT_0 },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: COLOR_TYPE },
  { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: COLOR_OPERATOR },
  { tag: [t.meta, t.comment], color: COLOR_COMMENT, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: ACCENT, textDecoration: 'underline' },
  { tag: t.heading, fontWeight: 'bold', color: COLOR_FUNCTION },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: COLOR_BUILTIN },
  { tag: [t.processingInstruction, t.string, t.inserted], color: COLOR_STRING },
  { tag: t.number, color: COLOR_NUMBER },
  { tag: t.invalid, color: COLOR_INVALID },
  { tag: t.bracket, color: TEXT_1 },
  { tag: t.angleBracket, color: TEXT_1 },
  { tag: t.tagName, color: COLOR_KEYWORD, fontStyle: 'bold' },
  { tag: t.attributeName, color: COLOR_PROPERTY },
  { tag: t.definition(t.function(t.variableName)), color: COLOR_FUNCTION },
  { tag: t.moduleKeyword, color: COLOR_KEYWORD },
  { tag: t.controlKeyword, color: COLOR_KEYWORD, fontStyle: 'bold' },
  { tag: t.namespace, color: COLOR_PREPROCESSOR },
  { tag: t.annotation, color: COLOR_PREPROCESSOR },
  { tag: t.punctuation, color: TEXT_1 },
])

/** syntaxHighlighting 확장으로 감싼 darcula 하이라이트 */
export const darculaHighlighting = syntaxHighlighting(darculaHighlightStyle)
