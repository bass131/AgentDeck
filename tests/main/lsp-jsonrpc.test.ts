/**
 * lsp-jsonrpc.test.ts — StdioRpc 단위 테스트
 *
 * electron import 없음 → vitest node 환경에서 직접 실행.
 * mock ChildProcess 로 Content-Length 프레이밍·요청-응답 상관관계·알림·타임아웃·
 * dispose 후 fast-fail 등 핵심 동작을 검증한다.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { StdioRpc } from '../../src/main/lsp/jsonrpc'

// ── Mock ChildProcess 헬퍼 ──────────────────────────────────────────────────

interface MockChildProcess {
  stdin: { write: ReturnType<typeof vi.fn> }
  stdout: EventEmitter
  pid: number
  emit: (event: string, ...args: unknown[]) => boolean
  on: (event: string, handler: (...args: unknown[]) => void) => MockChildProcess
  _handlers: Map<string, ((...args: unknown[]) => void)[]>
}

function makeMockChild(): MockChildProcess {
  const stdout = new EventEmitter()
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>()
  return {
    stdin: { write: vi.fn() },
    stdout,
    pid: 12345,
    _handlers: handlers,
    emit(event, ...args) {
      return stdout.emit(event, ...args)
    },
    on(event, handler) {
      const list = handlers.get(event) ?? []
      list.push(handler)
      handlers.set(event, list)
      return this
    }
  }
}

/** Content-Length 프레임 인코딩 */
function encodeFrame(obj: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(obj), 'utf8')
  const header = `Content-Length: ${body.length}\r\n\r\n`
  return Buffer.concat([Buffer.from(header, 'ascii'), body])
}

/** mock child의 stdout에 데이터를 주입해 StdioRpc가 수신한 것처럼 시뮬레이션 */
function feed(child: MockChildProcess, obj: unknown): void {
  child.stdout.emit('data', encodeFrame(obj))
}

describe('StdioRpc', () => {
  let child: MockChildProcess
  let rpc: StdioRpc

  beforeEach(() => {
    child = makeMockChild()
    rpc = new StdioRpc(child as never)
  })

  // ── 기본 요청-응답 상관관계 ──────────────────────────────────────────────────

  it('request: id가 일치하는 result 메시지를 받으면 resolve한다', async () => {
    const p = rpc.request<string>('textDocument/hover', { x: 1 }, 1000)
    // stdin.write 첫 번째 호출에서 id 추출
    const calls = child.stdin.write.mock.calls
    // 첫 write: 헤더, 두 번째 write: body
    const bodyBuf = calls[1][0] as Buffer
    const sent = JSON.parse(bodyBuf.toString('utf8')) as { id: number }
    // mock 응답 주입
    feed(child, { jsonrpc: '2.0', id: sent.id, result: 'hello' })
    await expect(p).resolves.toBe('hello')
  })

  it('request: error 응답이 오면 reject한다', async () => {
    const p = rpc.request<string>('textDocument/hover', {}, 1000)
    const bodyBuf = child.stdin.write.mock.calls[1][0] as Buffer
    const sent = JSON.parse(bodyBuf.toString('utf8')) as { id: number }
    feed(child, { jsonrpc: '2.0', id: sent.id, error: { code: -32601, message: 'Method not found' } })
    await expect(p).rejects.toThrow('Method not found')
  })

  it('notify: stdin에 id 없는 메시지를 쓴다', () => {
    rpc.notify('initialized', {})
    const calls = child.stdin.write.mock.calls
    const bodyBuf = calls[1][0] as Buffer
    const sent = JSON.parse(bodyBuf.toString('utf8')) as { id?: unknown; method: string }
    expect(sent.id).toBeUndefined()
    expect(sent.method).toBe('initialized')
  })

  // ── Content-Length 프레이밍 ─────────────────────────────────────────────────

  it('stdout에서 분할된 청크로 들어와도 메시지를 조립한다', async () => {
    const p = rpc.request<number>('test/method', {}, 1000)
    const bodyBuf = child.stdin.write.mock.calls[1][0] as Buffer
    const sent = JSON.parse(bodyBuf.toString('utf8')) as { id: number }

    const frame = encodeFrame({ jsonrpc: '2.0', id: sent.id, result: 42 })
    // 청크를 반으로 나눠 전달
    child.stdout.emit('data', frame.subarray(0, 10))
    child.stdout.emit('data', frame.subarray(10))

    await expect(p).resolves.toBe(42)
  })

  it('연속된 두 메시지를 하나의 청크로 받아도 각각 dispatch한다', async () => {
    const p1 = rpc.request<string>('m1', {}, 1000)
    const calls1 = child.stdin.write.mock.calls.slice(0)
    const body1 = JSON.parse((calls1[1][0] as Buffer).toString('utf8')) as { id: number }

    const p2 = rpc.request<string>('m2', {}, 1000)
    const calls2 = child.stdin.write.mock.calls.slice(0)
    const body2 = JSON.parse((calls2[3][0] as Buffer).toString('utf8')) as { id: number }

    const combined = Buffer.concat([
      encodeFrame({ jsonrpc: '2.0', id: body1.id, result: 'r1' }),
      encodeFrame({ jsonrpc: '2.0', id: body2.id, result: 'r2' })
    ])
    child.stdout.emit('data', combined)

    await expect(p1).resolves.toBe('r1')
    await expect(p2).resolves.toBe('r2')
  })

  // ── 서버 → 클라이언트 요청 ──────────────────────────────────────────────────

  it('onRequest: 서버가 request를 보내면 onRequest 핸들러를 호출하고 result를 stdin에 쓴다', async () => {
    rpc.onRequest = vi.fn().mockReturnValue({ data: [null] })

    // 서버가 workspace/configuration 요청을 보냄
    feed(child, { jsonrpc: '2.0', id: 99, method: 'workspace/configuration', params: { items: [{}] } })

    // onRequest 호출을 기다림 (Promise.resolve 안에서 실행됨)
    await Promise.resolve()
    await Promise.resolve()

    expect(rpc.onRequest).toHaveBeenCalledWith('workspace/configuration', { items: [{}] })

    // result가 stdin에 기록됐는지 확인
    const writeCalls = child.stdin.write.mock.calls
    const lastBodyBuf = writeCalls[writeCalls.length - 1][0] as Buffer
    const response = JSON.parse(lastBodyBuf.toString('utf8')) as { id: number; result: unknown }
    expect(response.id).toBe(99)
  })

  // ── 알림 ─────────────────────────────────────────────────────────────────────

  it('onNotify: 서버가 notification을 보내면 onNotify 핸들러를 호출한다', () => {
    const handler = vi.fn()
    rpc.onNotify = handler

    feed(child, { jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri: 'file:///a.ts' } })

    expect(handler).toHaveBeenCalledWith('textDocument/publishDiagnostics', { uri: 'file:///a.ts' })
  })

  // ── 타임아웃 ─────────────────────────────────────────────────────────────────

  it('timeout: 응답이 없으면 지정된 시간 후 reject한다', async () => {
    vi.useFakeTimers()
    const p = rpc.request<unknown>('slow/method', {}, 50)
    vi.advanceTimersByTime(100)
    await expect(p).rejects.toThrow(/시간 초과/)
    vi.useRealTimers()
  })

  // ── dispose ───────────────────────────────────────────────────────────────────

  it('dispose: 미완료 요청을 모두 reject하고 이후 request가 fast-fail한다', async () => {
    const p = rpc.request<unknown>('pending/method', {}, 5000)
    rpc.dispose('테스트 dispose')

    await expect(p).rejects.toThrow('테스트 dispose')

    // dispose 이후 새 요청도 즉시 reject
    await expect(rpc.request('another', {})).rejects.toThrow()
  })

  it('dispose 이후 notify는 아무 동작도 하지 않는다', () => {
    rpc.dispose('done')
    const callCount = child.stdin.write.mock.calls.length
    rpc.notify('test', {})
    // stdin.write가 더 이상 호출되지 않아야 함
    expect(child.stdin.write.mock.calls.length).toBe(callCount)
  })

  // ── 악성/불량 프레임 ─────────────────────────────────────────────────────────

  it('잘못된 JSON 프레임은 읽기 루프를 깨지 않고 스킵한다', async () => {
    const p = rpc.request<string>('ok/method', {}, 1000)
    const bodyBuf = child.stdin.write.mock.calls[1][0] as Buffer
    const sent = JSON.parse(bodyBuf.toString('utf8')) as { id: number }

    // 불량 JSON 먼저
    const badBody = Buffer.from('NOT_JSON', 'utf8')
    const badHeader = Buffer.from(`Content-Length: ${badBody.length}\r\n\r\n`, 'ascii')
    child.stdout.emit('data', Buffer.concat([badHeader, badBody]))

    // 정상 응답
    feed(child, { jsonrpc: '2.0', id: sent.id, result: 'ok' })

    await expect(p).resolves.toBe('ok')
  })
})
