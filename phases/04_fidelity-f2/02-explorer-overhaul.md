# Phase 02: explorer-overhaul

## 목표
탐색기가 원본 밀도/구조로 개편된다: 헤더(워크스페이스/MAIN + 폴더추가) + 파일검색 + lazy 접이식 트리(chevron 토글) + 파일타입 배지 + 변경색(edit=yellow/new=green).

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 복잡(트리 상태 + 검색 + 기존 동작 보존).

## 의존 Phase
01 (filetype-icons).

## 위험 깃발
없음 (renderer. 새 IPC 0 — store in-memory 트리 필터 + 로컬 펼침 상태).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/components/FileExplorer.tsx` — 트리 행에 chevron 토글(디렉토리 펼침 로컬 상태) + FileBadge + 변경색 클래스. 헤더(워크스페이스명 + MAIN 칩 + 폴더추가/다른폴더). 파일검색 입력(클라이언트 필터).
- `src/renderer/src/components/FileExplorer.css` — 행/들여쓰기/검색/배지/변경색.
- (필요 시) `src/renderer/src/lib/treeFilter.ts` (신규, 순수) — 검색어로 트리 평탄 필터(이름 매치, startswith>contains 정렬, 상한).

## ⚠️ 선택자 보존 계약 (plan-auditor 🔴①)
- **`.fe-file`·`.fe-tree`·`.fe-changed-dot`·`.fe-ref-section .fe-file` 클래스는 보존**(rename 금지). 기존 e2e(core-loop·visual-viewer·shell)가 의존.
- **루트 레벨 파일은 항상 가시**(lazy-collapse는 *중첩 디렉토리*의 자식만 접음). 현 e2e fixture는 루트 평탄(README/sample.ts/logo.svg, guide.md) → 접힘과 무충돌.
- 선택자를 부득이 바꾸면 **Phase 04에서 동반 갱신**(둘 다 허용 아님 — 보존이 기본).

## 작업 단계
1. 디렉토리 lazy 펼침: 로컬 `expanded: Set<path>` 상태. 디렉토리 행 클릭/chevron → 토글. **기본: 루트 직계는 펼침(루트 파일/1뎁스 디렉토리 노출), 더 깊은 중첩 디렉토리는 접힘**. 들여쓰기 8 + depth*14px.
2. 파일 행: `<FileBadge path>` + 이름 + 변경 표시. 변경 파일은 이름색(`.chg-edit`/`.chg-new`) + (옵션)배지. 디렉토리는 IconFolder/Open + 하위 변경 점.
3. 검색 입력(.exp-search, --inset bg, IconSearch). 입력 시 트리→평탄 필터 결과(treeFilter, 상한 100). X로 클리어.
4. 헤더: 워크스페이스명 + (레퍼런스 있으면)MAIN 칩 + 폴더추가/다른폴더 버튼(벡터 아이콘). 레퍼런스 섹션 유지.
5. **동작 보존**: 파일 클릭→openFile+selectDiffFile, 레퍼런스 클릭→openFile(refId), 변경 인디케이터. 기존 클래스(.fe-file 등) e2e 의존분 유지하거나 테스트 동반 갱신.
6. 인라인 색상 0(배지 동적색 제외).

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] treeFilter.test.ts(검색 필터 순수 로직) + FileExplorer 컴포넌트 테스트(접기 토글·검색·배지·변경색). PASS.
- [ ] `npm run test:e2e` 회귀 0(폴더열기→트리·파일클릭→뷰어·변경인디케이터·레퍼런스 — 선택자 보존 계약대로).
- [ ] **DOM 단언(시각검증 주 게이트, 스크린샷은 보조)**: 파일배지(`.ftbadge` 등) N≥1 존재 · 디렉토리 chevron 토글 후 자식 행 개수 변화 · 검색어 입력 후 `.fe-file` 개수 감소 · 변경 파일에 `.chg-edit`/`.chg-new` 클래스. e2e/컴포넌트 테스트로 단언.
- [ ] 시각검증(보조): 파일타입 컬러 아이콘 + 검색 + 접이식 트리 + 변경색 스크린샷 육안.

## 참조
docs/UI_FIDELITY.md §3-4(.exp-* 구조·변경색·측정값) · 레퍼런스 Explorer.tsx · phases/04_fidelity-f2/01-filetype-icons.md.
