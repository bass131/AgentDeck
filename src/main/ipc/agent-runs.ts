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
import type { AgentBackend, AgentRunInput } from '../agents/AgentBackend'
import type { AgentEvent } from '../../shared/agent-events'

// ── 타입 ─────────────────────────────────────────────────────────────────────

/**
 * 실행 중인 run의 내부 상태.
 * Map에 보관 후 abort 시 lookup.
 */
interface ActiveRun {
  runId: string
  abortFn: () => void
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
    onEvent: (event: AgentEvent) => void
  ): Promise<string>

  /**
   * 진행 중인 run 중단.
   *
   * @param runId  중단할 실행 ID
   * @returns      중단 요청 수락 여부 (이미 완료됐거나 없으면 false)
   */
  abort(runId: string): boolean
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
      onEvent: (event: AgentEvent) => void
    ): Promise<string> {
      const runId = randomUUID()

      // AgentBackend.start()는 즉시 AgentRun을 반환 (스폰은 내부에서 시작)
      const run = backend.start(req)

      const activeRun: ActiveRun = {
        runId,
        abortFn: () => run.abort(),
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
            onEvent(event)

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
          onEvent({ type: 'error', message })
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
    }
  }
}
