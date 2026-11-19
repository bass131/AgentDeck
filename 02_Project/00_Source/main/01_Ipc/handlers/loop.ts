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
import { handle } from '../handle'

// 핸들러가 부르는 구동자의 면. loopDriver.createLoopDriver가 이것을 채운다.
export interface LoopDriverApi {
  open(req: LoopOpenRequest): Promise<LoopStatus>
  start(cwd: string, milestoneId: string): Promise<LoopStatus>
  status(cwd: string): LoopStatus
  decide(req: LoopDecideRequest): Promise<LoopDecideResponse>
  answerCard(cwd: string, requestId: string, response: LoopCardResponse): boolean
  cancelSession(cwd: string): boolean
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

  handle(IPC_CHANNELS.LOOP_CANCEL_SESSION, async (_e, req) => ({ ok: driver.cancelSession(cwdOf(obj(req, 'loop.cancelSession'), 'loop.cancelSession')) }))

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
}

// 구동자의 상태 변화 → 창. 창이 없거나 닫혔으면 보내지 않는다(다음 status 호출이 같은 한 장을 돌려준다).
export function pushLoopState(state: { win: BrowserWindow | null }, s: LoopStatus): void {
  const win = state.win
  if (!win || win.isDestroyed()) return
  sendPush(win.webContents, IPC_CHANNELS.LOOP_STATE, s)
}
