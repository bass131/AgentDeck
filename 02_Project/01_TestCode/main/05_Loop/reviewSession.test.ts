// M09 G4 검수 세션 포트 — 구현 문맥 없는 새 세션 하나가 goal 문서와 실행기가 만든 diff만 보고 판정한다.
// 고정하는 것: 실행 입력(새 세션, 자동 모드, 자격 없는 환경, 읽기 전용 루프 잠금), 프롬프트(검수 지시 + goal 문서 + diff + 형식 계약,
// 마일스톤 id·goal 제목 없음), 판정은 마지막 줄 `VERDICT: pass|fail`만 센다(그 밖은 fail), 시간 초과·오류는 fail, 취소는 stop.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentBackend, AgentRun, AgentRunInput } from '@main/03_Agent/AgentBackend'
import { ClaudeCodeBackend } from '@main/04_Claude/ClaudeCodeBackend'
import type { ReviewRequest } from '@main/05_Loop/ports'
import { buildReviewPrompt, createReviewSessionPort, parseVerdict, type ReviewSessionOptions } from '@main/05_Loop/reviewSession'
import type { GoalState } from '@main/05_Loop/runState'
import type { GateNode } from '@main/05_Loop/template'
import type { AgentEvent } from '@shared/agentEvents'
import type { BackendId } from '@shared/ipcContract'
import { makeCaptureQuery } from '../00_Helpers/fakeQuery'

const CWD = 'C:\\work\\repo'
const APP = 'C:\\Users\\u\\AppData\\Roaming\\agentdeck\\loop'
const ENV: NodeJS.ProcessEnv = { PATH: '/bin', GH_TOKEN: 'agentdeck-no-credential' }
const NODE: GateNode = { kind: 'gate', id: 'review', title: '독립 검수', judge: 'model', when: { grade: 'strong' }, onFail: { goto: 'implement' } }
const GOAL = { id: 'G1', title: '검수 프롬프트에 없는 제목' } as unknown as GoalState

function request(over: Partial<ReviewRequest> = {}): ReviewRequest {
  return {
    milestoneId: 'M-ID-NOT-IN-PROMPT', node: NODE, goal: GOAL, base: 'milestone/M1',
    goalDoc: '# G1\n\n만들 것: 덧셈 함수', diff: 'diff --git a/src/add.ts b/src/add.ts\n+export const add = (a, b) => a + b\n', ...over,
  }
}

type Step = AgentEvent | 'hang'
function fakeBackend(events: Step[], opts: { id?: BackendId; throwOnStart?: boolean } = {}): { backend: AgentBackend; starts: AgentRunInput[]; aborts: () => number } {
  const starts: AgentRunInput[] = []
  let aborts = 0
  const backend: AgentBackend = {
    id: opts.id ?? 'claude-code',
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    listSupportedCommands: () => [],
    start(req): AgentRun {
      if (opts.throwOnStart) throw new Error('start boom')
      starts.push(req)
      let release: () => void = () => {}
      const aborted = new Promise<void>((r) => { release = r })
      return {
        events: (async function* () {
          for (const e of events) {
            if (e === 'hang') { await aborted; return }
            await Promise.resolve(); yield e
          }
        })(),
        abort() { aborts++; release() },
        interrupt() {},
        push() {},
        respond() {},
      }
    },
  }
  return { backend, starts, aborts: () => aborts }
}
const opts = (backend: AgentBackend, over: Partial<ReviewSessionOptions> = {}): ReviewSessionOptions => ({ backend, cwd: CWD, env: ENV, appLoopDir: APP, ...over })
const said = (text: string): Step[] => [{ type: 'text', delta: text, messageId: 'm1' }, { type: 'done' }]

describe('판정 줄 읽기', () => {
  it('마지막 비지 않은 줄이 정확히 `VERDICT: pass|fail`일 때만 그 판정이다 — 그 밖은 모두 fail', () => {
    expect(parseVerdict('범위 안이다.\nVERDICT: pass')).toBe('pass')
    expect(parseVerdict('범위 안이다.\nVERDICT: PASS\n\n  ')).toBe('pass')
    expect(parseVerdict('결함이 있다.\nVERDICT: fail')).toBe('fail')
    expect(parseVerdict('VERDICT: pass\n하지만 하나 더 볼 것')).toBe('fail')
    expect(parseVerdict('VERDICT: pass — 좋다')).toBe('fail')
    expect(parseVerdict('**VERDICT: pass**')).toBe('fail')
    expect(parseVerdict('')).toBe('fail')
    expect(parseVerdict('통과로 본다')).toBe('fail')
  })
})

describe('검수 프롬프트', () => {
  it('검수 지시·goal 문서·diff·형식 계약을 담고, 마일스톤 id·goal 제목은 없다', () => {
    const p = buildReviewPrompt(request())
    expect(p).toContain('만들 것: 덧셈 함수')
    expect(p).toContain('+export const add')
    expect(p).toContain('VERDICT: pass')
    expect(p).toContain('milestone/M1')
    expect(p).not.toContain('M-ID-NOT-IN-PROMPT')
    expect(p).not.toContain('검수 프롬프트에 없는 제목')
  })

  it('goal 문서가 없으면 없다고 적는다', () => {
    expect(buildReviewPrompt(request({ goalDoc: null }))).toContain('(goal 문서 없음)')
  })
})

describe('검수 세션 실행', () => {
  it('새 세션 하나를 자동 모드·작업 저장소 cwd·자격 없는 환경·읽기 전용 루프 잠금으로 연다', async () => {
    const { backend, starts } = fakeBackend(said('VERDICT: pass'))
    const port = createReviewSessionPort(opts(backend))
    await port.review(request())
    await port.review(request())
    expect(starts).toHaveLength(2)
    const s = starts[0]
    expect(s.messages).toEqual([{ role: 'user', content: buildReviewPrompt(request()) }])
    expect(s.mode).toBe('auto')
    expect(s.workspaceRoot).toBe(CWD)
    expect(s.env).toBe(ENV)
    expect(s.loopLock).toEqual({ repoRoot: CWD, appLoopDir: APP, readOnly: true })
    expect(s.resumeSessionId).toBeUndefined()
  })

  it('마지막 줄 판정을 돌려주고, 근거는 마지막 메시지의 앞부분 한 줄이다', async () => {
    const pass = await createReviewSessionPort(opts(fakeBackend(said('완료조건을 모두 채웠다.\nVERDICT: pass')).backend)).review(request())
    expect(pass.verdict).toBe('pass')
    expect(pass.evidence).toContain('완료조건을 모두 채웠다')
    const fail = await createReviewSessionPort(opts(fakeBackend(said('시험이 없다.\nVERDICT: fail')).backend)).review(request())
    expect(fail.verdict).toBe('fail')
    const vague = await createReviewSessionPort(opts(fakeBackend(said('좋아 보인다')).backend)).review(request())
    expect(vague.verdict).toBe('fail')
    expect(vague.evidence).toContain('VERDICT')
  })

  it('오류·done 없이 닫힘·시간 초과·열기 실패는 fail, 취소는 stop이다', async () => {
    expect((await createReviewSessionPort(opts(fakeBackend([{ type: 'error', message: 'rate' }, { type: 'done' }]).backend)).review(request())).verdict).toBe('fail')
    expect((await createReviewSessionPort(opts(fakeBackend([{ type: 'text', delta: 'VERDICT: pass' }]).backend)).review(request())).verdict).toBe('fail')
    const slow = fakeBackend(['hang'])
    const timed = await createReviewSessionPort(opts(slow.backend, { timeoutMs: 20 })).review(request())
    expect(timed.verdict).toBe('fail')
    expect(timed.evidence).toContain('시간 초과')
    expect((await createReviewSessionPort(opts(fakeBackend([], { throwOnStart: true }).backend)).review(request())).verdict).toBe('fail')
    const hung = fakeBackend(['hang'])
    const port = createReviewSessionPort(opts(hung.backend))
    const pending = port.review(request())
    await new Promise((r) => setTimeout(r, 10))
    expect(port.cancel?.()).toBe(true)
    expect((await pending).verdict).toBe('stop')
    const ac = new AbortController()
    ac.abort()
    expect((await createReviewSessionPort(opts(fakeBackend(said('VERDICT: pass')).backend, { signal: ac.signal })).review(request())).verdict).toBe('stop')
  })

  it('잠금을 붙일 수 없는 백엔드는 열지 않고 멈춘다(stop)', async () => {
    const { backend, starts } = fakeBackend(said('VERDICT: pass'), { id: 'codex' })
    expect((await createReviewSessionPort(opts(backend)).review(request())).verdict).toBe('stop')
    expect(starts).toHaveLength(0)
  })

  it('ClaudeCodeBackend로 열면 SDK 옵션에 읽기 전용 잠금 훅이 맨 앞에 실리고 사용자 MCP 서버를 읽지 않는다', async () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-rs-')))
    try {
      const { queryFn, captured } = makeCaptureQuery([])
      await createReviewSessionPort({ backend: new ClaudeCodeBackend(queryFn), cwd: dir, env: ENV, appLoopDir: APP, timeoutMs: 3000 }).review(request())
      const o = captured.options as Record<string, unknown>
      expect(o['strictMcpConfig']).toBe(true)
      type M = { hooks: ((i: unknown, id: string, x: { signal: AbortSignal }) => Promise<{ hookSpecificOutput?: { permissionDecision: string } }>)[] }
      const first = (o['hooks'] as { PreToolUse: M[] }).PreToolUse[0]
      const out = await first.hooks[0](
        { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: path.join(dir, 'a.ts'), content: 'x' } }, 't', { signal: new AbortController().signal })
      expect(out.hookSpecificOutput?.permissionDecision).toBe('deny')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
