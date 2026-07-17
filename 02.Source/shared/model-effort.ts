/**
 * model-effort.ts — 모델별 effort 지원 표 (shared 도메인 상수, LM1 P06)
 *
 * IPC 채널이 아니다 — 순수 도메인 상수 모듈. `ipc-contract.ts` 배럴에 등록하지 않는다
 * (계약 버전 bump 대상 아님). main·renderer 양쪽에서 직접 경로
 * (`02.Source/shared/model-effort`)로 import된다.
 *
 * CRITICAL: Node 전용 API 금지(fs·process·path 등) — 이 파일은 renderer 번들에도
 * 로드되므로 순수 상수/타입만 둔다. `02.Source/main/**`을 import하지 않는다(역의존 금지).
 *
 * 원본: `02.Source/main/01_agents/run-args.ts:41-59`(Phase 21b, ADR-016)에서 값·JSDoc
 * 원형 그대로 승격(LM1 P06, 영호 확정 2026-07-17). run-args.ts는 이 모듈을 import해
 * re-export한다(정의 단일화 — 소비처 import 경로·거동 불변, C#의 type forwarding 유사).
 */

/** `MODEL_EFFORT_SUPPORT` 각 항목의 값 타입. */
export interface EffortSupport {
  supports: boolean
  xhigh?: boolean
}

/**
 * 모델별 effort 지원 표.
 *
 * supports: false → effort/thinking 키를 아예 생략.
 * xhigh: false    → xhigh 입력 시 'high'로 클램프.
 *
 * 권위 확인(claude-code-guide, 2026-07-04):
 * - Opus 4.8: effort 지원, xhigh/max 모두 지원.
 * - Fable 5: effort 지원, xhigh/max 모두 지원.
 * - Sonnet 5: effort 지원, xhigh/max 모두 지원(Sonnet 4.6까지는 xhigh 미지원 →high 클램프였음 —
 *   'sonnet' 별칭 라이브 실측(SDK@0.3.201)으로 Sonnet 5 해석 확인 후 클램프 해제).
 * - Haiku 4.5: effort 미지원(키 생략).
 */
export const MODEL_EFFORT_SUPPORT: Record<string, EffortSupport> = {
  opus: { supports: true, xhigh: true },
  fable: { supports: true, xhigh: true },
  sonnet: { supports: true, xhigh: true },
  haiku: { supports: false }
}
