import type { CharterDoc, DocProblem, TasteDoc, TasteItem } from './tasteDoc'

export const TASTE_CHANNELS = {
  TASTE_READ: 'taste.read',
} as const

export interface TasteReadRequest { cwd: string }

type TasteDocKind ='global-taste' | 'project-taste' | 'charter'
// 메인 대화가 제안하는 문서 한 장의 구조. 앱이 쓰기 검사를 거쳐 사람 확정 뒤에만 쓴다.
export type TasteDraft =
  | { doc: 'global-taste' | 'project-taste'; items: TasteItem[] }
  | { doc: 'charter'; charter: CharterDoc }

// 열려 있는 프로젝트 문서 PR. text는 PR이 쓴 원문 — 로컬 문서가 같아지면 병합이 들어온 것이다.
// GitHub에서 찾기만 한 PR은 문서와 원문을 모른다(번호와 브랜치만)
export interface TastePrNote { pr: number; branch: string; doc?: 'charter' | 'project-taste'; text?: string }

// 줄바꿈(CRLF)·BOM·줄 끝 공백이 달라도 같은 문서로 본다 — core.autocrlf 체크아웃이 원문을 바꾼다
const BOM = String.fromCharCode(0xfeff)
export function sameDocText(a: string, b: string): boolean {
  const norm = (s: string): string => (s.startsWith(BOM) ? s.slice(1) : s).replace(/\r\n?/g, '\n').split('\n').map((l) => l.trimEnd()).join('\n').trimEnd()
  return norm(a) === norm(b)
}
// 확정이 가른 브랜치와 돌아갈 브랜치
export interface TasteCut { original: string; branch: string }

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
