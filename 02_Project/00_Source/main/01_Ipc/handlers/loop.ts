// M09 G4 — 앱 안 마일스톤 루프 IPC. 입력 꼴만 보고 구동자(main/05_Loop/loopDriver.ts)로 그대로 넘긴다.
// 화면은 상태를 넣지 못한다 — 판정할 노드는 구동자가 저장본에서 고르고, 스펙 승인은 사람이 본 스펙 해시에 묶인다.
// 카드 응답은 허용·거부와 질문 답만 받는다(「항상 허용」은 루프 세션에 없다). 꼴이 틀린 카드 응답은 ok:false다(QUESTION_RESPOND와 같다).
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
import type { LoopCancelTarget, LoopMainResponse, LoopSessionEventPayload, LoopSessionLog, MainChatArchives, MainChatView } from '@shared/13_Loop/loop'
import { handle } from '../handle'

const MAIN_TEXT_MAX = 20_000

// 핸들러가 부르는 구동자의 면. loopDriver.createLoopDriver가 이것을 채운다.
export interface LoopDriverApi {
  mainRead(cwd: string): MainChatView
  mainSend(cwd: string, text: string): LoopMainResponse
  mainNew(cwd: string): Promise<LoopMainResponse>
  // M10 G3 — 사람이 깃발을 내린다(cwd만), 취소는 대상을 고른다
  lowerFlag(cwd: string): LoopMainResponse
  sessionLog(cwd: string): LoopSessionLog
  mainArchives(cwd: string): Promise<MainChatArchives>
  open(req: LoopOpenRequest): Promise<LoopStatus>
  start(cwd: string, milestoneId: string): Promise<LoopStatus>
  status(cwd: string): LoopStatus
  decide(req: LoopDecideRequest): Promise<LoopDecideResponse>
  answerCard(cwd: string, requestId: string, response: LoopCardResponse): boolean
  cancelSession(cwd: string, target: LoopCancelTarget): boolean
  releaseLatch(cwd: string, token: string): Promise<LoopReleaseLatchResponse>
  close(cwd: string): Promise<void>
}

export interface LoopHandlerDeps { driver: LoopDriverApi }

const SHA256 = /^[0-9a-f]{64}$/
const EVIDENCE_MAX = 2000

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

export function cardResponseOf(v: unknown): LoopCardResponse | null {
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
  return null
}

export function registerLoopHandlers(deps: LoopHandlerDeps): void {
  const { driver } = deps

  handle(IPC_CHANNELS.LOOP_OPEN, async (_e, req) => {
    const r = obj(req, 'loop.open')
    const cwd = cwdOf(r, 'loop.open')
    // G4 검수 중요 I5 — CI 정책(필수 검사 이름)은 main이 고정한다(['hard-gates']). 화면 입력으로 바꾸지 못하게 그 칸이 오면 거부한다.
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

  // M10 G3 — 취소는 대상(메인 턴 main / 작업 세션 worker)을 골라야 한다. 대상이 없거나 모르면 거부한다(옛 「메인 먼저」로 기울지 않는다, Backlog 12).
  // 판정 칸은 읽지 않는다 — 구동자는 cwd와 대상만 받는다
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

  // ── M10 G2 메인 대화 ── 보내는 것은 글 하나뿐이다(판정 칸은 읽지 않는다). 카드 답은 loop.answerCard를 그대로 쓴다.
  handle(IPC_CHANNELS.LOOP_MAIN_READ, async (_e, req) => driver.mainRead(cwdOf(obj(req, 'loop.mainRead'), 'loop.mainRead')))

  handle(IPC_CHANNELS.LOOP_MAIN_SEND, async (_e, req) => {
    const r = obj(req, 'loop.mainSend')
    const cwd = cwdOf(r, 'loop.mainSend')
    return driver.mainSend(cwd, text(r, 'text', 'loop.mainSend', MAIN_TEXT_MAX))
  })

  handle(IPC_CHANNELS.LOOP_MAIN_NEW, async (_e, req) => driver.mainNew(cwdOf(obj(req, 'loop.mainNew'), 'loop.mainNew')))

  // M10 G3 — 사람이 일시 정지 깃발을 내린다. cwd만 읽는다 — 판정 칸(verdict·evidence·specSha256·expectNode)이 와도 구동자에 닿지 않는다.
  // 깃발 내리기는 사람 판정(decide)을 대신하지 않는다 — 실행 상태·검증 기록을 쓰지 않는다(USER-INPUT 줄 없음)
  handle(IPC_CHANNELS.LOOP_LOWER_FLAG, async (_e, req) => driver.lowerFlag(cwdOf(obj(req, 'loop.lowerFlag'), 'loop.lowerFlag')))

  handle(IPC_CHANNELS.LOOP_SESSION_LOG, async (_e, req) => driver.sessionLog(cwdOf(obj(req, 'loop.sessionLog'), 'loop.sessionLog')))
  handle(IPC_CHANNELS.LOOP_MAIN_ARCHIVES, async (_e, req) => driver.mainArchives(cwdOf(obj(req, 'loop.mainArchives'), 'loop.mainArchives')))
}

function pushTo<C extends Parameters<typeof sendPush>[1]>(state: { win: BrowserWindow | null }, ch: C, payload: Parameters<typeof sendPush<C>>[2]): void {
  const win = state.win
  if (!win || win.isDestroyed()) return
  sendPush(win.webContents, ch, payload)
}

// 구동자의 상태 변화 → 창. 창이 없거나 닫혔으면 보내지 않는다(다음 status 호출이 같은 한 장을 돌려준다).
export function pushLoopState(state: { win: BrowserWindow | null }, s: LoopStatus): void {
  pushTo(state, IPC_CHANNELS.LOOP_STATE, s)
}
// M10 G2 — 메인 대화 보기(다음 mainRead가 같은 것을 돌려준다)와 루프 세션 사건(꼬리표 동봉)
export function pushMainState(state: { win: BrowserWindow | null }, v: MainChatView): void {
  pushTo(state, IPC_CHANNELS.LOOP_MAIN_STATE, v)
}
export function pushSessionEvent(state: { win: BrowserWindow | null }, p: LoopSessionEventPayload): void {
  pushTo(state, IPC_CHANNELS.LOOP_SESSION_EVENT, p)
}
