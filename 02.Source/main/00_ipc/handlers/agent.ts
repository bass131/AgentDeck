/**
 * handlers/agent.ts — agent 도메인 핸들러 등록
 *
 * 채널: AGENT_RUN · AGENT_ABORT · AGENT_INTERRUPT · AGENT_TASK_STOP · AGENT_SET_MODE
 *       PERMISSION_RESPOND · QUESTION_RESPOND
 *
 * CRITICAL(신뢰경계):
 *   - 모든 renderer 입력(runId·requestId·behavior·answers 등)은 untrusted — 타입+내용 검증.
 *   - systemPrompt: normalizeSystemPrompt 통과 후만 backend 전달.
 *   - workspaceRoot: isAbsolute 검증 필수.
 *   - orchestration/persistent: boolean === true 엄격 정규화.
 *   - AGENT_EVENT는 state.win.webContents.send로만 push(ipc 채널명 하드코딩 0).
 */

import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { isAbsolute } from 'node:path'
import { IPC_CHANNELS } from '../../../shared/ipc-contract'
import type {
  AgentRunRequest,
  AgentRunResponse,
  AgentAbortRequest,
  AgentAbortResponse,
  AgentInterruptRequest,
  AgentInterruptResponse,
  TaskStopRequest,
  TaskStopResponse,
  SetModeRequest,
  SetModeResponse,
  AgentEventPayload,
  PermissionResponse,
  QuestionResponse,
} from '../../../shared/ipc-contract'
import type { RunManager } from '../agent-runs'
import { normalizeSystemPrompt } from '../normalize'
import { getBackend } from '../../01_agents/registry'

// ── 상수 ─────────────────────────────────────────────────────────────────────

/**
 * 라이브 전환 허용 권한 모드 picker id 4종 — 영호 박제(2026-07-14, GAP1 P13 📐).
 *
 * 'bypass'·'dontAsk'는 라이브 전환 금지 — 세션 생성 시에만 선택 가능.
 * SDK 어휘('default'·'bypassPermissions' 등)도 거부 — 이 계약은 picker id 원문만
 * 운반하고, SDK 모드로의 매핑은 어댑터 내부에만 둔다(ADR-003, 어휘 규율 고정).
 */
const LIVE_MODE_WHITELIST = ['normal', 'plan', 'acceptEdits', 'auto'] as const

// ── 의존성 타입 ──────────────────────────────────────────────────────────────

export interface AgentHandlerDeps {
  /** win: AGENT_EVENT push용. activate 시 갱신 반영. */
  state: { win: BrowserWindow | null }
  /** runManager: run 시작·중단·응답 라우팅. */
  runManager: RunManager
}

// ── 핸들러 등록 ──────────────────────────────────────────────────────────────

/** agent 도메인 IPC 핸들러를 등록한다. */
export function registerAgentHandlers(deps: AgentHandlerDeps): void {
  const { state, runManager } = deps

  // ── agent.run ─────────────────────────────────────────────────────────────
  // 에이전트 실행 시작. runId 반환, 이벤트는 AGENT_EVENT 채널로 push.

  ipcMain.handle(IPC_CHANNELS.AGENT_RUN, async (_e, req: AgentRunRequest): Promise<AgentRunResponse> => {
    // 입력 검증 (untrusted)
    if (!Array.isArray(req?.messages)) {
      throw new Error('agent.run: messages must be an array')
    }
    if (req.messages.length === 0) {
      throw new Error('agent.run: messages must not be empty')
    }

    // workspaceRoot 경로 탈출 방어 (선택적 필드)
    let workspaceRoot = req.workspaceRoot
    if (workspaceRoot) {
      if (!isAbsolute(workspaceRoot)) {
        throw new Error('agent.run: workspaceRoot must be an absolute path')
      }
      workspaceRoot = workspaceRoot.replace(/\\/g, '/')
    }

    const backend = getBackend(req.backendId)

    // model/effort/mode (untrusted) — string만 전달. allowlist 검증/CLI 매핑은
    // run-args.buildRunArgs(agent-backend)가 수행 → 임의 문자열의 플래그 주입 차단. (M4-1)
    const model = typeof req.model === 'string' ? req.model : undefined
    const effort = typeof req.effort === 'string' ? req.effort : undefined
    const mode = typeof req.mode === 'string' ? req.mode : undefined

    // systemPrompt 정규화: trim → 빈 체크 → cap(16000자).
    // CRITICAL(신뢰경계): 정규화 결과를 로그에 출력하지 않는다.
    const systemPrompt = normalizeSystemPrompt(req.systemPrompt)

    // orchestration 정규화: untrusted renderer boolean → === true 강제.
    const orchestration = req.orchestration === true

    // resumeSessionId 정규화: untrusted → string만, 아니면 undefined.
    const resumeSessionId = typeof req.resumeSessionId === 'string' && req.resumeSessionId.length > 0
      ? req.resumeSessionId
      : undefined

    // 지속세션(REPL, ADR-024) 정규화: boolean true만, sessionKey는 비어있지 않은 string만.
    const persistent = req.persistent === true
    const sessionKey = typeof req.sessionKey === 'string' && req.sessionKey.length > 0
      ? req.sessionKey
      : undefined

    const runId = await runManager.start(
      backend,
      { messages: req.messages, workspaceRoot, model, effort, mode, systemPrompt, orchestration, resumeSessionId, persistent, sessionKey },
      (event, eventRunId) => {
        const payload: AgentEventPayload = { runId: eventRunId, event }
        if (state.win && !state.win.isDestroyed()) {
          state.win.webContents.send(IPC_CHANNELS.AGENT_EVENT, payload)
        }
      }
    )

    return { runId }
  })

  // ── agent.abort ───────────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.AGENT_ABORT, (_e, req: AgentAbortRequest): AgentAbortResponse => {
    if (!req?.runId || typeof req.runId !== 'string') {
      return { accepted: false }
    }
    const accepted = runManager.abort(req.runId)
    return { accepted }
  })

  // ── agent.interrupt (현재 turn만 중단, 세션 유지 — REPL ADR-024) ─────────────

  ipcMain.handle(IPC_CHANNELS.AGENT_INTERRUPT, (_e, req: AgentInterruptRequest): AgentInterruptResponse => {
    if (!req?.runId || typeof req.runId !== 'string') {
      return { accepted: false }
    }
    const accepted = runManager.interrupt(req.runId)
    return { accepted }
  })

  // ── agent.taskStop (백그라운드 태스크 1개 정지 — run 유지, GAP1 P09) ────────
  // CRITICAL(신뢰경계):
  //   - runId·taskId: renderer untrusted string 2개 — 타입 + 비어있음(trim) 검증.
  //   - 불합격 → { accepted: false } (throw 금지). runId 존재 검증은 runManager.taskStop.
  //   - 정지 *결과*는 응답이 아니라 bg_task kind='notification'(status 'stopped')으로 흐른다.
  //   - guard 로직은 99.Others/tests/main/gap1-p09-task-stop-handler.test.ts의
  //     handleTaskStop 추출 미러와 동기화 유지(permission-respond 선례).

  ipcMain.handle(IPC_CHANNELS.AGENT_TASK_STOP, (_e, req: TaskStopRequest): TaskStopResponse => {
    if (!req?.runId || typeof req.runId !== 'string' || req.runId.trim() === '') {
      return { accepted: false }
    }
    if (!req?.taskId || typeof req.taskId !== 'string' || req.taskId.trim() === '') {
      return { accepted: false }
    }
    const accepted = runManager.taskStop(req.runId, req.taskId)
    return { accepted }
  })

  // ── agent.setMode (진행 중 세션 권한 모드 라이브 전환 — GAP1 P13) ────────────
  // CRITICAL(신뢰경계):
  //   - runId·mode: renderer untrusted string 2개 — 타입 + 비어있음(trim) + 화이트리스트 검증.
  //   - 화이트리스트 4종('normal'|'plan'|'acceptEdits'|'auto') 강제는 **main 핸들러 단독
  //     책임**(CORE-01, 영호 박제 2026-07-14) — 어댑터의 이중 방어와 무관하게 여기가 정본.
  //     'bypass'·'dontAsk'·SDK 어휘('default'·'bypassPermissions')·임의 문자열 전부 거부.
  //   - 불합격 → { accepted: false } (throw 금지) + run 위임 0. runId 존재 검증은
  //     runManager.setMode(미존재/완료 → false, taskStop 미러).
  //   - 검증된 picker id **원문**만 위임 — SDK 매핑은 어댑터 내부(ADR-003), main 변환 금지.
  //   - 전환 *결과* 정본은 응답이 아니라 permission_mode 이벤트로 흐른다(taskStop의
  //     bg_task notification 관례 미러) — 응답 accepted는 검증+라우팅 수락 여부만.
  //   - guard 로직은 99.Others/tests/main/gap1-p13-set-mode-handler.test.ts의
  //     handleSetMode 추출 미러와 동기화 유지(taskStop/permission-respond 선례).

  ipcMain.handle(IPC_CHANNELS.AGENT_SET_MODE, (_e, req: SetModeRequest): SetModeResponse => {
    if (!req?.runId || typeof req.runId !== 'string' || req.runId.trim() === '') {
      return { accepted: false }
    }
    // mode: string + 화이트리스트 4종 밖 전부 거부(임의 문자열의 엔진 플래그/모드 주입 차단).
    if (typeof req.mode !== 'string' || !(LIVE_MODE_WHITELIST as readonly string[]).includes(req.mode)) {
      return { accepted: false }
    }
    const accepted = runManager.setMode(req.runId, req.mode)
    return { accepted }
  })

  // ── agent.permissionRespond (M4-4) ────────────────────────────────────────
  // CRITICAL(신뢰경계):
  //   - runId·requestId: 비어있지 않은 string 검증.
  //   - behavior: 'allow'|'allow_always'|'deny' allowlist 검증.
  //   - 불합격 → { ok: false } (throw 금지).

  ipcMain.handle(IPC_CHANNELS.PERMISSION_RESPOND, (_e, req: PermissionResponse): { ok: boolean } => {
    if (!req?.runId || typeof req.runId !== 'string' || req.runId.trim() === '') {
      return { ok: false }
    }
    if (!req?.requestId || typeof req.requestId !== 'string' || req.requestId.trim() === '') {
      return { ok: false }
    }
    const allowedBehaviors = ['allow', 'allow_always', 'deny'] as const
    if (!allowedBehaviors.includes(req.behavior as (typeof allowedBehaviors)[number])) {
      return { ok: false }
    }

    const ok = runManager.respond(req.runId, req.requestId, {
      kind: 'permission',
      behavior: req.behavior
    })
    return { ok }
  })

  // ── agent.questionRespond (M4-4) ─────────────────────────────────────────
  // CRITICAL(신뢰경계):
  //   - runId·requestId: 비어있지 않은 string 검증.
  //   - answers: null(사용자 dismiss) 또는 string[][] 검증.

  ipcMain.handle(IPC_CHANNELS.QUESTION_RESPOND, (_e, req: QuestionResponse): { ok: boolean } => {
    if (!req?.runId || typeof req.runId !== 'string' || req.runId.trim() === '') {
      return { ok: false }
    }
    if (!req?.requestId || typeof req.requestId !== 'string' || req.requestId.trim() === '') {
      return { ok: false }
    }

    const answers = req.answers
    if (answers !== null) {
      if (!Array.isArray(answers)) {
        return { ok: false }
      }
      for (const row of answers) {
        if (!Array.isArray(row)) {
          return { ok: false }
        }
        for (const val of row) {
          if (typeof val !== 'string') {
            return { ok: false }
          }
        }
      }
    }

    const ok = runManager.respond(req.runId, req.requestId, {
      kind: 'question',
      answers: answers as string[][] | null
    })
    return { ok }
  })
}
