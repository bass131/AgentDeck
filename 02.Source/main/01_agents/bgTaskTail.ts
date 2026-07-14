/**
 * bgTaskTail.ts — 백그라운드 태스크 output 파일 증분 tail 폴러 (GAP1 P09)
 *
 * 배경(P09 tail 모델 확정 — 하이브리드): SDK 스트림은 백그라운드 태스크의
 * 생명주기(task_started/task_updated/task_notification) + output 파일 *경로*만
 * 운반하고, 증분 출력 *내용*은 세션 tasks/{taskId}.output 파일에만 쌓인다
 * (probe④ 실측 — sdk.d.ts상 호스트측 출력 폴링 메서드 없음). 따라서 라이브 tail은
 * main 측이 그 파일을 주기 폴링해 "새로 늘어난 부분"만 읽어내
 * `bg_task { kind:'output' }` 조각(AgentEventBgTask.outputChunk)으로 합성한다.
 *
 * 계약(RED 테스트 = gap1-p09-bg-task-tail.test.ts가 시그니처 정본):
 *  - startBgTaskTail(opts): BgTaskTailHandle — intervalMs(기본 750) 주기 폴링.
 *  - 증분만 방출(오프셋 관리) — 전체 재방출 금지.
 *  - maxChunkBytes(기본 65536): 1회 폴링 조각 상한. 상한 컷 발생 시 outputTruncated.
 *  - maxTotalBytes(기본 1048576): 태스크 누적 상한 — 도달 후 조각 방출 전면 중지
 *    (장시간 dev 서버 로그의 메모리·렌더 성능 보호).
 *  - stop(finalFlush): finalFlush=true면 잔여분을 조각 단위로 전부 flush 후 정지.
 *    멱등(재호출 안전) + 타이머 누수 0(정지 후 방출 0).
 *  - 파일 미존재/폴링 도중 삭제 → throw 없이 조용히 skip(graceful).
 *  - 파일 축소(로테이션) → 오프셋 리셋 후 처음부터 다시 tail(graceful).
 *
 * CORE-01(신뢰경계): fs 접근은 main 프로세스 단독 — 이 모듈은 01_agents 내부
 * (claudeAgentRun 펌프)에서만 사용한다. renderer로는 정규화된 AgentEvent만 흐른다.
 *
 * 알려진 한계(주석으로 명시):
 *  - 오프셋은 바이트 단위, 디코딩은 utf8 — 멀티바이트 문자가 조각 경계(maxChunkBytes
 *    컷)에 걸리면 그 조각의 끝/다음 조각의 앞이 U+FFFD로 깨질 수 있다(셸 로그는
 *    대부분 ASCII/짧은 줄이라 실용상 드묾 — 정밀 경계 처리는 필요 시 후속).
 */

import { open, stat } from 'node:fs/promises'
import type { AgentEventBgTask } from '../../shared/agent-events'

// ── 기본값 상수 (옵션 미지정 시) ───────────────────────────────────────────────

/** 폴링 주기 기본값(ms) — 너무 잦으면 IO 부하, 너무 뜸하면 라이브감 손실(trade-off). */
export const DEFAULT_TAIL_INTERVAL_MS = 750
/** 1회 폴링 조각 상한(바이트) — 단일 IPC 이벤트가 비대해지는 것을 막는다. */
export const DEFAULT_MAX_CHUNK_BYTES = 65536
/** 태스크 누적 방출 상한(바이트) — 장시간 로그의 무한 성장으로부터 소비자를 보호. */
export const DEFAULT_MAX_TOTAL_BYTES = 1048576

// ── 공개 타입 ─────────────────────────────────────────────────────────────────

export interface BgTaskTailOptions {
  /** 이 tail이 귀속되는 백그라운드 태스크 id (bg_task 이벤트 taskId 그대로). */
  taskId: string
  /** 폴링 대상 output 파일 절대경로 (세션 tasks/{taskId}.output). */
  outputFile: string
  /** kind='output' 조각 방출 콜백 — 호출자(펌프)가 push-queue에 적재한다. */
  emit: (ev: AgentEventBgTask) => void
  /** 폴링 주기(ms). 기본 {@link DEFAULT_TAIL_INTERVAL_MS}. */
  intervalMs?: number
  /** 1회 폴링 조각 상한(바이트). 기본 {@link DEFAULT_MAX_CHUNK_BYTES}. */
  maxChunkBytes?: number
  /** 태스크 누적 상한(바이트). 기본 {@link DEFAULT_MAX_TOTAL_BYTES}. */
  maxTotalBytes?: number
}

export interface BgTaskTailHandle {
  /**
   * tail 정지. finalFlush=true면 아직 폴링되지 않은 잔여분을 조각 단위로 전부
   * flush한 뒤 정지한다. 멱등 — 재호출 시 즉시 resolve(재-flush 없음).
   * 이 Promise는 절대 reject하지 않는다(정리 경로 안전).
   */
  stop(finalFlush?: boolean): Promise<void>
}

// ── 구현 ─────────────────────────────────────────────────────────────────────

class Tailer {
  private readonly _taskId: string
  private readonly _outputFile: string
  private readonly _emit: (ev: AgentEventBgTask) => void
  private readonly _intervalMs: number
  private readonly _maxChunkBytes: number
  private readonly _maxTotalBytes: number

  /** 다음 읽기 시작 바이트 오프셋(증분 관리의 정본). */
  private _offset = 0
  /** 지금까지 방출한 총 바이트(누적 상한 판정). */
  private _totalEmitted = 0
  /** 누적 상한 도달 — 이후 조각 방출 전면 중지(폴링 자체도 재스케줄 안 함). */
  private _capReached = false
  /** stop() 호출됨 — 이후 스케줄/방출 금지. */
  private _stopped = false
  /** 대기 중인 폴링 타이머(누수 0 보장 — stop에서 반드시 clear). */
  private _timer: ReturnType<typeof setTimeout> | null = null
  /** 진행 중인 폴링 IO — stop이 await해 "stop 후 늦은 방출"을 봉쇄한다. */
  private _inflight: Promise<void> = Promise.resolve()

  constructor(opts: BgTaskTailOptions) {
    this._taskId = opts.taskId
    this._outputFile = opts.outputFile
    this._emit = opts.emit
    this._intervalMs = opts.intervalMs ?? DEFAULT_TAIL_INTERVAL_MS
    this._maxChunkBytes = opts.maxChunkBytes ?? DEFAULT_MAX_CHUNK_BYTES
    this._maxTotalBytes = opts.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES
  }

  /** 다음 폴링 1회를 예약한다(폴링 완료 후 자기재귀 — setInterval 겹침 회피). */
  schedule(): void {
    if (this._stopped || this._capReached) return
    this._timer = setTimeout(() => {
      this._timer = null
      // 폴링 IO를 _inflight로 캡처 — stop()이 이 Promise를 await해 경합을 닫는다.
      this._inflight = this._pollOnce()
        .catch(() => {
          /* 폴링 실패는 조용히 skip(graceful) — 다음 틱에 재시도 */
        })
        .finally(() => this.schedule())
    }, this._intervalMs)
  }

  async stop(finalFlush: boolean): Promise<void> {
    if (this._stopped) return // 멱등 — 재호출 시 재-flush 없음
    this._stopped = true
    if (this._timer !== null) {
      clearTimeout(this._timer)
      this._timer = null
    }
    // 진행 중이던 폴링 IO 완주 대기 — 이 stop()이 resolve된 뒤 방출은 0이다.
    try {
      await this._inflight
    } catch {
      /* _inflight는 자체 catch로 보호되지만 방어적으로 삼킨다 */
    }
    if (finalFlush) {
      try {
        await this._drainAll()
      } catch {
        /* finalFlush 실패(파일 소실 등)도 조용히 — 정리 경로는 절대 throw 금지 */
      }
    }
  }

  /** 주기 폴링 1회 — 조각 1개까지만 읽는다(조각 상한은 다음 틱으로 이월). */
  private async _pollOnce(): Promise<void> {
    if (this._stopped || this._capReached) return
    await this._readNextChunk()
  }

  /** 잔여분 전부 flush(stop(true) 전용) — 조각 단위 반복(조각 상한 계약 유지). */
  private async _drainAll(): Promise<void> {
    for (;;) {
      if (this._capReached) return
      const emitted = await this._readNextChunk()
      if (!emitted) return
    }
  }

  /**
   * 오프셋부터 조각 1개(≤ maxChunkBytes, ≤ 남은 누적 예산)를 읽어 방출한다.
   * @returns 조각을 방출했으면 true(잔여 가능성 있음), 아니면 false.
   */
  private async _readNextChunk(): Promise<boolean> {
    // stat: 파일 미존재/삭제 → 조용히 skip(폴러 생존 — 다음 틱 재시도).
    let size: number
    try {
      size = (await stat(this._outputFile)).size
    } catch {
      return false
    }

    // 로테이션(파일이 기존 오프셋보다 작아짐) → 오프셋 리셋, 처음부터 다시 tail.
    if (size < this._offset) {
      this._offset = 0
    }

    const avail = size - this._offset
    if (avail <= 0) return false

    const budget = this._maxTotalBytes - this._totalEmitted
    if (budget <= 0) {
      this._capReached = true
      return false
    }

    const len = Math.min(avail, this._maxChunkBytes, budget)
    let bytesRead = 0
    const buf = Buffer.alloc(len)
    try {
      const fh = await open(this._outputFile, 'r')
      try {
        const res = await fh.read(buf, 0, len, this._offset)
        bytesRead = res.bytesRead
      } finally {
        await fh.close()
      }
    } catch {
      // open/read 실패(삭제 경합 등) → 조용히 skip.
      return false
    }
    if (bytesRead <= 0) return false

    this._offset += bytesRead
    this._totalEmitted += bytesRead
    if (this._totalEmitted >= this._maxTotalBytes) {
      this._capReached = true
    }
    // 절단 표시: 이번 읽기가 가용분을 다 싣지 못했다(조각 상한 컷 또는 누적 예산 컷).
    const truncated = bytesRead < avail

    const event: AgentEventBgTask = {
      type: 'bg_task',
      kind: 'output',
      taskId: this._taskId,
      outputChunk: buf.subarray(0, bytesRead).toString('utf8'),
      ...(truncated ? { outputTruncated: true } : {}),
    }
    this._emit(event)
    return true
  }
}

/**
 * output 파일 증분 tail을 시작한다.
 *
 * 즉시 폴링하지 않고 intervalMs 후 첫 폴링을 수행한다(스케줄 균일).
 * 반환 핸들의 stop()으로 반드시 정지시켜야 한다 — 호출자(claudeAgentRun)가
 * task_notification/abort/펌프 종료 시 정지 책임을 진다(타이머 누수 0).
 */
export function startBgTaskTail(opts: BgTaskTailOptions): BgTaskTailHandle {
  const tailer = new Tailer(opts)
  tailer.schedule()
  return {
    stop: (finalFlush = false) => tailer.stop(finalFlush),
  }
}
