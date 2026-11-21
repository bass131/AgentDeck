// 알림 판정자. 구동자가 내는 LoopStatus를 보고 사람을 부르는 사건을 정한다(구동자·실행기 동작은 그대로다).
//   - 바로 알릴 사건: halted·latched·blocked. Windows 알림 한 번(NotifyPort)과 앱 안 표시.
//   - 나중 사건: waiting-human이면서 milestonePr가 있다. 앱 안 표시만.
//   - 열쇠는 작업 폴더·phase·노드다(사유 글은 넣지 않는다). 알린 열쇠는 앱 영역의 alerts.json에 남겨 재기동 뒤에도 다시 알리지 않는다.
//   - 그 폴더가 사건 밖의 상태가 되면 열쇠를 지운다. closed·open-failed는 루프가 닫혔을 뿐이라 표시만 내리고 열쇠는 둔다 —
//     다시 연 같은 멈춤은 새 사건이 아니다.
//   - 앱 안 표시도 alerts.json에 남겨 재기동 직후(그 폴더를 다시 보기 전) 되살린다. 앱 종료는 상태를 내지 않아 표시가 남고,
//     사람이 루프를 닫아 내린 표시는 저장본에서도 빠진다. 그 폴더의 첫 상태가 오면 지금 판정으로 바꾼다.
//   - 판정은 한 줄로 세운다. 저장본 읽기가 끝난 뒤에 첫 상태를 보고, 앞 판정의 열쇠를 본 뒤에 다음 판정을 한다.
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { localClockLabel } from '@shared/13_Loop/clock'
import type { LoopAlert, LoopAlertList, LoopPhase, LoopStatus } from '@shared/13_Loop/loop'
import { repoKeyOf } from './digestStore'
import type { NotifyPort } from './ports'
import { writeFileAtomic } from './realPorts/atomicWrite'

const NOW_PHASES: ReadonlySet<LoopPhase> = new Set<LoopPhase>(['halted', 'latched', 'blocked'])
const UNSEEN_PHASES: ReadonlySet<LoopPhase> = new Set<LoopPhase>(['closed', 'open-failed'])
const LABEL: Partial<Record<LoopPhase, string>> = { halted: '멈춤', latched: '위조 래치', blocked: '진행 불가' }
const STORE = 'alerts.json'
const REASON_MAX = 160
const TITLE = 'AgentDeck — 사람이 필요해요'

interface LoopNotifierOptions {
  // 앱 영역(실물은 join(getUserDataDir(), 'loop') — 다른 루프 저장본과 같은 곳)
  appDataDir: string
  notify: NotifyPort
  onChange?: (list: LoopAlertList) => void
  // 사람이 Windows 알림을 눌렀다 — 그 작업 폴더의 작업 모드를 연다
  onOpen?: (cwd: string) => void
}

export interface LoopNotifier {
  observe(s: LoopStatus): Promise<void>
  list(): LoopAlert[]
}

// 한도 멈춤은 「나중」이다 — 사람이 없어도 풀리는 시각에 스스로 이어 간다
function levelOf(s: LoopStatus): LoopAlert['level'] | null {
  if (NOW_PHASES.has(s.phase)) return 'now'
  if (s.phase === 'waiting-human' && s.milestonePr !== null) return 'later'
  if (s.phase === 'limit') return 'later'
  return null
}

function limitTextOf(s: LoopStatus): string {
  const l = s.limit
  const head = ['사용량 한도 멈춤', s.node].filter((x) => x !== null && x !== '').join(' · ')
  if (!l) return head
  const at = l.human ? '사람의 「지금 이어 가기」를 기다려요' : l.resumeAt ? `${localClockLabel(Date.parse(l.resumeAt)) ?? l.resumeAt} 뒤 스스로 이어 가요` : '풀리는 시각을 몰라 「지금 이어 가기」를 기다려요'
  return `${head} — ${at}`
}

function textOf(s: LoopStatus): string {
  if (s.phase === 'waiting-human') return `마일스톤 PR #${s.milestonePr ?? ''} 병합을 기다려요`
  if (s.phase === 'limit') return limitTextOf(s)
  const head = [LABEL[s.phase] ?? s.phase, s.node].filter((x) => x !== null && x !== '').join(' · ')
  const reason = (s.reason ?? '').replace(/\s+/g, ' ').trim()
  if (reason === '') return head
  return `${head} — ${reason.length > REASON_MAX ? `${reason.slice(0, REASON_MAX)}…` : reason}`
}

const isStr = (v: unknown): v is string => typeof v === 'string'

function validAlert(v: unknown): v is LoopAlert {
  if (typeof v !== 'object' || v === null) return false
  const a = v as Record<string, unknown>
  return isStr(a['key']) && isStr(a['cwd']) && isStr(a['phase']) && isStr(a['text'])
    && (a['node'] === null || isStr(a['node'])) && (a['level'] === 'now' || a['level'] === 'later')
}

// 저장본은 {keys, alerts}다. 열쇠만 있는 옛 꼴도 읽는다 — 그때는 되살릴 표시가 없다
async function readStore(file: string): Promise<{ keys: Set<string>; alerts: LoopAlert[] }> {
  try {
    const raw = JSON.parse(await fsp.readFile(file, 'utf8')) as { keys?: unknown; alerts?: unknown } | null
    const keys = Array.isArray(raw?.keys) ? raw.keys.filter(isStr) : []
    const alerts = Array.isArray(raw?.alerts) ? raw.alerts.filter(validAlert) : []
    return { keys: new Set(keys), alerts }
  } catch {
    return { keys: new Set(), alerts: [] }
  }
}

export function createLoopNotifier(o: LoopNotifierOptions): LoopNotifier {
  const file = path.join(o.appDataDir, STORE)
  const current = new Map<string, LoopAlert>()
  let sent: Set<string> = new Set()
  const list = (): LoopAlert[] => [...current.values()]
  const emit = (): void => {
    try { o.onChange?.({ alerts: list() }) } catch { /* 화면 쪽 오류는 판정을 막지 않는다 */ }
  }

  // 재기동 직후 그 폴더를 관찰하기 전에도 풀리지 않은 알림을 보인다. 앱을 끌 때는 상태를 내지 않으므로 표시가 남는다
  let chain: Promise<void> = readStore(file).then(({ keys, alerts }) => {
    sent = keys
    for (const a of alerts) current.set(repoKeyOf(a.cwd), a)
    if (current.size > 0) emit()
  })

  async function save(keys: Set<string>): Promise<void> {
    try {
      await fsp.mkdir(o.appDataDir, { recursive: true })
      await writeFileAtomic(file, `${JSON.stringify({ keys: [...keys], alerts: list() })}\n`)
    } catch {
      // 저장하지 못하면 재기동 뒤 같은 사건을 한 번 더 알리거나 표시가 늦게 돌아올 뿐이다
    }
  }

  function show(s: LoopStatus, text: string): void {
    const where = path.basename(s.root ?? s.cwd) || s.cwd
    try {
      o.notify.show({ title: TITLE, body: `${where} — ${text}`, onClick: () => o.onOpen?.(s.cwd) })
    } catch {
      // 알림을 띄우지 못해도 앱 안 표시는 남는다
    }
  }

  async function apply(s: LoopStatus): Promise<void> {
    const keys = sent
    const folder = repoKeyOf(s.cwd)
    const before = current.get(folder)
    if (UNSEEN_PHASES.has(s.phase)) {
      if (before) { current.delete(folder); emit(); await save(keys) }
      return
    }
    const level = levelOf(s)
    const key = level === null ? null : `${folder}:${s.phase}:${s.node ?? '-'}`
    let dirty = false
    for (const k of [...keys]) {
      if (k.startsWith(`${folder}:`) && k !== key) { keys.delete(k); dirty = true }
    }
    if (key === null || level === null) {
      if (before) { current.delete(folder); emit(); dirty = true }
    } else {
      const alert: LoopAlert = { key, cwd: before?.cwd ?? s.cwd, phase: s.phase, node: s.node, level, text: textOf(s) }
      if (level === 'now' && !keys.has(key)) {
        keys.add(key)
        dirty = true
        show(s, alert.text)
      }
      if (before?.key !== key || before.text !== alert.text) { current.set(folder, alert); emit(); dirty = true }
    }
    if (dirty) await save(keys)
  }

  return {
    observe(s) {
      chain = chain.then(() => apply(s)).catch(() => undefined)
      return chain
    },
    list,
  }
}
