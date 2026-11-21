import { describe, expect, it } from 'vitest'
import type { AgentBackend, AgentRun } from '@main/03_Agent/AgentBackend'
import type { ReviewRequest, WorkRequest } from '@main/05_Loop/ports'
import { createReviewSessionPort } from '@main/05_Loop/reviewSession'
import type { GoalState } from '@main/05_Loop/runState'
import type { GateNode, WorkNode } from '@main/05_Loop/template'
import { createWorkSessionPort } from '@main/05_Loop/workSession'
import type { AgentEvent } from '@shared/agentEvents'

const NOW = Date.parse('2026-11-21T09:00:00Z')
const IN_AN_HOUR = Math.floor(NOW / 1000) + 3600
const GOAL = { id: 'G1', title: 'g' } as unknown as GoalState
const WORK: WorkNode = { kind: 'work', id: 'implement', title: '구현', role: 'worker', instruction: '구현한다', docs: [] }
const REVIEW: GateNode = { kind: 'gate', id: 'review', title: '검수', judge: 'model' }
const workReq: WorkRequest = { milestoneId: 'M1', node: WORK, goal: GOAL, docs: {} }
const reviewReq: ReviewRequest = { milestoneId: 'M1', node: REVIEW, goal: GOAL, goalDoc: '# G1', diff: 'diff', base: 'ms', baseSha: 'a'.repeat(40) }

type Step = AgentEvent | 'hang'
function backend(steps: Step[]): { backend: AgentBackend; aborts: () => number; consumed: () => number } {
  let aborts = 0
  let consumed = 0
  const b: AgentBackend = {
    id: 'claude-code',
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    listSupportedCommands: () => [],
    start(): AgentRun {
      let release: () => void = () => {}
      const aborted = new Promise<void>((r) => { release = r })
      return {
        events: (async function* () {
          for (const s of steps) {
            if (s === 'hang') { await aborted; return }
            await Promise.resolve()
            consumed++
            yield s
          }
        })(),
        abort() { aborts++; release() },
        interrupt() {},
        push() {},
        respond() {},
      }
    },
  }
  return { backend: b, aborts: () => aborts, consumed: () => consumed }
}

const port = (b: AgentBackend) => createWorkSessionPort({ backend: b, cwd: 'C:\\r', env: {}, appLoopDir: 'C:\\a', now: () => NOW, timeoutMs: 5_000 })
const review = (b: AgentBackend) => createReviewSessionPort({ backend: b, cwd: 'C:\\r', env: {}, appLoopDir: 'C:\\a', now: () => NOW, timeoutMs: 5_000 })
const rejected: AgentEvent = { type: 'rate_limit', status: 'rejected', rateLimitType: 'five_hour', resetsAt: IN_AN_HOUR }

describe('노드 세션의 한도 사건', () => {
  it('거부 사건을 받으면 그 세션을 바로 멈추고 취소(FAIL 아님)와 한도 보고를 돌려준다', async () => {
    const b = backend([{ type: 'text', delta: '일하는 중' }, rejected, 'hang', { type: 'done' }])
    const r = await port(b.backend).runWork(workReq)
    expect(r).toMatchObject({ ok: false, cancelled: true })
    expect(r.summary).toContain('사용량 한도')
    expect(r.limit?.windows).toEqual([{ window: 'five_hour', status: 'rejected', resetsAt: IN_AN_HOUR, utilization: null, overage: false }])
    expect(b.aborts()).toBe(1)
  })

  it('초과 사용 중이면 허용 상태여도 바로 멈춘다', async () => {
    const b = backend([{ type: 'rate_limit', status: 'allowed', rateLimitType: 'seven_day', resetsAt: IN_AN_HOUR, isUsingOverage: true }, 'hang'])
    expect(await port(b.backend).runWork(workReq)).toMatchObject({ ok: false, cancelled: true })
  })

  it('한도 오류가 오류·끝 표시보다 먼저 오면 오류가 아니라 한도 멈춤이다', async () => {
    const b = backend([{ type: 'rate_limit_error' }, { type: 'error', message: 'API Error: 429' }, { type: 'done' }])
    const r = await port(b.backend).runWork(workReq)
    expect(r).toMatchObject({ ok: false, cancelled: true, limit: { error: true } })
    expect(b.consumed()).toBe(1)
  })

  it('경고는 세션을 끝까지 돌리고 결과와 함께 보고한다 — 받는 때의 시계로 지난 시각을 거른다', async () => {
    const past = Math.floor(NOW / 1000) - 60
    const b = backend([{ type: 'rate_limit', status: 'allowed_warning', rateLimitType: 'seven_day', resetsAt: past, utilization: 0.9 }, { type: 'text', delta: '끝냈다' }, { type: 'done' }])
    const r = await port(b.backend).runWork(workReq)
    expect(r).toMatchObject({ ok: true, summary: '끝냈다' })
    expect(r.limit?.windows).toEqual([{ window: 'seven_day', status: 'allowed_warning', resetsAt: null, utilization: 0.9, overage: false }])
  })

  it('한도 사건이 없으면 보고도 없다', async () => {
    const r = await port(backend([{ type: 'done' }]).backend).runWork(workReq)
    expect(r.limit).toBeUndefined()
  })

  it('검수 세션도 같은 고리를 지난다 — 거부는 stop과 보고, 경고는 판정과 보고', async () => {
    const stopped = await review(backend([rejected, 'hang']).backend).review(reviewReq)
    expect(stopped.verdict).toBe('stop')
    expect(stopped.limit?.windows[0]?.status).toBe('rejected')
    const warned = await review(backend([
      { type: 'rate_limit', status: 'allowed_warning', rateLimitType: 'five_hour', resetsAt: IN_AN_HOUR },
      { type: 'text', delta: '근거\nVERDICT: pass' }, { type: 'done' },
    ]).backend).review(reviewReq)
    expect(warned.verdict).toBe('pass')
    expect(warned.limit?.windows[0]?.status).toBe('allowed_warning')
  })
})
