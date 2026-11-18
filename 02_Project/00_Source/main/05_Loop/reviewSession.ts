// M09 G4 — 모델 게이트(독립 검수)의 실물 포트. 검수마다 구현 문맥이 없는 새 세션을 연다.
//   - 입력: 실행기가 준 goal 문서와 diff(작업 트리 대 마일스톤 브랜치, 실행기가 임시 인덱스에서 만든 것)뿐이다.
//     마일스톤 id·goal 제목·작업 세션의 대화는 싣지 않는다. 세션은 작업 저장소를 읽어 확인할 수 있다.
//   - 실행 입력: 앱 「자동」 모드, 자격 없는 환경, 루프 잠금의 읽기 전용 꼴(loopLock readOnly — 저장소 쓰기·git 쓰기 하위 명령·
//     내려받기·패키지 설치 거부, 원격 쓰기·자격 꺼내기·MCP 거부는 작업 노드와 같다), 사용자 MCP 서버 없음(sdkOptions strictMcpConfig).
//     잠금은 claude-code 백엔드에서만 붙으므로 다른 백엔드는 열지 않는다(stop — 설정 문제라 FAIL로 세지 않는다).
//   - 판정: 마지막 메시지의 마지막 비지 않은 줄이 정확히 `VERDICT: pass` 또는 `VERDICT: fail`일 때만 센다. 그 밖은 fail이다.
//     오류·done 없이 닫힘·시간 초과·열기 실패는 fail, 취소(실행기 닫기·화면의 취소)는 stop이다.
//   - 카드(권한·질문)는 거부·무응답이다 — 사람이 없는 세션이다.
// pass를 검수한 트리에 묶는 일(검수 뒤 트리 대조, 커밋·push 전 대조)은 실행기(loopRunner)가 한다.
import type { AgentBackend } from '@main/03_Agent/AgentBackend'
import type { AgentEvent } from '@shared/agentEvents'
import type { ReviewPort, ReviewRequest } from './ports'
import { DOCS, goalDocPath } from './survivalDocs'
import { DEFAULT_SESSION_TIMEOUT_MS, denyCards, oneLine, runNodeSession } from './workSession'

export const DEFAULT_REVIEW_TIMEOUT_MS = 30 * 60_000

export interface ReviewSessionOptions {
  backend: AgentBackend
  cwd: string
  // 자격 없는 자식 환경(childEnv.ts)
  env: NodeJS.ProcessEnv
  appLoopDir: string
  timeoutMs?: number
  model?: string
  effort?: string
  signal?: AbortSignal
  onEvent?: (e: AgentEvent) => void
}

const VERDICT_LINE = /^VERDICT:\s*(pass|fail)\s*$/i

// 마지막 비지 않은 줄만 본다. 꼴이 정확하지 않으면 fail이다(모호한 통과를 통과로 읽지 않는다).
export function parseVerdict(text: string): 'pass' | 'fail' {
  const last = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '').at(-1) ?? ''
  const m = VERDICT_LINE.exec(last)
  return m && m[1].toLowerCase() === 'pass' ? 'pass' : 'fail'
}

const INSTRUCTION = [
  '너는 독립 검수자다. 이 변경을 만든 대화는 보지 못했고, 아래 goal 문서와 diff만 받는다.',
  'goal 문서의 「만들 것」「건드릴 곳」「하지 않을 것」「관찰 가능한 완료조건」에 비추어 diff를 검수한다.',
  '저장소의 파일은 읽어서 확인해도 된다. 파일을 고치거나, 커밋·브랜치·설치·내려받기를 하지 않는다(잠금이 막는다).',
  '완료조건을 채우지 못했거나, 범위 밖 변경이 있거나, 시험 없이 동작을 바꿨거나, 명백한 결함이 있으면 불통과다.',
].join('\n')

const FORMAT = [
  '## 답의 형식',
  '',
  '근거를 몇 줄로 쓰고, 맨 마지막 줄에는 아래 둘 중 하나만 그대로 쓴다. 그 줄 뒤에는 아무것도 쓰지 않는다.',
  '',
  'VERDICT: pass',
  'VERDICT: fail',
  '',
  '마지막 줄이 이 꼴이 아니면 불통과로 센다.',
].join('\n')

export function buildReviewPrompt(req: ReviewRequest): string {
  const goalPath = req.goal ? goalDocPath(req.goal.id) : `${DOCS.goalsDir}/(없음)`
  return [
    INSTRUCTION,
    `## goal 문서 (${goalPath})\n\n${req.goalDoc ?? '(goal 문서 없음)'}`,
    `## diff (작업 트리 대 ${req.base}, 실행기가 만들었다)\n\n\`\`\`diff\n${req.diff}\n\`\`\``,
    FORMAT,
  ].join('\n\n')
}

export function createReviewSessionPort(opts: ReviewSessionOptions): ReviewPort {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_REVIEW_TIMEOUT_MS
  let current: (() => boolean) | null = null
  return {
    async review(req) {
      if (opts.backend.id !== 'claude-code') {
        return { verdict: 'stop', evidence: `검수 세션은 루프 잠금을 붙일 수 있는 claude-code 백엔드로만 연다 — ${opts.backend.id}` }
      }
      if (opts.signal?.aborted) return { verdict: 'stop', evidence: '취소됐다 — 검수 세션을 열지 않았다' }
      const session = runNodeSession({
        backend: opts.backend,
        input: {
          messages: [{ role: 'user', content: buildReviewPrompt(req) }],
          workspaceRoot: opts.cwd,
          mode: 'auto',
          ...(opts.model !== undefined ? { model: opts.model } : {}),
          ...(opts.effort !== undefined ? { effort: opts.effort } : {}),
          env: opts.env,
          loopLock: { repoRoot: opts.cwd, appLoopDir: opts.appLoopDir, readOnly: true },
        },
        timeoutMs: timeoutMs > 0 ? timeoutMs : DEFAULT_SESSION_TIMEOUT_MS,
        signal: opts.signal,
        onCard: denyCards,
        cardContext: { node: req.node.id, goal: req.goal?.id ?? null },
        onEvent: opts.onEvent,
      })
      current = session.cancel
      try {
        const end = await session.done
        switch (end.kind) {
          case 'done': {
            const verdict = parseVerdict(end.text)
            const body = oneLine(end.text.replace(/\n?\s*VERDICT:\s*(pass|fail)\s*$/i, '')) || '근거 없음'
            const lastOk = VERDICT_LINE.test(end.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).at(-1) ?? '')
            return { verdict, evidence: lastOk ? `검수 세션 — ${body}` : `검수 세션의 마지막 줄이 VERDICT 꼴이 아니라 불통과로 셌다 — ${body}` }
          }
          case 'error': return { verdict: 'fail', evidence: oneLine(`검수 세션 오류 — ${end.error}`) }
          case 'cancelled': return { verdict: 'stop', evidence: '검수 세션이 취소됐다 — 사람이 이어 가기로 다시 돌린다' }
          case 'timeout': return { verdict: 'fail', evidence: `검수 세션 시간 초과(${Math.round(end.timeoutMs / 1000)}초)` }
          case 'start-failed': return { verdict: 'fail', evidence: oneLine(`검수 세션을 열지 못했다 — ${end.error}`) }
        }
      } finally {
        if (current === session.cancel) current = null
      }
    },
    cancel: () => (current ? current() : false),
  }
}
