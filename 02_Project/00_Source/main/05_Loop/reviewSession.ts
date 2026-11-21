// 모델 게이트(독립 검수)의 실물 포트. 검수마다 구현 문맥이 없는 새 세션을 연다.
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
import type { LoopSessionTag } from '@shared/13_Loop/loop'
import type { ReviewPort, ReviewRequest } from './ports'
import { DOCS, goalDocPath } from './survivalDocs'
import { DEFAULT_SESSION_TIMEOUT_MS, denyCards, nextSessionKey, oneLine, runNodeSession, taggedEvents } from './workSession'

const DEFAULT_REVIEW_TIMEOUT_MS = 30 * 60_000

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
  // 세션 꼬리표(kind review)와 함께 흘린다
  onEvent?: (e: AgentEvent, tag: LoopSessionTag) => void
}

// 정확히 일치만 받는다(대소문자·띄어쓰기 구분). 줄 앞뒤 공백만 무시한다.
const PASS_LINE = 'VERDICT: pass'
const FAIL_LINE = 'VERDICT: fail'
const lastLineOf = (text: string): string => text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '').at(-1) ?? ''

// 마지막 비지 않은 줄만 본다. 꼴이 정확하지 않으면 fail이다(모호한 통과를 통과로 읽지 않는다).
export function parseVerdict(text: string): 'pass' | 'fail' {
  return lastLineOf(text) === PASS_LINE ? 'pass' : 'fail'
}

// 울타리는 안에 싣는 글의 가장 긴 backtick 줄보다 길게 한다(안의 ``` 줄이 울타리를 닫지 못하게)
function fence(...bodies: string[]): string {
  let longest = 0
  for (const b of bodies) for (const m of b.matchAll(/`+/g)) longest = Math.max(longest, m[0].length)
  return '`'.repeat(Math.max(3, longest + 1))
}

const INSTRUCTION = [
  '너는 독립 검수자다. 이 변경을 만든 대화는 보지 못했고, 아래 goal 문서와 diff만 받는다.',
  'goal 문서의 「만들 것」「건드릴 곳」「하지 않을 것」「관찰 가능한 완료조건」에 비추어 diff를 검수한다.',
  '저장소의 파일은 읽어서 확인해도 된다. 파일을 고치거나, 커밋·브랜치·설치·내려받기를 하지 않는다(잠금이 막는다).',
  '시험·타입체크·린트·빌드는 이 검수 앞의 검사 게이트(checks)가 이미 돌려 통과했다. 검수 세션은 시험이나 명령을 다시 돌리지 않는다 — 읽고 판단만 한다.',
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
  const goalDoc = req.goalDoc ?? '(goal 문서 없음)'
  // 두 울타리를 같은 길이로 — 어느 쪽 안의 backtick 줄도 닫지 못한다
  const f = fence(goalDoc, req.diff)
  const diff = req.diff.endsWith('\n') ? req.diff : `${req.diff}\n`
  const doc = goalDoc.endsWith('\n') ? goalDoc : `${goalDoc}\n`
  return [
    INSTRUCTION,
    `## goal 문서 (${goalPath})\n\n${f}markdown\n${doc}${f}`,
    `## diff (작업 트리 대 ${req.base}의 goal 시작점 ${req.baseSha.slice(0, 12)}, 실행기가 만들었다)\n\n${f}diff\n${diff}${f}`,
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
        onEvent: taggedEvents(opts.onEvent, { key: nextSessionKey(), kind: 'review', node: req.node.id, goal: req.goal?.id ?? null }),
      })
      current = session.cancel
      try {
        const end = await session.done
        switch (end.kind) {
          case 'done': {
            // end.text는 마지막 최상위 메시지의 글이다(runNodeSession — 최상위 도구 호출 뒤 글이 없으면 빈 글)
            const verdict = parseVerdict(end.text)
            const last = lastLineOf(end.text)
            const lastOk = last === PASS_LINE || last === FAIL_LINE
            const body = oneLine(lastOk ? end.text.slice(0, end.text.lastIndexOf(last)) : end.text) || '근거 없음'
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
