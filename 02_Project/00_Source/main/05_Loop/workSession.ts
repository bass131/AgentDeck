// M09 G2 — 작업 노드 세션 포트(ports.SessionPort)의 실물. 노드마다 새 세션을 기존 03_Agent 백엔드로 연다.
//   - 프롬프트: 템플릿 노드의 지시와 그 노드가 고른 생존 문서(경로 머리 + 본문)만. 마일스톤 id·goal 제목 같은 다른 맥락은 없다.
//     단, 세션은 앱 세션과 같은 설정 출처(user·project·local)를 읽는다 — 작업 저장소와 사용자의 CLAUDE.md는 그쪽 몫이다.
//   - 실행 입력: 앱 「자동」 모드(picker id auto), cwd는 작업 저장소, 환경은 자격 없는 자식 환경, 루프 잠금 노드(loopLock.ts).
//     잠금은 claude-code 백엔드의 SDK 옵션에서만 붙으므로 다른 백엔드는 열지 않는다(fail-closed).
//   - 사람이 없는 세션이라 카드(권한·질문)는 기본으로 거부·무응답으로 넘긴다. G3의 사람 게이트가 응답자를 바꿔 끼운다.
//   - 결과: done이면 ok:true(요약은 마지막 메시지 한 줄). error가 하나라도 있었거나, done 없이 끝났거나, 시간 초과·취소면 ok:false.
import type { AgentBackend, AgentRun, RunResponse } from '@main/03_Agent/AgentBackend'
import type { AgentEvent } from '@shared/agentEvents'
import type { SessionPort, WorkRequest } from './ports'
import { DOCS, goalDocPath } from './survivalDocs'
import type { DocKind } from './template'

export const DEFAULT_SESSION_TIMEOUT_MS = 60 * 60_000
const SUMMARY_MAX = 300

type CardEvent = Extract<AgentEvent, { type: 'permission_request' | 'question_request' }>
export type CardResponder = (ev: CardEvent) => RunResponse | Promise<RunResponse>

export interface WorkSessionOptions {
  backend: AgentBackend
  // 작업 저장소 뿌리 — 세션 cwd이자 잠금의 저장소 뿌리
  cwd: string
  // 자격 없는 자식 환경(childEnv.ts)
  env: NodeJS.ProcessEnv
  // 앱 영역 — 잠금이 이 폴더 쓰기를 막는다
  appLoopDir: string
  timeoutMs?: number
  model?: string
  effort?: string
  // 실행기를 닫을 때 돌고 있는 세션을 멈춘다
  signal?: AbortSignal
  onCard?: CardResponder
  // 화면(G3)이 세션 진행을 볼 수 있게 이벤트를 흘린다
  onEvent?: (e: AgentEvent) => void
}

const DOC_LABEL: Record<DocKind, string> = {
  milestoneSpec: '마일스톤 스펙',
  goal: 'goal 문서',
  decisions: '결정 대장',
  verification: '검증 기록',
}

function docPathOf(kind: DocKind, req: WorkRequest): string | null {
  if (kind === 'goal') return req.goal ? goalDocPath(req.goal.id) : null
  return kind === 'milestoneSpec' ? DOCS.milestoneSpec : kind === 'decisions' ? DOCS.decisions : DOCS.verification
}

// 노드가 고른 문서 종(node.docs)의 순서로만 싣는다 — req.docs에 다른 종이 있어도 넣지 않는다.
export function buildWorkPrompt(req: WorkRequest): string {
  const parts = [req.node.instruction.trim()]
  for (const kind of req.node.docs) {
    const p = docPathOf(kind, req)
    const body = req.docs[kind]
    parts.push(`## ${DOC_LABEL[kind]}${p ? ` (${p})` : ''}\n\n${body ?? '(아직 없음)'}`)
  }
  return parts.join('\n\n')
}

const oneLine = (s: string): string => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > SUMMARY_MAX ? t.slice(0, SUMMARY_MAX - 1) + '…' : t
}

const denyCards = (ev: CardEvent): RunResponse =>
  ev.type === 'question_request' ? { kind: 'question', answers: null } : { kind: 'permission', behavior: 'deny' }

type Result = { ok: boolean; summary: string }

export function createWorkSessionPort(opts: WorkSessionOptions): SessionPort {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS
  const onCard = opts.onCard ?? denyCards

  return {
    async runWork(req: WorkRequest): Promise<Result> {
      if (opts.backend.id !== 'claude-code') {
        return { ok: false, summary: `작업 노드 세션은 루프 잠금을 붙일 수 있는 claude-code 백엔드로만 연다 — ${opts.backend.id}` }
      }
      if (opts.signal?.aborted) return { ok: false, summary: '취소됐다 — 세션을 열지 않았다' }
      let run: AgentRun
      try {
        run = opts.backend.start({
          messages: [{ role: 'user', content: buildWorkPrompt(req) }],
          workspaceRoot: opts.cwd,
          mode: 'auto',
          ...(opts.model !== undefined ? { model: opts.model } : {}),
          ...(opts.effort !== undefined ? { effort: opts.effort } : {}),
          env: opts.env,
          loopLock: { repoRoot: opts.cwd, appLoopDir: opts.appLoopDir },
        })
      } catch (e) {
        return { ok: false, summary: oneLine(`세션을 열지 못했다 — ${e instanceof Error ? e.message : String(e)}`) }
      }

      return new Promise<Result>((resolve) => {
        let settled = false
        const finish = (r: Result): void => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          opts.signal?.removeEventListener('abort', onAbort)
          try { run.abort() } catch { /* 이미 닫힌 세션 */ }
          resolve(r)
        }
        const timer = setTimeout(() => finish({ ok: false, summary: `시간 초과(${Math.round(timeoutMs / 1000)}초) — 세션을 취소했다` }), timeoutMs)
        const onAbort = (): void => finish({ ok: false, summary: '취소됐다 — 세션을 멈췄다' })
        opts.signal?.addEventListener('abort', onAbort, { once: true })

        void (async () => {
          let text = ''
          let messageId: string | undefined
          let error: string | null = null
          try {
            for await (const ev of run.events) {
              if (settled) return
              opts.onEvent?.(ev)
              if (ev.type === 'text') {
                if (ev.parentToolId !== undefined) continue
                if (ev.messageId !== undefined && ev.messageId !== messageId) { messageId = ev.messageId; text = '' }
                text += ev.delta
              } else if (ev.type === 'error') {
                error ??= ev.message
              } else if (ev.type === 'permission_request' || ev.type === 'question_request') {
                const id = ev.requestId
                void Promise.resolve(onCard(ev)).then((r) => { if (!settled) run.respond(id, r) }, () => { if (!settled) run.respond(id, denyCards(ev)) })
              } else if (ev.type === 'done') {
                finish(error !== null ? { ok: false, summary: oneLine(`세션 오류 — ${error}`) } : { ok: true, summary: oneLine(text) || '요약 없음' })
                return
              }
            }
            finish({ ok: false, summary: oneLine(error !== null ? `세션 오류 — ${error}` : '세션이 끝 표시(done) 없이 닫혔다') })
          } catch (e) {
            finish({ ok: false, summary: oneLine(`세션 오류 — ${e instanceof Error ? e.message : String(e)}`) })
          }
        })()
      })
    },
  }
}
