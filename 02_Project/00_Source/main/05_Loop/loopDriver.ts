// 앱 안 루프 구동자. 저장소마다 실행기(openLoop) 하나를 열고 step()을 끝까지 돌리며, 상태가 바뀔 때마다 한 장(LoopStatus)을 push한다.
//   - 기다림: CI는 ciRetryMs 간격으로 다시 step한다(실행기의 CI 시간 상한이 판정한다). 마일스톤 병합 게이트는 humanPollMs 간격으로
//     PR 병합 사실을 다시 본다. 스펙 승인은 사람의 판정(decide)을 기다린다.
//   - 메인 노드(브레인스토밍) 세션의 카드는 상태의 cards로 화면에 가고, 화면의 답(answerCard)이 세션으로 간다. 세션이 끝나면 카드는 빠진다.
//     작업자 노드와 검수 세션의 카드는 거부·무응답이다(workSession·reviewSession).
//     화면의 카드 id는 구동자가 세션 차례를 붙인 `s<차례>-<원래 id>`다 — 세션마다 권한 조정자가 같은 id를 다시 써도
//     새 세션의 카드가 화면에서 답할 수 있게 보이고, 옛 세션의 카드 id로 온 늦은 답은 새 세션에 붙지 않는다.
//     차례는 `<구동자 접두>.<번호>`다 — 번호는 구동자 전역에서 단조 증가하고(루프를 닫았다 열어도 0부터 다시 세지 않는다),
//     접두는 구동자마다 무작위라 앱을 다시 켜도 앞 구동자의 id와 겹치지 않는다.
//   - 사람 판정(decide)의 노드는 구동자가 저장본에서 고른다 — 멈춘 실행이면 커서 노드의 이어 가기, 스펙 승인이면 화면이 보낸 스펙 해시를
//     함께 넣는다(해시는 요청에서만 온다. 구동자가 채우지 않는다). 마일스톤 병합은 사람 판정으로 넘기지 않는다(병합 버튼 — 헌법 10조).
//   - 앱 「자동」 모드 허용 노드(mode-auto-bypass-allow)가 꺼져 있으면(autoModeCheck) 시작·이어 가기·구동 전에 사유와 함께 멈춘다 —
//     꺼진 채 돌면 작업자 노드의 편집이 카드가 되고 거부돼 FAIL이 쌓인다. 켠 뒤 화면의 「다시 열기」(닫고 다시 열기)로 이어 간다.
//   - CI 판정의 필수 검사 이름은 main이 고정한다(DEFAULT_REQUIRED_CHECKS). 화면 입력으로 바꾸지 못한다.
//   - 위조 래치 풀기(releaseLatch): 화면이 본 래치(사유·바뀐 키와 값·상태 요약·되돌릴 사본)의 token이 지금 다시 계산한
//     token과 같을 때만 푼다. 순서: 실행기를 닫는다 → 상태 파일을 다시 읽어 화면이 본 본문(token에 묶인 해시)과 같은지 본다 →
//     바뀐 설정 줄만 받아(acceptConfigChanged) 다시 연다 → 연 뒤에만 상태를 맞추고 래치를 지운다 → 이어 간다.
//     상태를 맞추는 법: 상태 파일이 앱의 다이제스트와 맞으면(설정 사유 래치) 그대로 둔다. 맞지 않으면(상태 위조 사유이거나, 설정 래치
//     동안 상태 파일도 바뀜) 위조본을 받지 않고 실행기가 마지막으로 쓴 사본(DigestStore.readCopy)으로 상태 파일을 되돌리고 다이제스트를
//     그 사본에 맞춘다. 사본이 없으면 풀지 않는다. 다시 열기가 거부되면(위험 키·grafts·http_unix_socket·hooksPath) 래치는 그대로 남는다.
//     닫은 뒤 다시 읽은 본문이 화면이 본 것과 다르면 풀지 않고, 그 상태 그대로 새 token의 래치를 다시 보인다.
//   - 열기·풀기가 기다리는 동안 닫히면 새로 연 실행기를 닫고 잠금을 푼다 — 고아 실행기가 저장소 잠금을 쥐지 않는다.
//   - 알림(note — 시작 거부·구동 오류)은 처음 보인 단계 동안만 싣고, 단계가 바뀌면 지운다.
//   - 다시 열기: 앱을 다시 켜고 open하면 실행기가 저장본에서 같은 노드를 고르고 이어 간다(load). 앱 종료(stopApp)는 closeAll을 기다리지 않는다 —
//     저장소 잠금은 죽은 프로세스의 것을 넘겨받는다(repoLock). 상태 파일 쓰기와 다이제스트 쓰기 사이에 꺼지면 다음 열기에서 래치가 걸리고,
//     풀면 사본(상태 파일보다 먼저 쓰므로 같은 내용)으로 맞춰 이어 간다.
// 메인 대화(mainChat.ts). 실행기를 열면(백엔드가 있을 때) 작업 폴더의 메인 대화를 함께 연다.
//   - 브레인스토밍 노드는 메인 대화로 간다(openLoop mainWork). 턴이 끝날 때마다 kick — 실행기가 다시 부르고, 스펙이 바뀌었으면 승인 카드다.
//     닫기는 브레인스토밍을 멈춤으로 만들지 않는다(대화 턴의 취소는 판정이 아니다). 다시 열면 같은 방문이다.
//   - 일시 정지 깃발(메인의 「멈춤」)은 메인 대화 장(main.json)에 산다. runSteps가 단계마다 앞에서 보고, 올라 있으면 다음 단계를 돌지 않는다.
//     실행 상태·검증 기록과 무관하다. 「이어 가기」는 깃발만 내리고 kick한다 — 사람 판정(decide)을 대신하지 않는다.
//   - 쓰기 창(canWrite): 실행기 커서가 그 방문의 메인 노드이고 실행이 running일 때만 참.
//   - 사건 줄: 노드 시작(같은 노드는 한 번)·판정·FAIL·멈춤·예외(구동 오류)·goal 병합·마일스톤 PR·스펙 승인/반려·래치·끝,
//     메인의 깃발(flag-raised·flag-lowered — 사람의 이어 가기 resumed와 다른 이름)을 모델 없이 대화 기록에 남긴다.
//     경계(goal 병합·멈춤·마일스톤 PR)에서만 메인이 짧은 턴으로 말한다(사건 턴은 줄 서 있는 동안 하나로 합쳐진다).
//   - 세션 사건: 작업·검수·메인 대화 세션의 사건을 꼬리표와 함께 onSessionEvent로 흘린다(노드 세션 탭이 같은 길을 쓴다).
// 이 모듈은 electron을 import하지 않는다 — 앱 영역(join(getUserDataDir(), 'loop'))과 push는 조립 지점(bootstrap)이 준다.
import { createHash, randomBytes } from 'node:crypto'
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
import type { AgentEvent } from '@shared/agentEvents'
import type {
  LoopCancelTarget, LoopEventItem, LoopListDirResponse, LoopMainResponse, LoopSessionEventPayload, LoopSessionLog, LoopSessionTag, LoopVerificationLine, MainChatArchives, MainChatView,
} from '@shared/13_Loop/loop'
import type { LoopGraphResponse } from '@shared/13_Loop/graph'
import { listDir as listWorkDir, resolveSafe } from '@main/07_Workspace/workspace'
import { loadBundledTemplate } from './bundledTemplate'
import type { NextStep } from './executor'
import { templateGraph } from './templateGraph'
import { createFileDigestStore, repoKeyOf, stateDigest } from './digestStore'
import { TAMPERED_REASON, finishedNotice, visitKeyOf } from './loopRunner'
import { openMainChat, readMainChatView, type MainActions, type MainChat, type TasteConfirmCtx } from './mainChat'
import { listArchives } from './mainChatStore'
import { createSessionLog } from './sessionLog'
import { appendBacklogLine, buildMainTools } from './mainChatTools'
import { openLoop, type OpenedLoop, type OpenLoopOptions, type OpenLoopResult } from './openLoop'
import type { DigestStore, GitPort, WorkRequest, WorkResult } from './ports'
import { createFsPort } from './realPorts/fsPort'
import { writeFileAtomic } from './realPorts/atomicWrite'
import { validateRunState, type RunState } from './runState'
import { DOCS } from './survivalDocs'
import { openCharterPr, type CharterGit } from '@main/13_Taste/charterPr'
import { OPEN_LINE, openingPrompt, tasteCheck, tasteProblemText } from '@main/13_Taste/tasteDialog'
import { projectDraftFile, readTasteDocs, writeTasteDraft, type TasteDirs } from '@main/13_Taste/tasteStore'
import { TASTE_DOC_LABEL, type TasteDialogScope, type TasteDraft, type TastePrNote } from '@shared/14_Taste/taste'

const STARTING = '실행을 시작하는 중이다 — 시작이 끝난 뒤(또는 마일스톤이 끝난 뒤) 다시 확정한다'
import { denyCards, oneLine, type CardEvent, type CardResponder } from './workSession'

const AUTO_MODE_NODE = 'mode-auto-bypass-allow'
const REOPEN_HINT = '켠 뒤 루프 화면의 「다시 열기」로 이어 간다'
const OPEN_STORE = 'open.json'

// 조립 지점이 controlsForRun(getUserDataDir())의 결과를 넘긴다. 노드 실행은 claudeAgentRun이 같은 컨트롤을 다시 읽는다.
export function autoModeReasonOf(c: ControlsForRun): string | null {
  if (!c.ok) return `컨트롤 설정을 확인하지 못해 루프를 돌리지 않는다 — ${c.message}. 설정을 확인한 뒤 루프 화면의 「다시 열기」로 이어 간다`
  if (!c.nodes.some((n) => n.id === AUTO_MODE_NODE)) {
    return `컨트롤 노드 ${AUTO_MODE_NODE}(앱 「자동」 모드 허용)가 꺼져 있다 — 켜지 않으면 작업자 노드의 편집이 거부돼 실패가 쌓인다. 설정 › 컨트롤에서 ${REOPEN_HINT}`
  }
  return null
}

const DEFAULT_CI_RETRY_MS = 60_000
const DEFAULT_HUMAN_POLL_MS = 60_000
const DEFAULT_REQUIRED_CHECKS = ['hard-gates']
const STEP_BUDGET = 1000

interface LoopDriverOptions {
  // 앱 영역(실물은 join(getUserDataDir(), 'loop'))
  appDataDir: string
  // 전역 Taste의 거처(실물은 getUserDataDir()). 없으면 전역 Taste 초안을 받지 않는다
  tasteDataDir?: string
  // 작업·검수 세션을 열 백엔드
  backend?: AgentBackend
  // openLoop에 덧붙이는 것(시험: gh·session·review·template·executorEnv)
  openExtras?: Partial<OpenLoopOptions>
  // 앱 「자동」 모드 허용 노드가 켜져 있는가 — 꺼져 있으면 사유
  autoModeCheck?: () => string | null
  onState?: (s: LoopStatus) => void
  // 메인 대화 보기가 바뀌었다 / 루프 세션의 사건(꼬리표 동봉)
  onMainState?: (v: MainChatView) => void
  onSessionEvent?: (p: LoopSessionEventPayload) => void
  // 시험 이음매 — 메인의 앱 안 도구 서버를 만든다(기본 buildMainTools). 시험은 능력 객체를 받아 직접 부른다
  mainTools?: (actions: MainActions) => Promise<Record<string, unknown> | null>
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
  // 취소는 대상을 고른다: main은 메인 대화의 턴만, worker는 작업·검수 세션만 멈춘다(서로 넘어가지 않는다)
  cancelSession(cwd: string, target: LoopCancelTarget): boolean
  releaseLatch(cwd: string, token: string): Promise<LoopReleaseLatchResponse>
  close(cwd: string): Promise<void>
  closeAll(): Promise<void>
  // 앱을 끌 때 열려 있던 작업 폴더를 다시 연다(사람이 닫은 폴더는 빠진다). 부팅 때 한 번 부른다
  reopenLast(): Promise<void>
  // 메인 대화 — 읽기(닫힌 저장소는 앱 영역 파일), 사용자 글 보내기, 새 메인 대화
  mainRead(cwd: string): MainChatView
  mainSend(cwd: string, text: string, opts?: { proxy?: boolean }): LoopMainResponse
  mainNew(cwd: string): Promise<LoopMainResponse>
  // 「문답 열기」 — 지금 문서와 꼴 규칙을 실은 여는 턴을 메인 대화에 보낸다
  tasteOpen(cwd: string, scope: TasteDialogScope): Promise<LoopMainResponse>
  // 사람이 일시 정지 깃발을 내린다(판정 칸 없음 — 실행 상태·검증 기록을 쓰지 않는다)
  lowerFlag(cwd: string): LoopMainResponse
  sessionLog(cwd: string): LoopSessionLog
  mainArchives(cwd: string): Promise<MainChatArchives>
  // 열린 실행기의 작업 저장소 뿌리 아래만 읽는다(작업 모드 탐색기)
  listDir(cwd: string, relDir: string): Promise<LoopListDirResponse>
  // 열 때 쓰는 템플릿(openExtras.template, 없으면 번들)의 화면용 그래프. 실행기를 열지 않아도 답한다
  graph(cwd: string): LoopGraphResponse
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
  // 세션 차례 — 카드 맥락의 신호(세션마다 하나)에 차례를 붙인다. 차례 번호는 구동자 전역의 것이다
  turns: WeakMap<AbortSignal, string>
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
  // 메인 대화, 마지막으로 시작을 적은 노드(같은 노드를 되풀이해 적지 않는다), 마지막 래치 사유
  chat: MainChat | null
  lastStarted: string | null
  lastLatch: string | null
  chatNotify: boolean
  // 프로젝트 문서 확정이 작업 트리를 쥐고 있다 — 그동안 실행을 시작하지 않는다
  tasteBusy: boolean
  // 실행을 시작하는 중(실행 상태를 쓰는 중) — 그동안 문서를 확정하지 않는다
  starting: boolean
  // 이 항목에서 실행이 끝났다(그 동안은 「끝남」으로 보인다). 열 때 이미 끝나 있던 실행은 「시작 전」과 안내 한 줄이다
  finishedHere?: boolean
}

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export function blankStatus(cwd: string): LoopStatus {
  return {
    cwd, root: null, phase: 'closed', milestoneId: null, node: null, nodeTitle: null, reason: null, base: null, ghRepo: null,
    failCount: 0, goals: [], approval: null, milestonePr: null, cards: [], sessionActive: false, lastVerdict: null, latch: null,
    paused: false, mainBusy: false, mainWaiting: false, mainNode: false, recentLines: [], sessions: [],
  }
}

const RECENT_LINES = 6
const LINE_SENTENCE_MAX = 200
function recentLinesOf(lines: RunState['lines']): LoopVerificationLine[] {
  return lines.slice(-RECENT_LINES).map((l) => {
    const one = oneLine(l.sentence)
    return { marker: l.marker, at: l.at, node: l.node, goal: l.goal, sentence: one.length > LINE_SENTENCE_MAX ? `${one.slice(0, LINE_SENTENCE_MAX)}…` : one }
  })
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

// 사람·메인에게 보이는 낱말 — 저장 값(status·marker)은 그대로다
const RUN_STATUS_WORD: Record<RunState['status'], string> = { running: '진행 중', 'needs-user': '사람 판정 대기', done: '끝' }
const MARKER_WORD: Record<RunState['lines'][number]['marker'], string> = { PASS: '통과', FAIL: '실패', 'USER-INPUT': '사람 입력' }

// 래치 카드에 보이는 상태 파일 요약(사람이 무엇을 받는지 본다)
export function stateSummary(text: string | null): string | null {
  if (text === null) return null
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return '상태 파일이 JSON으로 읽히지 않는다' }
  const checked = validateRunState(raw)
  if (!checked.ok) return `상태 파일이 스키마에 맞지 않는다 — ${checked.errors.slice(0, 3).map((e) => `${e.path} ${e.reason}`).join('; ')}`
  const s = checked.state
  return `${s.milestoneId} · ${cursorLabel(s)} · ${RUN_STATUS_WORD[s.status]} · 실패 ${s.failCount} · 검증 줄 ${s.lines.length}`
}

// 메인 에이전트에게 주는 실행 상태 요약 — 사건 문장과 같은 어휘(목표·실패)다. 상태 값 이름은 그대로 둔다
export function contextText(state: RunState, label: string | null): string {
  const goals = state.goals.map((g) => `${g.id}(${g.status})`).join(', ') || '없음'
  const lines = state.lines.slice(-5).map((l) => `- ${MARKER_WORD[l.marker]} ${l.node}: ${oneLine(l.sentence)}`).join('\n') || '- (없음)'
  return `실행 상태: ${state.milestoneId} · ${label ?? cursorLabel(state)} · ${state.status} · 실패 ${state.failCount}\n목표: ${goals}\n최근 검증 줄:\n${lines}`
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
  // 항목과 따로 둬서, 닫기가 항목을 지워도 지난 노드 세션을 열어 볼 수 있다
  const log = createSessionLog()
  function sessionEvent(cwd: string, session: LoopSessionTag, event: AgentEvent): void {
    const { seq, isNew } = log.record(cwd, session, event)
    try { opts.onSessionEvent?.({ cwd, session, event, seq }) } catch { /* 화면 쪽 오류는 세션을 막지 않는다 */ }
    const newNodeRow = isNew && session.kind !== 'main'
    if (newNodeRow) {
      const e = entryOf(cwd)
      if (e && !e.closed) void publish(e)
    }
  }
  const blank = (cwd: string): LoopStatus => ({ ...blankStatus(cwd), sessions: log.rows(cwd) })
  // 카드 차례 — 저장소 항목마다가 아니라 구동자 전역에서 단조 증가한다(닫기가 항목을 지워도 0부터 다시 세지 않는다).
  // 앱을 다시 켜면 새 구동자의 차례가 앞 구동자의 것과 겹치지 않게 구동자마다 무작위 접두를 붙인다.
  const turnPrefix = randomBytes(4).toString('hex')
  let turnSeq = 0
  const nextTurn = (): string => `${turnPrefix}.${++turnSeq}`
  const ciRetryMs = opts.ciRetryMs ?? DEFAULT_CI_RETRY_MS
  const humanPollMs = opts.humanPollMs ?? DEFAULT_HUMAN_POLL_MS
  const openImpl = opts.openLoopImpl ?? openLoop
  const mainTools = opts.mainTools ?? buildMainTools
  const appDigest = (): DigestStore => createFileDigestStore(path.join(opts.appDataDir, 'digests'))
  const autoCheck = (): string | null => {
    try { return opts.autoModeCheck?.() ?? null } catch (e) { return `자동 모드 허용 노드를 확인하지 못했다 — ${errText(e)}. ${REOPEN_HINT}` }
  }

  function entryOf(cwd: string): Entry | undefined { return entries.get(repoKeyOf(cwd)) }

  // 열린 작업 폴더 목록(앱 영역 open.json) — 열기가 더하고 사람의 닫기만 뺀다. 앱 종료(closeAll)는 그대로 둔다
  const openStore = path.join(opts.appDataDir, OPEN_STORE)
  const openSet: Promise<Map<string, string>> = fsp.readFile(openStore, 'utf8')
    .then((raw) => {
      const folders = (JSON.parse(raw) as { folders?: unknown } | null)?.folders
      const list = Array.isArray(folders) ? folders.filter((f): f is string => typeof f === 'string' && path.isAbsolute(f)) : []
      return new Map(list.map((f) => [repoKeyOf(f), f]))
    })
    .catch(() => new Map<string, string>())
  let openWrites: Promise<void> = Promise.resolve()
  function rememberOpen(cwd: string, on: boolean): void {
    openWrites = openWrites.then(async () => {
      const m = await openSet
      const key = repoKeyOf(cwd)
      if (on ? m.get(key) === cwd : !m.has(key)) return
      if (on) m.set(key, cwd)
      else m.delete(key)
      await fsp.mkdir(opts.appDataDir, { recursive: true })
      await writeFileAtomic(openStore, `${JSON.stringify({ folders: [...m.values()] })}\n`)
    }).catch(() => undefined)
  }
  // 같은 폴더의 열기는 한 줄로 선다 — 부팅의 다시 열기와 화면의 열기가 겹쳐도 실행기를 둘 열지 않는다
  const opening = new Map<string, Promise<unknown>>()
  function serialOpen(cwd: string, run: () => Promise<LoopStatus>): Promise<LoopStatus> {
    const key = repoKeyOf(cwd)
    const next = (opening.get(key) ?? Promise.resolve()).catch(() => undefined).then(run)
    const tail: Promise<unknown> = next.catch(() => undefined).finally(() => { if (opening.get(key) === tail) opening.delete(key) })
    opening.set(key, tail)
    return next
  }

  function newEntry(cwd: string): Entry {
    const e: Entry = {
      key: repoKeyOf(cwd), cwd, gen: 0, closed: false, loop: null, openFailure: null,
      status: blankStatus(cwd), seq: 0, cards: new Map(), turns: new WeakMap(), running: false, again: false, timer: null,
      sessionActive: false, waitingCi: false, blocked: null, note: null, notePhase: null, lastVerdict: null, latchSeen: new Map(),
      chat: null, lastStarted: null, lastLatch: null, chatNotify: false, tasteBusy: false, starting: false,
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
  // 메인 대화가 있으면 브레인스토밍은 그쪽 카드다(이 응답자는 메인 대화 없이 한 세션으로 도는 길에만 쓰인다).
  function cardResponder(e: Entry): CardResponder {
    return (ev: CardEvent, ctx) => new Promise<RunResponse>((resolve) => {
      let turn = e.turns.get(ctx.signal)
      if (turn === undefined) {
        turn = nextTurn()
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

  // 브레인스토밍 노드 → 메인 대화. 대화가 아직 없으면(열리는 중) 판정 없이 기다린다
  async function mainWorkOf(e: Entry, req: WorkRequest): Promise<WorkResult> {
    if (!e.chat) return { ok: false, summary: '메인 대화가 아직 열리지 않았다', waiting: true }
    return e.chat.brainstorm(req)
  }

  function openFor(e: Entry, accept?: readonly string[]): Promise<OpenLoopResult> {
    return openImpl({
      cwd: e.cwd,
      appDataDir: opts.appDataDir,
      ...(opts.backend ? { backend: opts.backend } : {}),
      requiredChecks: DEFAULT_REQUIRED_CHECKS,
      mainCard: cardResponder(e),
      mainWork: (req) => mainWorkOf(e, req),
      onSessionEvent: (event, session) => sessionEvent(e.cwd, session, event),
      ...opts.openExtras,
      ...(accept && accept.length > 0 ? { acceptConfigChanged: accept } : {}),
    })
  }

  // ── 메인 대화 ──
  const record = (e: Entry, ev: LoopEventItem, speak = false): void => { e.chat?.recordEvent(ev, speak) }

  // 보기 변화는 한 틱에 한 번만 밀어 준다(턴 하나에 저장이 여러 번 돈다)
  function chatChanged(e: Entry): void {
    if (e.chatNotify) return
    e.chatNotify = true
    queueMicrotask(() => {
      e.chatNotify = false
      if (!e.chat || e.closed) return
      try { opts.onMainState?.(e.chat.view(e.cwd)) } catch { /* 화면 쪽 오류는 대화를 막지 않는다 */ }
      void publish(e)
    })
  }

  async function contextOf(loop: OpenedLoop): Promise<string> {
    const r = await loop.runner.load()
    if (r.kind === 'missing') return '실행 상태: 아직 시작하지 않았다'
    if (r.kind !== 'ok') return `실행 상태: ${r.kind} — ${r.reason}`
    return contextText(r.state, labelOf(r.next))
  }

  // 깃발 내리기 — 메인의 resume 도구와 사람의 loop.lowerFlag가 같은 길을 쓴다. 깃발만 내리고 kick한다 —
  // 실행 상태·검증 기록을 쓰지 않고 사람 판정(decide)을 대신하지 않는다. 사건 이름은 flag-lowered다(사람 판정의 resumed와 다르다)
  function lowerFlagOf(e: Entry, by: 'main' | 'human'): { ok: boolean; reason?: string } {
    const chat = e.chat
    if (!chat) return { ok: false, reason: '메인 대화가 닫혔다' }
    if (!chat.paused()) return { ok: false, reason: '일시 정지 깃발이 올라 있지 않다' }
    chat.setPaused(false)
    record(e, { kind: 'flag-lowered', node: null, goal: null, text: by === 'human' ? '사람이 일시 정지 깃발을 내렸다' : '일시 정지 깃발을 내렸다' })
    if (e.loop) void kick(e)
    return { ok: true }
  }

  function attachChat(e: Entry, loop: OpenedLoop): void {
    if (!opts.backend || e.chat) return
    const fsPort = createFsPort(loop.root)
    const actions: MainActions = {
      pause: async () => {
        const chat = e.chat
        if (!chat) return '메인 대화가 닫혔다'
        if (chat.paused()) return '일시 정지 깃발이 이미 올라 있다'
        chat.setPaused(true)
        // 깃발 사건은 사람의 이어 가기(resumed)와 다른 이름이다
        record(e, { kind: 'flag-raised', node: null, goal: null, text: '일시 정지 깃발을 올렸다 — 지금 노드가 끝나면 다음 노드로 가지 않는다' })
        void publish(e)
        return '일시 정지 깃발을 올렸다 — 실행 상태와 검증 기록은 그대로다'
      },
      resume: async () => {
        const r = lowerFlagOf(e, 'main')
        return r.ok ? '일시 정지 깃발을 내렸다 — 사람 판정을 기다리는 실행은 그대로 기다린다' : (r.reason as string)
      },
      appendBacklog: async (line) => {
        const r = await appendBacklogLine(fsPort, line)
        if (!r.ok) return `적지 않았다 — ${r.reason}`
        record(e, { kind: 'backlog', node: null, goal: null, text: `미룬 일에 적었다 — ${line.trim()}` })
        return 'Backlog에 적었다'
      },
      proposeTasteDoc: async (draft) => e.chat?.proposeTasteDoc(draft) ?? '메인 대화가 닫혔다',
    }
    const dirs = { userDataDir: opts.tasteDataDir ?? null, root: loop.root }
    e.chat = openMainChat({
      root: loop.root,
      appDataDir: opts.appDataDir,
      env: loop.childEnv.env,
      backend: opts.backend,
      fs: fsPort,
      // 쓰기 창 — 실행기 커서가 그 방문의 메인 노드이고 실행이 running일 때만
      canWrite: async (key) => {
        if (e.closed || e.loop !== loop) return false
        const r = await loop.runner.load()
        return r.kind === 'ok' && r.state.status === 'running' && r.next.kind === 'work' && r.next.node.role === 'main' && visitKeyOf(r.state) === key
      },
      actions,
      context: () => contextOf(loop),
      nextTurnId: nextTurn,
      onTurnEnd: () => { if (e.loop === loop) void kick(e) },
      onChange: () => chatChanged(e),
      onEvent: (session, event) => sessionEvent(e.cwd, session, event),
      onNewChat: () => log.clear(e.cwd, 'main'),
      buildTools: () => mainTools(actions),
      taste: {
        check: (draft) => tasteCheck(draft, dirs),
        confirm: (draft, ctx) => confirmDraft(e, loop, draft, dirs, ctx),
      },
    })
  }

  // 실행기 밖에서 작업 트리를 바꾸는 확정은 실행이 없거나 끝났을 때만 — 기다리는 실행(CI·사람)도 다음 단계에서 브랜치를 옮긴다
  async function executorBusy(e: Entry, loop: OpenedLoop): Promise<string | null> {
    if (e.closed || e.loop !== loop) return '실행기가 닫혔다'
    if (e.starting) return STARTING
    const r = await loop.runner.load()
    if (r.kind !== 'missing' && !(r.kind === 'ok' && r.state.status === 'done')) {
      return '실행 중인 마일스톤이 있다 — 프로젝트 문서는 마일스톤이 끝난 뒤(또는 시작 전에) 확정한다'
    }
    return e.running || e.sessionActive ? '실행기가 단계를 돌고 있다 — 멈춘 뒤 다시 확정한다' : null
  }

  type Confirmed = { ok: true; summary: string; pr?: TastePrNote } | { ok: false; reason: string }

  function charterGitOf(g: GitPort): CharterGit | null {
    const { currentBranch, changedPaths, commitPaths, discardPaths } = g
    if (!currentBranch || !changedPaths || !commitPaths || !discardPaths) return null
    return { ...g, currentBranch, changedPaths, commitPaths, discardPaths }
  }

  // 열려 있는 문서 PR이 있으면 둘째 PR을 열지 않는다. 닫혔거나 병합됐으면 기록을 지운다
  async function openPrReason(loop: OpenedLoop, ctx: TasteConfirmCtx): Promise<string | null> {
    const note = ctx.openPr
    if (note === null) return null
    let state: string | null
    try { state = (await loop.gh.getPr(note.pr))?.state ?? null } catch (err) {
      return `PR #${note.pr}의 상태를 읽지 못했다 — ${err instanceof Error ? err.message : String(err)}`
    }
    if (state === 'open') return `${TASTE_DOC_LABEL[note.doc]} PR #${note.pr}(${note.branch})이 아직 열려 있다 — 병합하거나 닫은 뒤 다시 확정한다`
    ctx.prGone()
    return null
  }

  async function confirmDraft(e: Entry, loop: OpenedLoop, draft: TasteDraft, dirs: TasteDirs, ctx: TasteConfirmCtx): Promise<Confirmed> {
    const doc = draft.doc
    if (doc === 'global-taste') {
      try { return { ok: true, summary: `${await writeTasteDraft(draft, dirs)}에 썼다` } } catch (err) { return { ok: false, reason: tasteProblemText(err) } }
    }
    if (e.tasteBusy) return { ok: false, reason: '다른 프로젝트 문서를 확정하는 중이다' }
    if (e.starting) return { ok: false, reason: STARTING }
    const git = charterGitOf(loop.git)
    if (git === null) return { ok: false, reason: '이 실행기의 git 포트는 문서 확정을 지원하지 않는다' }
    let file: { rel: string; text: string }
    try { file = projectDraftFile(draft) } catch (err) { return { ok: false, reason: tasteProblemText(err) } }
    e.tasteBusy = true
    try {
      const why = ctx.openPr === null ? null : await openPrReason(loop, ctx)
      if (why !== null) return { ok: false, reason: why }
      const label = TASTE_DOC_LABEL[doc]
      const title = `docs(agentdeck): ${label} 확정`
      const out = await openCharterPr({
        git, gh: loop.gh, base: loop.base, now: new Date(), paths: [file.rel],
        executorBusy: () => executorBusy(e, loop),
        onCut: (cut) => ctx.cut(cut),
        write: async () => { await writeTasteDraft(draft, dirs).catch((err: unknown) => { throw new Error(tasteProblemText(err)) }) },
        title,
        body: `AgentDeck 메인 대화의 문답에서 사람이 확정한 ${label}이다. 병합은 사람이 PR 카드의 병합 버튼으로 한다.`,
      })
      if (!out.ok) return out
      const warn = out.warning ? ` (${out.warning})` : ''
      return {
        ok: true,
        summary: `${out.branch}에서 ${loop.base}로 가는 PR #${out.pr}을 열었다 — 병합하면 기본 브랜치에 들어간다${warn}`,
        pr: { pr: out.pr, branch: out.branch, doc, text: file.text },
      }
    } finally {
      e.tasteBusy = false
    }
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
    return { reason, file, changed, state: stateSummary(text), restore: stateSummary(copy), token }
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
    const s = blank(e.cwd)
    if (!e.loop) {
      if (!e.openFailure) return s
      return { ...s, phase: 'open-failed', root: e.openFailure.root ?? null, reason: e.openFailure.reason, latch: await openLatch(e, e.openFailure) }
    }
    const loop = e.loop
    const chat = e.chat
    const v: LoopStatus = {
      ...s, root: loop.root, base: loop.base, ghRepo: loop.ghRepo,
      // 메인 대화의 카드는 inChat을 붙인다(현황판은 보이고, 답하는 곳은 메인 대화 화면 한 곳이다)
      cards: [...[...e.cards.values()].map((c) => c.card), ...(chat?.cards() ?? []).map((c) => ({ ...c, inChat: true }))],
      sessionActive: e.sessionActive || (chat?.busy() ?? false), lastVerdict: e.lastVerdict, reason: e.note,
      paused: chat?.paused() ?? false, mainBusy: chat?.busy() ?? false, mainWaiting: chat?.waitingUser() ?? false,
      sessions: log.rows(e.cwd),
    }
    const r = await loop.runner.load()
    if (r.kind === 'missing') return e.blocked ? { ...v, phase: 'blocked', reason: e.blocked } : { ...v, phase: 'not-started' }
    if (r.kind === 'blocked') return { ...v, phase: 'blocked', reason: r.reason }
    if (r.kind === 'needs-user') return { ...v, phase: 'latched', reason: r.reason, latch: await liveLatch(e, loop, r.reason) }
    const { state, next } = r
    if (state.status === 'done' && !e.finishedHere) {
      return e.blocked ? { ...v, phase: 'blocked', reason: e.blocked } : { ...v, phase: 'not-started', notice: finishedNotice(state.milestoneId) }
    }
    const filled: LoopStatus = {
      ...v,
      milestoneId: state.milestoneId,
      failCount: state.failCount,
      goals: state.goals.map((g) => ({ id: g.id, title: g.title, status: g.status, grade: g.grade, pr: g.pr })),
      node: labelOf(next) ?? (state.status === 'done' ? null : cursorLabel(state)),
      nodeTitle: next.kind === 'work' || next.kind === 'gate' || next.kind === 'action' ? next.node.title : null,
      // 쓰기 창(mainChat)과 같은 판단이어야 두 화면이 같은 세션을 메인 대화로 본다
      mainNode: next.kind === 'work' && next.node.role === 'main',
      recentLines: recentLinesOf(state.lines),
    }
    if (state.status === 'done' || next.kind === 'done') return { ...filled, phase: 'done' }
    if (state.status === 'needs-user' || next.kind === 'needs-user') return { ...filled, phase: 'halted', reason: state.haltReason }
    // 구동(kick)과 같은 판단을 상태 계산이 직접 한다 — 여는 쪽의 계산이 구동보다 먼저 끝나도 running 한 장이 끼지 않는다
    const blocked = e.blocked ?? (chat?.paused() ? null : autoCheck())
    if (blocked) return { ...filled, phase: 'blocked', reason: blocked }
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
    // 알림은 처음 보인 단계 동안만 — 단계가 바뀌면 지운다
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

  // 판정 하나를 사건 줄로. 경계(goal 병합·마일스톤 PR)는 메인이 말한다
  function recordVerdict(e: Entry, next: NextStep, out: Awaited<ReturnType<OpenedLoop['runner']['step']>>): void {
    if (next.kind === 'done' || next.kind === 'needs-user') return
    const node = next.node.id
    const goal = next.goal?.id ?? null
    const label = labelOf(next) ?? node
    if ('verdict' in out && out.verdict) {
      const v = out.verdict
      const evidence = oneLine(v.evidence)
      if (next.kind === 'action' && v.verdict === 'pass' && next.node.action === 'mergeGoal') {
        record(e, { kind: 'goal-merged', node, goal, verdict: 'pass', text: `${goal ?? ''} 목표를 병합했다 — ${evidence}` }, true)
      } else if (next.kind === 'action' && v.verdict === 'pass' && next.node.action === 'openMilestonePr') {
        record(e, { kind: 'milestone-pr', node, goal, verdict: 'pass', text: `마일스톤 PR을 열었다 — ${evidence}` }, true)
      } else if (v.verdict === 'fail') {
        record(e, { kind: 'fail', node, goal, verdict: 'fail', text: `${label} 실패 — ${evidence}` })
      } else if (v.verdict === 'pass') {
        record(e, { kind: 'node-end', node, goal, verdict: 'pass', text: `${label} 통과 — ${evidence}` })
      }
    }
    if (out.kind === 'halted') {
      record(e, { kind: 'halt', node, goal, verdict: 'stop', text: `실행이 멈췄다(${label}) — ${oneLine(out.state.haltReason ?? '사유 없음')}` }, true)
    } else if (out.kind === 'done') {
      record(e, { kind: 'done', node, goal, text: '마일스톤 실행이 끝났다' })
    }
  }

  async function runSteps(e: Entry, gen: number): Promise<void> {
    for (let i = 0; i < STEP_BUDGET; i++) {
      if (!alive(e, gen)) return
      const loop = e.loop as OpenedLoop
      const loaded = await loop.runner.load()
      if (!alive(e, gen)) return
      if (loaded.kind === 'needs-user' && e.lastLatch !== loaded.reason) {
        e.lastLatch = loaded.reason
        record(e, { kind: 'latched', node: null, goal: null, text: `위조 래치가 걸렸다 — ${oneLine(loaded.reason)}` })
      }
      if (loaded.kind !== 'ok') return
      e.lastLatch = null
      const next = loaded.next
      if (next.kind === 'done' || next.kind === 'needs-user') return
      // 일시 정지 깃발이 올라 있으면 다음 단계를 돌지 않는다(실행 상태는 그대로)
      if (e.chat?.paused()) return
      const why = autoCheck()
      if (why) { e.blocked = why; return }
      e.blocked = null
      const label = labelOf(next)
      if (label !== null && label !== e.lastStarted) {
        e.lastStarted = label
        record(e, { kind: 'node-start', node: next.node.id, goal: next.goal?.id ?? null, text: `${label} — ${next.node.title}` })
      }
      const sessionNode = next.kind === 'work' || (next.kind === 'gate' && next.node.judge === 'model')
      e.sessionActive = sessionNode
      if (sessionNode) void publish(e)
      let out: Awaited<ReturnType<typeof loop.runner.step>>
      try {
        out = await loop.runner.step()
      } finally {
        e.sessionActive = false
        // 꼬리표에는 끝 신호가 없어서, 단계가 돌아오거나 깨진 때를 그 단계 노드 세션의 끝으로 본다
        log.endAll(e.cwd)
      }
      if (!alive(e, gen)) return
      if ('verdict' in out && out.verdict) e.lastVerdict = { node: out.verdict.node, verdict: out.verdict.verdict, evidence: out.verdict.evidence }
      recordVerdict(e, next, out)
      if (out.kind === 'done') e.finishedHere = true
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
      // 예외도 사건 줄로 남긴다(모델 턴 없이)
      record(e, { kind: 'error', node: null, goal: null, text: `구동 오류 — ${oneLine(errText(err))}` })
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
    e.finishedHere = false
    // 메인 대화를 먼저 닫는다(돌던 턴을 멈추고 남은 질문 카드를 저장한다 — 다음 열기에서 다시 묻는다)
    const chat = e.chat
    e.chat = null
    if (chat) await chat.close()
    // 실행기 닫기가 세션을 멈추고, 세션의 끝이 카드를 거둔다(카드를 먼저 답하면 세션이 그 답으로 나아간다)
    if (loop) await loop.close()
    for (const c of [...e.cards.values()]) c.settle({ kind: 'question', answers: null })
    e.cards.clear()
    log.endAll(e.cwd)
  }

  const rejectWith = async (e: Entry, reason: string): Promise<LoopDecideResponse> => ({ ok: false, reason, status: await publish(e) })
  const releaseRefused = async (e: Entry, reason: string): Promise<LoopReleaseLatchResponse> => ({ ok: false, reason, status: await publish(e) })
  const CLOSED_MEANWHILE = '기다리는 동안 루프가 닫혔다 — 새로 연 실행기를 닫았다'
  const NOT_OPEN = '열린 실행기가 없다 — 먼저 연다'

  function mainViewOf(cwd: string): MainChatView {
    const e = entryOf(cwd)
    if (e?.chat) return e.chat.view(cwd)
    return readMainChatView(opts.appDataDir, e?.loop?.root ?? e?.openFailure?.root ?? cwd)
  }

  async function openNow(req: LoopOpenRequest): Promise<LoopStatus> {
    const e = entryOf(req.cwd) ?? newEntry(req.cwd)
    e.closed = false
    if (!e.loop) {
      const gen = e.gen
      const r = await openFor(e)
      // 여는 동안 닫혔으면 새 실행기를 닫고(잠금을 푼다) 그 결과를 쓰지 않는다
      if (superseded(e, gen)) {
        if (r.ok) await r.loop.close()
        return entryOf(req.cwd)?.status ?? { ...blankStatus(req.cwd), reason: CLOSED_MEANWHILE }
      }
      if (r.ok) { e.loop = r.loop; e.openFailure = null; attachChat(e, r.loop) } else e.openFailure = { reason: r.reason, changed: r.changed, root: r.root }
    }
    if (e.loop) void kick(e)
    return publish(e)
  }

  return {
    async open(req) {
      const s = await serialOpen(req.cwd, () => openNow(req))
      // 다시 열 목록에는 열린 실행기만 남긴다(열다 실패했거나 그사이 닫혔으면 넣지 않는다)
      const e = entryOf(req.cwd)
      if (e?.loop && !e.closed) rememberOpen(req.cwd, true)
      return s
    },

    async reopenLast() {
      const folders = [...(await openSet).values()]
      // 줄을 서 있는 동안 사람이 닫았으면(목록에서 빠졌으면) 열지 않는다
      const reopen = (cwd: string) => serialOpen(cwd, async () => {
        await openWrites
        const e = entryOf(cwd)
        if ((await openSet).get(repoKeyOf(cwd)) !== cwd || e?.loop) return e?.status ?? blankStatus(cwd)
        return openNow({ cwd })
      })
      await Promise.all(folders.map((cwd) => (entryOf(cwd)?.loop ? undefined : reopen(cwd))))
    },

    async start(cwd, milestoneId) {
      const e = entryOf(cwd)
      if (!e?.loop) return e ? publish(e) : { ...blankStatus(cwd), reason: NOT_OPEN }
      if (e.tasteBusy) { setNote(e, '프로젝트 문서를 확정하는 중이다 — 확정이 끝난 뒤 시작한다'); return publish(e) }
      const why = autoCheck()
      if (why) { e.blocked = why; return publish(e) }
      e.blocked = null
      e.starting = true
      let r
      try { r = await e.loop.runner.start(milestoneId) } finally { e.starting = false }
      setNote(e, r.kind === 'ok' ? null : r.kind === 'missing' ? '실행 상태를 만들지 못했다' : r.reason)
      // 새 실행이다. 메인 대화 장의 방문은 앞 실행의 것이라 잊는다(방문 키 M1#0이 겹쳐 여는 턴을 건너뛰지 않게)
      if (r.kind === 'ok') { e.chat?.resetVisit(); e.lastStarted = null; e.finishedHere = false }
      void kick(e)
      return publish(e)
    },

    status: (cwd) => entryOf(cwd)?.status ?? blank(cwd),

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
      let event: LoopEventItem
      if (state.status === 'needs-user') {
        if (req.verdict !== 'pass') return rejectWith(e, '멈춘 실행은 이어 가기(pass)만 받는다')
        const why = autoCheck()
        if (why) { e.blocked = why; return rejectWith(e, why) }
        out = await loop.runner.submit({ node: state.cursor.node, judge: 'human', verdict: 'pass', evidence: req.evidence })
        event = { kind: 'resumed', node: state.cursor.node, goal: null, verdict: 'pass', text: `사람이 멈춘 실행을 이어 갔다 — ${oneLine(req.evidence)}` }
      } else if (next.kind === 'gate' && next.node.judge === 'human') {
        if (next.node.watch) return rejectWith(e, `${next.node.id}는 PR 병합 사실로만 통과한다 — 병합 버튼으로 사람이 병합한다`)
        out = await loop.runner.submit(
          { node: next.node.id, judge: 'human', verdict: req.verdict, evidence: req.evidence },
          req.specSha256 !== undefined ? { specSha256: req.specSha256 } : {},
        )
        event = req.verdict === 'pass'
          ? { kind: 'spec-approved', node: next.node.id, goal: null, verdict: 'pass', text: `사람이 스펙을 승인했다 — ${oneLine(req.evidence)}` }
          : { kind: 'spec-rejected', node: next.node.id, goal: null, verdict: 'fail', text: `사람이 스펙을 반려했다 — ${oneLine(req.evidence)}` }
      } else {
        return rejectWith(e, `지금 노드 ${here ?? '(없음)'}는 사람 판정을 받지 않는다`)
      }
      if (out.kind === 'blocked' || out.kind === 'needs-user') return rejectWith(e, out.reason)
      e.blocked = null
      if ('verdict' in out && out.verdict) e.lastVerdict = { node: out.verdict.node, verdict: out.verdict.verdict, evidence: out.verdict.evidence }
      record(e, event)
      void kick(e)
      return { ok: true, status: await publish(e) }
    },

    answerCard(cwd, requestId, response) {
      const e = entryOf(cwd)
      const c = e?.cards.get(requestId)
      // 카드 종류와 답의 꼴이 같아야 한다(질문 카드에 허용·거부를 넣지 않는다)
      if (c) {
        if (response.kind === 'taste' || c.card.kind !== response.kind) return false
        c.settle(response)
        return true
      }
      // 메인 대화의 카드(다시 묻는 카드 포함)
      return e?.chat?.answerCard(requestId, response) ?? false
    },

    // 대상을 고른 취소. main은 메인 대화의 턴만 멈추고(실행 상태와 무관), worker는 작업·검수 세션만 멈춘다 —
    // 작업 세션 취소의 멈춤(needs-user)은 실행기의 판정이다(FAIL이 아니라 stop). 한쪽이 없어도 다른 쪽으로 넘어가지 않는다
    cancelSession: (cwd, target) => {
      const e = entryOf(cwd)
      if (target === 'main') return e?.chat?.cancel() ?? false
      return e?.loop?.cancelSession() ?? false
    },

    lowerFlag(cwd) {
      const e = entryOf(cwd)
      if (!e?.chat) return { ok: false, reason: NOT_OPEN, view: mainViewOf(cwd) }
      const r = lowerFlagOf(e, 'human')
      return { ok: r.ok, ...(r.reason !== undefined ? { reason: r.reason } : {}), view: mainViewOf(cwd) }
    },

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
      // 상태가 다이제스트와 맞지 않으면 위조본을 받지 않고 사본으로 되돌린다. 사본이 없거나 스키마에 맞지 않으면
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
        // 바뀐 그 상태 그대로 새 token의 래치를 다시 보인다(받을 설정 줄은 화면이 본 그 목록). 사람이 다시 보고 누른다
        e.openFailure = { reason: '화면이 본 뒤 상태 파일이 바뀌어 래치를 풀지 않았다 — 새로 뜬 래치를 다시 보고 푼다', changed: accept, root }
        return releaseRefused(e, e.openFailure.reason)
      }
      if (!seen.tampered && text !== null) {
        try { JSON.parse(text) } catch {
          e.openFailure = { reason: '상태 파일이 JSON으로 읽히지 않아 래치를 풀지 않았다 — 사람이 파일을 고친 뒤 다시 연다', root }
          return releaseRefused(e, e.openFailure.reason)
        }
      }
      const r = await openFor(e, accept)
      // 풀기가 기다리는 동안 닫혔으면 새 실행기를 닫는다
      if (superseded(e, gen)) {
        if (r.ok) await r.loop.close()
        return { ok: false, reason: CLOSED_MEANWHILE, status: entryOf(cwd)?.status ?? blankStatus(cwd) }
      }
      if (!r.ok) {
        e.openFailure = { reason: r.reason, changed: r.changed, root: r.root ?? root }
        return releaseRefused(e, r.reason)
      }
      // 연 뒤에만 상태를 맞춘다 — 다시 열기가 거부되면 래치가 남는다. 맞추는 도중 깨지거나 닫히면 새 실행기를 닫는다
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
      attachChat(e, r.loop)
      void kick(e)
      return { ok: true, status: await publish(e) }
    },

    async close(cwd) {
      rememberOpen(cwd, false)
      const e = entryOf(cwd)
      if (!e) { await openWrites; return }
      e.closed = true
      await closeEntry(e)
      entries.delete(e.key)
      opts.onState?.(blank(e.cwd))
      await openWrites
    },

    sessionLog: (cwd) => log.read(cwd),

    // 보관 키는 mainRead와 같은 뿌리에서 만들어야 그 폴더의 보관 장을 찾는다
    async mainArchives(cwd) {
      const e = entryOf(cwd)
      const root = e?.loop?.root ?? e?.openFailure?.root ?? cwd
      return { cwd, archives: await listArchives(opts.appDataDir, repoKeyOf(root)) }
    },

    async closeAll() {
      const all = [...entries.values()]
      for (const e of all) e.closed = true
      await Promise.all(all.map(async (e) => {
        await closeEntry(e)
        entries.delete(e.key)
      }))
      await openWrites
    },

    mainRead: (cwd) => mainViewOf(cwd),

    async listDir(cwd, relDir) {
      const root = entryOf(cwd)?.loop?.root
      // 실행기가 없거나 작업 저장소 밖으로 나가는 경로는 빈 폴더가 아니라 막힘으로 답한다
      if (!root || !resolveSafe(root, relDir || '.')) return { ok: false, entries: [] }
      return { ok: true, entries: await listWorkDir(root, relDir) }
    },

    graph: () => {
      const given = opts.openExtras?.template
      if (given) return { ok: true, graph: templateGraph(given.template) }
      const t = loadBundledTemplate()
      if (!t.ok) return { ok: false, reason: `번들 템플릿이 스키마에 맞지 않는다 — ${t.errors.map((x) => `${x.path} ${x.reason}`).join('; ')}` }
      return { ok: true, graph: templateGraph(t.template) }
    },

    mainSend(cwd, text, opts) {
      const chat = entryOf(cwd)?.chat
      if (!chat) return { ok: false, reason: NOT_OPEN, view: mainViewOf(cwd) }
      const r = chat.send(text, opts)
      return { ok: r.ok, ...(r.reason !== undefined ? { reason: r.reason } : {}), view: chat.view(cwd) }
    },

    async mainNew(cwd) {
      const chat = entryOf(cwd)?.chat
      if (!chat) return { ok: false, reason: NOT_OPEN, view: mainViewOf(cwd) }
      const r = await chat.newChat()
      return { ok: r.ok, ...(r.reason !== undefined ? { reason: r.reason } : {}), view: mainViewOf(cwd) }
    },

    async tasteOpen(cwd, scope) {
      const e = entryOf(cwd)
      const root = e?.loop?.root
      if (!e?.chat || !root) return { ok: false, reason: NOT_OPEN, view: mainViewOf(cwd) }
      const docs = await readTasteDocs(opts.tasteDataDir ?? path.join(opts.appDataDir, 'no-taste-dir'), root)
      const chat = e.chat
      if (!chat) return { ok: false, reason: NOT_OPEN, view: mainViewOf(cwd) }
      const r = chat.send(OPEN_LINE[scope], { prompt: openingPrompt(scope, docs) })
      return { ok: r.ok, ...(r.reason !== undefined ? { reason: r.reason } : {}), view: chat.view(cwd) }
    },
  }
}
