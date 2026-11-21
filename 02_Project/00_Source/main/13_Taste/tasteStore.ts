// Taste·헌장의 두 거처. 전역 Taste는 앱 데이터 폴더, 프로젝트 헌장·Taste는 작업 저장소 안의 사람이 읽는 문서다
// (`.agentdeck/` 실행기 상태와 섞지 않는다). 이 모듈은 파일만 쓰고 커밋하지 않는다.
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { writeFileAtomic } from '@main/05_Loop/realPorts/atomicWrite'
import {
  parseCharter,
  parseTaste,
  serializeCharter,
  serializeTaste,
  validateCharter,
  validateTaste,
  type CharterDoc,
  type DocProblem,
  type TasteItem,
  type TasteScope,
} from '@shared/14_Taste/tasteDoc'
import type { DocRead, TasteDocsRead } from '@shared/14_Taste/taste'

const PROJECT_DIR = ['docs', 'agentdeck'] as const
const CHARTER_REL = [...PROJECT_DIR, '헌장.md'].join('/')
const PROJECT_TASTE_REL = [...PROJECT_DIR, 'Taste.md'].join('/')

export const globalTastePath = (userDataDir: string): string => path.join(userDataDir, 'taste', 'global-taste.md')
export const projectCharterPath = (root: string): string => path.join(root, ...PROJECT_DIR, '헌장.md')
export const projectTastePath = (root: string): string => path.join(root, ...PROJECT_DIR, 'Taste.md')

// 없으면 null. 그 밖의 실패는 「없음」과 섞이지 않게 던진다.
async function readRaw(file: string): Promise<string | null> {
  try {
    return await fsp.readFile(file, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

async function readDoc<T>(file: string, parse: (raw: string) => T, validate: (raw: string) => DocProblem[]): Promise<DocRead<T>> {
  const raw = await readRaw(file)
  if (raw === null) return { absent: true, path: file }
  return { absent: false, path: file, raw, doc: parse(raw), problems: validate(raw) }
}

const readTaste = (file: string, scope: TasteScope) =>
  readDoc(file, (t) => parseTaste(t, scope), (t) => validateTaste(t, scope))

export async function readTasteDocs(userDataDir: string, root: string): Promise<TasteDocsRead> {
  const [global, charter, project] = await Promise.all([
    readTaste(globalTastePath(userDataDir), 'global'),
    readDoc(projectCharterPath(root), parseCharter, validateCharter),
    readTaste(projectTastePath(root), 'project'),
  ])
  return { global, charter, project }
}

async function writeDoc(file: string, text: string): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await writeFileAtomic(file, text)
}

export const writeGlobalTaste = (userDataDir: string, items: TasteItem[]): Promise<void> =>
  writeDoc(globalTastePath(userDataDir), serializeTaste({ scope: 'global', items }))

export const writeProjectTaste = (root: string, items: TasteItem[]): Promise<void> =>
  writeDoc(projectTastePath(root), serializeTaste({ scope: 'project', items }))

export const writeProjectCharter = (root: string, doc: CharterDoc): Promise<void> =>
  writeDoc(projectCharterPath(root), serializeCharter(doc))

interface LoopDocsRaw { global: string | null; charter: string | null; project: string | null }

export function loopDocsAppend(raw: LoopDocsRaw): string | undefined {
  const labelled: [string, string | null][] = [
    ['전역 Taste', raw.global],
    [`프로젝트 헌장 — ${CHARTER_REL}`, raw.charter],
    [`프로젝트 Taste — ${PROJECT_TASTE_REL}`, raw.project],
  ]
  const parts = labelled
    .filter((p): p is [string, string] => p[1] !== null && p[1].trim() !== '')
    .map(([label, text]) => `[${label}]\n${text.trim()}`)
  return parts.length > 0 ? parts.join('\n\n') : undefined
}

// 한 장을 못 읽어도 세션은 연다 — 그 장만 빼고 main 로그에 남긴다.
async function rawOrSkip(file: string): Promise<string | null> {
  try {
    return await readRaw(file)
  } catch (e) {
    console.error(`[taste] ${file}을 읽지 못해 루프 세션에 싣지 않는다:`, e instanceof Error ? e.message : e)
    return null
  }
}

export async function loadLoopDocsAppend(userDataDir: string | undefined, root: string): Promise<string | undefined> {
  const [global, charter, project] = await Promise.all([
    userDataDir ? rawOrSkip(globalTastePath(userDataDir)) : Promise.resolve(null),
    rawOrSkip(projectCharterPath(root)),
    rawOrSkip(projectTastePath(root)),
  ])
  return loopDocsAppend({ global, charter, project })
}
