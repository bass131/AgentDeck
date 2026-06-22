# Phase 01: modal-scrollbar

## 목표
재사용 Modal 크롬(backdrop blur + 카드 + 헤더 + Esc/클릭아웃) + 전역 얇은 커스텀 스크롤바 + 최소 설정 모달(크롬 시연) + 트리거.

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통.

## 의존 Phase
F4(완료).

## 위험 깃발
없음 (renderer. 새 IPC 0. 로컬 open 상태).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/components/Modal.tsx`+CSS (신규) — `.modal-overlay`(backdrop blur) + `.modal-card`(헤더 title+X + body). Esc/오버레이 클릭 닫기. children.
- `src/renderer/src/components/SettingsModal.tsx`+CSS (신규) — 좌 nav(정보/테마 placeholder) + 콘텐츠(앱명/버전). *엔진버전/MCP/Skill 콘텐츠 = M5 placeholder*.
- `src/renderer/src/theme/tokens.css` — 전역 `::-webkit-scrollbar` 얇은 커스텀(8px, surface-3 thumb, transparent track).
- 트리거: Shell 또는 Sidebar 풋에 "설정" 버튼(로컬 open 상태).

## 작업 단계
1. Modal: `.modal-overlay`(fixed inset0, `backdrop-filter:blur` + 딤 배경, z 높음) + `.modal-card`(중앙, radius, shadow-win, 헤더[title + close X] + body). Esc/오버레이 클릭 → onClose. 포커스 관리는 최소(Esc).
2. SettingsModal: Modal 사용. 좌 `.set-nav`(정보·테마 항목) + 우 `.set-body`(앱명 AgentDeck + 버전 + "테마는 F6에서" 안내). 콘텐츠는 placeholder(M5 기능 콘텐츠 아님).
3. 얇은 스크롤바: tokens.css 전역 `::-webkit-scrollbar{width:8px;height:8px}` + thumb(surface-3, radius) + hover. (전역 적용 — 탐색기/대화/뷰어 모두.)
4. 트리거 버튼(설정) → 모달 open. 인라인 색상 0, 벡터 아이콘.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] Modal 테스트(DOM): 열림 시 `.modal-overlay`+`.modal-card`+헤더 X, Esc/오버레이 클릭 → onClose 호출. PASS.
- [ ] SettingsModal 테스트: 좌 nav + 콘텐츠 렌더. 트리거 버튼 클릭 → 모달 표시.
- [ ] 얇은 스크롤바 CSS 존재(grep `::-webkit-scrollbar`).
- [ ] **scope grep**: 설정 콘텐츠에 엔진버전/MCP/Skill 실로직 0(M5 placeholder).
- [ ] `npm run test:e2e` 회귀 0. 시각검증: 모달 backdrop + 카드(스크린샷 육안).

## 참조
docs/UI_FIDELITY.md §5·격차#8/#9 · 라이브 04-settings.png · 원본 Settings.tsx/resizableModal.tsx(크롬만).
