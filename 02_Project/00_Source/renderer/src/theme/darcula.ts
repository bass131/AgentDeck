import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

const BG_0 = '#0e0f12'
const BG_1 = '#16181d'
const BG_2 = '#1e2127'
const BORDER = '#2a2e37'
const TEXT_0 = '#e6e8ec'
const TEXT_1 = '#9aa0aa'
const ACCENT = '#4c8dff'

const COLOR_KEYWORD = '#cc7832'
const COLOR_STRING = '#6a8759'
const COLOR_COMMENT = '#808080'
const COLOR_NUMBER = '#6897bb'
const COLOR_FUNCTION = '#ffc66d'
const COLOR_TYPE = '#a9b7c6'
const COLOR_OPERATOR = '#a9b7c6'
const COLOR_BUILTIN = '#8888c6'
const COLOR_VARIABLE = '#a9b7c6'
const COLOR_PROPERTY = '#9876aa'
const COLOR_PREPROCESSOR = '#bbb529'
const COLOR_INVALID = '#f85149'

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

export const darculaHighlighting = syntaxHighlighting(darculaHighlightStyle)
