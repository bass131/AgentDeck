/**
 * orchestrationDeniedCopy.ts — orchestration_denied 이벤트의 reason → 표시 카피 매핑 (UC1 P10).
 *
 * ADR-032 개정 v2 ④ / Phase 08 결정: 계약(`OrchestrationDeniedReason`)에는 기계값(reason)만 있고
 * 사용자 한국어 카피는 넣지 않는다(카피 수정이 shared 계약 변경이 되지 않도록 분리 — CMD_CARDS와
 * 동일 패턴, cmdCards.ts 참조).
 *
 * CRITICAL: 순수 데이터 + 순수 함수 — window.api/Node/fs 0. reducer(notice.ts)가 이 모듈만 참조.
 */
import type { OrchestrationDeniedReason } from '../../../shared/agent-events'

/** 알 수 없는(미등록) reason에 대한 안전 폴백 카피. */
export const DEFAULT_ORCHESTRATION_DENIED_COPY =
  'UltraCode 오케스트레이션 호출이 차단됐어요 — 컴포저의 UltraCode 토글을 확인해 주세요.'

/**
 * reason 리터럴 → 표시 카피.
 * 새 reason이 계약에 additive로 늘어나면 이 맵에도 항목을 추가한다(누락 시 기본 카피로 폴백 — 안전).
 */
export const ORCHESTRATION_DENIED_COPY: Record<OrchestrationDeniedReason, string> = {
  // 'Workflow'는 SDK 내부 도구명 — 카피도 엔진중립 용어(오케스트레이션)만 쓴다(ADR-003).
  'orchestration-off':
    'UltraCode가 꺼져 있어 오케스트레이션 호출이 차단됐어요 — 컴포저의 UltraCode 토글을 켜면 사용할 수 있어요.',
}

/**
 * copyForOrchestrationDenied — reason(문자열)에 대응하는 표시 카피를 반환.
 *
 * 인자를 `string`으로 넓게 받는 이유: 계약은 리터럴 유니온이지만, 이 렌더러 빌드가 아직
 * 모르는 미래 reason이 런타임에 도착할 수 있다(additive 확장, 구버전 렌더러 시나리오) —
 * 맵에 없으면 예외 없이 기본 카피로 안전 폴백한다.
 */
export function copyForOrchestrationDenied(reason: string): string {
  return (ORCHESTRATION_DENIED_COPY as Record<string, string>)[reason] ?? DEFAULT_ORCHESTRATION_DENIED_COPY
}
