/**
 * usage.ts — OAuth 레이트리밋 게이지 조회 (Phase 26, B8)
 *
 * 원본 미러: AgentCodeGUI/src/main/index.ts getUsage L471~505.
 *
 * 설계 원칙:
 *   1. **electron import 0** — 순수 Node.js/Web API만 사용. Vitest에서 직접 테스트 가능.
 *   2. **주입형 deps** — readCredentials·fetchFn을 인자로 받아 mock 가능. 기본값은 실 구현.
 *   3. **신뢰경계(ADR-008)**: accessToken은 이 함수 내부 메모리에서만. 반환 UsageInfo에
 *      토큰/시크릿 필드 0 — pct·resetsAt 파생값만 포함. 로그·에러메시지에도 평문 노출 금지.
 *   4. **TTL 캐시**: 5분(USAGE_TTL) 인메모리 캐시. 유효하면 재fetch 없이 반환.
 *   5. **graceful**: 파일 없음·파싱 실패·네트워크 오류 → { fiveHour: null, weekly: null }.
 *
 * IPC 등록: src/main/ipc/index.ts 에서 USAGE_GET 채널에 등록.
 * 소비: renderer ContextStrip — window.api.getUsage() → UsageInfo.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { UsageInfo, UsageWindow } from '../shared/ipc-contract'

// ── TTL 상수 ────────────────────────────────────────────────────────────────

/** 인메모리 캐시 유효 기간: 5분 (ms). */
const USAGE_TTL = 5 * 60 * 1000

// ── 인메모리 캐시 ────────────────────────────────────────────────────────────

/**
 * 캐시 항목.
 * at: 저장 시각(Date.now() ms). data: 저장된 UsageInfo.
 *
 * CRITICAL(ADR-008): 이 캐시에는 accessToken을 저장하지 않는다.
 * UsageInfo는 pct·resetsAt 파생값만 포함한다.
 */
let usageCache: { at: number; data: UsageInfo } | null = null

/**
 * 인메모리 캐시를 초기화한다.
 * 테스트 격리용 — 프로덕션 코드에서는 호출하지 않는다.
 * @internal
 */
export function resetUsageCache(): void {
  usageCache = null
}

// ── 응답 변환 헬퍼 ──────────────────────────────────────────────────────────

/**
 * ISO 날짜 문자열 → unix seconds. 파싱 불가면 null.
 * CRITICAL: s가 undefined/null이면 null 반환 (토큰이 아닌 날짜 값만 처리).
 */
function toTs(s?: string): number | null {
  if (!s) return null
  const ms = Date.parse(s)
  return isNaN(ms) ? null : Math.floor(ms / 1000)
}

/**
 * API 응답 한 윈도우 객체 → UsageWindow.
 * utilization: 0~100 clamp + round (문자열·음수·NaN 대응).
 * resets_at: ISO → unix seconds 변환.
 *
 * CRITICAL(신뢰경계): 반환 UsageWindow는 pct·resetsAt만 포함.
 * API 응답의 다른 필드(예: remaining, limit 등)는 무시한다.
 */
function win(o?: { utilization?: number | string; resets_at?: string }): UsageWindow | null {
  if (!o) return null
  const raw = parseFloat(String(o.utilization ?? 0)) || 0
  const pct = Math.max(0, Math.min(100, Math.round(raw)))
  const resetsAt = toTs(o.resets_at)
  // 반환 객체 = pct + resetsAt 만 (토큰/시크릿 0)
  return { pct, resetsAt }
}

// ── 기본 deps 구현 (실 프로덕션 경로) ────────────────────────────────────────

/**
 * ~/.claude/.credentials.json 파일을 읽어 내용을 반환.
 * 파일 없음·권한 오류 등 → null (graceful).
 *
 * CRITICAL(ADR-008): 이 함수가 반환하는 JSON 문자열에는 accessToken이 포함된다.
 * 호출자(getUsage)가 토큰을 추출 후 *메모리에서만* 사용하고, 로그/반환값에 평문 노출하지 않는다.
 */
function defaultReadCredentials(): string | null {
  try {
    return readFileSync(join(homedir(), '.claude', '.credentials.json'), 'utf8')
  } catch {
    return null
  }
}

// ── 주입 인터페이스 ──────────────────────────────────────────────────────────

/**
 * getUsage에 주입할 의존성.
 * 프로덕션: 기본값 사용. 테스트: mock으로 대체.
 *
 * readCredentials: credentials.json 파일 내용 반환 함수.
 *   - null 반환 또는 throw → graceful(empty).
 * fetchFn: global fetch를 대체하는 함수.
 *   - AbortSignal은 RequestInit.signal로 전달됨.
 * forceRefresh: true면 캐시를 무시하고 무조건 재fetch (테스트용).
 * nowOverride: 현재 시각 ms 주입 (캐시 TTL 테스트용).
 *   - 지정하면 Date.now() 대신 이 값으로 캐시 저장 시각을 기록.
 *   - 기존 캐시의 at과 비교할 때도 이 값 사용.
 */
export interface UsageDeps {
  readCredentials?: () => string | null
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>
  forceRefresh?: boolean
  nowOverride?: number
}

// ── 메인 함수 ────────────────────────────────────────────────────────────────

/**
 * OAuth 레이트리밋 게이지 조회.
 *
 * 반환: UsageInfo { fiveHour: UsageWindow|null, weekly: UsageWindow|null }.
 *
 * CRITICAL(신뢰경계 ADR-008):
 *   - accessToken은 이 함수 스택 내 지역 변수에만 존재한다.
 *   - 반환값·로그·에러메시지에 accessToken을 포함하지 않는다.
 *   - 모든 오류는 catch에서 empty를 반환하며, 에러 메시지에 토큰을 노출하지 않는다.
 *
 * @param deps 테스트용 의존성 주입 (생략 시 프로덕션 기본값 사용)
 */
export async function getUsage(deps?: UsageDeps): Promise<UsageInfo> {
  const empty: UsageInfo = { fiveHour: null, weekly: null }

  const readCreds = deps?.readCredentials ?? defaultReadCredentials
  type FetchFn = (url: string, init?: RequestInit) => Promise<Response>
  const fetchImpl: FetchFn = deps?.fetchFn ?? (globalThis.fetch as FetchFn)
  const now = deps?.nowOverride ?? Date.now()

  // ── 1. TTL 캐시 확인 ──────────────────────────────────────────────────────
  if (!deps?.forceRefresh && usageCache && (now - usageCache.at) < USAGE_TTL) {
    return usageCache.data
  }

  // ── 2. credentials.json 읽기 → accessToken 추출 ───────────────────────────
  // CRITICAL: token은 이 블록 내부 지역 변수. 반환값에 포함하지 않는다.
  let token: string | undefined
  try {
    const raw = readCreds()
    if (!raw) return empty
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const creds: any = JSON.parse(raw)
    token = creds?.claudeAiOauth?.accessToken
  } catch {
    // 파일 없음·파싱 실패·접근 오류 → graceful
    // CRITICAL: catch 블록에서 token/오류 메시지를 로그하지 않는다(ADR-008).
    return empty
  }

  // accessToken 없음 → graceful
  if (!token) return empty

  // ── 3. API 호출 (5s 타임아웃) ────────────────────────────────────────────
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)

    const res = await fetchImpl!(
      'https://api.anthropic.com/api/oauth/usage',
      {
        // CRITICAL: Authorization 헤더에 token을 넣지만, 응답에는 포함하지 않는다.
        headers: {
          Authorization: 'Bearer ' + token,
          'anthropic-beta': 'oauth-2025-04-20'
        },
        signal: ctrl.signal
      }
    )
    clearTimeout(timer)

    if (!res.ok) return empty

    // ── 4. 응답 파싱 → 파생값(pct·resetsAt)만 추출 ─────────────────────────
    // CRITICAL(신뢰경계): j에서 utilization·resets_at만 사용한다.
    // API 응답의 다른 필드는 UsageInfo에 포함되지 않는다.
    const j = (await res.json()) as Record<
      string,
      { utilization?: number | string; resets_at?: string } | undefined
    >

    const data: UsageInfo = {
      fiveHour: win(j.five_hour),
      weekly: win(j.seven_day)
    }

    // ── 5. 캐시 저장 (nowOverride 대응) ──────────────────────────────────────
    // CRITICAL: 캐시에는 data(UsageInfo)만 저장. token은 저장하지 않는다.
    usageCache = { at: now, data }

    return data
  } catch {
    // 네트워크 오류·타임아웃(AbortError)·JSON 파싱 오류 → graceful
    // CRITICAL: catch 블록에서 token을 포함한 메시지를 throw/log하지 않는다.
    return empty
  }
}
