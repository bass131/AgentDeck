/**
 * ClaudeCodeBackend.ts — Claude Code CLI 어댑터
 *
 * AgentBackend 구현: claude -p --output-format stream-json --verbose
 * stdout NDJSON 줄 단위 → mapClaudeStreamLine → AgentEvent async iterable.
 *
 * 핵심 책임: 엔진 고유 출력(CLI stdout) → 공통 AgentEvent 정규화.
 * raw stdout를 외부로 누수하지 않는다.
 *
 * 엔진 분기는 registry.ts에서만 수행한다.
 * 이 클래스를 직접 import하는 곳은 registry.ts 하나뿐이어야 한다.
 *
 * API 키: 환경변수(ANTHROPIC_API_KEY)에서 spawn env로 전달.
 *          코드·로그에 평문 노출 절대 금지.
 *
 * 모델 ID: 하드코딩 금지. Claude CLI 기본값 사용 (CLI 자체가 모델을 결정).
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mapClaudeStreamLine } from './claude-stream'
import { buildRunArgs } from './run-args'
import type { AgentBackend, AgentRun, AgentRunInput } from './AgentBackend'
import type { AgentEvent } from '../../shared/agent-events'

// ── isAvailable / version 헬퍼 ─────────────────────────────────────────────

/**
 * claude CLI 존재 여부 탐지.
 * `claude --version`을 실행해 종료 코드 0이면 설치됨으로 판단.
 */
async function detectClaudeCli(): Promise<boolean> {
  return new Promise((resolve) => {
    // Windows: where claude / POSIX: which claude 대신 --version 시도
    const proc = spawn('claude', ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      // 환경은 현재 프로세스 그대로 상속 (PATH 포함)
      env: process.env,
      // 셸을 통해 PATH 검색이 되도록
      shell: process.platform === 'win32'
    })
    proc.on('close', (code) => resolve(code === 0))
    proc.on('error', () => resolve(false))
  })
}

/**
 * claude --version 출력에서 버전 문자열 추출.
 * 실패 시 null.
 */
async function getClaudeVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    let output = ''
    const proc = spawn('claude', ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      shell: process.platform === 'win32'
    })
    proc.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8')
    })
    proc.on('close', (code) => {
      if (code !== 0) { resolve(null); return }
      // 버전 문자열: "claude X.Y.Z" 또는 "X.Y.Z" 패턴
      const match = output.trim().match(/(\d+\.\d+\.\d+[\w.-]*)/)
      resolve(match ? match[1] : output.trim() || null)
    })
    proc.on('error', () => resolve(null))
  })
}

// ── ClaudeAgentRun ─────────────────────────────────────────────────────────

/**
 * claude CLI 실행 핸들.
 * AgentRun 인터페이스 구현.
 *
 * events: stdout NDJSON 줄 단위 → mapClaudeStreamLine → AgentEvent.
 * abort(): 자식프로세스 트리 kill + generator 종료 신호.
 */
class ClaudeAgentRun implements AgentRun {
  readonly events: AsyncIterable<AgentEvent>
  private _abortController = { aborted: false }
  private _proc: ChildProcess | null = null
  // abort 신호를 generator에게 전달하기 위한 resolve 함수
  private _abortResolve: (() => void) | null = null

  constructor(req: AgentRunInput) {
    this.events = this._createEventStream(req)
  }

  abort(): void {
    // 멱등: 이미 abort됐으면 무시
    if (this._abortController.aborted) return
    this._abortController.aborted = true

    // abort 대기 중인 generator를 깨움
    if (this._abortResolve) {
      this._abortResolve()
      this._abortResolve = null
    }

    // 자식프로세스 트리 kill (좀비 방지)
    if (this._proc && !this._proc.killed) {
      try {
        // Windows: taskkill /F /T /PID, POSIX: kill SIGTERM
        if (process.platform === 'win32' && this._proc.pid) {
          // Windows에서 프로세스 트리 kill
          spawn('taskkill', ['/F', '/T', '/PID', String(this._proc.pid)], {
            stdio: 'ignore',
            shell: false
          })
        } else {
          // POSIX: SIGTERM → 자식프로세스가 정리할 기회 부여
          this._proc.kill('SIGTERM')
        }
      } catch {
        // kill 실패는 조용히 무시 (이미 종료된 프로세스일 수 있음)
      }
    }
  }

  /**
   * AsyncGenerator로 events 스트림 생성.
   *
   * 흐름:
   * 1. spawn 'claude' with -p 프롬프트
   * 2. stdout → 줄 단위 버퍼링
   * 3. 각 줄 JSON.parse → mapClaudeStreamLine → yield AgentEvent
   * 4. stderr/비정상 종료 → error 이벤트 yield
   * 5. 프로세스 종료 또는 abort 시 generator 종료
   */
  private async *_createEventStream(req: AgentRunInput): AsyncGenerator<AgentEvent> {
    // abort 전에 이미 aborted인 경우 즉시 종료
    if (this._abortController.aborted) return

    // 마지막 user 메시지를 프롬프트로 사용
    const lastUserMsg = req.messages
      .filter(m => m.role === 'user')
      .at(-1)

    if (!lastUserMsg) {
      yield { type: 'error', message: 'No user message found in AgentRunInput.messages' }
      yield { type: 'done' }
      return
    }

    const prompt = lastUserMsg.content

    // API 키: 환경변수에서만. 평문 로그/코드 금지.
    // ANTHROPIC_API_KEY가 process.env에 있으면 자동으로 상속됨.
    const env = { ...process.env }
    // 키 값 자체는 로그하지 않음 — env 객체만 spawn에 전달

    const args = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',
      // model/effort/mode → allowlist 검증 후 CLI 플래그로 변환 (run-args).
      // 미전달/미지 id는 생략 → CLI 기본값 사용. 순서: model → effort → permission-mode.
      ...buildRunArgs({ model: req.model, effort: req.effort, mode: req.mode })
    ]

    let proc: ChildProcess
    try {
      proc = spawn('claude', args, {
        cwd: req.workspaceRoot ?? process.cwd(),
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32'
      })
    } catch (spawnErr) {
      const msg = spawnErr instanceof Error ? spawnErr.message : String(spawnErr)
      yield { type: 'error', message: `Failed to spawn claude CLI: ${msg}` }
      yield { type: 'done' }
      return
    }

    this._proc = proc

    // abort가 이미 요청됐으면 즉시 kill
    if (this._abortController.aborted) {
      this.abort()
      return
    }

    // 이벤트 큐: stdout에서 받은 AgentEvent들을 버퍼링
    const eventQueue: AgentEvent[] = []
    let processEnded = false
    let processError: string | null = null
    let resolveNext: ((value: IteratorResult<AgentEvent>) => void) | null = null

    // stdout NDJSON 줄 단위 처리
    let stdoutBuf = ''
    if (!proc.stdout) {
      yield { type: 'error', message: 'claude CLI stdout is not available' }
      yield { type: 'done' }
      return
    }
    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (chunk: string) => {
      stdoutBuf += chunk
      const lines = stdoutBuf.split('\n')
      // 마지막 요소는 불완전한 줄일 수 있으므로 버퍼에 보관
      stdoutBuf = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const parsed: unknown = JSON.parse(trimmed)
          const events = mapClaudeStreamLine(parsed)
          for (const event of events) {
            if (resolveNext) {
              const r = resolveNext
              resolveNext = null
              r({ value: event, done: false })
            } else {
              eventQueue.push(event)
            }
          }
        } catch {
          // JSON 파싱 실패 줄 → 조용히 무시 (stderr 메시지나 비JSON 줄)
        }
      }
    })

    // stderr → error 이벤트로 수집 (즉시 yield 안 하고 close 시 판단)
    let stderrBuf = ''
    if (proc.stderr) {
      proc.stderr.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString('utf8')
      })
    }

    // 프로세스 종료 처리
    proc.on('close', (code) => {
      // stdout 버퍼 잔여분 처리
      if (stdoutBuf.trim()) {
        try {
          const parsed: unknown = JSON.parse(stdoutBuf.trim())
          const events = mapClaudeStreamLine(parsed)
          for (const event of events) {
            eventQueue.push(event)
          }
        } catch {
          // 무시
        }
      }

      // 비정상 종료이고 아직 done이 없으면 error 추가
      if (code !== 0 && code !== null) {
        const stderrMsg = stderrBuf.trim()
        processError = stderrMsg || `claude CLI exited with code ${code}`
      }

      processEnded = true

      if (resolveNext) {
        // 대기 중인 next() 호출이 있으면 처리
        if (eventQueue.length > 0) {
          const event = eventQueue.shift()!
          const r = resolveNext
          resolveNext = null
          r({ value: event, done: false })
        } else {
          const r = resolveNext
          resolveNext = null
          r({ value: undefined as unknown as AgentEvent, done: true })
        }
      }
    })

    proc.on('error', (err) => {
      processError = `claude CLI spawn error: ${err.message}`
      processEnded = true
      if (resolveNext) {
        const r = resolveNext
        resolveNext = null
        r({ value: undefined as unknown as AgentEvent, done: true })
      }
    })

    // Generator 본체: 큐에서 이벤트를 꺼내 yield
    while (true) {
      // abort 체크
      if (this._abortController.aborted) {
        return
      }

      if (eventQueue.length > 0) {
        yield eventQueue.shift()!
        continue
      }

      if (processEnded) {
        // 프로세스가 끝났고 큐도 비었음
        break
      }

      // 다음 이벤트를 기다림 (abort 또는 프로세스 이벤트 대기)
      const nextEvent = await new Promise<IteratorResult<AgentEvent>>((resolve) => {
        // abort 신호와 프로세스 이벤트 중 먼저 오는 것에 반응
        resolveNext = resolve

        // abort 대기 등록
        const prevAbortResolve = this._abortResolve
        this._abortResolve = () => {
          if (prevAbortResolve) prevAbortResolve()
          if (resolveNext === resolve) {
            resolveNext = null
            resolve({ value: undefined as unknown as AgentEvent, done: true })
          }
        }

        // 이미 aborted인지 재확인 (race condition 방지)
        if (this._abortController.aborted) {
          this._abortResolve = null
          resolveNext = null
          resolve({ value: undefined as unknown as AgentEvent, done: true })
          return
        }

        // processEnded가 이미 true인데 큐도 비어있는 경우
        if (processEnded && eventQueue.length === 0) {
          this._abortResolve = null
          resolveNext = null
          resolve({ value: undefined as unknown as AgentEvent, done: true })
          return
        }
      })

      if (nextEvent.done) break
      yield nextEvent.value
    }

    // 프로세스 에러가 있으면 error 이벤트 후 done
    if (processError) {
      yield { type: 'error', message: processError }
      yield { type: 'done' }
    }
  }
}

// ── ClaudeCodeBackend ─────────────────────────────────────────────────────────

/**
 * Claude Code CLI 어댑터.
 * AgentBackend 인터페이스 구현.
 *
 * 엔진 출력 → AgentEvent 매핑 표:
 * ┌──────────────────────────────────────┬───────────────────────────────────┐
 * │ 엔진 출력 (CLI stdout NDJSON)         │ AgentEvent                        │
 * ├──────────────────────────────────────┼───────────────────────────────────┤
 * │ type:"assistant" content[text]       │ { type:"text", delta }            │
 * │ type:"assistant" content[tool_use]   │ { type:"tool_call", id,name,input}│
 * │ type:"user" content[tool_result]     │ { type:"tool_result", id,ok,output│
 * │ type:"result" subtype:"success"      │ { type:"done", usage? }           │
 * │ type:"result" subtype:"error"        │ { type:"error", message }         │
 * │                                      │ + { type:"done" }                 │
 * │ type:"system" (init)                 │ [] (무시)                         │
 * │ JSON 파싱 실패 줄                    │ [] (무시)                         │
 * │ 비정상 종료 (exit code != 0)         │ { type:"error", message }         │
 * │                                      │ + { type:"done" }                 │
 * │ stderr 출력                          │ close 시 error로 포함             │
 * └──────────────────────────────────────┴───────────────────────────────────┘
 */
export class ClaudeCodeBackend implements AgentBackend {
  readonly id = 'claude-code' as const

  async isAvailable(): Promise<boolean> {
    return detectClaudeCli()
  }

  async version(): Promise<string | null> {
    return getClaudeVersion()
  }

  start(req: AgentRunInput): AgentRun {
    return new ClaudeAgentRun(req)
  }
}
