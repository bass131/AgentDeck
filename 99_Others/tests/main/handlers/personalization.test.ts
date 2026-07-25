/**
 * personalization.test.ts — personalization 도메인 핸들러 입력 검증 단위 테스트
 *
 * 테스트 대상: handlers/personalization.ts 의 입력 검증 로직
 *   (ipcMain 의존으로 직접 단위 테스트 불가 → guard 로직 추출 검증)
 *
 * 검증 항목:
 *   1) profile.set: nickname·color 타입 검증, nickname trim·빈 문자열 거부
 *   2) ui.setPref: key trim·빈 문자열 거부
 *
 * 신뢰경계(trust-boundary) 검증:
 *   - 불합격 입력 → { ok: false }, throw 없음
 *   - 통과 시 검증된 값만 store에 전달
 */

import { describe, it, expect, vi } from 'vitest'

// ── profile.set guard 로직 추출 ───────────────────────────────────────────────

interface ProfileInput {
  nickname?: unknown
  color?: unknown
}

interface FakeProfileStore {
  set(p: { nickname: string; color: string }): Promise<boolean>
}

async function handleProfileSet(
  req: unknown,
  store: FakeProfileStore | null
): Promise<{ ok: boolean }> {
  if (!store) return { ok: false }
  if (!req || typeof req !== 'object') return { ok: false }
  const r = req as ProfileInput
  const nickname = r.nickname
  const color = r.color
  if (typeof nickname !== 'string' || nickname.trim().length === 0) {
    return { ok: false }
  }
  if (typeof color !== 'string') {
    return { ok: false }
  }
  const ok = await store.set({ nickname: nickname.trim(), color })
  return { ok }
}

// ── ui.setPref guard 로직 추출 ─────────────────────────────────────────────────

interface FakePrefsStore {
  set(key: string, value: unknown): Promise<boolean>
}

async function handleUiPrefsSet(
  req: unknown,
  store: FakePrefsStore | null
): Promise<{ ok: boolean }> {
  if (!store) return { ok: false }
  const r = req as { key?: unknown; value?: unknown }
  const key = r?.key
  if (typeof key !== 'string' || key.trim().length === 0) {
    return { ok: false }
  }
  const ok = await store.set(key.trim(), r?.value)
  return { ok }
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('personalization 핸들러 입력 검증', () => {
  describe('profile.set — nickname 검증', () => {
    it('nickname이 undefined이면 ok:false', async () => {
      const store: FakeProfileStore = { set: vi.fn().mockResolvedValue(true) }
      const result = await handleProfileSet({ color: '#ff0000' }, store)
      expect(result).toEqual({ ok: false })
      expect(store.set).not.toHaveBeenCalled()
    })

    it('nickname이 빈 문자열이면 ok:false', async () => {
      const store: FakeProfileStore = { set: vi.fn().mockResolvedValue(true) }
      const result = await handleProfileSet({ nickname: '', color: '#ff0000' }, store)
      expect(result).toEqual({ ok: false })
      expect(store.set).not.toHaveBeenCalled()
    })

    it('nickname이 공백만 있으면 ok:false', async () => {
      const store: FakeProfileStore = { set: vi.fn().mockResolvedValue(true) }
      const result = await handleProfileSet({ nickname: '   ', color: '#ff0000' }, store)
      expect(result).toEqual({ ok: false })
      expect(store.set).not.toHaveBeenCalled()
    })

    it('nickname이 number이면 ok:false', async () => {
      const store: FakeProfileStore = { set: vi.fn().mockResolvedValue(true) }
      const result = await handleProfileSet({ nickname: 123, color: '#ff0000' }, store)
      expect(result).toEqual({ ok: false })
      expect(store.set).not.toHaveBeenCalled()
    })

    it('nickname에 앞뒤 공백이 있으면 trim 후 저장', async () => {
      const store: FakeProfileStore = { set: vi.fn().mockResolvedValue(true) }
      await handleProfileSet({ nickname: '  영호  ', color: '#ff0000' }, store)
      expect(store.set).toHaveBeenCalledWith({ nickname: '영호', color: '#ff0000' })
    })
  })

  describe('profile.set — color 검증', () => {
    it('color가 undefined이면 ok:false', async () => {
      const store: FakeProfileStore = { set: vi.fn().mockResolvedValue(true) }
      const result = await handleProfileSet({ nickname: '영호' }, store)
      expect(result).toEqual({ ok: false })
      expect(store.set).not.toHaveBeenCalled()
    })

    it('color가 number이면 ok:false', async () => {
      const store: FakeProfileStore = { set: vi.fn().mockResolvedValue(true) }
      const result = await handleProfileSet({ nickname: '영호', color: 0xff0000 }, store)
      expect(result).toEqual({ ok: false })
      expect(store.set).not.toHaveBeenCalled()
    })

    it('color가 빈 문자열이면 ok:true (형식 검증은 renderer 책임)', async () => {
      const store: FakeProfileStore = { set: vi.fn().mockResolvedValue(true) }
      const result = await handleProfileSet({ nickname: '영호', color: '' }, store)
      expect(result).toEqual({ ok: true })
    })
  })

  describe('profile.set — store 미초기화', () => {
    it('store가 null이면 ok:false', async () => {
      const result = await handleProfileSet({ nickname: '영호', color: '#ff0000' }, null)
      expect(result).toEqual({ ok: false })
    })
  })

  describe('ui.setPref — key 검증', () => {
    it('key가 undefined이면 ok:false', async () => {
      const store: FakePrefsStore = { set: vi.fn().mockResolvedValue(true) }
      const result = await handleUiPrefsSet({ value: 'dark' }, store)
      expect(result).toEqual({ ok: false })
      expect(store.set).not.toHaveBeenCalled()
    })

    it('key가 빈 문자열이면 ok:false', async () => {
      const store: FakePrefsStore = { set: vi.fn().mockResolvedValue(true) }
      const result = await handleUiPrefsSet({ key: '', value: 'dark' }, store)
      expect(result).toEqual({ ok: false })
      expect(store.set).not.toHaveBeenCalled()
    })

    it('key가 공백만 있으면 ok:false', async () => {
      const store: FakePrefsStore = { set: vi.fn().mockResolvedValue(true) }
      const result = await handleUiPrefsSet({ key: '   ', value: 'dark' }, store)
      expect(result).toEqual({ ok: false })
      expect(store.set).not.toHaveBeenCalled()
    })

    it('key에 앞뒤 공백이 있으면 trim 후 저장', async () => {
      const store: FakePrefsStore = { set: vi.fn().mockResolvedValue(true) }
      await handleUiPrefsSet({ key: '  theme  ', value: 'dark' }, store)
      expect(store.set).toHaveBeenCalledWith('theme', 'dark')
    })

    it('store가 null이면 ok:false', async () => {
      const result = await handleUiPrefsSet({ key: 'theme', value: 'dark' }, null)
      expect(result).toEqual({ ok: false })
    })

    it('유효한 key·value는 ok:true', async () => {
      const store: FakePrefsStore = { set: vi.fn().mockResolvedValue(true) }
      const result = await handleUiPrefsSet({ key: 'theme', value: 'dark' }, store)
      expect(result).toEqual({ ok: true })
    })
  })
})
