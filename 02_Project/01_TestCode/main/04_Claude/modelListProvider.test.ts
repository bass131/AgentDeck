// M06 G4 — main의 모델 목록 공급자. SDK 목록 → 캐시 → 최소 목록 순으로 물러난다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const h = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>() }))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (...a: unknown[]) => unknown): void => {
      h.handlers.set(ch, fn)
    },
  },
}))

vi.mock('@main/00_App/registry', () => ({
  getBackend: (): unknown => ({}),
}))

import {
  ModelListProvider,
  fetchModelRowsWithoutTurn,
  currentModelRows,
  setCurrentModelRows,
} from '@main/04_Claude/modelListProvider'
import { registerAgentHandlers } from '@main/01_Ipc/handlers/agent'
import type { RunManager } from '@main/03_Agent/agentRuns'
import { FALLBACK_MODELS } from '@shared/03_Agent/models/knownModels'
import { IPC_CHANNELS } from '../../../../02_Project/00_Source/shared/ipcContract'
import type { ModelListResponse } from '@shared/03_Agent/models/modelList'
import { SDK_MODEL_ROWS, SDK_MODEL_ROWS_RAW } from '../../shared/00_Helpers/sdkModelRows'

let dir: string
let cacheFile: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'g4-models-'))
  cacheFile = join(dir, 'model-list.json')
  setCurrentModelRows(FALLBACK_MODELS)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  setCurrentModelRows(FALLBACK_MODELS)
})

describe('ModelListProvider — SDK 목록을 받으면', () => {
  it('source=sdk로 14행을 돌려주고 캐시 파일에 쓴다', async () => {
    const provider = new ModelListProvider({ fetchRows: async () => SDK_MODEL_ROWS_RAW, cacheFile })
    const res = await provider.load()
    expect(res.source).toBe('sdk')
    expect(res.models).toEqual(SDK_MODEL_ROWS)
    const cached = JSON.parse(readFileSync(cacheFile, 'utf8')) as { models: unknown[] }
    expect(cached.models).toEqual(SDK_MODEL_ROWS)
  })

  it('main의 현재 목록(실행 인자 검사가 읽는 값)도 바뀐다', async () => {
    const provider = new ModelListProvider({ fetchRows: async () => SDK_MODEL_ROWS_RAW, cacheFile })
    await provider.load()
    expect(currentModelRows()).toEqual(SDK_MODEL_ROWS)
    expect(provider.current()).toEqual(SDK_MODEL_ROWS)
  })

  it('load()는 한 번만 묻는다 — 동시 호출이 같은 결과를 나눈다', async () => {
    const fetchRows = vi.fn(async () => SDK_MODEL_ROWS_RAW)
    const provider = new ModelListProvider({ fetchRows, cacheFile })
    const [a, b] = await Promise.all([provider.load(), provider.load()])
    expect(fetchRows).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })
})

describe('ModelListProvider — SDK 호출이 실패하면', () => {
  it('마지막 캐시로 뜬다 (source=cache)', async () => {
    await new ModelListProvider({ fetchRows: async () => SDK_MODEL_ROWS_RAW, cacheFile }).load()
    const provider = new ModelListProvider({
      fetchRows: async () => {
        throw new Error('network down')
      },
      cacheFile,
    })
    const res = await provider.load()
    expect(res.source).toBe('cache')
    expect(res.models).toEqual(SDK_MODEL_ROWS)
    expect(currentModelRows()).toEqual(SDK_MODEL_ROWS)
  })

  it('캐시도 없으면 최소 목록으로 뜬다 (source=builtin)', async () => {
    const provider = new ModelListProvider({
      fetchRows: async () => {
        throw new Error('sdk missing')
      },
      cacheFile,
    })
    const res = await provider.load()
    expect(res.source).toBe('builtin')
    expect(res.models).toEqual(FALLBACK_MODELS)
    expect(existsSync(cacheFile)).toBe(false)
  })

  it('캐시가 깨졌으면 최소 목록으로 뜬다', async () => {
    writeFileSync(cacheFile, '{ not json')
    const provider = new ModelListProvider({ fetchRows: async () => Promise.reject(new Error('x')), cacheFile })
    expect((await provider.load()).source).toBe('builtin')
  })

  it('빈 목록·모양이 틀린 응답은 실패로 보고 캐시를 덮어쓰지 않는다', async () => {
    await new ModelListProvider({ fetchRows: async () => SDK_MODEL_ROWS_RAW, cacheFile }).load()
    for (const bad of [[], [{ nope: 1 }], { models: [] }, null]) {
      const res = await new ModelListProvider({ fetchRows: async () => bad, cacheFile }).load()
      expect(res.source, JSON.stringify(bad)).toBe('cache')
    }
    const cached = JSON.parse(readFileSync(cacheFile, 'utf8')) as { models: unknown[] }
    expect(cached.models).toHaveLength(14)
  })

  it('캐시 경로가 없어도(null) 최소 목록으로 뜬다', async () => {
    const provider = new ModelListProvider({ fetchRows: async () => Promise.reject(new Error('x')), cacheFile: null })
    expect((await provider.load()).source).toBe('builtin')
  })

  // M11 G2 — M06 Backlog 13. 시작 때 실패한 결과를 재시작 전까지 붙들고 있었다.
  it('SDK 목록을 못 받았으면 다음 load()가 다시 묻고, 받은 뒤에는 더 묻지 않는다', async () => {
    const fetchRows = vi.fn()
      .mockRejectedValueOnce(new Error('cold start'))
      .mockResolvedValue(SDK_MODEL_ROWS_RAW)
    const provider = new ModelListProvider({ fetchRows, cacheFile })
    expect((await provider.load()).source).toBe('builtin')
    const second = await provider.load()
    expect(second.source).toBe('sdk')
    expect(currentModelRows()).toEqual(SDK_MODEL_ROWS)
    await provider.load()
    expect(fetchRows).toHaveBeenCalledTimes(2)
  })

  it('다시 묻는 중의 동시 호출은 한 번만 묻는다', async () => {
    const fetchRows = vi.fn()
      .mockRejectedValueOnce(new Error('cold start'))
      .mockResolvedValue(SDK_MODEL_ROWS_RAW)
    const provider = new ModelListProvider({ fetchRows, cacheFile })
    await provider.load()
    const [a, b] = await Promise.all([provider.load(), provider.load()])
    expect(a).toBe(b)
    expect(fetchRows).toHaveBeenCalledTimes(2)
  })
})

describe('fetchModelRowsWithoutTurn — 프롬프트 없이 목록만 묻는다', () => {
  function fakeQuery(rows: Promise<unknown>): {
    queryFn: (p: { prompt: AsyncIterable<unknown>; options?: unknown }) => unknown
    seen: { prompt?: AsyncIterable<unknown>; options?: Record<string, unknown> }
  } {
    const seen: { prompt?: AsyncIterable<unknown>; options?: Record<string, unknown> } = {}
    const queryFn = (p: { prompt: AsyncIterable<unknown>; options?: unknown }): unknown => {
      seen.prompt = p.prompt
      seen.options = p.options as Record<string, unknown>
      const signal = (p.options as { abortController: AbortController }).abortController.signal
      // 메시지 없이 끊길 때까지 기다리는 세션 스트림.
      const iterable = {
        [Symbol.asyncIterator]: () => ({
          next: async (): Promise<IteratorResult<unknown>> => {
            await new Promise<void>((r) => signal.addEventListener('abort', () => r()))
            return { done: true, value: undefined }
          },
        }),
      }
      return Object.assign(iterable, { supportedModels: () => rows })
    }
    return { queryFn, seen }
  }

  it('supportedModels() 값을 돌려주고 사용자 메시지를 하나도 내보내지 않으며 끝나면 끊는다', async () => {
    const { queryFn, seen } = fakeQuery(Promise.resolve(SDK_MODEL_ROWS_RAW))
    const rows = await fetchModelRowsWithoutTurn(queryFn, { cwd: dir, timeoutMs: 1000 })
    expect(rows).toBe(SDK_MODEL_ROWS_RAW)
    const ac = (seen.options as { abortController: AbortController }).abortController
    expect(ac.signal.aborted).toBe(true)
    const first = await seen.prompt![Symbol.asyncIterator]().next()
    expect(first.done).toBe(true)
  })

  it('설정 소스를 비워 프로젝트 훅이 기동 때 돌지 않게 하고 중립 cwd를 쓴다', async () => {
    const { queryFn, seen } = fakeQuery(Promise.resolve(SDK_MODEL_ROWS_RAW))
    await fetchModelRowsWithoutTurn(queryFn, { cwd: dir, timeoutMs: 1000 })
    expect(seen.options?.['settingSources']).toEqual([])
    expect(seen.options?.['cwd']).toBe(dir)
    expect(seen.options?.['model']).toBeUndefined()
  })

  // G4 검수: 앱을 켤 때마다 ~/.claude/projects에 목록용 세션 기록을 남기지 않는다(공개 옵션 persistSession).
  it('세션 기록을 디스크에 남기지 않는다(persistSession: false)', async () => {
    const { queryFn, seen } = fakeQuery(Promise.resolve(SDK_MODEL_ROWS_RAW))
    await fetchModelRowsWithoutTurn(queryFn, { cwd: dir, timeoutMs: 1000 })
    expect(seen.options?.['persistSession']).toBe(false)
  })

  // G4 검수: 공개 타입의 Query.close()는 CLI 자식 프로세스까지 끝낸다 — 성공·시간 초과 모두 부른다.
  it('끝나면 close()로 자식 프로세스를 정리한다(성공·시간 초과)', async () => {
    for (const rows of [Promise.resolve(SDK_MODEL_ROWS_RAW), new Promise(() => {})]) {
      let closed = 0
      const { queryFn } = fakeQuery(rows)
      const withClose = (p: { prompt: AsyncIterable<unknown>; options?: unknown }): unknown =>
        Object.assign(queryFn(p) as object, { close: () => { closed++ } })
      await fetchModelRowsWithoutTurn(withClose, { cwd: dir, timeoutMs: 30 }).catch(() => {})
      expect(closed).toBe(1)
    }
  })

  it('close()가 없는 엔진 핸들이어도 목록을 돌려준다', async () => {
    const { queryFn } = fakeQuery(Promise.resolve(SDK_MODEL_ROWS_RAW))
    await expect(fetchModelRowsWithoutTurn(queryFn, { cwd: dir, timeoutMs: 1000 })).resolves.toBe(SDK_MODEL_ROWS_RAW)
  })

  it('끊기 전에는 입력이 아무것도 내지 않는다(대기 중)', async () => {
    let release: (v: unknown) => void = () => {}
    const { queryFn, seen } = fakeQuery(new Promise((r) => { release = r }))
    const pending = fetchModelRowsWithoutTurn(queryFn, { cwd: dir, timeoutMs: 1000 })
    await new Promise((r) => setTimeout(r, 10))
    const race = await Promise.race([
      seen.prompt![Symbol.asyncIterator]().next().then(() => 'yielded'),
      new Promise((r) => setTimeout(() => r('waiting'), 30)),
    ])
    expect(race).toBe('waiting')
    release(SDK_MODEL_ROWS_RAW)
    await pending
  })

  it('응답이 없으면 시간 초과로 실패하고 끊는다', async () => {
    const { queryFn, seen } = fakeQuery(new Promise(() => {}))
    await expect(fetchModelRowsWithoutTurn(queryFn, { cwd: dir, timeoutMs: 30 })).rejects.toThrow()
    expect((seen.options as { abortController: AbortController }).abortController.signal.aborted).toBe(true)
  })

  it('supportedModels가 없는 엔진이면 실패한다', async () => {
    const queryFn = (): unknown => ({
      [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }),
    })
    await expect(fetchModelRowsWithoutTurn(queryFn, { cwd: dir, timeoutMs: 100 })).rejects.toThrow()
  })
})

describe('agent.listModels IPC', () => {
  it('채널 이름이 계약에 있다', () => {
    expect(IPC_CHANNELS.AGENT_LIST_MODELS).toBe('agent.listModels')
  })

  it('핸들러가 공급자의 목록을 그대로 돌려준다', async () => {
    const response: ModelListResponse = { models: SDK_MODEL_ROWS, source: 'sdk' }
    h.handlers.clear()
    registerAgentHandlers({
      state: { win: null },
      runManager: {} as unknown as RunManager,
      getModelList: async () => response,
    })
    const handler = h.handlers.get(IPC_CHANNELS.AGENT_LIST_MODELS)
    expect(handler).toBeTypeOf('function')
    expect(await handler!({} as never)).toBe(response)
  })

  it('공급자가 배선되지 않았으면 최소 목록을 builtin으로 준다', async () => {
    h.handlers.clear()
    registerAgentHandlers({ state: { win: null }, runManager: {} as unknown as RunManager })
    const res = (await h.handlers.get(IPC_CHANNELS.AGENT_LIST_MODELS)!({} as never)) as ModelListResponse
    expect(res).toEqual({ models: [...FALLBACK_MODELS], source: 'builtin' })
  })
})
