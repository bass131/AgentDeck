/**
 * lr3-p01-probe.live.test.ts — LR3 P01 실측 probe (c)(d) (opt-in: LIVE_SDK=1).
 *
 * (c) 자연어 루프 요청 시 SDK 도구 선택 빈도 — 가이드 없는 대조군(P05 개선 비교 기준).
 *     held-open 세션에 자연어 반복 요청 3종 → tool_call 이벤트로 CronCreate/
 *     ScheduleWakeup/무발동 기록.
 * (d) idle-close 후 resume 무결성 + 턴 기동 오버헤드 — P02 AUTO 세션 수명 설계 입력.
 *     persistent 턴에서 코드워드 심기 → 세션 종료(닫힘 시뮬) → 새 persistent 세션이
 *     resumeSessionId로 회상하는지 + persistent vs 단발 기동 지연 비교.
 *
 * CRITICAL: probe 종료 시 반드시 abort(크론 정리 — 토큰 누수 방지, P01 함정).
 * 판정·로그는 01.Phases/LR3-loop-ux/_probe-findings.md에 박제.
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { AgentRun } from '../../../02.Source/main/01_agents/AgentBackend'

const LIVE = process.env.LIVE_SDK === '1'

interface RunObservation {
  toolCalls: string[]
  loopsEvents: number
  sessionId: string | null
  firstEventMs: number | null
  finalText: string
  timedOut: boolean
}

const sleep = (ms: number) => new Promise<'TIMEOUT'>((r) => setTimeout(() => r('TIMEOUT'), ms))

/**
 * run 이벤트를 done까지 소비하며 관측 수집.
 * 하드 타임아웃: 이벤트가 아예 안 와도(권한 대기·턴 내부 무한 반복) Promise.race로 탈출 —
 * 1차 실행에서 for-await 데드라인 체크가 이벤트 도착 시에만 평가돼 600s 행 걸린 교훈.
 * 권한 자동 승인: default 모드에서 부수효과 도구는 permission_request로 응답을 기다린다 —
 * 하네스가 respond(allow)로 즉시 승인(앱에서 사용자가 승인 버튼을 누르는 것과 동일 경로,
 * 2차 실행 교훈: 응답자 없으면 행).
 */
async function observeTurn(run: AgentRun, startedAt: number, timeoutMs = 120_000, tag = ''): Promise<RunObservation> {
  const obs: RunObservation = {
    toolCalls: [], loopsEvents: 0, sessionId: null, firstEventMs: null, finalText: '', timedOut: false,
  }
  const it = (run.events as AsyncIterable<unknown>)[Symbol.asyncIterator]()
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) { obs.timedOut = true; break }
    const r = await Promise.race([it.next(), sleep(remaining)])
    if (r === 'TIMEOUT') { obs.timedOut = true; break }
    if (r.done) break
    if (obs.firstEventMs === null) obs.firstEventMs = Date.now() - startedAt
    const e = r.value as { type: string; [k: string]: unknown }
    if (e.type === 'tool_call') {
      obs.toolCalls.push(String(e.name))
      console.log(`[P01${tag}] tool_call: ${String(e.name)}`) // 즉시 로깅 — 타임아웃에도 부분 데이터 생존
    }
    if (e.type === 'permission_request') {
      console.log(`[P01${tag}] permission_request → 승인: ${JSON.stringify(e).slice(0, 140)}`)
      run.respond(String(e.requestId), { kind: 'permission', behavior: 'allow' })
    }
    if (e.type === 'question_request') {
      console.log(`[P01${tag}] question_request → dismiss: ${JSON.stringify(e).slice(0, 140)}`)
      run.respond(String(e.requestId), { kind: 'question', answers: null })
    }
    if (e.type === 'loops') obs.loopsEvents++
    if (e.type === 'session') obs.sessionId = String(e.sessionId)
    if (e.type === 'text') obs.finalText += String(e.delta ?? '')
    if (e.type === 'done' || e.type === 'error') break
  }
  return obs
}

describe.skipIf(!LIVE)('LR3 P01 probe (c)(d) — LIVE_SDK=1', () => {
  it('(c) 자연어 루프 요청 3종 — 도구 선택 빈도 (가이드 없는 대조군)', async () => {
    const backend = new ClaudeCodeBackend()
    const prompts = [
      'Every minute, check the current time and report it. Keep doing this repeatedly until I say stop.',
      'Keep watching this workspace repeatedly at your own pace and report anything notable each time.',
      "이 작업을 주기적으로 반복해줘: 'PING'이라고만 답하기. 내가 멈추라고 할 때까지.",
    ]
    for (let i = 0; i < prompts.length; i++) {
      const ws = mkdtempSync(join(tmpdir(), `lr3p01c${i}-`))
      const run = await backend.start({
        messages: [{ role: 'user', content: prompts[i] }],
        workspaceRoot: ws,
        persistent: true,
        sessionKey: `p01c-${i}`,
      })
      const obs = await observeTurn(run, Date.now(), 120_000, `-c#${i + 1}`)
      const loopTools = obs.toolCalls.filter((n) => /cron|schedule|wakeup/i.test(n))
      console.log(
        `[P01-c] #${i + 1} timedOut=${obs.timedOut} tools=${JSON.stringify(obs.toolCalls)} loopTools=${JSON.stringify(loopTools)} loopsEvents=${obs.loopsEvents} text=${JSON.stringify(obs.finalText.slice(0, 80))}`
      )
      // 정리: 세션 abort — 크론/웨이크업 잔존 차단 (P01 함정)
      await Promise.resolve(run.abort())
      await new Promise((r) => setTimeout(r, 2000)) // 프로세스 종료 대기(Windows 파일락)
      try {
        rmSync(ws, { recursive: true, force: true })
      } catch {
        /* EPERM 잔존 락 — temp 누수 허용(2차 실행 교훈) */
      }
    }
    expect(true).toBe(true) // 관측 probe — 판정은 findings 문서에서
  }, 600_000)

  it('(d) persistent 기동 오버헤드 + 세션종료 후 resume 무결성', async () => {
    const backend = new ClaudeCodeBackend()
    const ws = mkdtempSync(join(tmpdir(), 'lr3p01d-'))
    try {
      // ── 턴1: persistent 세션에 코드워드 심기 + 기동 지연 측정 ────────────
      const t1 = Date.now()
      const run1 = await backend.start({
        messages: [{ role: 'user', content: 'Remember the codeword MANGO42LR3. Reply with exactly OK.' }],
        workspaceRoot: ws,
        persistent: true,
        sessionKey: 'p01d-k1',
      })
      const obs1 = await observeTurn(run1, t1)
      console.log(`[P01-d] persistent 턴1: firstEvent=${obs1.firstEventMs}ms sessionId=${obs1.sessionId?.slice(0, 8)}`)
      expect(obs1.sessionId).toBeTruthy()
      // 세션 종료 = AUTO idle-close의 외부 시뮬레이션(스트림 종료→정리 경로)
      await Promise.resolve(run1.abort())

      // ── 턴2: "닫힌 뒤 후속 턴" — 새 persistent 세션 + resume → 회상 ──────
      const t2 = Date.now()
      const run2 = await backend.start({
        messages: [
          { role: 'user', content: 'Remember the codeword MANGO42LR3. Reply with exactly OK.' },
          { role: 'assistant', content: 'OK' },
          { role: 'user', content: 'What was the codeword? Reply with the codeword only.' },
        ],
        workspaceRoot: ws,
        persistent: true,
        sessionKey: 'p01d-k1',
        resumeSessionId: obs1.sessionId ?? undefined,
      })
      const obs2 = await observeTurn(run2, t2)
      console.log(
        `[P01-d] persistent 턴2(재수립+resume): firstEvent=${obs2.firstEventMs}ms text=${JSON.stringify(obs2.finalText.slice(0, 60))}`
      )
      await Promise.resolve(run2.abort())
      expect(obs2.finalText).toContain('MANGO42LR3')

      // ── 비교군: 단발(one-shot) 턴 기동 지연 ─────────────────────────────
      const t3 = Date.now()
      const run3 = await backend.start({
        messages: [{ role: 'user', content: 'Reply with exactly OK.' }],
        workspaceRoot: ws,
        resumeSessionId: obs1.sessionId ?? undefined,
      })
      const obs3 = await observeTurn(run3, t3)
      console.log(`[P01-d] 단발 턴(비교군): firstEvent=${obs3.firstEventMs}ms`)
      await Promise.resolve(run3.abort())

      console.log(
        `[P01-d] 오버헤드 요약: persistent 신규=${obs1.firstEventMs}ms · persistent 재수립+resume=${obs2.firstEventMs}ms · 단발+resume=${obs3.firstEventMs}ms`
      )
    } finally {
      rmSync(ws, { recursive: true, force: true })
    }
  }, 600_000)
})
