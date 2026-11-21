import type { AgentEvent, LoopEventKind, LoopSessionRecord, LoopStatus, MainChatItem, MainChatView } from '@shared/ipcContract'
import { mainAnswerOf } from '@shared/13_Loop/mainTurn'

// 깃발(flag)은 「멈춤」 표시이고 이어 가기(resumed, human)는 사람의 판정이라 모양이 다르다
type EventTone = 'ok' | 'run' | 'fail' | 'human' | 'flag' | 'muted'

export const EVENT_LOOK: Record<LoopEventKind, { label: string; tone: EventTone }> = {
  'node-start': { label: '시작', tone: 'run' },
  'node-end': { label: '통과', tone: 'ok' },
  fail: { label: '실패', tone: 'fail' },
  halt: { label: '멈춤', tone: 'fail' },
  error: { label: '오류', tone: 'fail' },
  'goal-merged': { label: '병합', tone: 'ok' },
  'milestone-pr': { label: '마일스톤 PR', tone: 'ok' },
  'spec-approved': { label: '사람 · 승인', tone: 'human' },
  'spec-rejected': { label: '사람 · 고치기', tone: 'human' },
  'flag-raised': { label: '깃발 올림', tone: 'flag' },
  'flag-lowered': { label: '깃발 내림', tone: 'flag' },
  resumed: { label: '사람 · 이어 가기', tone: 'human' },
  backlog: { label: '미룬 일', tone: 'muted' },
  latched: { label: '래치', tone: 'fail' },
  done: { label: '끝', tone: 'ok' },
}

// 표에 없는 종류(옛 빌드가 남긴 이름, 객체 원형의 이름)는 그 이름을 muted로 그린다 — 모르는 종류 하나가 화면을 무너뜨리지 않는다
export function lookOf(kind: string): { label: string; tone: EventTone } {
  return Object.prototype.hasOwnProperty.call(EVENT_LOOK, kind) ? EVENT_LOOK[kind as LoopEventKind] : { label: kind, tone: 'muted' }
}

// push는 매번 새 객체를 주고 같은 id의 사람 글이 줄 섬 → 보냄으로 바뀌므로, id만이 아니라 그 줄이 그리는 칸을 모두 본다
export function sameItem(a: MainChatItem, b: MainChatItem): boolean {
  if (a === b) return true
  if (a.id !== b.id || a.at !== b.at) return false
  switch (a.kind) {
    case 'user': return b.kind === 'user' && a.text === b.text && a.state === b.state && a.proxy === b.proxy
    case 'assistant': return b.kind === 'assistant' && a.text === b.text && a.turn === b.turn
    case 'notice': return b.kind === 'notice' && a.text === b.text
    case 'event': {
      if (b.kind !== 'event') return false
      const x = a.event
      const y = b.event
      return x.kind === y.kind && x.text === y.text && x.node === y.node && x.goal === y.goal && x.verdict === y.verdict
    }
  }
}

// 세션 사건은 턴마다 session으로 시작하고 done으로 끝난다. 끝난 턴은 그 답 글(mainAnswerOf)이 같은 메인 답 자리에 그리고
// 그 답 글은 다시 그리지 않는다. 짝은 최근 것부터 찾는다 — 세션 기록은 앱을 켠 뒤의 턴만 갖는다.
// 짝이 없는 끝난 턴(글 없는 턴)은 다음 짝 앞에, 도는 턴은 맨 끝에 둔다. 앞부분이 잘린 기록의 첫 턴은 버린다(조각이다).
export interface MainTurn { key: string; events: AgentEvent[] }
type MainChatRow =
  | { kind: 'item'; item: MainChatItem; turn: MainTurn | null }
  | { kind: 'turn'; turn: MainTurn; live: boolean }

function splitTurns(events: readonly AgentEvent[]): { events: AgentEvent[]; ended: boolean }[] {
  const out: { events: AgentEvent[]; ended: boolean }[] = []
  let cur: AgentEvent[] = []
  for (const e of events) {
    if (e.type === 'session' && cur.some((x) => x.type !== 'session')) { out.push({ events: cur, ended: true }); cur = [] }
    cur.push(e)
    if (e.type === 'done') { out.push({ events: cur, ended: true }); cur = [] }
  }
  if (cur.length > 0) out.push({ events: cur, ended: false })
  return out
}

export function mainChatRows(items: readonly MainChatItem[], record: LoopSessionRecord | undefined, busy: boolean): MainChatRow[] {
  const all = splitTurns(record?.events ?? [])
  const parts = record?.truncated === true && all[0]?.events[0]?.type !== 'session' ? all.slice(1) : all
  const turns: MainTurn[] = parts.map((p, i) => ({ key: `turn-${i}`, events: p.events }))
  const last = parts.length - 1
  const answers = turns.map((t) => mainAnswerOf(t.events))
  const paired = new Map<number, number>()
  let k = turns.length - 1
  for (let i = items.length - 1; i >= 0 && k >= 0; i--) {
    const item = items[i]
    if (item.kind !== 'assistant') continue
    for (let m = k; m >= 0; m--) {
      if (answers[m] !== '' && answers[m] === item.text) { paired.set(i, m); k = m - 1; break }
    }
  }
  // done 없이 끝난 턴(멈춤)도 그 답이 기록에 짝지어졌으면 도는 턴이 아니다
  const pairedTurns = new Set(paired.values())
  const live = busy && last >= 0 && !parts[last].ended && !pairedTurns.has(last) ? last : -1
  const rows: MainChatRow[] = []
  let s = 0
  items.forEach((item, i) => {
    const m = paired.get(i)
    if (m === undefined) { rows.push({ kind: 'item', item, turn: null }); return }
    for (; s < m; s++) rows.push({ kind: 'turn', turn: turns[s], live: false })
    rows.push({ kind: 'item', item, turn: turns[m] })
    s = m + 1
  })
  for (; s < turns.length; s++) rows.push({ kind: 'turn', turn: turns[s], live: s === live })
  if (busy && live === -1) rows.push({ kind: 'turn', turn: { key: 'turn-next', events: [] }, live: true })
  return rows
}

// 끝난 턴의 사건 배열은 push마다 새로 잘리지만 원소는 그대로다 — 원소가 모두 같으면 같은 턴이다
export function sameTurn(a: MainTurn | null, b: MainTurn | null): boolean {
  if (a === b) return true
  if (a === null || b === null || a.key !== b.key || a.events.length !== b.events.length) return false
  return a.events.every((e, i) => e === b.events[i])
}

// main은 빈 근거를 받지 않는다
export const CHAT_APPROVE_EVIDENCE = '사람이 메인 대화에서 스펙 본문을 보고 승인했다'

export function clockOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function blockedReason(cwd: string | null, view: MainChatView | null): string | null {
  if (cwd === null) return '작업 폴더를 먼저 골라요 — 오른쪽 현황판의 「폴더 고르기」나 왼쪽 「프로젝트 열기」'
  if (view === null) return '메인 대화를 읽는 중이에요'
  if (view.root === null) return '실행기가 열려 있지 않아요 — 오른쪽 현황판에서 「열기」를 누르면 메인 대화가 열려요'
  return null
}

// 상태의 sessionActive는 메인 턴도 함께 센다 — 실행이 노드를 돌지 않는데(사람·CI 기다림) 메인 턴만 돌면 작업 세션이 아니다.
// 확신할 수 없는 경우(노드를 돌며 메인 턴도 돎)는 보이고, 멈출 세션이 없으면 main이 거짓을 돌려준다.
// 메인 대화 화면과 현황판의 「작업 세션 취소」가 이 한 판단을 쓴다.
export function workSessionLive(status: LoopStatus | null, view: MainChatView | null): boolean {
  if (status === null || !status.sessionActive) return false
  if (status.mainNode || view?.brainstorming === true) return false
  return !(status.mainBusy && status.phase !== 'running')
}
