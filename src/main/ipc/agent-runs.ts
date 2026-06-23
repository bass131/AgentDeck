/**
 * agent-runs.ts — 에이전트 실행 관리 (순수에 가까운 모듈)
 *
 * CRITICAL: electron을 import하지 않는다 → vitest node 환경에서 직접 테스트 가능.
 *   이벤트 콜백을 주입받아 동작 → ipc/index.ts(얇은 등록 레이어)가 webContents.send 연결.
 *
 * 책임:
 *   - runId 발급 (UUID)
 *   - AgentBackend.start() 호출 → AsyncIterable<AgentEvent> 소비
 *   - 이벤트마다 onEvent 콜백 호출
 *   - abort 요청 시 AgentRun.abort() 전달 + 실행 레지스트리 정리
 *
 * 격리 설계 (테스트 가능성):
 *   createRunManager()가 RunManager 인스턴스를 반환.
 *   start(backend, req, onEvent): onEvent는 (AgentEvent, runId) => void 콜백 주입.
 *   ipc/index.ts에서 onEvent = (event, runId) => win.webContents.send(...) 로 연결.
 */

import { randomUUID } from 'node:crypto'
import type { AgentBackend, AgentRunInput, RunResponse } from '../agents/AgentBackend'
import type { AgentEvent } from '../../shared/agent-events'

// ── 타입 ─────────────────────────────────────────────────────────────────────

/**
 * 실행 중인 run의 내부 상태.
 * Map에 보관 후 abort / respond 시 lookup.
 */
interface ActiveRun {
  runId: string
  abortFn: () => void
  /** 양방향 요청(permission/question)에 대한 응답을 run.respond로 전달한다. */
  respondFn: (requestId: string, response: RunResponse) => void
  done: boolean
}

/**
 * RunManager 공개 인터페이스.
 * electron 없이 테스트 가능하도록 콜백 주입형.
 */
export interface RunManager {
  /**
   * 에이전트 실행 시작.
   *
   * @param backend  AgentBackend 인스턴스 (registry에서 가져온 것)
   * @param req      AgentRunInput (메시지·워크스페이스)
   * @param onEvent  이벤트 수신 콜백 (main-ipc 레이어에서 webContents.send로 연결)
   * @returns        runId (abort·이벤트 매칭용)
   *
   * 주의: 반환값은 Promise<string>이지만 start()는 즉시 runId를 발급하고
   *       AsyncIterable 소비는 백그라운드에서 진행됨.
   */
  start(
    backend: AgentBackend,
    req: AgentRunInput,
    onEvent: (event: AgentEvent, runId: string) => void
  ): Promise<string>

  /**
   * 진행 중인 run 중단.
   *
   * @param runId  중단할 실행 ID
   * @returns      중단 요청 수락 여부 (이미 완료됐거나 없으면 false)
   */
  abort(runId: string): boolean

  /**
   * 진행 중인 run에 양방향 응답을 라우팅한다.
   *
   * renderer가 PERMISSION_RESPOND / QUESTION_RESPOND invoke를 통해 보낸 응답을
   * 해당 runId의 AgentRun.respond()로 전달한다.
   *
   * @param runId      대상 실행 ID
   * @param requestId  응답 대상 요청 ID (permission_request / question_request의 requestId)
   * @param response   사용자 응답 (RunResponse discriminated union)
   * @returns          전달 성공 여부 (미존재/완료 run이면 false — no-op, no-throw)
   */
  respond(runId: string, requestId: string, response: RunResponse): boolean
}

// ── createRunManager ─────────────────────────────────────────────────────────

/**
 * RunManager 인스턴스를 생성한다.
 *
 * 싱글턴으로 사용하거나, 테스트마다 새로 생성 가능.
 */
export function createRunManager(): RunManager {
  // 활성 run 레지스트리 (runId → ActiveRun)
  const activeRuns = new Map<string, ActiveRun>()

  return {
    async start(
      backend: AgentBackend,
      req: AgentRunInput,
      onEvent: (event: AgentEvent, runId: string) => void
    ): Promise<string> {
      // runId는 소비 시작 *전* 동기 발급 → 모든 이벤트(첫 이벤트 포함)를 정확한
      // runId로 태깅할 수 있다. (멀티 동시실행 라우팅 토대 — ipc 레이어 box 불요.)
      const runId = randomUUID()

      // AgentBackend.start()는 즉시 AgentRun을 반환 (스폰은 내부에서 시작)
      const run = backend.start(req)

      const activeRun: ActiveRun = {
        runId,
        abortFn: () => run.abort(),
        // AgentRun.respond를 캡처 — run 핸들이 살아있는 동안 respondFn 유효.
        // 멱등·안전: 미존재 requestId 호출은 run.respond 내부에서 no-op.
        respondFn: (rid, res) => run.respond(rid, res),
        done: false
      }

      activeRuns.set(runId, activeRun)

      // AsyncIterable 소비를 백그라운드에서 시작 (await하지 않음)
      // Promise chain으로 오류를 silently 삼키지 않고 error 이벤트로 전달
      void (async () => {
        try {
          for await (const event of run.events) {
            // abort 후에도 남은 이벤트가 올 수 있으므로, done 확인 후 스킵
            if (activeRun.done) break
            onEvent(event, runId)

            // done 또는 error 이벤트 후 레지스트리에서 제거
            if (event.type === 'done' || event.type === 'error') {
              activeRun.done = true
              activeRuns.delete(runId)
              break
            }
          }
        } catch (err: unknown) {
          // iterator 에러 → error 이벤트로 변환해 전달
          const message = err instanceof Error ? err.message : String(err)
          onEvent({ type: 'error', message }, runId)
          activeRun.done = true
          activeRuns.delete(runId)
        } finally {
          // 정상 완료 시에도 레지스트리 정리 보장
          if (!activeRun.done) {
            activeRun.done = true
            activeRuns.delete(runId)
          }
        }
      })()

      return runId
    },

    abort(runId: string): boolean {
      const activeRun = activeRuns.get(runId)

      if (!activeRun || activeRun.done) {
        return false
      }

      // abort 전에 done으로 마킹해 이후 이벤트 무시
      activeRun.done = true
      activeRuns.delete(runId)
      activeRun.abortFn()

      return true
    },

    respond(runId: string, requestId: string, response: RunResponse): boolean {
      const activeRun = activeRuns.get(runId)

      // 미존재 또는 이미 완료된 run → no-op (throw 없음, renderer 입력 신뢰X)
      if (!activeRun || activeRun.done) {
        return false
      }

      // run.respond로 라우팅 — 멱등: 미존재 requestId는 내부 no-op
      activeRun.respondFn(requestId, response)
      return true
    }
  }
}
