# F15 — 레이아웃 정정 (탐색기 디테일 + 파일 뷰어 플로팅 모달)

> 사용자 실측 발견: 우리 셸은 파일 클릭 시 **이중 탭 자동전환**(탐색기→diff, 대화→코드)으로 탐색기·채팅이 둘 다 사라짐. 원본은 **탐색기·채팅 항상 유지 + 파일=플로팅 모달(`.fv-overlay`/`.rzm`)**. 원본 직접 조작으로 확정(artifacts/screenshots/ref-02·03).

## 결정 (사용자)
- **코드/diff = 원본기반 플로팅 모달, 기본 "창모드"** — 코드+채팅 동시 표시. 최대화 토글로 원본(전체 덮기)도 가능.
- 탐색기 디테일 = 원본 1:1 폴리싱.

## Phase
| # | slug | 도메인 | 깃발 | 의존 |
|---|---|---|---|---|
| 01 | explorer-detail-polish | renderer | 없음 | F14 |
| 02 | filemodal-overlay-layout | renderer | 없음(새 IPC 0, 모달=순수 renderer) | 01 |
| (e2e) | visual-viewer 갱신 | qa | 없음 | 02 |

## 원본 레퍼런스 (C:/Dev/AgentCodeGUI, 읽기전용)
- `src/renderer/src/components/Explorer.tsx` — exp-head/exp-folders/exp-frow/exp-fadd/exp-search(kbd)/exp-tree/exp-blank, "viewing" 모델
- `src/renderer/src/components/FileModal.tsx` L1870~1964 — `.fv-overlay > .fv-modal.rzm > .diff-head` 헤더 anatomy
- `src/renderer/src/components/resizableModal.tsx` — `useResizableModal`/`ModalResizeHandles` 훅
- `src/renderer/src/styles.css` — L397~526(.exp-*), L535~560(.chat-files/.cf-tab), L1337~1349(.diff-head), L1380~1386·1899~1924(.fv-overlay/.fv-modal/.rzm/.rzm-h)

## 검증 게이트
typecheck(main+web) · vitest 전체 · lint · playwright e2e 회귀 0 · 핸즈온 시각검증(우리 앱 구동→파일클릭→스샷, 원본 1:1 대조) · reviewer(신뢰경계: 모달=순수 renderer, 새 IPC 0).
