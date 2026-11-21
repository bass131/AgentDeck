// 화면은 실행 상태를 넣지 못한다. 판정할 노드는 구동자가 저장본에서 고르고, 스펙 승인은 사람이 본 스펙 해시에 묶인다.
// 카드 응답은 허용·거부와 질문 답만 받는다(「항상 허용」은 루프 세션에 없다).
import type { BrowserWindow } from 'electron'
import { isAbsolute } from 'node:path'
import { IPC_CHANNELS, sendPush } from '@shared/ipcContract'
import type {
  LoopCardResponse,
  LoopDecideRequest,
  LoopDecideResponse,
  LoopOpenRequest,
  LoopReleaseLatchResponse,
  LoopStatus,
} from '@shared/ipcContract'
import type {
  LoopAlert, LoopAlertList, LoopAlertOpen, LoopCancelTarget, LoopListDirResponse, LoopMainResponse, LoopSessionEventPayload, LoopSessionLog, MainChatArchives, MainChatView,
} from '@shared/13_Loop/loop'
import type { LoopGraphResponse } from '@shared/13_Loop/graph'
import type { TasteDialogScope } from '@shared/14_Taste/taste'
import { handle } from '../handle'

const MAIN_TEXT_MAX = 20_000

export interface LoopDriverApi {
  mainRead(cwd: string): MainChatView
  mainSend(cwd: string, text: string, opts?: { proxy?: boolean }): LoopMainResponse
  mainNew(cwd: string): Promise<LoopMainResponse>
  lowerFlag(cwd: string): LoopMainResponse
  sessionLog(cwd: string): LoopSessionLog
  mainArchives(cwd: string): Promise<MainChatArchives>
  graph(cwd: string): LoopGraphResponse
  listDir(cwd: string, relDir: string): Promise<LoopListDirResponse>
  tasteOpen(cwd: string, scope: TasteDialogScope): Promise<LoopMainResponse>
  open(req: LoopOpenRequest): Promise<LoopStatus>
  start(cwd: string, milestoneId: string): Promise<LoopStatus>
  status(cwd: string): LoopStatus
  decide(req: LoopDecideRequest): Promise<LoopDecideResponse>
  answerCard(cwd: string, requestId: string, response: LoopCardResponse): boolean
  cancelSession(cwd: string, target: LoopCancelTarget): boolean
  releaseLatch(cwd: string, token: string): Promise<LoopReleaseLatchResponse>
  close(cwd: string): Promise<void>
}

interface LoopHandlerDeps { driver: LoopDriverApi; alerts?: { list(): LoopAlert[] } }

const SHA256 = /^[0-9a-f]{64}$/
const EVIDENCE_MAX = 2000
const REJECT_REASON_MAX = 500

function obj(req: unknown, ch: string): Record<string, unknown> {
  if (!req || typeof req !== 'object') throw new Error(`${ch}: 요청이 객체가 아니다`)
  return req as Record<string, unknown>
}
function cwdOf(r: Record<string, unknown>, ch: string): string {
  const cwd = r['cwd']
  if (typeof cwd !== 'string' || cwd.trim() === '' || !isAbsolute(cwd)) throw new Error(`${ch}: cwd는 절대 경로여야 한다`)
  return cwd
}
function text(r: Record<string, unknown>, key: string, ch: string, max = 200): string {
  const v = r[key]
  if (typeof v !== 'string' || v.trim() === '' || v.length > max) throw new Error(`${ch}: ${key}가 비었거나 너무 길다`)
  return v
}

function cardResponseOf(v: unknown): LoopCardResponse | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (r['kind'] === 'permission') {
    return r['behavior'] === 'allow' || r['behavior'] === 'deny' ? { kind: 'permission', behavior: r['behavior'] } : null
  }
  if (r['kind'] === 'question') {
    const a = r['answers']
    if (a === null) return { kind: 'question', answers: null }
    if (Array.isArray(a) && a.every((row) => Array.isArray(row) && row.every((s) => typeof s === 'string'))) {
      return { kind: 'question', answers: a as string[][] }
    }
  }
  // 문서 초안 카드 — 확정은 구조를 받지 않는다(쓰는 것은 main이 쥔 초안이다). 반려는 이유 한 줄
  if (r['kind'] === 'taste') {
    if (r['decision'] === 'confirm') return { kind: 'taste', decision: 'confirm' }
    const reason = r['reason']
    if (r['decision'] === 'reject' && typeof reason === 'string' && reason.trim() !== '' && reason.length <= REJECT_REASON_MAX && !/[\r\n]/.test(reason)) {
      return { kind: 'taste', decision: 'reject', reason }
    }
  }
  return null
}

export function registerLoopHandlers(deps: LoopHandlerDeps): void {
  const { driver } = deps

  handle(IPC_CHANNELS.LOOP_OPEN, async (_e, req) => {
    const r = obj(req, 'loop.open')
    const cwd = cwdOf(r, 'loop.open')
    // 화면이 필수 검사를 빈 목록으로 바꾸면 아무 검사나 통과한다
    if (r['requiredChecks'] !== undefined) throw new Error('loop.open: requiredChecks는 받지 않는다 — 필수 검사 이름은 main이 고정한다')
    return driver.open({ cwd })
  })

  handle(IPC_CHANNELS.LOOP_START, async (_e, req) => {
    const r = obj(req, 'loop.start')
    return driver.start(cwdOf(r, 'loop.start'), text(r, 'milestoneId', 'loop.start', 64))
  })

  handle(IPC_CHANNELS.LOOP_STATUS, async (_e, req) => driver.status(cwdOf(obj(req, 'loop.status'), 'loop.status')))

  handle(IPC_CHANNELS.LOOP_DECIDE, async (_e, req) => {
    const r = obj(req, 'loop.decide')
    const cwd = cwdOf(r, 'loop.decide')
    const verdict = r['verdict']
    if (verdict !== 'pass' && verdict !== 'fail') throw new Error('loop.decide: verdict는 pass·fail 중 하나다')
    const evidence = text(r, 'evidence', 'loop.decide', EVIDENCE_MAX)
    const sha = r['specSha256']
    if (sha !== undefined && (typeof sha !== 'string' || !SHA256.test(sha))) throw new Error('loop.decide: specSha256은 sha256 16진수다')
    const expectNode = r['expectNode']
    if (expectNode !== undefined && typeof expectNode !== 'string') throw new Error('loop.decide: expectNode는 문자열이다')
    return driver.decide({
      cwd, verdict, evidence,
      ...(sha !== undefined ? { specSha256: sha as string } : {}),
      ...(expectNode !== undefined ? { expectNode: expectNode as string } : {}),
    })
  })

  handle(IPC_CHANNELS.LOOP_ANSWER_CARD, async (_e, req) => {
    const r = obj(req, 'loop.answerCard')
    const cwd = cwdOf(r, 'loop.answerCard')
    const requestId = r['requestId']
    const response = cardResponseOf(r['response'])
    if (typeof requestId !== 'string' || requestId === '' || response === null) return { ok: false }
    return { ok: driver.answerCard(cwd, requestId, response) }
  })

  // 대상이 없을 때 메인 턴 쪽으로 기울지 않게, 모르는 대상은 거부한다
  handle(IPC_CHANNELS.LOOP_CANCEL_SESSION, async (_e, req) => {
    const r = obj(req, 'loop.cancelSession')
    const cwd = cwdOf(r, 'loop.cancelSession')
    const target = r['target']
    if (target !== 'main' && target !== 'worker') throw new Error('loop.cancelSession: target은 main·worker 중 하나다')
    return { ok: driver.cancelSession(cwd, target) }
  })

  handle(IPC_CHANNELS.LOOP_RELEASE_LATCH, async (_e, req) => {
    const r = obj(req, 'loop.releaseLatch')
    const cwd = cwdOf(r, 'loop.releaseLatch')
    const token = r['token']
    if (typeof token !== 'string' || !SHA256.test(token)) throw new Error('loop.releaseLatch: token은 sha256 16진수다')
    return driver.releaseLatch(cwd, token)
  })

  handle(IPC_CHANNELS.LOOP_CLOSE, async (_e, req) => {
    await driver.close(cwdOf(obj(req, 'loop.close'), 'loop.close'))
    return { ok: true }
  })

  handle(IPC_CHANNELS.LOOP_MAIN_READ, async (_e, req) => driver.mainRead(cwdOf(obj(req, 'loop.mainRead'), 'loop.mainRead')))

  handle(IPC_CHANNELS.LOOP_MAIN_SEND, async (_e, req) => {
    const r = obj(req, 'loop.mainSend')
    const cwd = cwdOf(r, 'loop.mainSend')
    const body = text(r, 'text', 'loop.mainSend', MAIN_TEXT_MAX)
    return r['proxy'] === true ? driver.mainSend(cwd, body, { proxy: true }) : driver.mainSend(cwd, body)
  })

  handle(IPC_CHANNELS.LOOP_MAIN_NEW, async (_e, req) => driver.mainNew(cwdOf(obj(req, 'loop.mainNew'), 'loop.mainNew')))

  // 깃발 내리기는 사람 판정(decide)을 대신하지 않는다 — 실행 상태·검증 기록을 쓰지 않는다
  handle(IPC_CHANNELS.LOOP_LOWER_FLAG, async (_e, req) => driver.lowerFlag(cwdOf(obj(req, 'loop.lowerFlag'), 'loop.lowerFlag')))

  handle(IPC_CHANNELS.LOOP_SESSION_LOG, async (_e, req) => driver.sessionLog(cwdOf(obj(req, 'loop.sessionLog'), 'loop.sessionLog')))
  handle(IPC_CHANNELS.LOOP_MAIN_ARCHIVES, async (_e, req) => driver.mainArchives(cwdOf(obj(req, 'loop.mainArchives'), 'loop.mainArchives')))
  handle(IPC_CHANNELS.LOOP_GRAPH, async (_e, req) => driver.graph(cwdOf(obj(req, 'loop.graph'), 'loop.graph')))
  handle(IPC_CHANNELS.LOOP_ALERTS, async () => ({ alerts: deps.alerts?.list() ?? [] }))

  // 읽을 뿌리는 구동자가 그 cwd의 열린 실행기에서 정한다
  handle(IPC_CHANNELS.LOOP_LIST_DIR, async (_e, req) => {
    const r = obj(req, 'loop.listDir')
    const cwd = cwdOf(r, 'loop.listDir')
    const relDir = r['relDir']
    if (typeof relDir !== 'string' || relDir.length > 4096) throw new Error('loop.listDir: relDir는 상대 경로 글자다')
    return driver.listDir(cwd, relDir)
  })

  // 여는 턴의 글은 main이 만든다 — 화면은 범위만 고른다
  handle(IPC_CHANNELS.LOOP_TASTE_OPEN, async (_e, req) => {
    const r = obj(req, 'loop.tasteOpen')
    const cwd = cwdOf(r, 'loop.tasteOpen')
    const scope = r['scope']
    if (scope !== 'global' && scope !== 'project') throw new Error('loop.tasteOpen: scope는 global·project 중 하나다')
    return driver.tasteOpen(cwd, scope)
  })
}

// 창이 없거나 닫혔으면 보내지 않는다. 다음 읽기 호출이 같은 값을 돌려준다
function pushTo<C extends Parameters<typeof sendPush>[1]>(state: { win: BrowserWindow | null }, ch: C, payload: Parameters<typeof sendPush<C>>[2]): void {
  const win = state.win
  if (!win || win.isDestroyed()) return
  sendPush(win.webContents, ch, payload)
}

export function pushLoopState(state: { win: BrowserWindow | null }, s: LoopStatus): void {
  pushTo(state, IPC_CHANNELS.LOOP_STATE, s)
}
export function pushMainState(state: { win: BrowserWindow | null }, v: MainChatView): void {
  pushTo(state, IPC_CHANNELS.LOOP_MAIN_STATE, v)
}
export function pushSessionEvent(state: { win: BrowserWindow | null }, p: LoopSessionEventPayload): void {
  pushTo(state, IPC_CHANNELS.LOOP_SESSION_EVENT, p)
}
export function pushAlerts(state: { win: BrowserWindow | null }, list: LoopAlertList): void {
  pushTo(state, IPC_CHANNELS.LOOP_ALERTS_STATE, list)
}
export function pushAlertOpen(state: { win: BrowserWindow | null }, open: LoopAlertOpen): void {
  pushTo(state, IPC_CHANNELS.LOOP_ALERT_OPEN, open)
}
