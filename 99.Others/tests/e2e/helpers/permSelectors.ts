/**
 * permSelectors.ts — 권한 요청 인라인 카드(PermissionCard, BF3 Phase 06/ADR-030) 공용 셀렉터.
 *
 * 배경: 옛 PermissionModal 컴포넌트(`.q-overlay` 안에 role=dialog 풀오버레이로 렌더되던
 *   중앙 모달)가 폐기되고 컴포저 바로 위 인라인 카드(`.perm-card`, role="group" — role=dialog
 *   아님, 오버레이 아님)로 대체됐다(ADR-030). e2e 7개 파일이 그 옛 모달 셀렉터 문자열을
 *   산재 의존하고 있었으므로, 재발 방지를 위해 이 파일 하나로 계약을 단일화한다(renderer
 *   PermissionCard.tsx가 실제 구현 SoT — 값이 어긋나면 그쪽이 이긴다).
 *
 * 계약(02.Source/renderer/src/components/07_notice/PermissionCard.tsx 실측):
 *   - 루트: `.perm-card`(role="group", aria-label="도구 사용 승인 요청")
 *   - 버튼: `.perm-card-opt` × 3, `data-perm-choice="allow"|"allow_always"|"deny"`로 식별
 *   - 숫자키 1·2·3·Esc는 카드 컨테이너 스코프(전역 아님) — 카드가 마운트 시 자동
 *     포커스되지만, e2e에서 확실히 하려면 카드를 먼저 클릭하거나 버튼을 직접 클릭할 것.
 */

/** 권한 카드 루트 — role="group"(모달 아님, 오버레이 아님). */
export const PERM_CARD = '.perm-card'

/** 권한 카드 선택 버튼(허용/항상허용/거부) 공통 클래스. */
export const PERM_CARD_OPT = '.perm-card-opt'

export type PermChoice = 'allow' | 'allow_always' | 'deny'

/** 특정 선택지 버튼 셀렉터 — data-perm-choice 속성 기반(라벨 문자열 의존 회피). */
export function permChoiceSelector(choice: PermChoice): string {
  return `${PERM_CARD_OPT}[data-perm-choice="${choice}"]`
}
