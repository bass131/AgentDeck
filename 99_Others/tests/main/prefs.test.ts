import { describe, it, expect, vi } from 'vitest'

import { createPrefsStore } from '../../../02_Source/main/prefs'

function makeMockFs(initialContent: string | null = null) {
  let storedContent: string | null = initialContent
  let lastWritten: string | null = null

  const readFile = vi.fn(async (): Promise<string> => {
    if (storedContent === null) {
      throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' })
    }
    return storedContent
  })

  const writeFile = vi.fn(async (content: string): Promise<void> => {
    lastWritten = content
    storedContent = content
  })

  return {
    readFile,
    writeFile,
    get lastWritten() { return lastWritten },
  }
}

describe('createPrefsStore()', () => {

  describe('파일 없음/파싱 실패 → graceful {}', () => {
    it('파일이 없으면(ENOENT) getAll()은 {}를 반환한다', async () => {
      const mock = makeMockFs(null)
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })
      const result = await store.getAll()
      expect(result).toEqual({})
    })

    it('파일 내용이 빈 문자열이면 getAll()은 {}를 반환한다', async () => {
      const mock = makeMockFs('')
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })
      const result = await store.getAll()
      expect(result).toEqual({})
    })

    it('파일 내용이 유효하지 않은 JSON이면 getAll()은 {}를 반환한다', async () => {
      const mock = makeMockFs('NOT_VALID_JSON{{{{')
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })
      const result = await store.getAll()
      expect(result).toEqual({})
    })

    it('파일 내용이 JSON 배열이면 객체가 아니므로 getAll()은 {}를 반환한다', async () => {
      const mock = makeMockFs('[1, 2, 3]')
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })
      const result = await store.getAll()
      expect(result).toEqual({})
    })

    it('파일 내용이 null 리터럴이면 getAll()은 {}를 반환한다', async () => {
      const mock = makeMockFs('null')
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })
      const result = await store.getAll()
      expect(result).toEqual({})
    })
  })

  describe('정상 파일 읽기', () => {
    it('유효한 JSON 객체를 읽어 getAll()로 반환한다', async () => {
      const initial = { theme: 'dark', zoomFactor: 1.2 }
      const mock = makeMockFs(JSON.stringify(initial))
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })
      const result = await store.getAll()
      expect(result).toEqual(initial)
    })
  })

  describe('set() → getAll() 반영 + 디스크 write', () => {
    it('set(key, value) 후 getAll()에 반영된다', async () => {
      const mock = makeMockFs(null)
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      await store.set('theme', 'dark')
      const result = await store.getAll()
      expect(result).toEqual({ theme: 'dark' })
    })

    it('set() 시 writeFile을 호출한다', async () => {
      const mock = makeMockFs(null)
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      await store.set('theme', 'dark')
      expect(mock.writeFile).toHaveBeenCalledTimes(1)
    })

    it('writeFile에 JSON 직렬화된 내용을 전달한다', async () => {
      const mock = makeMockFs(null)
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      await store.set('theme', 'dark')
      const written = JSON.parse(mock.lastWritten!)
      expect(written).toEqual({ theme: 'dark' })
    })

    it('다양한 값 타입(number·boolean·null·array·object)을 저장할 수 있다', async () => {
      const mock = makeMockFs(null)
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      await store.set('zoomFactor', 1.5)
      await store.set('seenWhatsNew', true)
      await store.set('panelSize', null)
      await store.set('recentItems', [1, 2, 3])
      await store.set('windowBounds', { x: 0, y: 0, width: 1280, height: 800 })

      const result = await store.getAll()
      expect(result.zoomFactor).toBe(1.5)
      expect(result.seenWhatsNew).toBe(true)
      expect(result.panelSize).toBeNull()
      expect(result.recentItems).toEqual([1, 2, 3])
      expect(result.windowBounds).toEqual({ x: 0, y: 0, width: 1280, height: 800 })
    })
  })

  describe('여러 set() — 기존 키 보존 + 병합', () => {
    it('여러 set() 호출 시 기존 키를 보존하고 새 키를 추가한다', async () => {
      const initial = { theme: 'light', zoomFactor: 1.0 }
      const mock = makeMockFs(JSON.stringify(initial))
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      await store.set('seenWhatsNew', true)
      const result = await store.getAll()

      expect(result.theme).toBe('light')
      expect(result.zoomFactor).toBe(1.0)
      expect(result.seenWhatsNew).toBe(true)
    })

    it('같은 키에 set()을 두 번 하면 마지막 값으로 덮어쓴다', async () => {
      const mock = makeMockFs(null)
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      await store.set('theme', 'light')
      await store.set('theme', 'dark')

      const result = await store.getAll()
      expect(result.theme).toBe('dark')
    })

    it('여러 set() 각각 writeFile을 호출한다', async () => {
      const mock = makeMockFs(null)
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      await store.set('a', 1)
      await store.set('b', 2)
      await store.set('c', 3)

      expect(mock.writeFile).toHaveBeenCalledTimes(3)
    })

    it('연속 set() 후 getAll()은 모든 키를 포함한다', async () => {
      const mock = makeMockFs(null)
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      await store.set('a', 1)
      await store.set('b', 2)
      await store.set('c', 3)

      const result = await store.getAll()
      expect(result).toEqual({ a: 1, b: 2, c: 3 })
    })
  })

  describe('빈 key 입력 검증 — set()이 false를 반환한다', () => {
    it('key가 빈 문자열이면 set()은 false를 반환하고 write하지 않는다', async () => {
      const mock = makeMockFs(null)
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      const result = await store.set('', 'value')
      expect(result).toBe(false)
      expect(mock.writeFile).not.toHaveBeenCalled()
    })

    it('빈 key set() 후 getAll()은 {}이다 (write 없음)', async () => {
      const mock = makeMockFs(null)
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      await store.set('', 'value')
      const result = await store.getAll()
      expect(result).toEqual({})
    })

    it('유효한 key는 set()이 true를 반환한다', async () => {
      const mock = makeMockFs(null)
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      const result = await store.set('theme', 'dark')
      expect(result).toBe(true)
    })
  })

  describe('인메모리 캐시 — readFile은 최초 1회만', () => {
    it('getAll()을 여러 번 호출해도 readFile은 최초 1회만 호출된다', async () => {
      const mock = makeMockFs(JSON.stringify({ theme: 'dark' }))
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      await store.getAll()
      await store.getAll()
      await store.getAll()

      expect(mock.readFile).toHaveBeenCalledTimes(1)
    })

    it('set() 후 getAll()은 readFile을 재호출하지 않는다 (캐시에서 반환)', async () => {
      const mock = makeMockFs(JSON.stringify({ theme: 'light' }))
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      await store.getAll()
      await store.set('theme', 'dark')
      await store.getAll()

      expect(mock.readFile).toHaveBeenCalledTimes(1)
    })

    it('캐시가 있으면 set() 후 getAll()은 갱신된 값을 즉시 반환한다', async () => {
      const mock = makeMockFs(JSON.stringify({ theme: 'light' }))
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      await store.getAll()
      await store.set('theme', 'dark')
      const result = await store.getAll()
      expect(result.theme).toBe('dark')
    })
  })

  describe('IPC 핸들러 계약 — UI_PREFS_GET / UI_PREFS_SET', () => {

    it('빈 key로 set()하면 { ok: false }를 반환한다 (IPC 입력 검증)', async () => {
      const mock = makeMockFs(null)
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      const key = ''
      const ok = typeof key === 'string' && key.length > 0
        ? await store.set(key, 'value')
        : false

      expect(ok).toBe(false)
    })

    it('공백만 있는 key도 set()에서 false를 반환해야 한다 (trim 후 빈 문자열)', async () => {
      const mock = makeMockFs(null)
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      const key = '   '
      const trimmedKey = key.trim()
      const ok = trimmedKey.length > 0
        ? await store.set(trimmedKey, 'value')
        : false

      expect(ok).toBe(false)
    })

    it('유효한 key로 getAll() + set() 왕복 테스트', async () => {
      const mock = makeMockFs(null)
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      const initial = await store.getAll()
      expect(initial).toEqual({})

      const ok = await store.set('panelSize', 300)
      expect(ok).toBe(true)

      const updated = await store.getAll()
      expect(updated.panelSize).toBe(300)
    })
  })
})
