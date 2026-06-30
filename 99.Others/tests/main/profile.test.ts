/**
 * profile.test.ts — createProfileStore() 단위 테스트 (P2 — 로컬 사용자 프로필 영속)
 *
 * TDD 순서: 이 파일을 먼저 작성(실패) → src/main/profile.ts 구현 → 통과.
 *
 * 테스트 전략:
 *   1. mock fs(readFile/writeFile 주입) — electron import 0, node 환경 직접 실행.
 *   2. 파일 없음/파싱 실패/필드 누락 → get() = null (graceful, 첫실행 취급).
 *   3. set(p) → get() 반영 + writeFile 호출 확인.
 *   4. 빈 nickname / 비-string color → set()이 false 반환.
 *   5. 캐시 동작 — readFile은 최초 1회만.
 *   6. IPC 핸들러 계약 시뮬레이션 — PROFILE_GET / PROFILE_SET.
 *
 * CRITICAL(신뢰경계): profile은 닉네임·색상 개인화만 — 토큰·시크릿 0.
 * 빈 nickname 거부, color는 string 타입 검증 — 호출부(renderer) 책임은 색상 범위 검증.
 */

import { describe, it, expect, vi } from 'vitest'

// ── 구현 파일 import (아직 없음 → 이 시점에서 테스트 실패 예상) ───────────────
import { createProfileStore } from '../../../02.Source/main/profile'

// ── 헬퍼: mock fs 팩토리 ────────────────────────────────────────────────────────

/**
 * mock readFile / writeFile을 생성한다.
 *
 * @param initialContent 파일 초기 내용. null이면 "파일 없음" ENOENT 시뮬레이션.
 * @returns { readFile, writeFile, lastWritten }
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
    storedContent = content
  })

  return {
    readFile,
    writeFile,
    get lastWritten() { return lastWritten },
  }
}

// ══════════════════════════════════════════════════════════════════════════════
describe('createProfileStore()', () => {

  // ── get() — 파일 없음/파싱 실패/필드 누락 → null ────────────────────────────

  describe('파일 없음/파싱 실패/필드 누락 → get() = null (graceful, 첫실행)', () => {
    it('파일이 없으면(ENOENT) get()은 null을 반환한다', async () => {
      const mock = makeMockFs(null)
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })
      const result = await store.get()
      expect(result).toBeNull()
    })

    it('파일 내용이 빈 문자열이면 get()은 null을 반환한다', async () => {
      const mock = makeMockFs('')
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })
      const result = await store.get()
      expect(result).toBeNull()
    })

    it('파일 내용이 유효하지 않은 JSON이면 get()은 null을 반환한다', async () => {
      const mock = makeMockFs('NOT_VALID_JSON{{{{')
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })
      const result = await store.get()
      expect(result).toBeNull()
    })

    it('파일 내용이 JSON 배열이면(비-객체) get()은 null을 반환한다', async () => {
      const mock = makeMockFs('[1, 2, 3]')
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })
      const result = await store.get()
      expect(result).toBeNull()
    })

    it('파일 내용이 null 리터럴이면 get()은 null을 반환한다', async () => {
      const mock = makeMockFs('null')
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })
      const result = await store.get()
      expect(result).toBeNull()
    })

    it('nickname 필드가 없으면 get()은 null을 반환한다(필수 필드 누락)', async () => {
      const mock = makeMockFs(JSON.stringify({ color: '#6366f1' }))
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })
      const result = await store.get()
      expect(result).toBeNull()
    })

    it('color 필드가 없으면 get()은 null을 반환한다(필수 필드 누락)', async () => {
      const mock = makeMockFs(JSON.stringify({ nickname: '홍길동' }))
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })
      const result = await store.get()
      expect(result).toBeNull()
    })

    it('nickname이 string이 아니면 get()은 null을 반환한다', async () => {
      const mock = makeMockFs(JSON.stringify({ nickname: 42, color: '#6366f1' }))
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })
      const result = await store.get()
      expect(result).toBeNull()
    })

    it('color가 string이 아니면 get()은 null을 반환한다', async () => {
      const mock = makeMockFs(JSON.stringify({ nickname: '홍길동', color: 123 }))
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })
      const result = await store.get()
      expect(result).toBeNull()
    })

    it('nickname이 빈 문자열이면 get()은 null을 반환한다(필드 누락과 동일 취급)', async () => {
      const mock = makeMockFs(JSON.stringify({ nickname: '', color: '#6366f1' }))
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })
      const result = await store.get()
      expect(result).toBeNull()
    })
  })

  // ── get() — 유효한 프로필 읽기 ───────────────────────────────────────────────

  describe('유효한 파일 읽기 → Profile 반환', () => {
    it('유효한 JSON 프로필을 읽어 get()으로 반환한다', async () => {
      const profile = { nickname: '홍길동', color: '#6366f1' }
      const mock = makeMockFs(JSON.stringify(profile))
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })
      const result = await store.get()
      expect(result).toEqual(profile)
    })

    it('추가 필드가 있어도 nickname·color가 유효하면 get()은 Profile을 반환한다', async () => {
      const data = { nickname: '홍길동', color: '#6366f1', extra: 'ignored' }
      const mock = makeMockFs(JSON.stringify(data))
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })
      const result = await store.get()
      // nickname·color 포함 여부만 확인(추가 필드 보존 여부는 구현 재량)
      expect(result).not.toBeNull()
      expect(result!.nickname).toBe('홍길동')
      expect(result!.color).toBe('#6366f1')
    })
  })

  // ── set() → get() 반영 + writeFile 호출 ─────────────────────────────────────

  describe('set(p) → get() 반영 + 디스크 write', () => {
    it('set(p) 후 get()에 반영된다', async () => {
      const mock = makeMockFs(null)
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      const profile = { nickname: '홍길동', color: '#6366f1' }
      const ok = await store.set(profile)
      expect(ok).toBe(true)

      const result = await store.get()
      expect(result).toEqual(profile)
    })

    it('set(p) 시 writeFile을 호출한다', async () => {
      const mock = makeMockFs(null)
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      await store.set({ nickname: '홍길동', color: '#6366f1' })
      expect(mock.writeFile).toHaveBeenCalledTimes(1)
    })

    it('writeFile에 JSON 직렬화된 profile 내용을 전달한다', async () => {
      const mock = makeMockFs(null)
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      const profile = { nickname: '홍길동', color: '#6366f1' }
      await store.set(profile)
      const written = JSON.parse(mock.lastWritten!)
      expect(written.nickname).toBe('홍길동')
      expect(written.color).toBe('#6366f1')
    })

    it('set() 후 다시 set()하면 마지막 값으로 덮어쓴다', async () => {
      const mock = makeMockFs(null)
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      await store.set({ nickname: '홍길동', color: '#6366f1' })
      await store.set({ nickname: '이순신', color: '#ec4899' })

      const result = await store.get()
      expect(result!.nickname).toBe('이순신')
      expect(result!.color).toBe('#ec4899')
    })
  })

  // ── set() 입력 검증 — 불합격 → false ─────────────────────────────────────────

  describe('set() 입력 검증 — 불합격 → false, write 없음', () => {
    it('nickname이 빈 문자열이면 set()은 false를 반환하고 write하지 않는다', async () => {
      const mock = makeMockFs(null)
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      const ok = await store.set({ nickname: '', color: '#6366f1' })
      expect(ok).toBe(false)
      expect(mock.writeFile).not.toHaveBeenCalled()
    })

    it('nickname이 공백만 있는 문자열이면 set()은 false를 반환한다', async () => {
      const mock = makeMockFs(null)
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      const ok = await store.set({ nickname: '   ', color: '#6366f1' })
      expect(ok).toBe(false)
      expect(mock.writeFile).not.toHaveBeenCalled()
    })

    it('nickname이 string이 아니면 set()은 false를 반환한다', async () => {
      const mock = makeMockFs(null)
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ok = await store.set({ nickname: 42 as any, color: '#6366f1' })
      expect(ok).toBe(false)
      expect(mock.writeFile).not.toHaveBeenCalled()
    })

    it('color가 string이 아니면 set()은 false를 반환한다', async () => {
      const mock = makeMockFs(null)
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ok = await store.set({ nickname: '홍길동', color: 123 as any })
      expect(ok).toBe(false)
      expect(mock.writeFile).not.toHaveBeenCalled()
    })

    it('입력 객체 자체가 null이면 set()은 false를 반환한다', async () => {
      const mock = makeMockFs(null)
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ok = await store.set(null as any)
      expect(ok).toBe(false)
      expect(mock.writeFile).not.toHaveBeenCalled()
    })

    it('유효한 profile은 set()이 true를 반환한다', async () => {
      const mock = makeMockFs(null)
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      const ok = await store.set({ nickname: '홍길동', color: '#6366f1' })
      expect(ok).toBe(true)
    })
  })

  // ── 캐시 동작 ─────────────────────────────────────────────────────────────────

  describe('인메모리 캐시 — readFile은 최초 1회만', () => {
    it('get()을 여러 번 호출해도 readFile은 최초 1회만 호출된다', async () => {
      const mock = makeMockFs(JSON.stringify({ nickname: '홍길동', color: '#6366f1' }))
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      await store.get()
      await store.get()
      await store.get()

      expect(mock.readFile).toHaveBeenCalledTimes(1)
    })

    it('set() 후 get()은 readFile을 재호출하지 않는다 (캐시에서 반환)', async () => {
      const mock = makeMockFs(JSON.stringify({ nickname: '홍길동', color: '#6366f1' }))
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      await store.get()   // 최초 읽기 (readFile 1회)
      await store.set({ nickname: '이순신', color: '#ec4899' }) // 캐시 갱신 + writeFile 1회
      await store.get()   // 캐시에서 반환 — readFile 재호출 없음

      expect(mock.readFile).toHaveBeenCalledTimes(1)
    })

    it('set() 후 get()은 갱신된 값을 즉시 반환한다', async () => {
      const mock = makeMockFs(JSON.stringify({ nickname: '홍길동', color: '#6366f1' }))
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      await store.get() // 캐시 초기화
      await store.set({ nickname: '이순신', color: '#ec4899' })
      const result = await store.get()
      expect(result!.nickname).toBe('이순신')
    })

    it('null 캐시(파일 없음) 상태에서 set() 후 get()은 설정된 값을 반환한다', async () => {
      const mock = makeMockFs(null)
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      // 파일 없음 → null 캐시
      const before = await store.get()
      expect(before).toBeNull()

      // set() 후 → 캐시 갱신
      await store.set({ nickname: '홍길동', color: '#6366f1' })
      const after = await store.get()
      expect(after).toEqual({ nickname: '홍길동', color: '#6366f1' })
    })
  })

  // ── IPC 핸들러 계약 시뮬레이션 ────────────────────────────────────────────────

  describe('IPC 핸들러 계약 — PROFILE_GET / PROFILE_SET', () => {
    /**
     * 실제 ipcMain을 사용하지 않는다.
     * store의 get()/set() 반환 패턴이 핸들러 계약과 일치하는지 확인한다:
     *   - PROFILE_GET: store.get() → Profile | null 반환 (null = 첫실행)
     *   - PROFILE_SET: 유효 입력 → { ok: true }, 빈 nickname → { ok: false }
     */

    it('PROFILE_GET 시뮬레이션: 파일 없음 → null (첫실행)', async () => {
      const mock = makeMockFs(null)
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      // 핸들러: store.get() 결과를 그대로 반환
      const result = await store.get()
      expect(result).toBeNull() // null = 첫실행 → renderer 온보딩 진입
    })

    it('PROFILE_GET 시뮬레이션: 유효한 파일 → Profile 반환', async () => {
      const profile = { nickname: '홍길동', color: '#6366f1' }
      const mock = makeMockFs(JSON.stringify(profile))
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      const result = await store.get()
      expect(result).toEqual(profile)
    })

    it('PROFILE_SET 시뮬레이션: 유효한 profile → { ok: true }', async () => {
      const mock = makeMockFs(null)
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      // 핸들러: 입력 검증 후 store.set(p) → { ok }
      const req = { nickname: '홍길동', color: '#6366f1' }
      const nicknameTrimmed = typeof req.nickname === 'string' ? req.nickname.trim() : ''
      const colorIsString = typeof req.color === 'string'
      const ok = nicknameTrimmed.length > 0 && colorIsString
        ? await store.set(req)
        : false

      expect(ok).toBe(true)
    })

    it('PROFILE_SET 시뮬레이션: 빈 nickname → { ok: false }', async () => {
      const mock = makeMockFs(null)
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      // 핸들러: nickname trim 후 빈 문자열 → false (write 없음)
      const req = { nickname: '', color: '#6366f1' }
      const nicknameTrimmed = typeof req.nickname === 'string' ? req.nickname.trim() : ''
      const colorIsString = typeof req.color === 'string'
      const ok = nicknameTrimmed.length > 0 && colorIsString
        ? await store.set(req)
        : false

      expect(ok).toBe(false)
    })

    it('PROFILE_SET 시뮬레이션: 비-string color → { ok: false }', async () => {
      const mock = makeMockFs(null)
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const req: any = { nickname: '홍길동', color: 99 }
      const nicknameTrimmed = typeof req.nickname === 'string' ? req.nickname.trim() : ''
      const colorIsString = typeof req.color === 'string'
      const ok = nicknameTrimmed.length > 0 && colorIsString
        ? await store.set(req)
        : false

      expect(ok).toBe(false)
    })

    it('PROFILE_SET 후 PROFILE_GET: 저장된 값을 반환한다', async () => {
      const mock = makeMockFs(null)
      const store = createProfileStore({ readFile: mock.readFile, writeFile: mock.writeFile })

      const profile = { nickname: '홍길동', color: '#6366f1' }
      await store.set(profile)
      const result = await store.get()
      expect(result).toEqual(profile)
    })
  })
})
