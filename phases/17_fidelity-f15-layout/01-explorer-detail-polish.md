# Phase 01: explorer-detail-polish

## 목표
FileExplorer를 원본 `Explorer.tsx` 시각 구조에 1:1로 맞춘다: **탐색기 헤더 분리 + 폴더 리스트 버튼 + 폴더 추가 + kbd 힌트 + 빈상태 카드**. 트리 행 셀렉터(`.fe-tree`/`.fe-file`)는 유지(e2e/단위 보존). 정적/로컬 — 새 IPC 0.

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통~복잡.

## 의존 Phase
F14(완료).

## 위험 깃발
없음 (renderer-only. window.api는 기존 store 액션 경유만. 새 IPC 0).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/components/FileExplorer.tsx`
  - **헤더 분리**: `.fe-head`(신규) — `.fe-title`("탐색기" uppercase) + git 버튼(`.exp-act git`, onOpenGit) + 접기 버튼(collapse, Shell이 주입하는 onCollapse). 현재 `.fe-workspace-header`의 워크스페이스명/dots는 폴더 리스트로 이동.
  - **폴더 리스트** `.fe-folders`(신규): 메인 폴더 버튼 `.fe-frow main`(IconFolder accent + project명 + 우측 `Ctrl O` kbd 힌트 / 레퍼런스 있으면 "메인" 칩) + 레퍼런스 폴더들 `.fe-frow`(IconFolder + 이름 + `.f-x` 닫기 hover) + `.fe-folder-add` 점선 버튼("＋ 폴더 추가").
  - **"viewing" 모델 채택**: 로컬 `viewing` state(''=메인). 메인 버튼 클릭=viewing이면 메인 복귀, 아니면 `openWorkspace()`(다른 폴더). 레퍼런스 버튼 클릭=`setViewing(refId)` → 트리 영역에 그 ref의 `tree`(store ReferenceEntry.tree) 렌더. **기존 하단 `.fe-ref-section` 스택 섹션 제거**, 폴더 리스트 스위처로 대체. 메인 보기일 때만 changedFiles 마커 적용.
  - **검색창** `.fe-search`: 비었을 때 우측 `Ctrl F` kbd 힌트 추가(`.fe-search .kbd`).
  - **빈상태 카드** `.fe-blank`(신규): 아이콘 원(`.fe-blank-ic`) + 2줄 안내 + "폴더 선택" 버튼(`.fe-blank-btn`). 기존 `.file-explorer--empty` 대체.
  - 트리 행: 기존 `.fe-tree`/`.fe-file`/`.fe-node`/`.fe-node-name`/FileBadge 유지(e2e `.fe-file`·`.ftbadge`·검색 필터 보존). changedFiles 마커는 `.fe-chg`(또는 기존 `.fe-changed-dot`) 'M'로 — store가 tag 무구분이므로 단일 'edit'(M)만(🟡 new/edit 분리=M4).
- `src/renderer/src/components/FileExplorer.css` — 원본 styles.css L397~526(.exp-*) 시각값 이식(우리 `.fe-*` 네이밍으로): 헤더/폴더리스트/폴더추가/kbd/빈상태. 인라인 색 0 — 토큰만. indent=8+depth*14(원본 일치, 현재 10→8).
- `src/renderer/src/components/Sidebar.tsx` 등 **변경 금지**.

## 트리거 자기완결 (계약 보존)
- `FileExplorerProps`에 `onCollapse?`(접기) 추가 — **optional**(미주입 시 버튼 숨김, 기존 호출부 무파손). Shell이 Phase 02에서 주입.
- 기존 `onOpenGit?` 유지(헤더로 위치만 이동).

## 작업 단계 (TDD)
1. (qa 협조 또는 동일 PR 단위) FileExplorer 단위 테스트 먼저: `.fe-head .fe-title`("탐색기") 존재 · 메인 폴더 버튼(project명+Ctrl O) · 레퍼런스 버튼 클릭→viewing 전환(그 ref 트리 표시, 메인 트리 숨김) · 폴더 추가 버튼 · 검색 Ctrl F 힌트 · 빈상태 카드 · 기존 `.fe-file` 클릭 openFile 회귀 0.
2. 구현(DOM 재구조화 + CSS 이식).
3. 기존 `fileexplorer`/`components` 단위 테스트 회귀 수정(셀렉터 변경분).

## 신 셀렉터 계약 (02 e2e 재작성이 참조 — 이름 고정)
- `.fe-head` / `.fe-head .fe-title`("탐색기") · `.fe-folders` · `.fe-frow`(+`.fe-frow.main`) · `.fe-folder-add` · `.fe-blank`/`.fe-blank-btn` · 검색 `.fe-search .kbd`.
- **viewing 스위처**: 레퍼런스 폴더는 `.fe-frow`(메인 아님)로 렌더 → 클릭 시 `viewing` 전환, 해당 ref 트리를 `.fe-tree`에 표시(메인 트리 숨김). **기존 `.fe-ref-section`은 제거** → 02/qa가 '레퍼런스' e2e를 `.fe-frow` 클릭 모델로 재작성한다.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] 단위: 위 1번 케이스 PASS. **`.fe-head .fe-title`('탐색기')·`.fe-frow.main`(project명)·`.fe-folder-add`·`.fe-blank`·`.fe-search .kbd` 존재 단언** + 레퍼런스 `.fe-frow` 클릭→viewing 전환(그 ref 트리 표시, 메인 트리 숨김) 단언.
- [ ] `.fe-tree`/`.fe-file` 셀렉터 보존(검색 필터·파일 클릭 회귀 0). `.fe-ref-section` 제거 확인.
- [ ] scope grep: window.api 신규 호출 0(store 액션만). 인라인 색 0.
- [ ] `npm run test`(vitest) 회귀 0. (레퍼런스/탭 **e2e**는 02의 qa 핸드오프에서 재작성 — 01 단독으론 e2e 미실행.)

## 참조
원본 `Explorer.tsx` L329~466 · `styles.css` L397~526 · REPLICA_GAP F15.
