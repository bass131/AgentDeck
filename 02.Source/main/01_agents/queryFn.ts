/**
 * queryFn.ts — query 함수 해석 + 핸들 유틸 (RF1-followup P03: ClaudeCodeBackend에서 분리)
 *
 * SDK query() 시그니처 타입과 그 해석(lazy import) + query 핸들 부가 기능(supportedCommands
 * 캡처)을 한 곳에 모은다. ClaudeCodeBackend와 ClaudeAgentRun이 공용 import하는 저수준 유틸 —
 * 별 파일로 두어 둘 사이 순환참조(ClaudeCodeBackend ↔ claudeAgentRun)를 피한다.
 *
 * 격리 원칙(ADR-003): @anthropic-ai/claude-agent-sdk 패키지명·SDK 형상은 이 파일 내부에만.
 *   외부 계약/renderer엔 generic 타입만 노출.
 * API 키: 환경변수(ANTHROPIC_API_KEY)에서 SDK가 자동 처리 — 코드·로그 평문 노출 금지.
 */

import { sanitizeDescription } from './descriptionUtils'
import type { SlashCommandInfo } from '../../shared/ipc-contract'

// ── QueryFn 타입 ──────────────────────────────────────────────────────────────

/**
 * query() 함수 시그니처.
 * 실 SDK와 mock 모두 이 타입을 만족한다.
 * options는 unknown으로 열어두어 실 SDK Options 타입과 mock 양쪽 호환.
 *
 * prompt: string — 단발(비-persistent) 경로 기본 시그니처.
 *   지속세션(held-open) 경로는 AsyncIterable<unknown>을 prompt로 전달하나, 이 퍼블릭 타입은
 *   string으로 유지한다(반변성: 유니온으로 넓히면 `prompt: string`만 받는 기존 mock이 타입
 *   오류). 지속세션 호출부는 `PersistentQueryFn`으로 **정밀 캐스트**(as unknown as)한다 —
 *   `any` 아님. ADR-003: AsyncIterable prompt 형상은 어댑터(_runPersistentPump) 내부에만.
 */
export type QueryFn = (params: {
  prompt: string
  options?: unknown
}) => AsyncIterable<unknown> & { interrupt?: () => Promise<void> }

/**
 * 지속세션(REPL, ADR-024) 호출용 query() 시그니처 — prompt가 AsyncIterable(held-open).
 * 실 SDK query()는 `string | AsyncIterable<SDKUserMessage>`를 모두 수용하므로, `QueryFn`(string)을
 * 이 타입으로 `as unknown as` 캐스트해 호출한다(반변성 우회의 타입안전 형태 — `any` 금지 준수).
 * ADR-003: SDKUserMessage 형상은 _inputGen() 본문 내부에만 — 이 타입은 unknown으로만 노출.
 */
export type PersistentQueryFn = (params: {
  prompt: AsyncIterable<unknown>
  options?: unknown
}) => AsyncIterable<unknown> & { interrupt?: () => Promise<void> }

// ── 기본 queryFn (lazy dynamic import) ───────────────────────────────────────

/**
 * 기본 queryFn: @anthropic-ai/claude-agent-sdk를 lazy하게 import하여 query를 반환.
 * 모듈 top-level import가 아닌 lazy import → mock 테스트 시 실 SDK를 평가하지 않음.
 * (결정 #8)
 */
export async function getDefaultQueryFn(): Promise<QueryFn> {
  // 활성 설치 버전 우선(인-앱 업데이트, ADR-018). 실패/미설정 → 번들 SDK 폴백.
  // ADR-003: engine-versions를 단방향 import만 — 역방향(engine-versions→ClaudeCodeBackend) 금지.
  // CRITICAL: throw 전파 금지 — 모든 실패는 번들 폴백으로 흡수.
  try {
    const { loadActiveQuery } = await import('../engine-versions')
    const active = await loadActiveQuery()
    if (active) return active as unknown as QueryFn
  } catch {
    /* engine-versions 로드 실패 또는 loadActiveQuery 실패 → 번들 폴백 */
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk = await import('@anthropic-ai/claude-agent-sdk') as any
  return sdk.query as QueryFn
}

// ── supportedCommands 캡처 (ADR-019, 단발·지속 펌프 공용) ──────────────────────

/**
 * query 핸들에서 supportedCommands를 fire-and-forget으로 캡처한다 (ADR-019).
 *
 * 단발(`_runPump`)·지속세션(`_runPersistentPump`) **양쪽 펌프가 공용 호출** —
 * REPL 기본 모드(persistent)에서도 슬래시 커맨드(/loop·/schedule·/goal 등)가 팔레트에
 * 뜨려면 지속 펌프도 이 캡처를 돌려야 한다.
 *
 * .then()으로 비동기 처리 → 스트림을 블록하지 않음(await 금지). 모든 실패(메서드 없음/
 * throw) → 무시(캐시 미갱신, run 정상 계속). 신뢰경계: name·description(cap+개행 제거)·
 * argHint만 캡처. 시크릿/경로 0.
 *
 * @param queryIterable query() 반환 핸들
 * @param onCaptured 캡처 콜백. null이면 즉시 no-op(테스트 격리/캐시 미제공).
 */
export function captureSupportedCommands(
  queryIterable: AsyncIterable<unknown> & { interrupt?: () => Promise<void> },
  onCaptured: ((cmds: SlashCommandInfo[]) => void) | null
): void {
  if (!onCaptured) return
  const rawIterable = queryIterable as unknown as Record<string, unknown>
  if (typeof rawIterable['supportedCommands'] !== 'function') return
  // fire-and-forget: void로 버림 → await 없음 → 스트림 지연 0
  void (rawIterable['supportedCommands'] as () => Promise<unknown>)()
    .then((result: unknown) => {
      if (!Array.isArray(result)) return
      const cmds: SlashCommandInfo[] = []
      for (const item of result) {
        if (!item || typeof item !== 'object') continue
        const raw = item as Record<string, unknown>
        const name = typeof raw['name'] === 'string' ? raw['name'].trim() : ''
        if (!name) continue
        // description: null/undefined → '' (graceful), 길이 cap + 개행 제거
        const rawDesc = raw['description'] != null ? String(raw['description']) : ''
        const description = sanitizeDescription(rawDesc)
        // argumentHint: 빈 문자열 → undefined (팔레트에 미표시)
        const rawHint = raw['argumentHint']
        const argHint = typeof rawHint === 'string' && rawHint.trim().length > 0
          ? rawHint.trim()
          : undefined
        const cmd: SlashCommandInfo = { name, description, scope: 'builtin' }
        if (argHint !== undefined) cmd.argHint = argHint
        cmds.push(cmd)
      }
      onCaptured(cmds)
    })
    .catch(() => {
      // supportedCommands throw → 무시(캐시 미갱신). run은 정상 계속.
    })
}
