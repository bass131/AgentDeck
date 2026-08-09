import { describe, it, expect, beforeEach } from 'vitest'
import { SendTokenLedger, isTurnAnchoringMessage } from '../../../02_Project/00_Source/main/01_agents/sendTokenLedger'

const sessionState = (state: string): unknown => ({
  type: 'system',
  subtype: 'session_state_changed',
  state,
})
const systemSub = (subtype: string): unknown => ({ type: 'system', subtype })
const assistantMsg: unknown = { type: 'assistant', message: { content: [] } }
const resultMsg: unknown = { type: 'result', subtype: 'success' }

describe('isTurnAnchoringMessage — 턴 귀속 메시지만 epoch를 시작할 자격이 있다', () => {
  it('system이 아닌 모든 메시지는 앵커 자격이 있다', () => {
    expect(isTurnAnchoringMessage(assistantMsg)).toBe(true)
    expect(isTurnAnchoringMessage(resultMsg)).toBe(true)
    expect(isTurnAnchoringMessage({ type: 'user' })).toBe(true)
    expect(isTurnAnchoringMessage({ type: 'stream_event' })).toBe(true)
  })

  it('비객체·null도 앵커 자격이 있다(보수적 기본값 — origin 판정 소실 방지)', () => {
    expect(isTurnAnchoringMessage(null)).toBe(true)
    expect(isTurnAnchoringMessage(undefined)).toBe(true)
    expect(isTurnAnchoringMessage('not-an-object')).toBe(true)
  })

  it("session_state_changed는 state:'idle'만 자격 박탈(늦은 idle 선점 봉합)", () => {
    expect(isTurnAnchoringMessage(sessionState('idle'))).toBe(false)
    expect(isTurnAnchoringMessage(sessionState('running'))).toBe(true)
    expect(isTurnAnchoringMessage(sessionState('requires_action'))).toBe(true)
  })

  it('task_* 생명주기 4종은 턴과 독립 수명이라 자격 없음', () => {
    expect(isTurnAnchoringMessage(systemSub('task_started'))).toBe(false)
    expect(isTurnAnchoringMessage(systemSub('task_progress'))).toBe(false)
    expect(isTurnAnchoringMessage(systemSub('task_updated'))).toBe(false)
    expect(isTurnAnchoringMessage(systemSub('task_notification'))).toBe(false)
  })

  it('나머지 system 메시지(init·api_retry 등)는 자격 유지', () => {
    expect(isTurnAnchoringMessage(systemSub('init'))).toBe(true)
    expect(isTurnAnchoringMessage(systemSub('api_retry'))).toBe(true)
    expect(isTurnAnchoringMessage({ type: 'system' })).toBe(true)
  })
})

describe('SendTokenLedger — 토큰 수명 전이', () => {
  let ledger: SendTokenLedger

  beforeEach(() => {
    ledger = new SendTokenLedger()
  })

  it('초기 상태는 미완료 토큰 0 · 무토큰 epoch(자율)', () => {
    expect(ledger.outstandingCount()).toBe(0)
    expect(ledger.hasOwnedToken()).toBe(false)
    expect(ledger.queuedSeqs).toEqual([])
  })

  it('issue()는 단조증가 seq를 발급하고 queued FIFO에 적재한다', () => {
    expect(ledger.issue()).toBe(0)
    expect(ledger.issue()).toBe(1)
    expect(ledger.queuedSeqs).toEqual([0, 1])
    expect(ledger.outstandingCount()).toBe(2)
  })

  it('deliverNext()는 queued→delivered 전이 — 총 미완료 수는 그대로(상태만 이동)', () => {
    ledger.issue()
    expect(ledger.deliverNext()).toBe(true)
    expect(ledger.queuedSeqs).toEqual([])
    expect(ledger.outstandingCount()).toBe(1)
    expect(ledger.hasOwnedToken()).toBe(false)
  })

  it('deliverNext()는 FIFO 순서를 지킨다', () => {
    ledger.issue()
    ledger.issue()
    ledger.deliverNext()
    expect(ledger.queuedSeqs).toEqual([1])
  })

  it('빈 FIFO에서의 deliverNext()는 false(desync 신호) + delivered를 null로 폴백', () => {
    expect(ledger.deliverNext()).toBe(false)
    expect(ledger.outstandingCount()).toBe(0)
    ledger.issue()
    ledger.deliverNext()
    expect(ledger.outstandingCount()).toBe(1)
    expect(ledger.deliverNext()).toBe(false)
    expect(ledger.outstandingCount()).toBe(0)
  })

  it('ANCHOR는 delivered→owned 승격 — 그때부터 이 epoch은 user origin', () => {
    ledger.issue()
    ledger.deliverNext()
    ledger.anchorIfEligible(assistantMsg)
    expect(ledger.hasOwnedToken()).toBe(true)
    expect(ledger.outstandingCount()).toBe(1)
  })

  it('턴 비귀속 메시지는 ANCHOR를 발화시키지 않는다(늦은 idle·task_* 선점 봉합)', () => {
    ledger.issue()
    ledger.deliverNext()
    ledger.anchorIfEligible(sessionState('idle'))
    ledger.anchorIfEligible(systemSub('task_started'))
    expect(ledger.hasOwnedToken()).toBe(false)
    ledger.anchorIfEligible(resultMsg)
    expect(ledger.hasOwnedToken()).toBe(true)
  })

  it('ANCHOR는 epoch당 1회 멱등 — 이미 앵커된 epoch은 뒤늦은 delivered를 흡수하지 않는다', () => {
    ledger.anchorIfEligible(assistantMsg)
    expect(ledger.hasOwnedToken()).toBe(false)
    ledger.issue()
    ledger.deliverNext()
    ledger.anchorIfEligible(assistantMsg)
    expect(ledger.hasOwnedToken()).toBe(false)
    expect(ledger.outstandingCount()).toBe(1)
  })

  it('completeTurn()은 owned만 완료하고 다음 epoch의 ANCHOR를 재무장한다', () => {
    ledger.issue()
    ledger.deliverNext()
    ledger.anchorIfEligible(assistantMsg)
    ledger.completeTurn()
    expect(ledger.outstandingCount()).toBe(0)
    expect(ledger.hasOwnedToken()).toBe(false)
    ledger.issue()
    ledger.deliverNext()
    ledger.anchorIfEligible(assistantMsg)
    expect(ledger.hasOwnedToken()).toBe(true)
  })

  it('무토큰(자율) epoch의 completeTurn()은 남의 token을 훔치지 않는다 — P11 반증 봉합', () => {
    ledger.anchorIfEligible(assistantMsg)
    ledger.issue()
    ledger.completeTurn()
    expect(ledger.outstandingCount()).toBe(1)
    expect(ledger.hasOwnedToken()).toBe(false)
  })

  it('outstandingCount()는 queued+delivered+owned 총합이다', () => {
    ledger.issue()
    ledger.issue()
    ledger.deliverNext()
    ledger.anchorIfEligible(assistantMsg)
    ledger.issue()
    ledger.deliverNext()
    expect(ledger.outstandingCount()).toBe(3)
  })

  it('queuedSeqs는 라이브 뷰다 — 1:1 불변식 검사·desync 주입 seam(gap1-p12 §4 C-2)', () => {
    ledger.issue()
    expect(ledger.queuedSeqs.length).toBe(1)
    ledger.queuedSeqs.length = 0
    expect(ledger.outstandingCount()).toBe(0)
    expect(ledger.deliverNext()).toBe(false)
  })
})
