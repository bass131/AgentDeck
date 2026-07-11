/**
 * lib/replModeDefault.ts — replMode 세션별 폴백의 단일 출처 (LR4 P07).
 *
 * replMode(REPL 지속세션 토글, ADR-024)가 전역 단일 필드에서 대화별
 * (ConversationRecord.replMode)/패널별(PanelThreadSnapshot.replMode) 세션 스코프로 이관되며,
 * 레코드/스냅샷에 replMode가 없는 경우(옛 대화·신규 패널·마이그레이션 전 데이터)의 공통
 * 폴백값을 이 모듈이 단일 소유한다.
 *
 * main.tsx가 부트 시 전역 pref(getPref('replMode'))로 저장돼 있던 옛 마이그값을
 * setReplModeDefault로 이 모듈에 흡수(seed)한다 — 이후 단일챗 slice(system.ts)와 멀티
 * panelSession(panelSession.ts) 양쪽이 이 모듈만 참조해 같은 폴백을 공유한다(appStore
 * 비의존 — panelSession 독립성 유지).
 *
 * CRITICAL(신뢰경계): 순수 인메모리 boolean 저장소 — window.api/Node/fs 호출 0. 시크릿 아님.
 */

/** 미시드 상태의 기본 폴백값 — held-open 지속세션이 기본(ADR-024/LR3-03 정합). */
const DEFAULT_FALLBACK = true

let replModeDefault: boolean = DEFAULT_FALLBACK

/** getReplModeDefault — 현재 폴백값 반환(시드 전에는 true). */
export function getReplModeDefault(): boolean {
  return replModeDefault
}

/**
 * setReplModeDefault — 전역 pref('replMode') 마이그값을 흡수해 폴백을 갱신한다.
 * main.tsx 부트 시 1회 호출 — 이후 레코드/스냅샷에 replMode가 없는 세션의 로드 폴백으로 적용.
 */
export function setReplModeDefault(v: boolean): void {
  replModeDefault = v
}

/**
 * __resetReplModeDefaultForTests — 테스트 전용 리셋(모듈 싱글턴 격리).
 * CRITICAL: 프로덕션 코드에서 호출 금지.
 */
export function __resetReplModeDefaultForTests(): void {
  replModeDefault = DEFAULT_FALLBACK
}
