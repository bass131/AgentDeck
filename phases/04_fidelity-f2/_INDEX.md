# Milestone 04 — 충실도 F2: 사이드바 + 탐색기 (Fidelity)

> 충실도 트랙 F2(`docs/UI_FIDELITY.md` §3-4, 격차 TOP#4). F1(디자인시스템+셸) 위에 **좌측 두 컬럼**(사이드바·탐색기)을 원본 밀도/구조로. **renderer-only, trust-boundary 없음**(새 IPC 0, 클라이언트 필터/로컬 상태).
>
> 권위 스펙 = `docs/UI_FIDELITY.md` · 레퍼런스 = `C:/Dev/AgentCodeGUI`(읽기전용). 블루프린트 추출 완료(Explorer DOM·fileType 매핑·icons 패턴·변경색·Sidebar 구조·측정값).

## 전제 (완료)
- F1-a OKLCH 듀얼테마(0cf8557) · F1-b 투명 4컬럼 셸(1d6cdd4~e8e39ba). 사이드바=스텁, 탐색기=기본 트리(파일타입아이콘·검색·접기 없음).

## 격차 (F2 타깃)
1. **파일타입 컬러 아이콘 없음** (현 텍스트 chevron ▾) → 확장자→{label,색} 배지.
2. **파일 검색 없음** → 클라이언트 트리 필터.
3. **디렉토리 항상 펼침** → lazy 접이식(chevron 토글, 로컬 상태).
4. **변경색 코딩 없음** (현 점만) → 이름색 edit=yellow/new=green.
5. **사이드바 스텁** → 브랜딩 mark + 새채팅 + 검색 + 세션목록 placeholder + 프로필 풋.

## Phase 분해 (4개 — 의존성 순서)

| NN | Phase | 도메인 | 깃발 | 의존 |
|---|---|---|---|---|
| 01 | filetype-icons | renderer | 없음 | F1-b |
| 02 | explorer-overhaul | renderer | 없음 | 01 |
| 03 | sidebar-visual | renderer | 없음 | F1-b |
| 04 | f2-visual-regression | qa | 없음 | 01,02,03 |

## 범위 경계 (scope creep 차단)
- **사이드바 채팅 세션 목록 실데이터·전환·rename/delete = M4** → F2는 *시각 구조 + placeholder*만. 우클릭 컨텍스트 메뉴·⌘N 단축키는 M4.
- **프로필(아바타·이름)** = 인증 미구현 → 정적 placeholder.
- 트리 펼침 prefs 영속화 = 후속(F2는 로컬 상태). LSP 시맨틱색 = M2-LSP. Git 칩 실동작 = M3.
- 새 IPC 0 — 검색/필터/펼침 전부 store의 in-memory 트리 + 로컬 state.

## 실행/검증
renderer Worker 또는 메인 직접 + TDD(순수 fileType 매핑 우선) + reviewer(≥보통·렌더 다수) + 시각검증(visual-viewer/shell 스크린샷 — 파일타입 아이콘·검색·접기·사이드바). 자동: `python scripts/execute.py 04_fidelity-f2`.
