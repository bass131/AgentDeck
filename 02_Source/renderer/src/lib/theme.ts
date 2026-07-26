/**
 * theme.ts — 앱 테마(light/dark) 적용·영속.
 *
 * 디자인시스템 전체가 CSS 변수 기반(theme/tokens.css)이라, 테마 적용 = <html>의
 * data-theme 속성 설정 한 줄. tokens.css가 `:root[data-theme="dark"]`에서 토큰을
 * 재선언하므로 속성만 바꾸면 전 토큰이 뒤집힌다. 원본 AgentCodeGUI lib/theme.ts와
 * 동일 패턴(원본은 ui-prefs.json IPC 영속 — F1은 의존 최소화 위해 localStorage).
 *
 * applyTheme()는 첫 페인트 전에 호출(main.tsx)해야 다크 사용자가 라이트 카드를
 * 깜빡이지 않는다.
 *
 * 기본값 = dark. 원본(light 기본)과 달리 dark 기본은 의도적 영구 차이(프로젝트 결정).
 *    light 테마 자체는 지원(토글)하되 기본값을 light로 되돌리지 않음.
 */

export type Theme = 'light' | 'dark'

const KEY = 'agentdeck.theme'
const DEFAULT_THEME: Theme = 'dark'

/** 저장된 테마 선택값. 없거나 손상 시 기본값(dark). */
export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    if (t === 'light' || t === 'dark') return t
  } catch {
    /* localStorage 접근 불가(테스트/샌드박스) → 기본값 */
  }
  return DEFAULT_THEME
}

/** 주어진(또는 저장된) 테마로 <html>을 칠한다. */
export function applyTheme(theme: Theme = getTheme()): void {
  document.documentElement.setAttribute('data-theme', theme)
}

/** 새 테마 선택을 영속 + 즉시 적용. */
export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* 영속 실패해도 적용은 진행 */
  }
  applyTheme(theme)
}
