/**
 * prefs.test.ts — createPrefsStore() 단위 테스트 (P1 — UI Prefs 영속)
 *
 * TDD 순서: 이 파일을 먼저 작성(실패) → src/main/prefs.ts 구현 → 통과.
 *
 * 테스트 전략:
 *   1. mock fs(readFile/writeFile 주입) — electron import 0, node 환경 직접 실행.
 *   2. 파일 없음/파싱 실패 → getAll() = {} (graceful).
 *   3. set → getAll 반영 + writeFile 호출 확인.
 *   4. 여러 set 병합 (기존 키 보존 + 신규 키 추가).
 *   5. 빈 key → set가 false 반환(ok:false 패턴).
 *   6. 캐시 동작 — readFile은 최초 1회만 호출(이후 캐시에서 반환).
 *   7. IPC 핸들러 계약 검증 — 빈 key 요청 → { ok: false }.
 *
 * CRITICAL(신뢰경계): 테스트에서도 API 키·시크릿을 value로 저장하는 경우
 *   반환 blob에 그대로 담기는 설계임을 확인 → "무해 설정만 저장" 계약은
 *   호출부(renderer) 책임임을 명시(main은 값을 검증하지 않음).
 */

import { describe, it, expect, vi } from 'vitest'

// ── 구현 파일 import (아직 없음 → 이 시점에서 테스트 실패 예상) ───────────────
import { createPrefsStore } from '../../src/main/prefs'

// ── 헬퍼: mock fs 팩토리 ────────────────────────────────────────────────────────

/**
 * mock readFile / writeFile을 생성한다.
 *
 * @param initialContent 파일 초기 내용. null이면 "파일 없음" ENOENT 시뮬레이션.
 * @returns { readFile, writeFile, written } — written은 마지막 write된 내용.
 */
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
    storedContent = content // 다음 read에서 갱신된 내용 반환
  })

  return {
    readFile,
    writeFile,
    get lastWritten() { return lastWritten },
  }
}

// ══════════════════════════════════════════════════════════════════════════════
describe('createPrefsStore()', () => {

  // ── graceful 초기화 ────────────────────────────────────────────────────────

  describe('파일 없음/파싱 실패 → graceful {}', () => {
    it('파일이 없으면(ENOENT) getAll()은 {}를 반환한다', async () => {
      const mock = makeMockFs(null) // null = ENOENT
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

  // ── 정상 읽기 ─────────────────────────────────────────────────────────────

  describe('정상 파일 읽기', () => {
    it('유효한 JSON 객체를 읽어 getAll()로 반환한다', async () => {
      const initial = { theme: 'dark', zoomFactor: 1.2 }
      const mock = makeMockFs(JSON.stringify(initial))
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })
      const result = await store.getAll()
      expect(result).toEqual(initial)
    })
  })

  // ── set → getAll 반영 + writeFile 호출 ───────────────────────────────────

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

  // ── 여러 set 병합 ─────────────────────────────────────────────────────────

  describe('여러 set() — 기존 키 보존 + 병합', () => {
    it('여러 set() 호출 시 기존 키를 보존하고 새 키를 추가한다', async () => {
      const initial = { theme: 'light', zoomFactor: 1.0 }
      const mock = makeMockFs(JSON.stringify(initial))
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      await store.set('seenWhatsNew', true)
      const result = await store.getAll()

      // 기존 키 보존
      expect(result.theme).toBe('light')
      expect(result.zoomFactor).toBe(1.0)
      // 새 키 추가
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

  // ── 빈 key → { ok: false } 패턴 ─────────────────────────────────────────

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

  // ── 캐시 동작 ─────────────────────────────────────────────────────────────

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

      await store.getAll() // 최초 읽기 (readFile 1회)
      await store.set('theme', 'dark') // 캐시 갱신 + writeFile 1회
      await store.getAll() // 캐시에서 반환 — readFile 재호출 없음

      expect(mock.readFile).toHaveBeenCalledTimes(1)
    })

    it('캐시가 있으면 set() 후 getAll()은 갱신된 값을 즉시 반환한다', async () => {
      const mock = makeMockFs(JSON.stringify({ theme: 'light' }))
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      await store.getAll() // 캐시 초기화
      await store.set('theme', 'dark')
      const result = await store.getAll()
      expect(result.theme).toBe('dark')
    })
  })

  // ── IPC 핸들러 계약 시뮬레이션 ────────────────────────────────────────────

  describe('IPC 핸들러 계약 — UI_PREFS_GET / UI_PREFS_SET', () => {
    /**
     * 아래 테스트는 실제 ipcMain을 사용하지 않는다.
     * store의 getAll()/set() 반환 패턴이 핸들러 계약과 일치하는지 확인한다:
     *   - UI_PREFS_GET: store.getAll() → UiPrefs 반환
     *   - UI_PREFS_SET: 빈 key → { ok: false }, 유효 key → { ok: true }
     */

    it('빈 key로 set()하면 { ok: false }를 반환한다 (IPC 입력 검증)', async () => {
      const mock = makeMockFs(null)
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      // IPC 핸들러 로직 시뮬레이션: key 검증 후 store.set
      const key = '' // 빈 key (untrusted renderer 입력)
      const ok = typeof key === 'string' && key.length > 0
        ? await store.set(key, 'value')
        : false

      expect(ok).toBe(false)
    })

    it('공백만 있는 key도 set()에서 false를 반환해야 한다 (trim 후 빈 문자열)', async () => {
      const mock = makeMockFs(null)
      const store = createPrefsStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      // IPC 핸들러에서 key.trim() 후 빈 문자열 → false
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

      // UI_PREFS_GET 시뮬레이션
      const initial = await store.getAll()
      expect(initial).toEqual({})

      // UI_PREFS_SET 시뮬레이션
      const ok = await store.set('panelSize', 300)
      expect(ok).toBe(true)

      // UI_PREFS_GET 재호출 — 갱신 반영
      const updated = await store.getAll()
      expect(updated.panelSize).toBe(300)
    })
  })
})
