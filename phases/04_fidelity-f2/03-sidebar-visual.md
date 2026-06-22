# Phase 03: sidebar-visual

## 목표
사이드바가 원본 시각 구조를 갖춘다: 워크스페이스 브랜딩(mark + 이름) + 새채팅 + 검색 + 세션목록(placeholder) + 프로필 풋. **채팅 세션 실데이터/전환은 M4** — F2는 비주얼 골격 + 빈 상태.

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통.

## 의존 Phase
F1-b(완료, Sidebar 스텁 존재).

## 위험 깃발
없음 (renderer. 새 IPC 0).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/components/Sidebar.tsx` — 스텁 → 브랜딩(mark 정사각 badge + name/sub) + 새채팅(.sb-new, 비활성/no-op) + 검색(.sb-search, 비기능 시각) + 세션목록(.sb-list, 빈 placeholder) + 프로필 풋(.sb-foot, 정적).
- `src/renderer/src/components/Sidebar.css` — 측정값(top 14/12/10, ws 8/radius9, mark 26px, new 7/10, search 8/10, label 11px uppercase, item 9/10, foot border-top).

## 작업 단계
1. 상단(.sb-top): mark(26px 정사각, --accent bg, 모노 첫글자) + 이름(워크스페이스명 or 'AgentDeck') + sub(경로 or 'Claude Code'). 접힘 버튼 유지.
2. 새채팅(.sb-new): 아이콘 + "새 대화" + (선택)단축키 칩. 비활성(M4) — disabled, 시각만.
3. 검색(.sb-search): IconSearch + input(--inset). 비기능(시각 골격) — M4 세션 검색 자리.
4. 세션목록(.sb-list): 빈 placeholder("대화 기록이 여기에 표시됩니다"). 행 스타일(.sb-item active=좌측 accent bar, dot)은 CSS로 정의해 두되 데이터는 없음(M4).
5. 프로필 풋(.sb-foot): 아바타(정적 색) + 이름 placeholder. 인증=후속.
6. 이모지 0, 벡터 아이콘, 인라인 색상 0.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] Sidebar 컴포넌트 테스트(DOM 단언): `.sb-new[disabled]` + `.sb-search input` + `.sb-list .sb-empty`(placeholder 텍스트) + `.sb-foot` 렌더, 접힘 onCollapse 호출. PASS.
- [ ] 세션 전환/rename/delete 로직 **없음**(M4 — grep: onSelect/rename/delete/세션 핸들러 0).
- [ ] **프로필 풋 = 하드코딩 placeholder**(동적 사용자 데이터 바인딩 0 — grep: user/avatar 동적 prop 0).
- [ ] 시각검증(보조): 브랜딩·새채팅·검색·풋 스크린샷 육안.

## 참조
docs/UI_FIDELITY.md §3(.sb-* 구조·측정값) · 레퍼런스 Sidebar.tsx(시각 구조만) · phases/04_fidelity-f2/01-filetype-icons.md(icons).
