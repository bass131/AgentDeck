/**
 * opus5-models-probe.test.ts — 임시 실측 프로브 2탄 (LIVE_SDK=1). 재구축 후 삭제 예정.
 *
 * 측정 대상:
 *  1) SDK가 제공하는 ModelInfo[] 전체 (supportedModels() + system init의 models 배열)
 *     → Opus 5 존재 여부 / resolvedModel / supportedEffortLevels / displayName
 *  2) full 모델 ID('claude-opus-5')를 options.model에 직접 전달 → 통과 여부
 *     (AgentDeck의 KNOWN_MODELS allowlist를 우회해 SDK 자체 수용 범위를 잰다)
 *  3) 'claude-opus-5' + effort:'max' → 통과 여부
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const LIVE = process.env.LIVE_SDK === '1'
const OUT = join(tmpdir(), 'opus5-models-probe.log')

function record(line: string): void {
  appendFileSync(OUT, line + '\n', 'utf8')
  // eslint-disable-next-line no-console
  console.log(line)
}

const sleep = (ms: number) => new Promise<'TIMEOUT'>((r) => setTimeout(() => r('TIMEOUT'), ms))

/**
 * SDK query()를 직접 호출한다(ClaudeCodeBackend·allowlist 우회 — SDK 자체 수용 범위 측정).
 * 반환: 관측된 message.model 집합 · init 메시지의 models 배열 · 에러 텍스트.
 */
async function rawProbe(
  label: string,
  options: Record<string, unknown>,
  opts: { dumpModels?: boolean } = {}
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk = (await import('@anthropic-ai/claude-agent-sdk')) as any
  const ws = mkdtempSync(join(tmpdir(), 'models-probe-'))
  record(`=== ${label} :: options=${JSON.stringify(options)}`)
  const ac = new AbortController()
  try {
    const handle = sdk.query({
      prompt: 'Reply with exactly one word: OK',
      options: { cwd: ws, abortController: ac, ...options },
    })

    const modelsSeen = new Set<string>()
    let initModels: unknown = null
    const drainPromise = (async () => {
      for await (const msg of handle as AsyncIterable<unknown>) {
        const obj = (msg ?? {}) as Record<string, unknown>
        const message = obj['message']
        if (message && typeof message === 'object') {
          const m = (message as Record<string, unknown>)['model']
          if (typeof m === 'string' && m) modelsSeen.add(m)
        }
        if (obj['type'] === 'system' && obj['subtype'] === 'init') {
          if (Array.isArray(obj['models'])) initModels = obj['models']
          if (typeof obj['model'] === 'string') modelsSeen.add(obj['model'] as string)
        }
        if (obj['type'] === 'result') break
      }
    })()

    const raced = await Promise.race([drainPromise, sleep(120_000)])
    if (raced === 'TIMEOUT') record('  [TIMEOUT]')

    record(`  [models seen] ${JSON.stringify([...modelsSeen])}`)

    if (opts.dumpModels) {
      // supportedModels() 핸들 메서드 — sdk.d.ts:2350
      let viaMethod: unknown = null
      try {
        const raw = handle as unknown as Record<string, unknown>
        if (typeof raw['supportedModels'] === 'function') {
          viaMethod = await (raw['supportedModels'] as () => Promise<unknown>)()
        } else {
          record('  [supportedModels] 메서드 없음')
        }
      } catch (e) {
        record(`  [supportedModels THROW] ${String(e).slice(0, 300)}`)
      }
      const chosen = viaMethod ?? initModels
      record(`  [ModelInfo 출처] ${viaMethod ? 'supportedModels()' : initModels ? 'init.models' : '없음'}`)
      if (Array.isArray(chosen)) {
        record(`  [ModelInfo 개수] ${chosen.length}`)
        for (const row of chosen) record('  ROW ' + JSON.stringify(row))
      }
    }
  } catch (err) {
    record(`  [THROW] ${String(err).slice(0, 800)}`)
  } finally {
    ac.abort()
    rmSync(ws, { recursive: true, force: true })
    record('')
  }
}

describe.skipIf(!LIVE)('SDK ModelInfo 실측 — LIVE_SDK=1', () => {
  it('supportedModels() / init.models 전체 덤프', async () => {
    record('##### ModelInfo 덤프 #####')
    await rawProbe('modelinfo-dump', {}, { dumpModels: true })
    expect(true).toBe(true)
  }, 300_000)

  it('full 모델 ID 직접 전달 수용 여부', async () => {
    record('##### full ID 수용 #####')
    await rawProbe('claude-opus-5', { model: 'claude-opus-5' })
    await rawProbe('claude-opus-5 + max', { model: 'claude-opus-5', effort: 'max' })
    expect(true).toBe(true)
  }, 300_000)
})
