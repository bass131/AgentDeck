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
import type { DocRead, TasteDocsRead } from '@shared/14_Taste/taste'

const GLOBAL_REL = 'taste/global-taste.md'
const CHARTER_REL = 'docs/agentdeck/헌장.md'
const PROJECT_TASTE_REL = 'docs/agentdeck/Taste.md'

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

async function writeDoc<T>(root: string, rel: string, text: string, scan: Scan<T>): Promise<void> {
  const current = await readRaw(root, rel)
  if (current !== null && current.trim() !== '') {
    const { problems } = scan(current)
    if (problems.length > 0) throw new TasteWriteError('existing-problems', `${rel}에 문제가 있어 덮어쓰지 않는다`, problems)
  }
  await createFsPort(root).write(rel, text)
}

async function writeTaste(root: string, rel: string, scope: TasteScope, items: TasteItem[]): Promise<void> {
  checkTasteInput(items)
  const expected = { scope, items: items.map((i) => ({ id: i.id, title: i.title, fields: i.fields.map((f) => ({ name: f.name, text: f.text })) })) }
  const text = serializeTaste(expected)
  checkRoundTrip(text, tasteScan(scope), expected)
  await writeDoc(root, rel, text, tasteScan(scope))
}

export const writeGlobalTaste = (userDataDir: string, items: TasteItem[]): Promise<void> =>
  writeTaste(userDataDir, GLOBAL_REL, 'global', items)

export const writeProjectTaste = (root: string, items: TasteItem[]): Promise<void> =>
  writeTaste(root, PROJECT_TASTE_REL, 'project', items)

export async function writeProjectCharter(root: string, doc: CharterDoc): Promise<void> {
  const expected: CharterDoc = { goal: [...doc.goal], nonGoals: doc.nonGoals === null ? null : [...doc.nonGoals] }
  if ([...expected.goal, ...(expected.nonGoals ?? [])].some(hasBreak)) throw new TasteWriteError('bad-input', '헌장: 줄바꿈이 든 줄은 쓰지 않는다')
  const text = serializeCharter(expected)
  checkRoundTrip(text, scanCharter, expected)
  await writeDoc(root, CHARTER_REL, text, scanCharter)
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
