import type { CharterDoc, DocProblem, TasteDoc } from './tasteDoc'

export const TASTE_CHANNELS = {
  TASTE_READ: 'taste.read',
} as const

export interface TasteReadRequest { cwd: string }

// 파일이 없으면 absent다. 빈 파일은 absent가 아니라 빈 원문과 그 검사 문제다.
export type DocRead<T> =
  | { absent: true; path: string }
  | { absent: false; path: string; raw: string; doc: T; problems: DocProblem[] }

export interface TasteDocsRead {
  global: DocRead<TasteDoc>
  charter: DocRead<CharterDoc>
  project: DocRead<TasteDoc>
}
