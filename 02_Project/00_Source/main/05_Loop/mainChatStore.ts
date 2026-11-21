// 메인 대화 저장. 작업 폴더마다 앱 영역(userData/loop)의 `<repoKey>.main.json` 한 장이다(작업 저장소와 채팅 저장소 밖).
// 담는 것: SDK 세션 id(재개), 대화 기록(사용자 글·메인 답·실행기 사건·알림, 상한 MAX_ITEMS), 꺼질 때 남은 질문 카드(다시 묻는다),
// 줄 서 있던 턴(사용자 글·사건·다시 물은 카드의 답), 브레인스토밍 방문(키·방문 처음의 스펙 해시·여는 턴의 상태·반려 사유·끝남),
// 구동자의 일시 정지 깃발. 실행 상태(run-state)·검증 기록과는 무관하다 — 메인이 이 파일로 실행기를 움직이지 못한다.
// 쓰기는 같은 폴더 임시 파일 + 이름 바꾸기(writeFileAtomic). 새 메인 대화는 지난 장을 `main-archive/`에 보관한다.
// 읽다가 깨진 장은 버리지 않고 `.broken-<시각>`으로 옆에 두고 빈 장으로 연다.
import fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import type { LoopCard, LoopEventItem, LoopEventKind, MainChatArchive, MainChatItem, MainTurnKind } from '@shared/13_Loop/loop'
import type { TastePrNote } from '@shared/14_Taste/taste'
import { writeFileAtomic } from './realPorts/atomicWrite'

export const MAX_ITEMS = 500
const ARCHIVE_DIR = 'main-archive'

// 줄 서 있던 턴 — 여는 턴(start·rejected)은 저장하지 않는다(실행기가 방문을 다시 부를 때 visit.open으로 다시 넣는다)
export interface StoredTurn {
  kind: Extract<MainTurnKind, 'user' | 'event' | 'card-answer'>
  text: string
  itemId: string | null
  proxy?: boolean
  events?: LoopEventItem[]
}
// open: 그 방문의 여는 턴 — queued(아직 세션이 받지 못함), sent(세션이 받았다)
interface StoredVisit {
  key: string
  node: string
  baselineSpecSha: string | null
  open: 'queued' | 'sent'
  rejected: string | null
  done: boolean
}
export interface MainChatRecord {
  version: 1
  root: string
  sessionId: string | null
  // 이 장에서 세션을 한 번이라도 열었다 — 세션 id를 잃었으면 새 세션에 생존 문서를 싣는다
  everSession: boolean
  items: MainChatItem[]
  cards: LoopCard[]
  queue: StoredTurn[]
  visit: StoredVisit | null
  paused: boolean
  tastePr?: TastePrNote
}

export const mainChatPath = (appDataDir: string, repoKey: string): string => path.join(appDataDir, `${repoKey}.main.json`)

export const blankRecord = (root: string): MainChatRecord => ({
  version: 1, root, sessionId: null, everSession: false, items: [], cards: [], queue: [], visit: null, paused: false,
})

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): v is string => typeof v === 'string'
const strOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string'

function validVisit(v: unknown): v is StoredVisit {
  return isObj(v) && str(v['key']) && str(v['node']) && strOrNull(v['baselineSpecSha'])
    && (v['open'] === 'queued' || v['open'] === 'sent') && strOrNull(v['rejected']) && typeof v['done'] === 'boolean'
}

const TURN_KINDS: readonly unknown[] = ['user', 'start', 'rejected', 'event', 'card-answer'] satisfies MainTurnKind[]
// 사건 종류 전부 — 키가 종류 전부여야 컴파일된다(종류가 늘거나 줄면 이 표도 바뀐다)
const EVENT_KIND_TABLE: Record<LoopEventKind, true> = {
  'node-start': true, 'node-end': true, fail: true, halt: true, error: true, 'goal-merged': true, 'milestone-pr': true,
  'spec-approved': true, 'spec-rejected': true, 'flag-raised': true, 'flag-lowered': true, resumed: true, backlog: true,
  latched: true, done: true,
}
const EVENT_KINDS: readonly unknown[] = Object.keys(EVENT_KIND_TABLE)

// 항목 하나 — 종류마다 그 종류가 쓰는 칸을 본다. 칸이 빠진 항목은 생존 문서의 최근 대화(tailLine)를 깨뜨리고,
// 그 뒤 새 세션의 턴이 모두 실패한다. 사건은 아는 종류만 받는다 — 이름이 바뀌기 전 빌드의 사건(paused 꼴)이나 모르는 종류는
// 화면이 그 모양을 찾지 못하므로 버린다(옛 사건을 기록으로 남기던 선택을 뒤집었다).
const validEvent = (e: unknown): boolean => isObj(e) && EVENT_KINDS.includes(e['kind']) && str(e['text'])

function validItem(i: unknown): boolean {
  if (!isObj(i) || !str(i['id']) || !str(i['at'])) return false
  switch (i['kind']) {
    case 'user': return str(i['text']) && (i['state'] === 'queued' || i['state'] === 'sent') && (i['proxy'] === undefined || typeof i['proxy'] === 'boolean')
    case 'assistant': return str(i['text']) && TURN_KINDS.includes(i['turn'])
    case 'event': return validEvent(i['event'])
    case 'notice': return str(i['text'])
    default: return false
  }
}

// 다시 묻는 질문 창이 읽는 칸 — 질문 글과 고를 것의 이름표
const validQuestion = (q: unknown): boolean =>
  isObj(q) && str(q['question']) && Array.isArray(q['options']) && (q['options'] as unknown[]).every((o) => isObj(o) && str(o['label']))
const strs = (v: unknown): boolean => Array.isArray(v) && v.every(str)
const validTasteItem = (i: unknown): boolean =>
  isObj(i) && str(i['id']) && str(i['title']) && Array.isArray(i['fields'])
  && (i['fields'] as unknown[]).every((f) => isObj(f) && str(f['name']) && str(f['text']))
function validDraft(d: unknown): boolean {
  if (!isObj(d)) return false
  if (d['doc'] === 'global-taste' || d['doc'] === 'project-taste') return Array.isArray(d['items']) && (d['items'] as unknown[]).every(validTasteItem)
  const c = d['charter']
  return d['doc'] === 'charter' && isObj(c) && strs(c['goal']) && (c['nonGoals'] === null || strs(c['nonGoals']))
}
// 문서 초안 카드는 확정에 쓰는 구조(draft)와 사람이 본 원문(preview)이 함께 있어야 받는다
const validCut = (v: unknown): boolean => isObj(v) && str(v['original']) && str(v['branch'])
const validPrNote = (v: unknown): v is TastePrNote =>
  isObj(v) && Number.isInteger(v['pr']) && str(v['branch']) && (v['doc'] === 'charter' || v['doc'] === 'project-taste') && str(v['text'])
const validTasteCard = (c: Record<string, unknown>): boolean =>
  str(c['preview']) && validDraft(c['draft'])
  && (c['confirming'] === undefined || typeof c['confirming'] === 'boolean') && (c['refused'] === undefined || str(c['refused']))
  && (c['cut'] === undefined || validCut(c['cut']))
const validCard = (c: unknown): boolean =>
  isObj(c) && str(c['requestId']) && str(c['text']) && (
    (c['kind'] === 'question' && Array.isArray(c['questions']) && (c['questions'] as unknown[]).every(validQuestion))
    || (c['kind'] === 'taste' && validTasteCard(c))
  )

// 줄 선 턴 — 사건 턴은 사건 칸이 아는 사건의 배열이어야 프롬프트를 만든다. 다른 턴의 사건 칸은 버린다
function storedTurn(t: unknown): StoredTurn | null {
  if (!isObj(t) || !str(t['text'])) return null
  const kind = t['kind']
  if (kind !== 'user' && kind !== 'event' && kind !== 'card-answer') return null
  const base: StoredTurn = { kind, text: t['text'], itemId: str(t['itemId']) ? t['itemId'] : null, ...(t['proxy'] === true ? { proxy: true } : {}) }
  if (kind !== 'event') return base
  const events = t['events']
  if (!Array.isArray(events) || events.length === 0 || !events.every(validEvent)) return null
  return { ...base, events: events as LoopEventItem[] }
}

// 모양이 맞는 것만 받는다. 항목·카드·줄 선 턴은 종류에 맞는 칸이 있는 것만 받고 나머지는 버린다.
function parseRecord(text: string, root: string): MainChatRecord | null {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return null }
  if (!isObj(raw) || raw['version'] !== 1) return null
  const items = Array.isArray(raw['items']) ? (raw['items'] as unknown[]).filter(validItem) as MainChatItem[] : []
  const cards = Array.isArray(raw['cards']) ? (raw['cards'] as unknown[]).filter(validCard) as LoopCard[] : []
  const queue = Array.isArray(raw['queue'])
    ? (raw['queue'] as unknown[]).map(storedTurn).filter((t): t is StoredTurn => t !== null)
    : []
  return {
    version: 1,
    root,
    sessionId: strOrNull(raw['sessionId']) ? raw['sessionId'] as string | null : null,
    everSession: raw['everSession'] === true,
    items: items.slice(-MAX_ITEMS),
    cards,
    queue,
    visit: validVisit(raw['visit']) ? raw['visit'] : null,
    paused: raw['paused'] === true,
    ...(validPrNote(raw['tastePr']) ? { tastePr: raw['tastePr'] } : {}),
  }
}

// 없으면 null. 깨졌으면 옆에 두고 null(부르는 쪽이 빈 장으로 연다).
export function loadRecordSync(file: string, root: string): MainChatRecord | null {
  let text: string
  try { text = fs.readFileSync(file, 'utf8') } catch { return null }
  const rec = parseRecord(text, root)
  if (rec === null) {
    try { fs.renameSync(file, `${file}.broken-${Date.now()}`) } catch { /* 옆에 두지 못해도 빈 장으로 연다 */ }
  }
  return rec
}

// 읽기만 — 깨진 장을 옮기지 않는다(닫힌 실행기의 보기)
export function peekRecordSync(file: string, root: string): MainChatRecord | null {
  try { return parseRecord(fs.readFileSync(file, 'utf8'), root) } catch { return null }
}

export async function saveRecord(file: string, rec: MainChatRecord): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await writeFileAtomic(file, `${JSON.stringify(rec, null, 2)}\n`)
}

const ARCHIVE_LIST_MAX = 20
export async function listArchives(appDataDir: string, repoKey: string, limit = ARCHIVE_LIST_MAX): Promise<MainChatArchive[]> {
  const dir = path.join(appDataDir, ARCHIVE_DIR)
  let names: string[]
  try { names = await fsp.readdir(dir) } catch { return [] }
  const mine = names.filter((n) => n.startsWith(`${repoKey}-`) && n.endsWith('.json')).sort().reverse()
  const out: MainChatArchive[] = []
  for (const name of mine) {
    if (out.length >= limit) break
    const file = path.join(dir, name)
    let text: string
    try { text = await fsp.readFile(file, 'utf8') } catch { continue }
    const rec = parseRecord(text, '')
    if (rec === null) continue
    const stamp = name.slice(repoKey.length + 1, -'.json'.length)
    const m = /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(stamp)
    let at = m ? `${m[1]}:${m[2]}:${m[3]}.${m[4]}Z` : ''
    if (at === '' || Number.isNaN(new Date(at).getTime())) {
      try { at = (await fsp.stat(file)).mtime.toISOString() } catch { at = new Date(0).toISOString() }
    }
    out.push({ id: name.slice(0, -'.json'.length), at, items: rec.items })
  }
  return out
}

export async function archiveRecord(appDataDir: string, repoKey: string, rec: MainChatRecord): Promise<string> {
  const dir = path.join(appDataDir, ARCHIVE_DIR)
  await fsp.mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(dir, `${repoKey}-${stamp}.json`)
  await writeFileAtomic(file, `${JSON.stringify(rec, null, 2)}\n`)
  return file
}
