// 모델 목록 공급자 (M06 G4) — 앱에 든 Agent SDK의 `supportedModels()`로 모델 목록을 받는다.
// 받으면 사용자 데이터 폴더에 캐시하고, 실패하면 마지막 캐시, 캐시도 없으면 코드의 최소 목록을 쓴다.
// 목록은 프롬프트를 보내지 않는 짧은 세션으로 묻는다 — 모델 턴을 쓰지 않는다(4단계 실측: 약 1초, 응답 메시지 없음).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { FALLBACK_MODELS } from '@shared/03_Agent/models/knownModels'
import { sanitizeModelRows, type ModelListResponse, type ModelRow } from '@shared/03_Agent/models/modelList'

let _currentRows: readonly ModelRow[] = FALLBACK_MODELS

// main이 지금 아는 목록 — 실행 인자 검사(effort 단계, 짧은 별칭 허용)가 읽는다. 공급자가 목록을 얻을 때마다 바뀐다.
export function currentModelRows(): readonly ModelRow[] {
  return _currentRows
}

export function setCurrentModelRows(rows: readonly ModelRow[]): void {
  _currentRows = rows
}

type ListingQueryFn = (params: { prompt: AsyncIterable<unknown>; options?: unknown }) => unknown

export interface NoTurnListingOptions {
  cwd: string
  timeoutMs: number
  env?: Record<string, string | undefined>
}

// 프롬프트를 하나도 내보내지 않는 입력으로 세션을 열고 `supportedModels()`만 물은 뒤 바로 끊는다.
// 설정 소스를 비워 사용자·프로젝트 훅이 기동 때 돌지 않게 한다. 모델을 지정하지 않는다.
export async function fetchModelRowsWithoutTurn(queryFn: ListingQueryFn, opts: NoTurnListingOptions): Promise<unknown> {
  const abortController = new AbortController()
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  // 사용자 메시지를 하나도 내지 않고, 끊을 때 끝나는 입력.
  const noPrompt: AsyncIterable<never> = {
    [Symbol.asyncIterator]: () => ({
      next: async (): Promise<IteratorResult<never>> => {
        await held
        return { done: true, value: undefined }
      },
    }),
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  let closeHandle: (() => void) | undefined
  try {
    const handle = queryFn({
      prompt: noPrompt,
      options: {
        cwd: opts.cwd,
        abortController,
        settingSources: [],
        // 목록만 묻는 세션은 ~/.claude/projects에 기록을 남기지 않는다.
        persistSession: false,
        ...(opts.env ? { env: opts.env } : {}),
      },
    }) as (AsyncIterable<unknown> & { supportedModels?: () => Promise<unknown>; close?: () => void }) | null

    // 공개 타입의 Query.close()는 CLI 자식 프로세스까지 끝낸다 — 끝날 때 abort와 함께 부른다.
    if (handle && typeof handle.close === 'function') closeHandle = () => handle.close!()

    if (handle && typeof (handle as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function') {
      void (async () => {
        try {
          for await (const msg of handle) void msg
        } catch {
          // 끊을 때의 「Operation aborted」 거절은 정상 종료다.
        }
      })()
    }
    if (!handle || typeof handle.supportedModels !== 'function') {
      throw new Error('이 엔진은 supportedModels()를 내지 않는다')
    }
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`supportedModels() ${opts.timeoutMs}ms 안에 응답 없음`)), opts.timeoutMs)
    })
    return await Promise.race([handle.supportedModels(), timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    abortController.abort()
    release()
    try {
      closeHandle?.()
    } catch {
      // 이미 끝난 세션의 close 실패는 무시한다.
    }
  }
}

interface CacheFile {
  fetchedAt: string
  models: ModelRow[]
}

export interface ModelListProviderOptions {
  fetchRows: () => Promise<unknown>
  cacheFile: string | null
  now?: () => Date
}

export class ModelListProvider {
  private readonly _opts: ModelListProviderOptions
  private _loading: Promise<ModelListResponse> | null = null
  private _rows: readonly ModelRow[] = FALLBACK_MODELS

  constructor(opts: ModelListProviderOptions) {
    this._opts = opts
  }

  current(): readonly ModelRow[] {
    return this._rows
  }

  // SDK 목록을 받을 때까지는 호출마다 다시 묻고, 받은 뒤와 묻는 중에는 같은 결과를 나눈다(M06 Backlog 13).
  load(): Promise<ModelListResponse> {
    if (!this._loading) {
      this._loading = this._resolve()
      void this._loading.then((res) => {
        if (res.source !== 'sdk') this._loading = null
      })
    }
    return this._loading
  }

  private async _resolve(): Promise<ModelListResponse> {
    const res = (await this._fromSdk()) ?? this._fromCache() ?? { models: [...FALLBACK_MODELS], source: 'builtin' as const }
    this._rows = res.models
    setCurrentModelRows(res.models)
    return res
  }

  private async _fromSdk(): Promise<ModelListResponse | null> {
    let rows: ModelRow[]
    try {
      rows = sanitizeModelRows(await this._opts.fetchRows())
    } catch (err) {
      console.warn('[models] SDK 모델 목록 실패 — 캐시·최소 목록으로 물러난다:', err instanceof Error ? err.message : err)
      return null
    }
    if (rows.length === 0) {
      console.warn('[models] SDK 모델 목록이 비었거나 모양이 틀림 — 캐시를 덮어쓰지 않는다')
      return null
    }
    const fetchedAt = (this._opts.now?.() ?? new Date()).toISOString()
    this._writeCache({ fetchedAt, models: rows })
    return { models: rows, source: 'sdk', fetchedAt }
  }

  private _fromCache(): ModelListResponse | null {
    if (!this._opts.cacheFile) return null
    try {
      const parsed = JSON.parse(readFileSync(this._opts.cacheFile, 'utf8')) as Partial<CacheFile>
      const rows = sanitizeModelRows(parsed.models)
      if (rows.length === 0) return null
      return {
        models: rows,
        source: 'cache',
        ...(typeof parsed.fetchedAt === 'string' ? { fetchedAt: parsed.fetchedAt } : {}),
      }
    } catch {
      return null
    }
  }

  private _writeCache(data: CacheFile): void {
    if (!this._opts.cacheFile) return
    try {
      mkdirSync(dirname(this._opts.cacheFile), { recursive: true })
      writeFileSync(this._opts.cacheFile, JSON.stringify(data, null, 2))
    } catch (err) {
      console.warn('[models] 모델 목록 캐시 쓰기 실패:', err instanceof Error ? err.message : err)
    }
  }
}
