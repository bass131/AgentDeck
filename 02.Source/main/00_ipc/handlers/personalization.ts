/**
 * handlers/personalization.ts — personalization 도메인 핸들러 등록
 *
 * 채널: PROFILE_GET · PROFILE_SET · UI_PREFS_GET · UI_PREFS_SET · USAGE_GET
 *
 * CRITICAL(신뢰경계 ADR-008):
 *   - PROFILE_GET/SET: nickname·color 2개 필드만 — 토큰·시크릿·API 키 0.
 *   - UI_PREFS_GET/SET: 무해 UI 설정(패널 크기·줌·테마 등)만 — 자격증명 저장 금지.
 *     key: trim 후 비어있지 않은 string 검증. value: JSON 직렬화 가능 설정값만.
 *   - USAGE_GET: pct·resetsAt 파생값만 — OAuth 토큰/시크릿 0.
 *   - store 미초기화 → null/{}. throw 없음 (non-critical — 앱 크래시 방지).
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../shared/ipc-contract'
import type {
  Profile,
  UiPrefs,
  UiPrefsSetReq,
  UsageInfo,
} from '../../../shared/ipc-contract'
import type { PrefsStore } from '../../prefs'
import type { ProfileStore } from '../../profile'
import { getUsage } from '../../usage'

// ── 의존성 타입 ──────────────────────────────────────────────────────────────

export interface PersonalizationHandlerDeps {
  getPrefsStore: () => PrefsStore | null
  getProfileStore: () => ProfileStore | null
}

// ── 핸들러 등록 ──────────────────────────────────────────────────────────────

/** personalization 도메인 IPC 핸들러를 등록한다. */
export function registerPersonalizationHandlers(deps: PersonalizationHandlerDeps): void {
  const { getPrefsStore, getProfileStore } = deps

  // ── ui.getPrefs (P1) ──────────────────────────────────────────────────────
  // CRITICAL: 인자 없음. 반환값: UiPrefs(무해 설정) — API 키·시크릿 저장 금지.

  ipcMain.handle(IPC_CHANNELS.UI_PREFS_GET, async (): Promise<UiPrefs> => {
    const store = getPrefsStore()
    if (!store) return {}
    return store.getAll()
  })

  // ── ui.setPref (P1) ───────────────────────────────────────────────────────
  // CRITICAL: key — trim 후 비어있지 않은 string 검증. value — 무해 설정값만.

  ipcMain.handle(IPC_CHANNELS.UI_PREFS_SET, async (_e, req: UiPrefsSetReq): Promise<{ ok: boolean }> => {
    const store = getPrefsStore()
    if (!store) return { ok: false }
    const key = req?.key
    if (typeof key !== 'string' || key.trim().length === 0) {
      return { ok: false }
    }
    const ok = await store.set(key.trim(), req.value)
    return { ok }
  })

  // ── profile.get (P2) ──────────────────────────────────────────────────────
  // null = 미설정/첫실행 → renderer 온보딩 진입.
  // CRITICAL: 반환값 Profile(nickname·color) | null — 토큰·시크릿 0.

  ipcMain.handle(IPC_CHANNELS.PROFILE_GET, async (): Promise<Profile | null> => {
    const store = getProfileStore()
    if (!store) return null
    return store.get()
  })

  // ── profile.set (P2) ──────────────────────────────────────────────────────
  // CRITICAL: nickname·color만 저장 — 토큰·시크릿 저장 금지.
  //   nickname: trim 후 비어있지 않은 string. color: string.

  ipcMain.handle(IPC_CHANNELS.PROFILE_SET, async (_e, req: Profile): Promise<{ ok: boolean }> => {
    const store = getProfileStore()
    if (!store) return { ok: false }
    if (!req || typeof req !== 'object') return { ok: false }
    const nickname = req.nickname
    const color = req.color
    if (typeof nickname !== 'string' || nickname.trim().length === 0) {
      return { ok: false }
    }
    if (typeof color !== 'string') {
      return { ok: false }
    }
    const ok = await store.set({ nickname: nickname.trim(), color })
    return { ok }
  })

  // ── usage.get (B8) ────────────────────────────────────────────────────────
  // CRITICAL: 인자 없음. 반환값: UsageInfo(pct·resetsAt 파생값) — 토큰/시크릿 0.
  //   5분 TTL 인메모리 캐시(getUsage 내부) — 과도한 API 호출 방지.

  ipcMain.handle(IPC_CHANNELS.USAGE_GET, async (): Promise<UsageInfo> => {
    return getUsage()
  })
}
