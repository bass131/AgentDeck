// M09 G4 — 앱 안 루프 구동자. 저장소마다 실행기(openLoop) 하나를 열고 step()을 끝까지 돌리며, 상태가 바뀔 때마다 한 장(LoopStatus)을 push한다.
//   - 기다림: CI는 ciRetryMs 간격으로 다시 step한다(실행기의 CI 시간 상한이 판정한다). 마일스톤 병합 게이트는 humanPollMs 간격으로
//     PR 병합 사실을 다시 본다. 스펙 승인은 사람의 판정(decide)을 기다린다.
//   - 메인 노드(브레인스토밍) 세션의 카드는 상태의 cards로 화면에 가고, 화면의 답(answerCard)이 세션으로 간다. 세션이 끝나면 카드는 빠진다.
//     작업자 노드와 검수 세션의 카드는 거부·무응답이다(workSession·reviewSession).
//     화면의 카드 id는 구동자가 세션 차례를 붙인 `s<차례>-<원래 id>`다(G4 검수 I2) — 세션마다 권한 조정자가 같은 id를 다시 써도
//     새 세션의 카드가 화면에서 답할 수 있게 보이고, 옛 세션의 카드 id로 온 늦은 답은 새 세션에 붙지 않는다.
//   - 사람 판정(decide)의 노드는 구동자가 저장본에서 고른다 — 멈춘 실행이면 커서 노드의 이어 가기, 스펙 승인이면 화면이 보낸 스펙 해시를
//     함께 넣는다(해시는 요청에서만 온다. 구동자가 채우지 않는다). 마일스톤 병합은 사람 판정으로 넘기지 않는다(병합 버튼 — 헌법 10조).
//   - 앱 「자동」 모드 허용 노드(mode-auto-bypass-allow)가 꺼져 있으면(autoModeCheck) 시작·이어 가기·구동 전에 사유와 함께 멈춘다 —
//     꺼진 채 돌면 작업자 노드의 편집이 카드가 되고 거부돼 FAIL이 쌓인다. 켠 뒤 화면의 「다시 열기」(닫고 다시 열기)로 이어 간다.
//   - CI 판정의 필수 검사 이름은 main이 고정한다(DEFAULT_REQUIRED_CHECKS — G4 검수 I5). 화면 입력으로 바꾸지 못한다.
//   - 위조 래치 풀기(releaseLatch, G4 검수 I1 반영): 화면이 본 래치(사유·바뀐 키와 값·상태 요약·되돌릴 사본)의 token이 지금 다시 계산한
//     token과 같을 때만 푼다. 순서: 실행기를 닫는다 → 상태 파일을 다시 읽어 화면이 본 본문(token에 묶인 해시)과 같은지 본다 →
//     바뀐 설정 줄만 받아(acceptConfigChanged) 다시 연다 → 연 뒤에만 상태를 맞추고 래치를 지운다 → 이어 간다.
//     상태를 맞추는 법: 상태 파일이 앱의 다이제스트와 맞으면(설정 사유 래치) 그대로 둔다. 맞지 않으면(상태 위조 사유이거나, 설정 래치
//     동안 상태 파일도 바뀜) 위조본을 받지 않고 실행기가 마지막으로 쓴 사본(DigestStore.readCopy)으로 상태 파일을 되돌리고 다이제스트를
//     그 사본에 맞춘다. 사본이 없으면 풀지 않는다. 다시 열기가 거부되면(위험 키·grafts·http_unix_socket·hooksPath) 래치는 그대로 남는다.
//   - 열기·풀기가 기다리는 동안 닫히면(G4 검수 I4) 새로 연 실행기를 닫고 잠금을 푼다 — 고아 실행기가 저장소 잠금을 쥐지 않는다.
//   - 알림(note — 시작 거부·구동 오류)은 처음 보인 단계 동안만 싣고, 단계가 바뀌면 지운다(G4 검수 사소 6).
//   - 다시 열기: 앱을 다시 켜고 open하면 실행기가 저장본에서 같은 노드를 고르고 이어 간다(load). 앱 종료(stopApp)는 closeAll을 기다리지 않는다 —
//     저장소 잠금은 죽은 프로세스의 것을 넘겨받는다(repoLock). 상태 파일 쓰기와 다이제스트 쓰기 사이에 꺼지면 다음 열기에서 래치가 걸리고,
//     풀면 사본(상태 파일보다 먼저 쓰므로 같은 내용)으로 맞춰 이어 간다.
// 이 모듈은 electron을 import하지 않는다 — 앱 영역(join(getUserDataDir(), 'loop'))과 push는 조립 지점(bootstrap)이 준다.
import { createHash } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import type { AgentBackend, RunResponse } from '@main/03_Agent/AgentBackend'
import type { ControlsForRun } from '@main/04_Claude/permission/controlsStore'
import type {
  LoopCard,
  LoopCardResponse,
  LoopDecideRequest,
  LoopDecideResponse,
  LoopLatch,
  LoopOpenRequest,
  LoopReleaseLatchResponse,
  LoopStatus,
} from '@shared/ipcContract'
import type { NextStep } from './executor'
import { createFileDigestStore, repoKeyOf, stateDigest } from './digestStore'
import { TAMPERED_REASON } from './loopRunner'
import { openLoop, type OpenedLoop, type OpenLoopOptions, type OpenLoopResult } from './openLoop'
import type { DigestStore } from './ports'
import { createFsPort } from './realPorts/fsPort'
import { validateRunState, type RunState } from './runState'
import { DOCS } from './survivalDocs'
import { denyCards, type CardEvent, type CardResponder } from './workSession'

export const AUTO_MODE_NODE = 'mode-auto-bypass-allow'
const REOPEN_HINT = '켠 뒤 루프 화면의 「다시 열기」로 이어 간다'

// 조립 지점이 controlsForRun(getUserDataDir())의 결과를 넘긴다. 노드 실행은 claudeAgentRun이 같은 컨트롤을 다시 읽는다.
export function autoModeReasonOf(c: ControlsForRun): string | null {
  if (!c.ok) return `컨트롤 설정을 확인하지 못해 루프를 돌리지 않는다 — ${c.message}. 설정을 확인한 뒤 루프 화면의 「다시 열기」로 이어 간다`
  if (!c.nodes.some((n) => n.id === AUTO_MODE_NODE)) {
    return `컨트롤 노드 ${AUTO_MODE_NODE}(앱 「자동」 모드 허용)가 꺼져 있다 — 켜지 않으면 작업자 노드의 편집이 거부돼 FAIL이 쌓인다. 설정 › 컨트롤에서 ${REOPEN_HINT}`
  }
  return null
}

export const DEFAULT_CI_RETRY_MS = 60_000
export const DEFAULT_HUMAN_POLL_MS = 60_000
export const DEFAULT_REQUIRED_CHECKS = ['hard-gates']
const STEP_BUDGET = 1000

export interface LoopDriverOptions {
  // 앱 영역(실물은 join(getUserDataDir(), 'loop'))
  appDataDir: string
  // 작업·검수 세션을 열 백엔드
  backend?: AgentBackend
  // openLoop에 덧붙이는 것(시험: gh·session·review·template·executorEnv)
  openExtras?: Partial<OpenLoopOptions>
  // 앱 「자동」 모드 허용 노드가 켜져 있는가 — 꺼져 있으면 사유
  autoModeCheck?: () => string | null
  onState?: (s: LoopStatus) => void
  ciRetryMs?: number
  humanPollMs?: number
  // 시험 이음매 — 실행기를 여는 함수(기본 openLoop). 열기·풀기 도중 닫기의 시점을 시험이 잡는다
  openLoopImpl?: (o: OpenLoopOptions) => Promise<OpenLoopResult>
}

export interface LoopDriver {
  open(req: LoopOpenRequest): Promise<LoopStatus>
  start(cwd: string, milestoneId: string): Promise<LoopStatus>
  status(cwd: string): LoopStatus
  decide(req: LoopDecideRequest): Promise<LoopDecideResponse>
  answerCard(cwd: string, requestId: string, response: LoopCardResponse): boolean
  cancelSession(cwd: string): boolean
  releaseLatch(cwd: string, token: string): Promise<LoopReleaseLatchResponse>
  close(cwd: string): Promise<void>
  closeAll(): Promise<void>
}

interface OpenFailure { reason: string; changed?: string[]; root?: string }

// 화면이 본 래치의 사실(token에 묶인 것) — 풀 때 다시 읽은 상태 본문을 이것과 대조한다
interface LatchSeen { token: string; textSha: string | null; tampered: boolean; copy: string | null }
const LATCH_SEEN_MAX = 8

interface Entry {
  key: string
  cwd: string
  gen: number
  closed: boolean
  loop: OpenedLoop | null
  openFailure: OpenFailure | null
  status: LoopStatus
  seq: number
  cards: Map<string, { card: LoopCard; settle: (r: RunResponse) => void }>
  // 세션 차례(G4 검수 I2) — 카드 맥락의 신호(세션마다 하나)에 차례 번호를 붙인다
  turns: WeakMap<AbortSignal, number>
  turnSeq: number
  running: boolean
  again: boolean
  timer: ReturnType<typeof setTimeout> | null
  sessionActive: boolean
  waitingCi: boolean
  blocked: string | null
  note: string | null
  // 알림을 처음 보인 단계(null이면 아직 보이지 않았다)
  notePhase: LoopStatus['phase'] | null
  lastVerdict: LoopStatus['lastVerdict']
  latchSeen: Map<string, LatchSeen>
}

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export function blankStatus(cwd: string): LoopStatus {
  return {
    cwd, root: null, phase: 'closed', milestoneId: null, node: null, nodeTitle: null, reason: null, base: null, ghRepo: null,
    failCount: 0, goals: [], approval: null, milestonePr: null, cards: [], sessionActive: false, lastVerdict: null, latch: null,
  }
}

const labelOf = (next: NextStep): string | null =>
  next.kind === 'done' || next.kind === 'needs-user' ? null : next.goal ? `${next.goal.id}/${next.node.id}` : next.node.id
const cursorLabel = (s: RunState): string => {
  const g = s.cursor.goal === null ? null : s.goals[s.cursor.goal]
  return g ? `${g.id}/${s.cursor.node}` : s.cursor.node
}

async function readText(file: string): Promise<string | null> {
  try { return await fsp.readFile(file, 'utf8') } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

// 래치 카드에 보이는 상태 파일 요약(사람이 무엇을 받는지 본다)
function summarize(text: string | null): string | null {
  if (text === null) return null
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return '상태 파일이 JSON으로 읽히지 않는다' }
  const checked = validateRunState(raw)
  if (!checked.ok) return `상태 파일이 스키마에 맞지 않는다 — ${checked.errors.slice(0, 3).map((e) => `${e.path} ${e.reason}`).join('; ')}`
  const s = checked.state
  return `${s.milestoneId} · ${cursorLabel(s)} · ${s.status} · FAIL ${s.failCount} · 검증 줄 ${s.lines.length}`
}

// 상태 파일이 앱의 다이제스트와 맞는가(둘 다 없음도 맞음). 맞지 않으면 풀 때 사본으로 되돌린다.
async function stateMatchesDigest(digest: DigestStore, key: string, text: string | null): Promise<boolean> {
  const stored = await digest.read(key).catch(() => null)
  if (text === null) return stored === null
  if (stored === null) return false
  try { return stateDigest(JSON.parse(text)) === stored } catch { return false }
}

export function createLoopDriver(opts: LoopDriverOptions): LoopDriver {
  const entries = new Map<string, Entry>()
  const ciRetryMs = opts.ciRetryMs ?? DEFAULT_CI_RETRY_MS
  const humanPollMs = opts.humanPollMs ?? DEFAULT_HUMAN_POLL_MS
  const openImpl = opts.openLoopImpl ?? openLoop
  const appDigest = (): DigestStore => createFileDigestStore(path.join(opts.appDataDir, 'digests'))
  const autoCheck = (): string | null => {
    try { return opts.autoModeCheck?.() ?? null } catch (e) { return `자동 모드 허용 노드를 확인하지 못했다 — ${errText(e)}. ${REOPEN_HINT}` }
  }

  function entryOf(cwd: string): Entry | undefined { return entries.get(repoKeyOf(cwd)) }

  function newEntry(cwd: string): Entry {
    const e: Entry = {
      key: repoKeyOf(cwd), cwd, gen: 0, closed: false, loop: null, openFailure: null,
      status: blankStatus(cwd), seq: 0, cards: new Map(), turns: new WeakMap(), turnSeq: 0, running: false, again: false, timer: null,
      sessionActive: false, waitingCi: false, blocked: null, note: null, notePhase: null, lastVerdict: null, latchSeen: new Map(),
    }
    entries.set(e.key, e)
    return e
  }

  function setNote(e: Entry, text: string | null): void {
    e.note = text
    e.notePhase = null
  }

  // 열기·풀기의 await 뒤 — 그 사이 닫혔거나(close) 다른 열기가 실행기를 갈았으면 이 결과를 쓰지 않는다
  const superseded = (e: Entry, gen: number): boolean => e.closed || e.gen !== gen || entries.get(e.key) !== e

  // 메인 노드 세션의 카드 → 상태. 화면의 답이나 세션의 끝(ctx.signal)이 카드를 거둔다.
  function cardResponder(e: Entry): CardResponder {
    return (ev: CardEvent, ctx) => new Promise<RunResponse>((resolve) => {
      let turn = e.turns.get(ctx.signal)
      if (turn === undefined) {
        turn = ++e.turnSeq
        e.turns.set(ctx.signal, turn)
      }
      // 세션의 원래 id는 세션에 답할 때(runNodeSession)만 쓴다. 화면과 answerCard는 차례가 붙은 id로 부른다.
      const id = `s${turn}-${ev.requestId}`
      const base = { requestId: id, node: ctx.node, goal: ctx.goal, text: ctx.text }
      const card: LoopCard = ev.type === 'question_request'
        ? { ...base, kind: 'question', questions: ev.questions }
        : { ...base, kind: 'permission', toolName: ev.toolName, summary: ev.summary }
      const settle = (r: RunResponse): void => {
        if (e.cards.get(id)?.settle !== settle) return
        e.cards.delete(id)
        resolve(r)
        void publish(e)
      }
      e.cards.set(id, { card, settle })
      // 이미 끝난 세션의 카드는 싣지 않고 바로 거부한다(abort 이벤트는 다시 오지 않는다)
      if (ctx.signal.aborted) { settle(denyCards(ev)); return }
      ctx.signal.addEventListener('abort', () => settle(denyCards(ev)), { once: true })
      void publish(e)
    })
  }

  function openFor(e: Entry, accept?: readonly string[]): Promise<OpenLoopResult> {
    return openImpl({
      cwd: e.cwd,
      appDataDir: opts.appDataDir,
      ...(opts.backend ? { backend: opts.backend } : {}),
      requiredChecks: DEFAULT_REQUIRED_CHECKS,
      mainCard: cardResponder(e),
      ...opts.openExtras,
      ...(accept && accept.length > 0 ? { acceptConfigChanged: accept } : {}),
    })
  }

  // ── 래치 ──
  function tokenOf(parts: unknown): string { return sha256(JSON.stringify(parts)) }

  // 상태 파일 본문·위조 여부·되돌릴 사본을 읽어 래치 카드를 만든다. 화면이 본 사실(token에 묶인 것)을 e.latchSeen에 남긴다.
  async function latchView(e: Entry, kind: 'live' | 'open', root: string, digest: DigestStore, key: string, reason: string, changed: string[], file: string | null): Promise<LoopLatch> {
    const text = await readText(path.join(root, DOCS.runState)).catch(() => null)
    const tampered = reason.includes(TAMPERED_REASON) || !(await stateMatchesDigest(digest, key, text))
    const copy = tampered ? await digest.readCopy(key).catch(() => null) : null
    const textSha = text === null ? null : sha256(text)
    const token = tokenOf([kind, root, reason, changed, textSha, tampered, copy === null ? null : sha256(copy)])
    // 동시에 돈 계산이 서로의 것을 덮지 않게 token으로 찾는다(최근 몇 장만 둔다)
    e.latchSeen.delete(token)
    e.latchSeen.set(token, { token, textSha, tampered, copy })
    while (e.latchSeen.size > LATCH_SEEN_MAX) e.latchSeen.delete(e.latchSeen.keys().next().value as string)
    return { reason, file, changed, state: summarize(text), restore: summarize(copy), token }
  }

  // 사유는 실행기가 돌려준 것(load)만 쓴다 — 실행기는 래치를 메모리에 먼저 걸고 앱 영역 파일을 뒤에 쓰므로, 파일을 읽으면
  // 동시에 돈 계산끼리 사유가 달라져 token이 흔들린다(화면이 본 token이 바로 다음 계산과 어긋난다)
  async function liveLatch(e: Entry, loop: OpenedLoop, loadReason: string): Promise<LoopLatch> {
    const file = (() => { try { return loop.digest.latchPath?.(loop.repoKey) ?? null } catch { return null } })()
    return latchView(e, 'live', loop.root, loop.digest, loop.repoKey, loadReason, loop.configChanges(), file)
  }

  async function openLatch(e: Entry, f: OpenFailure): Promise<LoopLatch | null> {
    if (!f.changed || !f.root) return null
    const digest = appDigest()
    const key = repoKeyOf(f.root)
    const stored = await digest.readLatch(key).catch(() => null)
    const reason = stored ? `${f.reason} / 앞서 걸린 래치: ${stored}` : f.reason
    return latchView(e, 'open', f.root, digest, key, reason, f.changed, digest.latchPath?.(key) ?? null)
  }

  // ── 상태 한 장 ──
  async function compute(e: Entry): Promise<LoopStatus> {
    const s = blankStatus(e.cwd)
    if (!e.loop) {
      if (!e.openFailure) return s
      return { ...s, phase: 'open-failed', root: e.openFailure.root ?? null, reason: e.openFailure.reason, latch: await openLatch(e, e.openFailure) }
    }
    const loop = e.loop
    const v: LoopStatus = {
      ...s, root: loop.root, base: loop.base, ghRepo: loop.ghRepo, cards: [...e.cards.values()].map((c) => c.card),
      sessionActive: e.sessionActive, lastVerdict: e.lastVerdict, reason: e.note,
    }
    const r = await loop.runner.load()
    if (r.kind === 'missing') return e.blocked ? { ...v, phase: 'blocked', reason: e.blocked } : { ...v, phase: 'not-started' }
    if (r.kind === 'blocked') return { ...v, phase: 'blocked', reason: r.reason }
    if (r.kind === 'needs-user') return { ...v, phase: 'latched', reason: r.reason, latch: await liveLatch(e, loop, r.reason) }
    const { state, next } = r
    const filled: LoopStatus = {
      ...v,
      milestoneId: state.milestoneId,
      failCount: state.failCount,
      goals: state.goals.map((g) => ({ id: g.id, title: g.title, status: g.status, grade: g.grade, pr: g.pr })),
      node: labelOf(next) ?? (state.status === 'done' ? null : cursorLabel(state)),
      nodeTitle: next.kind === 'work' || next.kind === 'gate' || next.kind === 'action' ? next.node.title : null,
    }
    if (state.status === 'done' || next.kind === 'done') return { ...filled, phase: 'done' }
    if (state.status === 'needs-user' || next.kind === 'needs-user') return { ...filled, phase: 'halted', reason: state.haltReason }
    if (e.blocked) return { ...filled, phase: 'blocked', reason: e.blocked }
    if (next.kind === 'gate' && next.node.judge === 'human') {
      if (next.node.watch) return { ...filled, phase: 'waiting-human', milestonePr: state.milestonePr }
      const view = await loop.runner.specView()
      return { ...filled, phase: 'waiting-human', approval: { node: next.node.id, title: next.node.title, spec: view.text, sha256: view.sha256 } }
    }
    if (next.kind === 'gate' && next.node.rule?.type === 'ci' && e.waitingCi) return { ...filled, phase: 'waiting-ci' }
    return { ...filled, phase: 'running' }
  }

  // 늦게 끝난 계산이 새 상태를 덮지 않게 차례 번호로 받는다. 부른 쪽에는 자기가 계산한 한 장을 그대로 돌려준다.
  async function publish(e: Entry): Promise<LoopStatus> {
    const seq = ++e.seq
    let s: LoopStatus
    try { s = await compute(e) } catch (err) { s = { ...e.status, reason: `상태를 읽지 못했다 — ${errText(err)}` } }
    if (seq !== e.seq || e.closed) return s
    // 알림은 처음 보인 단계 동안만 — 단계가 바뀌면 지운다(G4 검수 사소 6)
    if (e.note !== null) {
      if (e.notePhase === null) e.notePhase = s.phase
      else if (e.notePhase !== s.phase) {
        const stale = e.note
        setNote(e, null)
        if (s.reason === stale) s = { ...s, reason: null }
      }
    }
    e.status = s
    opts.onState?.(s)
    return s
  }

  // ── 구동 ──
  function clearTimer(e: Entry): void {
    if (e.timer) clearTimeout(e.timer)
    e.timer = null
  }
  function schedule(e: Entry, ms: number): void {
    clearTimer(e)
    const t = setTimeout(() => { e.timer = null; void kick(e) }, ms)
    ;(t as { unref?: () => void }).unref?.()
    e.timer = t
  }
  const alive = (e: Entry, gen: number): boolean => !e.closed && e.gen === gen && e.loop !== null

  async function runSteps(e: Entry, gen: number): Promise<void> {
    for (let i = 0; i < STEP_BUDGET; i++) {
      if (!alive(e, gen)) return
      const loop = e.loop as OpenedLoop
      const loaded = await loop.runner.load()
      if (!alive(e, gen) || loaded.kind !== 'ok') return
      const next = loaded.next
      if (next.kind === 'done' || next.kind === 'needs-user') return
      const why = autoCheck()
      if (why) { e.blocked = why; return }
      e.blocked = null
      const sessionNode = next.kind === 'work' || (next.kind === 'gate' && next.node.judge === 'model')
      e.sessionActive = sessionNode
      if (sessionNode) void publish(e)
      const out = await loop.runner.step()
      e.sessionActive = false
      if (!alive(e, gen)) return
      if ('verdict' in out && out.verdict) e.lastVerdict = { node: out.verdict.node, verdict: out.verdict.verdict, evidence: out.verdict.evidence }
      e.waitingCi = out.kind === 'waiting' && out.on === 'ci'
      void publish(e)
      if (out.kind === 'advanced' || out.kind === 'failed' || out.kind === 'resumed') continue
      if (out.kind === 'waiting') {
        if (out.on === 'ci') schedule(e, ciRetryMs)
        else if (next.kind === 'gate' && next.node.watch) schedule(e, humanPollMs)
      }
      return
    }
    setNote(e, `한 번의 구동에서 ${STEP_BUDGET}단계를 넘었다 — 멈추고 사람을 부른다`)
  }

  async function kick(e: Entry): Promise<void> {
    if (e.running) { e.again = true; return }
    e.running = true
    try {
      do {
        e.again = false
        clearTimer(e)
        await runSteps(e, e.gen)
      } while (e.again && !e.closed)
    } catch (err) {
      setNote(e, `구동 오류 — ${errText(err)}`)
    } finally {
      e.running = false
      e.sessionActive = false
    }
    await publish(e)
  }

  async function closeEntry(e: Entry): Promise<void> {
    e.gen++
    clearTimer(e)
    const loop = e.loop
    e.loop = null
    // 실행기 닫기가 세션을 멈추고, 세션의 끝이 카드를 거둔다(카드를 먼저 답하면 세션이 그 답으로 나아간다)
    if (loop) await loop.close()
    for (const c of [...e.cards.values()]) c.settle({ kind: 'question', answers: null })
    e.cards.clear()
  }

  const rejectWith = async (e: Entry, reason: string): Promise<LoopDecideResponse> => ({ ok: false, reason, status: await publish(e) })
  const releaseRefused = async (e: Entry, reason: string): Promise<LoopReleaseLatchResponse> => ({ ok: false, reason, status: await publish(e) })
  const CLOSED_MEANWHILE = '기다리는 동안 루프가 닫혔다 — 새로 연 실행기를 닫았다'

  return {
    async open(req) {
      const e = entryOf(req.cwd) ?? newEntry(req.cwd)
      e.closed = false
      if (!e.loop) {
        const gen = e.gen
        const r = await openFor(e)
        // G4 검수 I4 — 여는 동안 닫혔으면 새 실행기를 닫고(잠금을 푼다) 그 결과를 쓰지 않는다
        if (superseded(e, gen)) {
          if (r.ok) await r.loop.close()
          return entryOf(req.cwd)?.status ?? { ...blankStatus(req.cwd), reason: CLOSED_MEANWHILE }
        }
        if (r.ok) { e.loop = r.loop; e.openFailure = null } else e.openFailure = { reason: r.reason, changed: r.changed, root: r.root }
      }
      if (e.loop) void kick(e)
      return publish(e)
    },

    async start(cwd, milestoneId) {
      const e = entryOf(cwd)
      if (!e?.loop) return e ? publish(e) : { ...blankStatus(cwd), reason: '열린 실행기가 없다 — 먼저 연다' }
      const why = autoCheck()
      if (why) { e.blocked = why; return publish(e) }
      e.blocked = null
      const r = await e.loop.runner.start(milestoneId)
      setNote(e, r.kind === 'ok' ? null : r.kind === 'missing' ? '실행 상태를 만들지 못했다' : r.reason)
      void kick(e)
      return publish(e)
    },

    status: (cwd) => entryOf(cwd)?.status ?? blankStatus(cwd),

    async decide(req) {
      const e = entryOf(req.cwd)
      if (!e?.loop) return { ok: false, reason: '열린 실행기가 없다', status: e?.status ?? blankStatus(req.cwd) }
      const loop = e.loop
      const r = await loop.runner.load()
      if (r.kind !== 'ok') return rejectWith(e, r.kind === 'missing' ? '실행 상태가 없다' : r.reason)
      const { state, next } = r
      const here = state.status === 'needs-user' ? cursorLabel(state) : labelOf(next)
      if (req.expectNode !== undefined && req.expectNode !== here) {
        return rejectWith(e, `화면이 본 노드 ${req.expectNode}와 지금 노드 ${here ?? '(없음)'}가 다르다 — 다시 보고 판정한다`)
      }
      let out
      if (state.status === 'needs-user') {
        if (req.verdict !== 'pass') return rejectWith(e, '멈춘 실행은 이어 가기(pass)만 받는다')
        const why = autoCheck()
        if (why) { e.blocked = why; return rejectWith(e, why) }
        out = await loop.runner.submit({ node: state.cursor.node, judge: 'human', verdict: 'pass', evidence: req.evidence })
      } else if (next.kind === 'gate' && next.node.judge === 'human') {
        if (next.node.watch) return rejectWith(e, `${next.node.id}는 PR 병합 사실로만 통과한다 — 병합 버튼으로 사람이 병합한다`)
        out = await loop.runner.submit(
          { node: next.node.id, judge: 'human', verdict: req.verdict, evidence: req.evidence },
          req.specSha256 !== undefined ? { specSha256: req.specSha256 } : {},
        )
      } else {
        return rejectWith(e, `지금 노드 ${here ?? '(없음)'}는 사람 판정을 받지 않는다`)
      }
      if (out.kind === 'blocked' || out.kind === 'needs-user') return rejectWith(e, out.reason)
      e.blocked = null
      if ('verdict' in out && out.verdict) e.lastVerdict = { node: out.verdict.node, verdict: out.verdict.verdict, evidence: out.verdict.evidence }
      void kick(e)
      return { ok: true, status: await publish(e) }
    },

    answerCard(cwd, requestId, response) {
      const c = entryOf(cwd)?.cards.get(requestId)
      // 카드 종류와 답의 꼴이 같아야 한다(질문 카드에 허용·거부를 넣지 않는다)
      if (!c || c.card.kind !== response.kind) return false
      c.settle(response)
      return true
    },

    cancelSession: (cwd) => entryOf(cwd)?.loop?.cancelSession() ?? false,

    async releaseLatch(cwd, token) {
      const e = entryOf(cwd)
      if (!e) return { ok: false, reason: '열린 실행기가 없다', status: blankStatus(cwd) }
      const now = await compute(e)
      const seen = e.latchSeen.get(token)
      if (!now.latch || now.latch.token !== token || seen === undefined) {
        return releaseRefused(e, '화면이 본 래치와 지금 래치가 다르다 — 다시 보고 푼다')
      }
      const root = e.loop?.root ?? e.openFailure?.root
      if (!root) return releaseRefused(e, '작업 저장소 뿌리를 모른다')
      // G4 검수 I1 — 상태가 다이제스트와 맞지 않으면 위조본을 받지 않고 사본으로 되돌린다. 사본이 없거나 스키마에 맞지 않으면
      // 풀지 않는다(닫기 전에 본다 — 다시 연 실행기가 되돌리기 도중에 깨져 고아가 되지 않게)
      let restoreDigest: string | null = null
      if (seen.tampered) {
        const NO_COPY = '실행기가 마지막으로 쓴 상태 사본이 앱 영역에 없거나 스키마에 맞지 않아 래치를 풀지 않았다 — 사람이 상태 파일을 확인한 뒤 실행 상태를 지우고 새로 시작한다'
        if (seen.copy === null) return releaseRefused(e, NO_COPY)
        let raw: unknown
        try { raw = JSON.parse(seen.copy) } catch { return releaseRefused(e, NO_COPY) }
        if (!validateRunState(raw).ok) return releaseRefused(e, NO_COPY)
        restoreDigest = stateDigest(raw)
      }
      const accept = now.latch.changed
      await closeEntry(e)
      const gen = e.gen
      // 세션을 멈춘 뒤 다시 읽은 본문이 화면이 본 본문(token에 묶인 해시)과 같아야 한다
      const text = await readText(path.join(root, DOCS.runState))
      if ((text === null ? null : sha256(text)) !== seen.textSha) {
        e.openFailure = { reason: '화면이 본 뒤 상태 파일이 바뀌어 래치를 풀지 않았다 — 다시 열어 새 래치를 보고 푼다', root }
        return releaseRefused(e, e.openFailure.reason)
      }
      if (!seen.tampered && text !== null) {
        try { JSON.parse(text) } catch {
          e.openFailure = { reason: '상태 파일이 JSON으로 읽히지 않아 래치를 풀지 않았다 — 사람이 파일을 고친 뒤 다시 연다', root }
          return releaseRefused(e, e.openFailure.reason)
        }
      }
      const r = await openFor(e, accept)
      // G4 검수 I4 — 풀기가 기다리는 동안 닫혔으면 새 실행기를 닫는다
      if (superseded(e, gen)) {
        if (r.ok) await r.loop.close()
        return { ok: false, reason: CLOSED_MEANWHILE, status: entryOf(cwd)?.status ?? blankStatus(cwd) }
      }
      if (!r.ok) {
        e.openFailure = { reason: r.reason, changed: r.changed, root: r.root ?? root }
        return releaseRefused(e, r.reason)
      }
      // 연 뒤에만 상태를 맞춘다 — 다시 열기가 거부되면 래치가 남는다. 맞추는 도중 깨지거나 닫히면 새 실행기를 닫는다(I4)
      const { digest, repoKey } = r.loop
      // 한 걸음마다 닫혔는지 본다 — 닫혔으면 남은 쓰기를 하지 않는다(사람이 닫은 뒤에 상태를 바꾸지 않는다)
      const closedMeanwhile = new Error(CLOSED_MEANWHILE)
      const stillOpen = (): void => { if (superseded(e, gen)) throw closedMeanwhile }
      try {
        if (seen.tampered) {
          const copy = seen.copy as string
          await digest.writeCopy(repoKey, copy)
          stillOpen()
          await createFsPort(r.loop.root).write(DOCS.runState, copy)
          stillOpen()
          await digest.write(repoKey, restoreDigest as string)
          stillOpen()
        }
        await digest.clearLatch(repoKey)
        stillOpen()
      } catch (err) {
        await r.loop.close()
        if (err === closedMeanwhile || superseded(e, gen)) return { ok: false, reason: CLOSED_MEANWHILE, status: entryOf(cwd)?.status ?? blankStatus(cwd) }
        e.openFailure = { reason: `래치를 풀며 상태를 되돌리지 못했다 — ${errText(err)}`, root }
        return releaseRefused(e, e.openFailure.reason)
      }
      e.loop = r.loop
      e.openFailure = null
      e.blocked = null
      e.latchSeen.clear()
      setNote(e, null)
      void kick(e)
      return { ok: true, status: await publish(e) }
    },

    async close(cwd) {
      const e = entryOf(cwd)
      if (!e) return
      e.closed = true
      await closeEntry(e)
      entries.delete(e.key)
      opts.onState?.(blankStatus(e.cwd))
    },

    async closeAll() {
      const all = [...entries.values()]
      for (const e of all) e.closed = true
      await Promise.all(all.map(async (e) => {
        await closeEntry(e)
        entries.delete(e.key)
      }))
    },
  }
}
