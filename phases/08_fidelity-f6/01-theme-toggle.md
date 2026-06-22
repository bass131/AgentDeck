# Phase 01: theme-toggle

## 목표
설정 모달 테마 섹션(F5 placeholder)을 라이트/다크 선택 토글로 교체. 선택 시 `lib/theme.ts setTheme`으로 즉시 적용 + localStorage 영속. 현재 선택 테마를 UI에 반영(체크/활성).

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통.

## 의존 Phase
F5(완료).

## 위험 깃발
없음 (renderer. 새 IPC 0. theme.ts는 기존 모듈 — <html data-theme> + localStorage만).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/components/SettingsModal.tsx` — 테마 섹션 placeholder(`<p>…다음 업데이트…</p>`)를 라이트/다크 2-옵션 셀렉터로 교체. 로컬 state `theme`(초기값 `getTheme()`) + 선택 시 `setTheme(t)` 호출 후 state 갱신(리렌더). 선택된 옵션에 `IconCheck` + `.on`.
- `src/renderer/src/components/SettingsModal.css` — 테마 옵션 행(`.set-theme-opt`) 스타일(미리보기 스와치 + 라벨 + 체크). 색 토큰만.
- (필요 시) `src/renderer/src/lib/useTheme.ts` (신규, 선택) — `getTheme()` 동기 초기 + setter 래퍼. 과설계 지양 — 로컬 useState로 충분하면 생략.

## 작업 단계
1. SettingsModal 테마 pane: 두 옵션(다크/라이트). 각 옵션 = 버튼(`.set-theme-opt`, 미리보기 스와치 + 라벨 "다크"/"라이트" + 선택 시 IconCheck). 클릭 → `setTheme('dark'|'light')` + 로컬 state 갱신.
2. 초기 선택 = `getTheme()`(기본 dark). startup 기본값 dark 유지 — theme.ts DEFAULT_THEME 변경 금지.
3. 인라인 색상 0, 벡터 아이콘(IconCheck). 스와치 색은 토큰(var(--bg)/var(--accent)) 조합으로 다크/라이트 표현.

**폴리시 범위(명시)**: 전역 테마 전환 트랜지션(`tokens.css`/`styles.css` 차원의 전역 transition)은 **F6 범위 외**(즉시 전환 유지 — 깜빡임 위험·전역 회귀 회피). 포커스링 일관은 본 Phase 변경 대상(`.set-theme-opt`)에 한해 `:focus-visible` 토큰 적용으로 국한.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] SettingsModal 테마 테스트(DOM, RED→GREEN): 테마 nav 클릭 → 다크/라이트 2옵션 렌더. 라이트 클릭 → `document.documentElement` data-theme='light' + localStorage 'agentdeck.theme'='light'. 다크 클릭 → 'dark'. 현재 선택에 체크 표시. PASS.
- [ ] placeholder 문구("다음 업데이트") 제거 확인(grep 0).
- [ ] `npm run test` 회귀 0. `npm run test:e2e` 회귀 0.

## 참조
docs/UI_FIDELITY.md §5·§6(설정 모달 좌nav Theme) · lib/theme.ts(setTheme/getTheme) · 원본 lib/theme.ts 패턴.
