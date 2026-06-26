/**
 * backend-status.ts — 듀얼 프로바이더 상태 집계 (B1)
 *
 * `backend.list` IPC 채널 응답 BackendStatus[] 를 생성한다.
 * registry.listBackends() 의 각 어댑터에 대해 가용/버전/최신버전/인증을 조회·조합.
 *
 * 설계 원칙(engine-state.ts 와 동일):
 *   1. **electron import 0** — 순수. Vitest 직접 테스트 가능.
 *   2. **주입형 deps** — backends·getAuthed 를 인자로 받아 mock 가능.
 *      기본값은 실 구현(registry.listBackends + engine-state 결합).
 *   3. **신뢰경계(ADR-008 — 절대 규칙)**:
 *      - 반환 BackendStatus 는 id·name·available·version·latestVersion·authed 6개 필드만.
 *      - 토큰·API 키·시크릿·자격증명 0. authed 는 불리언만(engine-state 가 이미 환원).
 *      - 버전 문자열만 — 시크릿/URL/패키지명 미포함(어댑터가 이미 문자열만 반환).
 *   4. **graceful**: 어댑터 메서드 throw → 해당 필드 안전 기본값(available=false,
 *      version/latestVersion=null, authed=false). 한 백엔드 실패가 전체를 막지 않음.
 *   5. **ADR-003 경계**: raw 'claude-code' 리터럴 분기 금지 — authed 결합 대상은
 *      engine-state 의 ENGINE_STATE_BACKEND_ID 상수로 식별.
 *
 * IPC 등록: src/main/00_ipc/index.ts 에서 BACKEND_LIST 채널에 등록.
 * 소비: renderer ProviderStatusPanel(SettingsModal "프로바이더" 섹션).
 */

import type { BackendStatus, BackendId } from '../shared/ipc-contract'
import { BACKEND_LABELS } from '../shared/ipc-contract'
import { listBackends } from './01_agents/registry'
import { getEngineState, ENGINE_STATE_BACKEND_ID } from './engine-state'

// ── 주입 인터페이스 ──────────────────────────────────────────────────────────

/**
 * 상태 집계에 필요한 어댑터의 최소 표면(AgentBackend 의 부분집합).
 * version()/latestVersion()/isAvailable() 만 사용 — run/start 등은 불필요.
 */
export interface BackendLike {
  readonly id: BackendId
  isAvailable(): Promise<boolean>
  version(): Promise<string | null>
  latestVersion(): Promise<string | null>
}

/**
 * buildBackendStatuses 에 주입할 의존성.
 * 프로덕션: 기본값 사용. 테스트: mock 대체.
 *
 * backends: 집계 대상 어댑터 목록(기본 registry.listBackends()).
 * getAuthed: 백엔드별 인증 존재 여부 판정 함수(불리언만 반환).
 *   - 기본: ENGINE_STATE_BACKEND_ID(claude-code)면 getEngineState().authed, 그 외 false.
 *   - CRITICAL: 이 함수는 boolean 만 반환 — 토큰/키 값을 반환하거나 노출하지 않는다.
 */
export interface BackendStatusDeps {
  backends?: BackendLike[]
  getAuthed?: (id: BackendId) => Promise<boolean>
}

// ── 기본 deps 구현 (실 프로덕션 경로) ────────────────────────────────────────

/**
 * 백엔드별 인증 존재 여부 기본 판정.
 * 현재 실엔진(claude-code)만 engine-state 인증 결합 — 그 외는 false.
 * raw 리터럴 분기 회피: ENGINE_STATE_BACKEND_ID 상수와 비교(ADR-003).
 *
 * CRITICAL(ADR-008): getEngineState() 는 authed 불리언만 반환 — 토큰 미노출.
 */
async function defaultGetAuthed(id: BackendId): Promise<boolean> {
  if (id === ENGINE_STATE_BACKEND_ID) {
    const state = await getEngineState()
    return state.authed
  }
  return false
}

// ── 메인 함수 ────────────────────────────────────────────────────────────────

/**
 * 등록된 모든 백엔드의 상태 요약 배열을 생성한다(등록 순서 보존).
 *
 * CRITICAL(신뢰경계 ADR-008): 각 원소는 id·name·available·version·latestVersion·authed
 *   6개 필드만. accessToken·ANTHROPIC_API_KEY·시크릿 값은 어떤 필드에도 포함하지 않는다.
 *
 * @param deps 테스트용 의존성 주입 (생략 시 프로덕션 기본값)
 */
export async function buildBackendStatuses(deps?: BackendStatusDeps): Promise<BackendStatus[]> {
  const backends: BackendLike[] = deps?.backends ?? listBackends()
  const getAuthed = deps?.getAuthed ?? defaultGetAuthed

  return Promise.all(
    backends.map(async (b): Promise<BackendStatus> => {
      // 각 메서드 독립 graceful — 하나가 throw 해도 다른 필드/백엔드에 영향 없음.
      let available = false
      try {
        available = await b.isAvailable()
      } catch {
        available = false
      }

      let version: string | null = null
      try {
        const v = await b.version()
        version = typeof v === 'string' && v.length > 0 ? v : null
      } catch {
        version = null
      }

      let latestVersion: string | null = null
      try {
        const lv = await b.latestVersion()
        latestVersion = typeof lv === 'string' && lv.length > 0 ? lv : null
      } catch {
        latestVersion = null
      }

      let authed = false
      try {
        authed = await getAuthed(b.id)
      } catch {
        authed = false
      }

      // CRITICAL: 정확히 6개 필드만. 토큰/시크릿 0.
      return {
        id: b.id,
        name: BACKEND_LABELS[b.id] ?? b.id,
        available,
        version,
        latestVersion,
        authed
      }
    })
  )
}
