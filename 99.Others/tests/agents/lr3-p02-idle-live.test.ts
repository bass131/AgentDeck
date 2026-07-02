/**
 * lr3-p02-idle-live.test.ts — LR3 P02 라이브 probe 2종 (opt-in: LIVE_SDK=1 + P02L=1).
 *
 * 수용신호(Phase 02 완료조건 — plan-auditor 재검증 🟡 반영, P01-(d) 관측법 인용):
 *  (i)  일반 대화: done 후 세션이 "스스로"(abort 없이) 자연 종료(idle-close) +
 *       후속 턴이 이전 session_id를 resume으로 재사용해 맥락 회상.
 *  (ii) 루프 활동(wakeup armed): done 후에도 세션 유지(스트림 미종료) → abort 정리.
 *
 * CRITICAL: probe 종료 시 abort(웨이크업/크론 잔존 차단 — 토큰 누수 방지).
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { AgentRun } from '../../../02.Source/main/01_agents/AgentBackend'

const LIVE = process.env.LIVE_SDK === '1' && process.env.P02L === '1'
const sleep = (ms: number) => new Promise<'TIMEOUT'>((r) => setTimeout(() => r('TIMEOUT'), ms))

interface TurnObs {
  sessionId: string | null
  finalText: string
  sawDone: boolean
  /** done 이후 스트림 자연종료까지 걸린 ms (windowMs 내 미종료면 null) */
  closedAfterDoneMs: number | null
}

/** done까지 소비 후, windowMs 동안 스트림 자연종료 여부를 관측(abort 안 함). */
async function observeTurnAndClose(run: AgentRun, windowMs: number, tag: string): Promise<TurnObs> {
  const obs: TurnObs = { sessionId: null, finalText: '', sawDone: false, closedAfterDoneMs: null }
  const it = (run.events as AsyncIterable<unknown>)[Symbol.asyncIterator]()
  const hardDeadline = Date.now() + 180_000
  // 1) done까지 소비 (권한 요청은 승인 응답)
  for (;;) {
    const remaining = hardDeadline - Date.now()
    if (remaining <= 0) return obs
    const r = await Promise.race([it.next(), sleep(remaining)])
    if (r === 'TIMEOUT' || r.done) return obs
    const e = r.value as { type: string; requestId?: string; [k: string]: unknown }
    if (e.type === 'session') obs.sessionId = String(e.sessionId)
    if (e.type === 'text') obs.finalText += String(e.delta ?? '')
    if (e.type === 'permission_request') {
      run.respond(String(e.requestId), { kind: 'permission', behavior: 'allow' })
    }
    if (e.type === 'error') return obs
    if (e.type === 'done') { obs.sawDone = true; break }
  }
  // 2) done 후 windowMs 내 자연종료 관측 (abort 없이)
  const doneAt = Date.now()
  const windowEnd = doneAt + windowMs
  for (;;) {
    const remaining = windowEnd - Date.now()
    if (remaining <= 0) break // 창 내 미종료 → closedAfterDoneMs = null(세션 유지)
    const r = await Promise.race([it.next(), sleep(remaining)])
    if (r === 'TIMEOUT') break
    if (r.done) { obs.closedAfterDoneMs = Date.now() - doneAt; break }
    // done 후 잔여 이벤트(loops 정리 등)는 소비만
    console.log(`[${tag}] done 후 이벤트: ${(r.value as { type: string }).type}`)
  }
  return obs
}

describe.skipIf(!LIVE)('LR3 P02 라이브 — idle-close·유지·resume (LIVE_SDK=1 P02L=1)', () => {
  it('(i) 무활동 done → 자연종료(idle-close) + 후속 턴 resume 회상', async () => {
    const backend = new ClaudeCodeBackend()
    const ws = mkdtempSync(join(tmpdir(), 'lr3p02i-'))
    try {
      const run1 = await backend.start({
        messages: [{ role: 'user', content: 'Remember the codeword ORBIT77P02. Reply with exactly OK.' }],
        workspaceRoot: ws,
        persistent: true,
        sessionKey: 'p02L-i',
      })
      const t1 = await observeTurnAndClose(run1, 15_000, 'P02-i/턴1')
      console.log(`[P02-i] 턴1 sawDone=${t1.sawDone} sessionId=${t1.sessionId?.slice(0, 8)} 자연종료=${t1.closedAfterDoneMs}ms`)
      expect(t1.sawDone).toBe(true)
      // 수용신호 1: abort 없이 done 후 스스로 닫힘(idle-close)
      expect(t1.closedAfterDoneMs).not.toBeNull()

      const run2 = await backend.start({
        messages: [
          { role: 'user', content: 'Remember the codeword ORBIT77P02. Reply with exactly OK.' },
          { role: 'assistant', content: 'OK' },
          { role: 'user', content: 'What was the codeword? Reply with the codeword only.' },
        ],
        workspaceRoot: ws,
        persistent: true,
        sessionKey: 'p02L-i',
        resumeSessionId: t1.sessionId ?? undefined,
      })
      const t2 = await observeTurnAndClose(run2, 15_000, 'P02-i/턴2')
      console.log(`[P02-i] 턴2 text=${JSON.stringify(t2.finalText.slice(0, 60))} 자연종료=${t2.closedAfterDoneMs}ms`)
      // 수용신호 2: 이전 session_id resume 재사용으로 맥락 회상
      expect(t2.finalText).toContain('ORBIT77P02')
      expect(t2.closedAfterDoneMs).not.toBeNull()
    } finally {
      await new Promise((r) => setTimeout(r, 2000))
      try { rmSync(ws, { recursive: true, force: true }) } catch { /* 파일락 허용 */ }
    }
  }, 300_000)

  it('(ii) 루프 활동(wakeup armed) done → 세션 유지 → abort 정리', async () => {
    const backend = new ClaudeCodeBackend()
    const ws = mkdtempSync(join(tmpdir(), 'lr3p02ii-'))
    const run = await backend.start({
      messages: [{ role: 'user', content: "이 작업을 주기적으로 반복해줘: 'PING'이라고만 답하기. 내가 멈추라고 할 때까지." }],
      workspaceRoot: ws,
      persistent: true,
      sessionKey: 'p02L-ii',
    })
    try {
      const t = await observeTurnAndClose(run, 12_000, 'P02-ii')
      console.log(`[P02-ii] sawDone=${t.sawDone} 자연종료=${t.closedAfterDoneMs}ms (null=유지)`)
      expect(t.sawDone).toBe(true)
      // 수용신호: 활동(armed wakeup) 있으면 done 후에도 세션 유지(창 내 미종료)
      expect(t.closedAfterDoneMs).toBeNull()
    } finally {
      await Promise.resolve(run.abort()) // 웨이크업 정리(토큰 누수 방지)
      await new Promise((r) => setTimeout(r, 2000))
      try { rmSync(ws, { recursive: true, force: true }) } catch { /* 파일락 허용 */ }
    }
  }, 300_000)
})
