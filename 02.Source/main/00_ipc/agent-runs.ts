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
import type { AgentBackend, AgentRunInput, RunResponse } from '../01_agents/AgentBackend'
import type { AgentEvent } from '../../shared/agent-events'

// ── 타입 ─────────────────────────────────────────────────────────────────────

/**
 * 실행 중인 run의 내부 상태.
 * Map에 보관 후 abort / respond 시 lookup.
 */
interface ActiveRun {
  runId: string
  abortFn: () => void
  /** 현재 turn만 중단(세션 유지, REPL ADR-024). run.interrupt 바인딩. */
  interruptFn: () => void
  /** 양방향 요청(permission/question)에 대한 응답을 run.respond로 전달한다. */
  respondFn: (requestId: string, response: RunResponse) => void
  done: boolean
  /**
   * 지속세션(REPL, ADR-024) 여부. true면 done(=turn 경계)에 run을 삭제하지 않고
   * 세션을 유지한다(held-open). error/스트림종료/abort에만 정리.
   */
  persistent: boolean
  /**
   * 지속세션에 후속 user 메시지를 주입하는 push 콜백(run.push 바인딩).
   * 같은 sessionKey의 후속 start()가 새 세션 대신 이 콜백으로 turn을 추가한다.
   */
  pushFn?: (content: string) => void
  /**
   * 지속세션 턴별 orchestration(UltraCode) 갱신 콜백(run.setOrchestration 바인딩, UC1-P03).
   * 같은 sessionKey의 후속 start()가 turn push **직전**에 이 콜백으로 이번 턴의 orchestration을
   * 반영한다 — 세션 생성 시 고정 캡처가 아니라 매 턴 갱신(ADR-032 ④, 할당이지 래치 아님).
   * optional: setOrchestration 미구현 백엔드(AgentRun.setOrchestration이 undefined)에서는 no-op.
   */
  setOrchestrationFn?: (value: boolean) => void
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
   * 진행 중인 run 중단(세션 종료).
   *
   * @param runId  중단할 실행 ID
   * @returns      중단 요청 수락 여부 (이미 완료됐거나 없으면 false)
   */
  abort(runId: string): boolean

  /**
   * 현재 turn만 중단(세션 유지) — REPL 지속세션의 "정지"(ADR-024 (3)).
   *
   * abort()와 분리: abort=세션 종료(레지스트리 정리), interrupt=진행 turn만 중단(run 유지).
   * 단발 run에서도 진행 query를 best-effort 중단(이후 done으로 자연 종료).
   *
   * @param runId  대상 실행 ID
   * @returns      수락 여부 (미존재/완료 run이면 false — no-op)
   */
  interrupt(runId: string): boolean

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

  /**
   * 모든 활성 run을 종료한다 — 앱 종료(before-quit) 시 호출(ADR-024 (4a)).
   *
   * 지속세션(REPL)·단발 run 전부 abort → 세션 generator 종료 + abortController.abort()
   * → 세션스코프 크론도 동반 사망. **앱을 끄면 세션은 죽는다**(좀비 0). 끈 뒤에도 도는
   * "auto-revive"는 의도적으로 두지 않음 — 맥락 복원은 다음 프롬프트의 resume(session_id 영속)이 담당.
   *
   * @returns  종료한 run 수(좀비 0 검증·로깅용). 활성 run이 없으면 0. 멱등(재호출 0).
   */
  closeAll(): number
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
  // 지속세션 레지스트리 (sessionKey → ActiveRun). sessionKey === runId(안정).
  // 같은 sessionKey의 후속 start()를 기존 held-open 세션으로 라우팅한다(REPL, ADR-024).
  const persistentRuns = new Map<string, ActiveRun>()

  /** req.messages의 마지막 user 메시지 content(없으면 null). 지속세션 후속 turn 주입용. */
  function lastUserContent(req: AgentRunInput): string | null {
    const m = req.messages.filter((x) => x.role === 'user').at(-1)
    return m ? m.content : null
  }

  /** run을 양 레지스트리에서 정리(멱등). persistent는 sessionKey===runId로 동시 제거. */
  function cleanup(activeRun: ActiveRun): void {
    activeRun.done = true
    // identity-checked delete: persistent runId===sessionKey라, idle-close로 라우팅에서 빠진 뒤
    // 같은 sessionKey로 새 run이 재생성되면 old run의 지연된 cleanup(스트림 종료 finally)이
    // 새 엔트리를 blind-delete할 수 있다(RMW lost-update). 자기 자신일 때만 지운다.
    if (activeRuns.get(activeRun.runId) === activeRun) activeRuns.delete(activeRun.runId)
    if (activeRun.persistent && persistentRuns.get(activeRun.runId) === activeRun) {
      persistentRuns.delete(activeRun.runId)
    }
  }

  return {
    async start(
      backend: AgentBackend,
      req: AgentRunInput,
      onEvent: (event: AgentEvent, runId: string) => void
    ): Promise<string> {
      // 지속세션(REPL, ADR-024) 판정: persistent + 유효 sessionKey.
      // ipc/index.ts가 이미 정규화하나(=== true·string), 방어적으로 재확인.
      const sessionKey = req.persistent === true && typeof req.sessionKey === 'string' && req.sessionKey.length > 0
        ? req.sessionKey
        : null

      // 같은 sessionKey의 살아있는 세션이 있으면 → 새 세션 대신 기존 세션에 turn push.
      if (sessionKey) {
        const existing = persistentRuns.get(sessionKey)
        if (existing && !existing.done) {
          // turn push **직전**에 이번 턴의 orchestration을 갱신한다(UC1-P03, ADR-032 ④).
          // 순서 엄수: push 후 갱신이면 그 턴의 첫 도구 호출(Workflow)이 옛 상태로 판정될 수
          // 있다. === true 재정규화(untrusted renderer 경유 값 방어) — 할당이지 래치 아님:
          // false도 그대로 전파해 ON→OFF 턴에 게이트가 deny로 재봉인돼야 한다(plan-auditor 🔴#2).
          existing.setOrchestrationFn?.(req.orchestration === true)
          const content = lastUserContent(req)
          if (content !== null) existing.pushFn?.(content)
          return existing.runId   // 안정 runId(=sessionKey) 재사용 → (5) 라우팅 일관
        }
      }

      // runId: 지속세션이면 sessionKey(안정), 아니면 UUID. 소비 시작 *전* 동기 발급.
      const runId = sessionKey ?? randomUUID()

      // AgentBackend.start()는 즉시 AgentRun을 반환 (스폰은 내부에서 시작)
      const run = backend.start(req)

      const activeRun: ActiveRun = {
        runId,
        abortFn: () => run.abort(),
        // 현재 turn만 중단(세션 유지) — REPL 정지=interrupt, 세션종료=abort 분리(ADR-024 (3)).
        interruptFn: () => run.interrupt(),
        // AgentRun.respond를 캡처 — run 핸들이 살아있는 동안 respondFn 유효.
        // 멱등·안전: 미존재 requestId 호출은 run.respond 내부에서 no-op.
        respondFn: (rid, res) => run.respond(rid, res),
        // 지속세션 후속 turn 주입 — run.push 바인딩(비-persistent도 보유하나 미사용).
        pushFn: (content) => run.push(content),
        // 지속세션 턴별 orchestration 갱신 — run.setOrchestration 바인딩(UC1-P03).
        // optional chaining: 미구현 백엔드(AgentRun.setOrchestration undefined)에서는 no-op.
        setOrchestrationFn: (value) => run.setOrchestration?.(value),
        persistent: sessionKey !== null,
        done: false
      }

      activeRuns.set(runId, activeRun)
      if (sessionKey) persistentRuns.set(sessionKey, activeRun)

      // LR4-P02: idle-close commit → **라우팅만** 닫는다.
      //   persistentRuns에서 이 activeRun을 identity-checked 제거(같은 sessionKey로 새 run이
      //   이미 들어와 있으면 그 새 엔트리를 오제거하지 않도록 === 비교). done은 세팅하지 않는다 —
      //   이 run이 방금 큐에 적재한 자신의 마지막 turn-done 이벤트가 아직 소비 대기 중일 수 있고,
      //   done=true면 아래 소비 IIFE의 for-await 루프에 있는 `if (activeRun.done)` late-event
      //   가드가 그 정당한 done을 swallow하기 때문. activeRuns도 건드리지 않는다(소비 IIFE가
      //   아직 스트림을 돌리는 중). 위 turn-push 라우팅(`persistentRuns.get(sessionKey)` 조회)은
      //   persistentRuns만 조회하므로 여기서 제거하는 것으로 stale-HIT 창은 닫힌다.
      if (sessionKey) {
        run.onSessionClosing?.(() => {
          if (persistentRuns.get(activeRun.runId) === activeRun) {
            persistentRuns.delete(activeRun.runId)
          }
        })
      }

      // AsyncIterable 소비를 백그라운드에서 시작 (await하지 않음)
      // Promise chain으로 오류를 silently 삼키지 않고 error 이벤트로 전달
      void (async () => {
        try {
          for await (const event of run.events) {
            // abort 후에도 남은 이벤트가 올 수 있다. done 이후엔 정리 스냅샷(loops)만 통과 —
            // 백엔드 abortCleanup의 loops:[] 가 renderer 표시 진실을 복구한다(LR2-03 근본수리).
            // break 금지: 스트림 자연종료까지 소비 — 백엔드 abort가 스트림을 곧 닫는다(실측).
            // 비-loops(done/error/text/permission 등)는 절대 통과 X(이중 done·유령 권한모달 방지).
            if (activeRun.done) {
              if (event.type === 'loops') onEvent(event, runId)
              continue
            }
            onEvent(event, runId)

            // 종료 판정: 단발은 done/error에 종료. 지속세션은 done=turn 경계(세션 유지) →
            // error(터미널)에만 종료. 지속세션 정상 종료는 스트림 자연종료(finally)가 처리.
            const terminal = event.type === 'error' || (event.type === 'done' && !activeRun.persistent)
            if (terminal) {
              cleanup(activeRun)
              break
            }
          }
        } catch (err: unknown) {
          // iterator 에러 → error 이벤트로 변환해 전달
          const message = err instanceof Error ? err.message : String(err)
          onEvent({ type: 'error', message }, runId)
          cleanup(activeRun)
        } finally {
          // 정상 완료(스트림 자연종료) 시에도 레지스트리 정리 보장 — 지속세션 종료 포함.
          if (!activeRun.done) {
            cleanup(activeRun)
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

      // abort 전에 done으로 마킹해 이후 이벤트 무시 + 양 레지스트리 정리(persistent 포함)
      cleanup(activeRun)
      activeRun.abortFn()

      return true
    },

    interrupt(runId: string): boolean {
      const activeRun = activeRuns.get(runId)
      if (!activeRun || activeRun.done) {
        return false
      }
      // 현재 turn만 중단 — 레지스트리 유지(세션 살아있음). cleanup 하지 않음.
      activeRun.interruptFn()
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
    },

    closeAll(): number {
      // 활성 run을 스냅샷 후 순회(abortFn→이벤트로 인한 동시 mutation 방어).
      // 지속세션은 activeRuns·persistentRuns 둘 다에 같은 객체로 등록(start()의 이중 등록) →
      // activeRuns만 순회해도 전부 커버(cleanup이 둘 다 제거).
      let count = 0
      for (const activeRun of [...activeRuns.values()]) {
        if (activeRun.done) continue
        // done 마킹 + 양 레지스트리 정리(persistent 포함) 후 abort — abort 후 이벤트 무시.
        cleanup(activeRun)
        activeRun.abortFn()
        count++
      }
      return count
    }
  }
}
