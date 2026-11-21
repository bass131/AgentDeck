// Taste·헌장의 두 거처. 전역 Taste는 앱 데이터 폴더, 프로젝트 헌장·Taste는 작업 저장소 안의 사람이 읽는 문서다
// (`.agentdeck/` 실행기 상태와 섞지 않는다). 이 모듈은 파일만 쓰고 커밋하지 않는다.
// 읽기·쓰기는 뿌리 기준 상대 경로로 fsPort를 지난다 — junction·링크를 따라간 실제 경로가 뿌리 밖이면 거절한다.
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { createFsPort } from '@main/05_Loop/realPorts/fsPort'
import {
  scanCharter,
  scanTaste,
  serializeCharter,
  serializeTaste,
  type CharterDoc,
  type DocProblem,
  type TasteDoc,
  type TasteItem,
  type TasteScope,
} from '@shared/14_Taste/tasteDoc'
import type { DocRead, TasteDocsRead, TasteDraft } from '@shared/14_Taste/taste'

const GLOBAL_REL = 'taste/global-taste.md'
const CHARTER_REL = 'docs/agentdeck/헌장.md'
export const PROJECT_TASTE_REL = 'docs/agentdeck/Taste.md'

export const LOOP_DOC_MAX_BYTES = 32 * 1024

export const globalTastePath = (userDataDir: string): string => path.join(userDataDir, ...GLOBAL_REL.split('/'))
export const projectCharterPath = (root: string): string => path.join(root, ...CHARTER_REL.split('/'))
export const projectTastePath = (root: string): string => path.join(root, ...PROJECT_TASTE_REL.split('/'))

// bad-input: 쓰면 다시 읽은 구조가 달라지거나 문제가 생기는 입력. existing-problems: 지금 파일에 문제가 있어 덮어쓰면 글을 잃는다.
export class TasteWriteError extends Error {
  constructor(readonly kind: 'bad-input' | 'existing-problems', message: string, readonly problems: DocProblem[] = []) {
    super(message)
    this.name = 'TasteWriteError'
  }
}

const isAbsentCode = (e: unknown): boolean => {
  const code = (e as NodeJS.ErrnoException).code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

// 없으면 null. 그 밖의 실패는 「없음」과 섞이지 않게 던진다.
async function readRaw(root: string, rel: string): Promise<string | null> {
  try {
    return await createFsPort(root).read(rel)
  } catch (e) {
    if (isAbsentCode(e)) return null
    throw e
  }
}

type Scan<T> = (raw: string) => { doc: T; problems: DocProblem[] }

async function readDoc<T>(root: string, rel: string, scan: Scan<T>): Promise<DocRead<T>> {
  const file = path.join(root, ...rel.split('/'))
  let raw: string | null
  try {
    raw = await readRaw(root, rel)
  } catch (e) {
    const message = `읽지 못했다 — ${e instanceof Error ? e.message : String(e)}`
    return { absent: false, path: file, raw: '', doc: scan('').doc, problems: [{ kind: 'unreadable', line: null, message }] }
  }
  if (raw === null) return { absent: true, path: file }
  return { absent: false, path: file, raw, ...scan(raw) }
}

const tasteScan = (scope: TasteScope): Scan<TasteDoc> => (t) => scanTaste(t, scope)

// 검수의 판 — 전역 Taste 원문. 없으면 null, 그 밖의 실패는 던진다
export const readGlobalTaste = (userDataDir: string): Promise<string | null> => readRaw(userDataDir, GLOBAL_REL)

export async function readTasteDocs(userDataDir: string, root: string): Promise<TasteDocsRead> {
  const [global, charter, project] = await Promise.all([
    readDoc(userDataDir, GLOBAL_REL, tasteScan('global')),
    readDoc(root, CHARTER_REL, scanCharter),
    readDoc(root, PROJECT_TASTE_REL, tasteScan('project')),
  ])
  return { global, charter, project }
}

const hasBreak = (s: string): boolean => /[\r\n]/.test(s)

function checkTasteInput(items: TasteItem[]): void {
  for (const item of items) {
    const values = [item.id, item.title, ...item.fields.flatMap((f) => [f.name, f.text])]
    if (values.some(hasBreak)) throw new TasteWriteError('bad-input', `${item.id}: 줄바꿈이 든 값은 쓰지 않는다`)
    if (item.fields.some((f) => f.name.includes(':'))) throw new TasteWriteError('bad-input', `${item.id}: 칸 이름에 쌍점을 쓰지 않는다`)
  }
}

// 쓸 글을 다시 읽어 같은 구조이고 문제가 없을 때만 쓴다.
function checkRoundTrip<T>(text: string, scan: Scan<T>, expected: T): void {
  const back = scan(text)
  if (back.problems.length > 0) throw new TasteWriteError('bad-input', '다시 읽으면 문제가 있는 글은 쓰지 않는다', back.problems)
  if (!isDeepStrictEqual(back.doc, expected)) throw new TasteWriteError('bad-input', '다시 읽은 구조가 쓰려는 구조와 다르다')
}

async function checkExisting<T>(root: string, rel: string, scan: Scan<T>): Promise<void> {
  const current = await readRaw(root, rel)
  if (current !== null && current.trim() !== '') {
    const { problems } = scan(current)
    if (problems.length > 0) throw new TasteWriteError('existing-problems', `${rel}에 문제가 있어 덮어쓰지 않는다`, problems)
  }
}

function tasteText(scope: TasteScope, items: TasteItem[]): string {
  checkTasteInput(items)
  const expected = { scope, items: items.map((i) => ({ id: i.id, title: i.title, fields: i.fields.map((f) => ({ name: f.name, text: f.text })) })) }
  const text = serializeTaste(expected)
  checkRoundTrip(text, tasteScan(scope), expected)
  return text
}

function charterText(doc: CharterDoc): string {
  const expected: CharterDoc = { goal: [...doc.goal], nonGoals: doc.nonGoals === null ? null : [...doc.nonGoals] }
  if ([...expected.goal, ...(expected.nonGoals ?? [])].some(hasBreak)) throw new TasteWriteError('bad-input', '헌장: 줄바꿈이 든 줄은 쓰지 않는다')
  const text = serializeCharter(expected)
  checkRoundTrip(text, scanCharter, expected)
  return text
}

interface Plan { root: string; rel: string; text: string; scan: Scan<unknown> }

async function writePlan(p: Plan): Promise<void> {
  await checkExisting(p.root, p.rel, p.scan)
  await createFsPort(p.root).write(p.rel, p.text)
}

export const writeGlobalTaste = async (userDataDir: string, items: TasteItem[]): Promise<void> =>
  writePlan({ root: userDataDir, rel: GLOBAL_REL, text: tasteText('global', items), scan: tasteScan('global') })

export const writeProjectTaste = async (root: string, items: TasteItem[]): Promise<void> =>
  writePlan({ root, rel: PROJECT_TASTE_REL, text: tasteText('project', items), scan: tasteScan('project') })

export const writeProjectCharter = async (root: string, doc: CharterDoc): Promise<void> =>
  writePlan({ root, rel: CHARTER_REL, text: charterText(doc), scan: scanCharter })

export interface TasteDirs { userDataDir: string | null; root: string }

// 루프 세션이 싣지 않을 크기의 문서는 쓰지 않는다
function planOf(draft: TasteDraft, dirs: TasteDirs): Plan {
  const p = planOfDoc(draft, dirs)
  const size = Buffer.byteLength(p.text, 'utf8')
  if (size > LOOP_DOC_MAX_BYTES) {
    throw new TasteWriteError('bad-input', `쓸 글이 ${size}바이트로 루프 세션이 싣는 상한 ${LOOP_DOC_MAX_BYTES}바이트를 넘는다 — 항목을 줄인다`)
  }
  return p
}

function planOfDoc(draft: TasteDraft, dirs: TasteDirs): Plan {
  switch (draft.doc) {
    case 'global-taste':
      if (dirs.userDataDir === null) throw new Error('전역 Taste의 거처(앱 데이터 폴더)를 모른다')
      return { root: dirs.userDataDir, rel: GLOBAL_REL, text: tasteText('global', draft.items), scan: tasteScan('global') }
    case 'project-taste':
      return { root: dirs.root, rel: PROJECT_TASTE_REL, text: tasteText('project', draft.items), scan: tasteScan('project') }
    case 'charter':
      return { root: dirs.root, rel: CHARTER_REL, text: charterText(draft.charter), scan: scanCharter }
  }
}

// 프로젝트 문서의 저장소 상대 경로와 쓸 글(뿌리를 읽지 않는다 — 확정 브랜치에서 쓰기 전에 커밋할 경로를 정한다)
export function projectDraftFile(draft: TasteDraft): { rel: string; text: string } {
  if (draft.doc === 'global-taste') throw new Error('전역 Taste는 프로젝트 문서가 아니다')
  const p = planOf(draft, { userDataDir: null, root: '' })
  return { rel: p.rel, text: p.text }
}

// 쓰기와 같은 검사를 돌리되 쓰지 않는다. 통과하면 쓸 글을 돌려준다.
export async function checkTasteDraft(draft: TasteDraft, dirs: TasteDirs): Promise<string> {
  const p = planOf(draft, dirs)
  await checkExisting(p.root, p.rel, p.scan)
  return p.text
}

export async function writeTasteDraft(draft: TasteDraft, dirs: TasteDirs): Promise<string> {
  const p = planOf(draft, dirs)
  await writePlan(p)
  return path.join(p.root, ...p.rel.split('/'))
}

type LoopDocRaw = string | null | { tooLarge: number }
interface LoopDocsRaw { global: LoopDocRaw; charter: LoopDocRaw; project: LoopDocRaw }

export function loopDocsAppend(raw: LoopDocsRaw): string | undefined {
  const labelled: [string, LoopDocRaw][] = [
    ['전역 Taste', raw.global],
    [`프로젝트 헌장 — ${CHARTER_REL}`, raw.charter],
    [`프로젝트 Taste — ${PROJECT_TASTE_REL}`, raw.project],
  ]
  const parts: string[] = []
  for (const [label, text] of labelled) {
    if (text === null) continue
    if (typeof text !== 'string') parts.push(`[${label}] 크기 ${text.tooLarge}바이트가 상한 ${LOOP_DOC_MAX_BYTES}바이트를 넘어 싣지 않았다.`)
    else if (text.trim() !== '') parts.push(`[${label}]\n${text.trim()}`)
  }
  return parts.length > 0 ? parts.join('\n\n') : undefined
}

// 한 장을 못 읽어도 세션은 연다 — 그 장만 빼고 main 로그에 남긴다. 크기는 읽기 전에 본다(작업 노드가 저장소 안 문서를 키울 수 있다).
async function loopDocRaw(root: string, rel: string): Promise<LoopDocRaw> {
  const file = path.join(root, ...rel.split('/'))
  try {
    const { size } = await fsp.stat(file)
    if (size > LOOP_DOC_MAX_BYTES) {
      console.error(`[taste] ${file}이 ${size}바이트로 상한 ${LOOP_DOC_MAX_BYTES}바이트를 넘어 루프 세션에 싣지 않는다`)
      return { tooLarge: size }
    }
    return await readRaw(root, rel)
  } catch (e) {
    if (isAbsentCode(e)) return null
    console.error(`[taste] ${file}을 읽지 못해 루프 세션에 싣지 않는다:`, e instanceof Error ? e.message : e)
    return null
  }
}

export async function loadLoopDocsAppend(userDataDir: string | undefined, root: string): Promise<string | undefined> {
  const [global, charter, project] = await Promise.all([
    userDataDir ? loopDocRaw(userDataDir, GLOBAL_REL) : Promise.resolve(null),
    loopDocRaw(root, CHARTER_REL),
    loopDocRaw(root, PROJECT_TASTE_REL),
  ])
  return loopDocsAppend({ global, charter, project })
}
