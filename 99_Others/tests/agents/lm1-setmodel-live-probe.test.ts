/**
 * lm1-setmodel-live-probe.test.ts — LM1 P05 라이브 setModel 실측 probe (opt-in: LIVE_SDK=1).
 *
 * 배경(반영 정본의 유일한 기계 검증):
 *   라이브 모델 전환(AgentRun.setModel — claudeAgentRun.ts:764)은 fire-and-forget이고,
 *   모델은 setPermissionMode의 permission_mode 같은 **역통지 이벤트가 없다**(2026-07-17
 *   영호 확정). 따라서 "전환이 실제로 엔진에 반영됐는가"의 유일한 기계 증거는 후속
 *   assistant SDKMessage의 원시 `message.model` 필드다(model-alias-sonnet5-live-probe의
 *   message.model 관측 선례를 held-open 다중 턴으로 확장).
 *
 * 두 관측(둘 다 단정은 "턴 성립·크래시 없음"까지 — 판정은 콘솔 로그로 영호 human-gate):
 *   ⓐ message.model 실측 — 턴1(model:'sonnet') → setModel('haiku') → 턴2. 두 턴의
 *      assistant message.model 원시 ID를 비교(전환 반영이 message.model 변화로 드러나는지).
 *   ⓑ effort 잔존 실측 — 세션 생성 시 effort:'xhigh'가 고정된 opus 세션에서(run-args.ts:54
 *      MODEL_EFFORT_SUPPORT: opus xhigh 지원) haiku(effort 미지원, supports:false)로
 *      라이브 전환 → 턴이 성립하는지 / 에러·경고가 오는지 / message.model이 무엇인지 거동을
 *      기록. SDK 라이브 effort API 부재 상태에서 세션 생성 시 고정된 effort가 어떻게
 *      처리되는지는 설계 문서에 없어 실측으로만 확정 가능(Phase 정본 (c)(d)).
 *
 * 하네스: 실 SDK query()를 tap으로 감싸 raw 메시지를 적재 + 스트리밍-입력 제어 메서드
 *   (setModel/interrupt)를 실 핸들로 forward한다(model-alias-sonnet5-live-probe 미러 +
 *   setModel forward 1건 추가 — 어댑터가 `_queryHandle.setModel`을 실 SDK로 위임하게 함).
 *   held-open persistent 세션(persistent:true + sessionKey)으로 다중 턴을 구동(lr3-p01
 *   probe.live 선례). 비용 최소화: 트리비얼 1단어 프롬프트 + 턴당 done까지만.
 *
 * ⚠ 실 토큰 소모 — 최소 턴(모델당 1턴). 종료 시 반드시 abort(held-open 세션 정리, 누수 방지).
 *
 * opt-in: LIVE_SDK=1 npx vitest run 99.Others/tests/agents/lm1-setmodel-live-probe.test.ts
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/queryFn'
import type { AgentRun } from '../../../02.Source/main/01_agents/AgentBackend'

const LIVE = process.env.LIVE_SDK === '1'

// 타입 다리 — setModel은 AgentRun optional 메서드(claudeAgentRun.ts 구현).
type RunWithSetModel = AgentRun & { setModel?: (modelId: string) => void }

/**
 * 실 SDK query()를 감싸 raw 메시지를 collected에 적재하는 tap QueryFn.
 *
 * model-alias-sonnet5-live-probe.makeTappingQueryFn의 확장:
 *   - held-open persistent 경로가 요구하는 스트리밍-입력 제어 메서드(setModel·interrupt)를
 *     실 핸들에서 그대로 forward한다 → 어댑터가 `_queryHandle.setModel(modelId)`을 호출하면
 *     실 SDK Query.setModel(sdk.d.ts:2270)이 발화한다(mock 주입이 아니라 진짜 위임 관측).
 */
async function makeTappingQueryFn(collected: unknown[]): Promise<QueryFn> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk = (await import('@anthropic-ai/claude-agent-sdk')) as any
  const realQuery = sdk.query as QueryFn
  return (params) => {
    const iterable = realQuery(params)
    async function* tap(): AsyncGenerator<unknown> {
      for await (const msg of iterable) {
        collected.push(msg)
        yield msg
      }
    }
    const wrapped = tap() as unknown as AsyncIterable<unknown> & Record<string, unknown>
    const rawHandle = iterable as unknown as Record<string, unknown>
    // 스트리밍-입력 제어 메서드를 실 핸들로 forward(존재하는 것만).
    for (const m of ['interrupt', 'setModel', 'setPermissionMode', 'stopTask']) {
      if (typeof rawHandle[m] === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        wrapped[m] = (...args: unknown[]): unknown => (rawHandle[m] as (...a: unknown[]) => unknown)(...args)
      }
    }
    return wrapped as unknown as ReturnType<QueryFn>
  }
}

const sleep = (ms: number) => new Promise<'TIMEOUT'>((r) => setTimeout(() => r('TIMEOUT'), ms))
const tick = (ms = 50): Promise<void> => new Promise((r) => setTimeout(r, ms))

interface TurnObs {
  text: string
  sawDone: boolean
  sawError: boolean
  errorMessages: string[]
  timedOut: boolean
  sessionId: string | null
}

/**
 * held-open run의 events를 이번 턴의 done/error까지 소비한다(다음 턴 대비 스트림은 유지).
 * 권한 요청은 즉시 allow(부수효과 도구 대비 — lr3-p01 probe 미러), 질문은 dismiss.
 * 하드 타임아웃: 이벤트가 안 와도 Promise.race로 탈출(행 방지).
 */
async function driveTurnToDone(run: AgentRun, timeoutMs = 120_000): Promise<TurnObs> {
  const obs: TurnObs = { text: '', sawDone: false, sawError: false, errorMessages: [], timedOut: false, sessionId: null }
  const it = (run.events as AsyncIterable<unknown>)[Symbol.asyncIterator]()
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) { obs.timedOut = true; break }
    const r = await Promise.race([it.next(), sleep(remaining)])
    if (r === 'TIMEOUT') { obs.timedOut = true; break }
    if (r.done) break
    const e = r.value as { type: string; [k: string]: unknown }
    if (e.type === 'permission_request') {
      run.respond(String(e.requestId), { kind: 'permission', behavior: 'allow' })
    } else if (e.type === 'question_request') {
      run.respond(String(e.requestId), { kind: 'question', answers: null })
    } else if (e.type === 'session') {
      obs.sessionId = String(e.sessionId)
    } else if (e.type === 'text') {
      obs.text += String(e.delta ?? '')
    } else if (e.type === 'error') {
      obs.sawError = true
      obs.errorMessages.push(String(e.message ?? JSON.stringify(e)))
    } else if (e.type === 'done') {
      obs.sawDone = true
      break
    }
  }
  return obs
}

/** collected[from..to)에서 assistant message.model 원시 ID를 집합으로 추출. */
function modelsInRange(collected: unknown[], from: number, to: number): string[] {
  const seen = new Set<string>()
  for (let i = from; i < to; i++) {
    const obj = (collected[i] ?? {}) as Record<string, unknown>
    const message = obj['message']
    if (message && typeof message === 'object') {
      const m = (message as Record<string, unknown>)['model']
      if (typeof m === 'string' && m) seen.add(m)
    }
  }
  return [...seen]
}

/** collected[from..to)에서 result 메시지의 subtype·is_error를 요약(effort 거동 관측용). */
function resultSummary(collected: unknown[], from: number, to: number): string {
  const rows: string[] = []
  for (let i = from; i < to; i++) {
    const obj = (collected[i] ?? {}) as Record<string, unknown>
    if (obj['type'] === 'result') {
      rows.push(`subtype=${String(obj['subtype'])} is_error=${String(obj['is_error'])}`)
    }
  }
  return rows.length ? rows.join(' | ') : '(result 메시지 없음)'
}

describe.skipIf(!LIVE)('LM1 P05 라이브 setModel 실측 probe — LIVE_SDK=1', () => {
  // ⓐ message.model 전환 반영 실측 (반영 정본 검증)
  it("ⓐ sonnet → setModel('haiku') → 두 턴 message.model 원시 ID 비교", async () => {
    const collected: unknown[] = []
    const queryFn = await makeTappingQueryFn(collected)
    const backend = new ClaudeCodeBackend(queryFn)
    const ws = mkdtempSync(join(tmpdir(), 'lm1-setmodel-a-'))
    let run: RunWithSetModel | null = null
    try {
      run = backend.start({
        messages: [{ role: 'user', content: 'Reply with exactly one word: OK' }],
        workspaceRoot: ws,
        persistent: true,
        sessionKey: 'lm1p05-a',
        model: 'sonnet',
      }) as RunWithSetModel

      // ── 턴1 (sonnet) ──────────────────────────────────────────────────
      const t1From = 0
      const obs1 = await driveTurnToDone(run)
      const t1To = collected.length
      const turn1Models = modelsInRange(collected, t1From, t1To)

      // ── 라이브 전환 + 턴2 (haiku) ──────────────────────────────────────
      expect(typeof run.setModel).toBe('function')
      run.setModel?.('haiku')
      await tick() // 위임 프로미스 정착 여유(fire-and-forget)
      run.push('Reply with exactly one word: DONE')
      const obs2 = await driveTurnToDone(run)
      const t2To = collected.length
      const turn2Models = modelsInRange(collected, t1To, t2To)

      // eslint-disable-next-line no-console
      console.log('[lm1p05-ⓐ] 턴1(sonnet) message.model:', JSON.stringify(turn1Models), 'done=', obs1.sawDone, 'timedOut=', obs1.timedOut)
      // eslint-disable-next-line no-console
      console.log('[lm1p05-ⓐ] 턴2(haiku) message.model:', JSON.stringify(turn2Models), 'done=', obs2.sawDone, 'timedOut=', obs2.timedOut)
      // eslint-disable-next-line no-console
      console.log('[lm1p05-ⓐ] 전환 반영 여부(교집합 비어야 반영):', JSON.stringify({ turn1Models, turn2Models }))
      // eslint-disable-next-line no-console
      console.log('[lm1p05-ⓐ] raw 메시지 개수:', collected.length, 'turn1 text=', JSON.stringify(obs1.text.slice(0, 40)), 'turn2 text=', JSON.stringify(obs2.text.slice(0, 40)))

      // 관측 probe — 단정은 "두 턴 모두 성립(done)·크래시 없음"까지. 반영 판정은 로그로.
      expect(obs1.sawDone || obs1.text.length > 0).toBe(true)
      expect(obs2.sawDone || obs2.text.length > 0).toBe(true)
    } finally {
      run?.abort()
      await tick(2000) // 프로세스 종료 대기(Windows 파일락)
      try { rmSync(ws, { recursive: true, force: true }) } catch { /* EPERM 잔존 락 허용 */ }
    }
  }, 300_000)

  // ⓑ effort 잔존 실측 (opus+xhigh → haiku 라이브 전환) — 영호 human-gate 자료
  it("ⓑ opus(effort:'xhigh') 세션 → setModel('haiku') → 잔존 effort 거동 기록", async () => {
    const collected: unknown[] = []
    const queryFn = await makeTappingQueryFn(collected)
    const backend = new ClaudeCodeBackend(queryFn)
    const ws = mkdtempSync(join(tmpdir(), 'lm1-setmodel-b-'))
    let run: RunWithSetModel | null = null
    try {
      // 세션 생성 시 effort:'xhigh' 고정(opus는 xhigh 지원 — run-args.ts:54).
      // 이후 haiku(effort 미지원)로 라이브 전환 시, 세션에 박힌 effort 옵션이
      // 어떻게 처리되는지 관측(SDK 라이브 effort API 부재).
      run = backend.start({
        messages: [{ role: 'user', content: 'Reply with exactly one word: OK' }],
        workspaceRoot: ws,
        persistent: true,
        sessionKey: 'lm1p05-b',
        model: 'opus',
        effort: 'xhigh',
      }) as RunWithSetModel

      // ── 턴1 (opus + xhigh) ─────────────────────────────────────────────
      const obs1 = await driveTurnToDone(run)
      const t1To = collected.length
      const turn1Models = modelsInRange(collected, 0, t1To)

      // ── 라이브 전환 haiku(effort 미지원) + 턴2 ──────────────────────────
      run.setModel?.('haiku')
      await tick()
      run.push('Reply with exactly one word: DONE')
      const obs2 = await driveTurnToDone(run)
      const t2To = collected.length
      const turn2Models = modelsInRange(collected, t1To, t2To)

      // eslint-disable-next-line no-console
      console.log('[lm1p05-ⓑ] 턴1(opus+xhigh) message.model:', JSON.stringify(turn1Models), 'result:', resultSummary(collected, 0, t1To))
      // eslint-disable-next-line no-console
      console.log('[lm1p05-ⓑ] 턴2(haiku, effort 잔존) message.model:', JSON.stringify(turn2Models), 'result:', resultSummary(collected, t1To, t2To))
      // eslint-disable-next-line no-console
      console.log('[lm1p05-ⓑ] 턴2 성립:', JSON.stringify({ sawDone: obs2.sawDone, sawError: obs2.sawError, timedOut: obs2.timedOut, textLen: obs2.text.length }))
      // eslint-disable-next-line no-console
      console.log('[lm1p05-ⓑ] 턴2 error 메시지:', JSON.stringify(obs2.errorMessages), '| 턴1 error:', JSON.stringify(obs1.errorMessages))

      // 단정은 "턴 성립·크래시 없음"까지만(Phase 정본 ⓑ — 판단은 영호 몫).
      // 턴2가 done 또는 텍스트로 귀결되면 성립. 에러가 오더라도 크래시(예외 throw)만 아니면 OK.
      expect(obs2.sawDone || obs2.sawError || obs2.text.length > 0).toBe(true)
    } finally {
      run?.abort()
      await tick(2000)
      try { rmSync(ws, { recursive: true, force: true }) } catch { /* EPERM 잔존 락 허용 */ }
    }
  }, 300_000)
})
