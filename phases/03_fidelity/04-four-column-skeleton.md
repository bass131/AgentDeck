# Phase 04: four-column-skeleton

## 목표
`.win` 카드 본문이 원본의 **4컬럼 골격**(사이드바 248 / 탐색기 236 / 대화 1fr / 에이전트 392)으로 잡히고, 접힘 rail(30px) 토글이 동작한다. Sidebar는 신규 스텁 컴포넌트. (기존 기능 컴포넌트 배치는 Phase 05.)

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통.

## 의존 Phase
03 (셸 크롬 — `.win` 카드 프레임).

## 위험 깃발
없음 (renderer 내부 레이아웃. IPC/신뢰경계 변화 없음).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/layout/Shell.tsx` — 본문을 `.win-body` flex row 4컬럼 골격으로 (컬럼 안엔 임시 placeholder; 실제 컴포넌트 주입은 Phase 05)
- `src/renderer/src/layout/shell.css` — `.win-body`(flex row), 컬럼 폭(`flex:0 0 248/236/392`, 대화 `flex:1; min-width:0`), 접힘 rail(30px), 컬럼 경계선(`--line`)
- `src/renderer/src/components/Sidebar.tsx` (신규, 스텁) + CSS — 브랜딩 + "새 대화"(비동작 스텁) + "최근 채팅" placeholder("M4") + 접힘 버튼

## 작업 단계
1. `.win-body` = `display:flex; flex-direction:row; min-height:0; flex:1`.
2. 4컬럼 골격: ①사이드바 `flex:0 0 248px`(접힘 `.sidebar-rail` 30px) / ②탐색기 `flex:0 0 236px`(접힘 rail 30px) / ③대화 `flex:1; min-width:0` / ④에이전트 `flex:0 0 392px`. 각 경계 `1px solid var(--line)`.
3. Sidebar 스텁: 브랜딩 + "새 대화" 버튼(disabled/no-op) + "최근 채팅" 빈 placeholder. 세션 로직 없음(M4).
4. 접힘 토글: ①②에 rail 접힘 버튼 → 로컬 state로 폭 30px ↔ 정상. (영속화는 후속.)
5. 컬럼 내부는 Phase 05 전까지 식별 가능한 임시 placeholder(예: 컬럼명 라벨). 인라인 색상 0.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] 4컬럼 + rail이 DOM에 존재(컴포넌트 테스트: `.win-body` 자식 4 + 접힘 토글 클릭 시 rail 클래스/폭 변화). PASS.
- [ ] 컬럼 폭이 248/236/392 px + 대화 1fr(CSS grep 또는 e2e 측정).
- [ ] 시각검증: 4컬럼 골격 + 접힘 rail이 원본 폭/경계로 렌더(스크린샷 육안 확인).

## 이 Phase에서 안 하는 것 (영구 제외 아님)
- 접힘 상태 prefs 영속화(원본은 ui-prefs 저장) → 후속/F6. 본 Phase는 로컬 state. · 컬럼 폭 가변(드래그-리사이즈) → 후속. · 사이드바 세션 목록 실동작 → M4.

## 참조
docs/UI_FIDELITY.md(4컬럼 폭 248/236/392·rail 30px) · docs/UI_GUIDE.md(레이아웃·IDE 밀도) · 레퍼런스 App.tsx(.win-body)·Sidebar.tsx·styles.css(컬럼폭·rail).
