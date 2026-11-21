import type { CharterDoc, DocProblem, TasteDoc, TasteItem } from './tasteDoc'

export const TASTE_CHANNELS = {
  TASTE_READ: 'taste.read',
} as const

export interface TasteReadRequest { cwd: string }

export type TasteDocKind = 'global-taste' | 'project-taste' | 'charter'
// 메인 대화가 제안하는 문서 한 장의 구조. 앱이 쓰기 검사를 거쳐 사람 확정 뒤에만 쓴다.
export type TasteDraft =
  | { doc: 'global-taste' | 'project-taste'; items: TasteItem[] }
  | { doc: 'charter'; charter: CharterDoc }

export const TASTE_DOC_LABEL: Record<TasteDocKind, string> = {
  'global-taste': '전역 Taste',
  'project-taste': '프로젝트 Taste',
  charter: '프로젝트 헌장',
}

// global은 전역 Taste, project는 프로젝트 헌장과 프로젝트 Taste를 함께 다룬다
export type TasteDialogScope = 'global' | 'project'

// 파일이 없으면 absent다. 빈 파일은 absent가 아니라 빈 원문과 그 검사 문제다.
export type DocRead<T> =
  | { absent: true; path: string }
  | { absent: false; path: string; raw: string; doc: T; problems: DocProblem[] }

export interface TasteDocsRead {
  global: DocRead<TasteDoc>
  charter: DocRead<CharterDoc>
  project: DocRead<TasteDoc>
}
