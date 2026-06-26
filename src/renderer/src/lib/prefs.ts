/**
 * prefs.ts — renderer UI 환경설정 인메모리 캐시 (P1, 원본 AgentCodeGUI lib/prefs.ts 미러)
 *
 * boot 시 1회 loadPrefs() → 인메모리 캐시 채움.
 * getPref(key, fallback): 동기 캐시 읽기 (로드 전이면 fallback 반환 — graceful).
 * setPref(key, value): 캐시 즉시 갱신 + window.api.setUiPref 비동기 IPC 저장 (실패 무시).
 *
 * 신뢰경계 규칙:
 *   - renderer untrusted — fs/Node 직접 0. window.api.getUiPrefs / setUiPref 만 사용.
 *   - CRITICAL: 민감 자격증명(API 키·OAuth 토큰·시크릿) 저장 금지 (무해 UI 설정 전용).
 *   - IPC 채널명 하드코딩 금지 — preload가 노출한 window.api 심볼만 호출.
 *
 * 원본 AgentCodeGUI와 주요 차이:
 *   - saveUiPrefs(전체 blob) → setUiPref(단일 키-값) 으로 계약 변경 (P1 설계).
 *   - 디바운스 대신 매 setPref마다 즉시 IPC 호출 (단순화 — 성능 트레이드오프 허용).
 *   - localStorage 마이그레이션 블록 없음 (이 프로젝트는 처음부터 prefs 사용).
 */

import type { UiPrefs } from '../../../shared/ipc-contract'

// ── 모듈 수준 인메모리 캐시 ─────────────────────────────────────────────────────

/** 인메모리 캐시 — boot 후 단일 진실 공급원. 컴포넌트는 이 캐시에서만 읽는다. */
let _cache: UiPrefs = {}

/**
 * 로드 완료 여부 플래그.
 * false이면 getPref가 항상 fallback을 반환한다 (graceful degradation).
 */
let _loaded = false

// ── 공개 API ────────────────────────────────────────────────────────────────────

/**
 * 저장된 UI 환경설정을 IPC로 읽어 인메모리 캐시에 채운다.
 *
 * 앱 부트 시 렌더 전/마운트 1회 호출.
 * IPC 실패 시 빈 캐시로 초기화(graceful — 이후 getPref는 모두 fallback 반환).
 * 로드 완료 전에는 getPref가 fallback을 반환한다.
 *
 * CRITICAL: renderer untrusted — window.api.getUiPrefs(IPC)만 사용.
 */
export async function loadPrefs(): Promise<void> {
  try {
    const raw = await window.api.getUiPrefs()
    // null/undefined 방어: 빈 객체로 초기화
    _cache = raw != null ? raw : {}
  } catch {
    // IPC 실패 graceful: 빈 캐시. 이후 getPref는 모두 fallback 반환.
    _cache = {}
  }
  _loaded = true
}

/**
 * 인메모리 캐시에서 키 값을 동기 읽기.
 *
 * loadPrefs() 완료 전에는 fallback을 반환한다 (graceful degradation).
 * 값이 null/undefined이면 fallback을 반환한다.
 * 0, false, '' 등 falsy이지만 유효한 값은 그대로 반환한다.
 *
 * @param key - 설정 키
 * @param fallback - 로드 전 또는 키 미존재 시 반환할 기본값
 * @returns 캐시의 값(T) 또는 fallback
 */
export function getPref<T>(key: string, fallback: T): T {
  if (!_loaded) return fallback
  const v = _cache[key]
  return v === undefined || v === null ? fallback : (v as T)
}

/**
 * 인메모리 캐시를 즉시 갱신하고, window.api.setUiPref IPC로 비동기 저장.
 *
 * IPC 저장 실패는 무시한다 (캐시 갱신은 유지 — 세션 내 동기 읽기 보장).
 *
 * CRITICAL: value에 민감 자격증명(API 키·토큰·시크릿) 저장 금지.
 *           무해 UI 설정(테마·모드·크기·플래그 등)만 허용 — 호출부 책임.
 *
 * @param key - 설정 키
 * @param value - JSON 직렬화 가능한 무해 설정값
 */
export function setPref(key: string, value: unknown): void {
  // 캐시 즉시 갱신 (동기 — IPC 완료를 기다리지 않는다)
  _cache = { ..._cache, [key]: value }

  // IPC 비동기 저장 — 실패 무시 (세션 내 캐시는 이미 갱신됨)
  // CRITICAL: window.api.setUiPref(IPC)만 사용 — fs/Node 직접 0.
  // 방어 가드: setUiPref 미존재(테스트 mock·preload 미주입) 시 no-op — graceful
  //   (loadPrefs/loadMultiSessions와 동일 패턴). 캐시는 이미 갱신되어 세션 내 읽기 정상.
  if (typeof window?.api?.setUiPref !== 'function') return
  window.api.setUiPref({ key, value }).catch(() => {
    // IPC 실패 무시 — 캐시는 이미 갱신되어 세션 내 읽기는 정상 동작
  })
}
