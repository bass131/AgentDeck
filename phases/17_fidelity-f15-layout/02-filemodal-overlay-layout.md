# Phase 02: filemodal-overlay-layout

## 목표
파일 클릭 시 **이중 탭 자동전환 제거** → 탐색기·채팅 **항상 유지**, 코드/diff는 **플로팅 리사이즈 모달**(`.fv-overlay`/`.fv-modal.rzm`)로 오버레이. 결정=**기본 창모드**(코드+채팅 동시), 최대화 토글=원본(전체 덮기). 새 IPC 0 — 모달은 순수 renderer, 기존 뷰어 컴포넌트 재사용.

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 복잡.

## 의존 Phase
F15-01.

## 위험 깃발
**없음** — 모달=순수 renderer 오버레이. fs/Node/IPC 신규 0. 기존 store 액션(openFile/selectDiffFile)·뷰어(CodeViewerPane/DiffViewerPane/MarkdownView/ImagePreview) 재사용. reviewer 신뢰경계 점검 대상이나 새 권한작업 없음.

## 변경 대상 (이 경계 밖 금지)
### Shell 재구성 — `src/renderer/src/layout/Shell.tsx`
- **좌측 pane**: `탐색기/diff` pane-tabs **제거**. 탐색기 = `<FileExplorer onOpenGit onCollapse>`만(항상). 접힘 rail 유지(`.col-rail`). DiffViewerPane는 모달로 이동.
- **중앙 pane**: `대화/코드` pane-tabs **제거**. 항상 = 채팅 헤더 + `<RecentFiles>` 스트립(`.chat-files`) + `<Conversation>`. CodeViewerPane 직접 렌더 제거(모달로).
- **자동전환 useEffect 2개 제거**(`diffFilePath→leftTab`, `openedFile→centerTab`). `leftTab`/`centerTab` state 삭제.
- `<FileModal/>` 오버레이 렌더 추가(아래). multi 모드 분기·기타 모달·단축키·footer 유지.
### 새 리사이즈 모달 훅 — `src/renderer/src/lib/resizableModal.tsx`(신규)
- 원본 `resizableModal.tsx` 이식: `useResizableModal(storageKey, open, {defaultMaximized})` + `ModalResizeHandles`. **단 기본=창모드**(`defaultMaximized:false`). 크기 영속은 localStorage(ui-prefs IPC=M5이므로 localStorage 폴백). MIN_W=520/MIN_H=300, 핸들 e/w/s/se/sw.
### 새 파일 모달 — `src/renderer/src/components/FileModal.tsx`(신규) + CSS
- `openedFile`(store)가 null이면 미렌더. 있으면:
  - `.fv-overlay`(스크림) > `.fv-modal.rzm`(rz.modalStyle). **기본 창모드=우측 도킹 창**(CSS 기본: 화면 우측 영역 ~58% width·~80% height, top/ right inset). **스크림은 약하게 + backdrop pointer-events 비차단**(창모드에선 탐색기·채팅 클릭 가능 → 코드+채팅 동시 사용). **최대화 시**: 전체 덮기 + 짙은 스크림(원본 동일).
  - `.diff-head` 헤더: FileBadge(size 22) + `.dpath`(`.dir` + name) + 변경시 `tag`(NEW/EDIT) + `.dspacer` + 최대화 버튼(`.dclose`, IconMax/IconRestore, rz.toggleMaximize) + 닫기(`.dclose`, IconClose). 헤더 더블클릭=rz.onHeaderDoubleClick. 읽기 배지(정적 "읽기").
  - 본문 라우팅(기존 뷰어 재사용): 변경 파일(diffFilePath & changed)→`<DiffViewerPane>`; 그 외 viewer=image→ImagePreview, markdown→MarkdownView, code→CodeViewerPane(또는 CodeViewer). 읽기전용 배지(레퍼런스) 유지.
  - 닫기: `requestClose` → store 액션으로 opened 상태 리셋(`closeOpenedFile` 신규 또는 openFile(null) 동등). 오버레이 바깥(창모드 스크림 영역) 클릭=닫기. **Esc=닫기**(기존 useGlobalShortcuts/모달 Esc 우선 규칙 준수 — FileModal 자체 keydown으로 처리, 전역 preventDefault 금지).
  - `!rz.maximized && <ModalResizeHandles onStart={rz.startResize}/>`.
### store — `src/renderer/src/store/appStore.ts`
- 닫기 액션 추가(`closeOpenedFile`): openedFile/openedContent/openedStatus/diffFilePath 초기화. (openFile 시그니처·기존 셀렉터 무변경.)
### RecentFiles 위치
- 채팅 헤더 영역(`.chat-files`)으로 이동(원본 위치). 탭 클릭=openFile(모달 표시), x/ctx-menu=기존. 모달 닫혀도 스트립 유지(재열기). props 시그니처(files/activePath/onOpen/onRemove/onReorder) **무변경** — store recentFiles/openedFile 계약 보존.
- **diff 정확성은 범위 밖**: 본문이 변경 파일에 `DiffViewerPane`를 재사용할 뿐, "fs.diff HEAD 빈 기준 → 모두 add" 버그는 **M3 소관**. F15는 컴포넌트 재사용만(시각검증자/reviewer 혼선 차단용 명시).

### qa 핸드오프 — 깨질 기존 테스트 (신모델로 재작성, 02 완료조건에 포함)
> 이 변경으로 **확정 회귀**. 단순 셀렉터 치환이 아니라 *케이스 재작성*이 필요한 것은 ★ 표시. 02는 이들이 green이 되어야 완료(qa 협조, 동일 PR).
- `tests/e2e/core-loop.e2e.ts` L51-52 — `.pane.chat .pane-tab '대화'/'코드'` 단언 **삭제**(탭 제거).
- ★ `tests/e2e/core-loop.e2e.ts` L73-82 — "파일 클릭→`.pane.explorer`가 코드 내용" 케이스 → **신 기대값**: 파일 클릭 → `.fv-overlay` 표시 + `.diff-head .dpath`에 경로 + **`.pane.explorer`·`.pane.chat` DOM 유지**(자동 탭전환 없음). 닫기(Esc/`.dclose`)→`.fv-overlay` 사라지고 채팅 복귀.
- `tests/e2e/visual-viewer.e2e.ts` — L122/149/175/207/263 `.pane-tab '대화'` 활성화 스텝 **삭제**(대화 항상 표시), L281/296 `.pane.explorer .pane-tab '탐색기'' 복원 스텝 **삭제**(탐색기 항상 표시), 헤더 주석 L17-18(diff 자동전환 전제) 갱신.
- ★ `tests/e2e/visual-viewer.e2e.ts` L276-297(F10 RecentFiles) — 파일 2개 열기에서 "탐색기 탭 복원" 제거, `.chat-files`는 항상 가시. `.code-viewer` 대기 → `.fv-overlay .diff-head`/모달 본문 대기로 교체.
- ★ `tests/e2e/visual-viewer.e2e.ts` L338-352('레퍼런스') — `.fe-ref-section` 의존 제거 → 01의 **viewing 스위처** 신모델로 재작성: `.fe-frow`(ref 폴더) 클릭→트리 표시→ref 파일 클릭→`.fv-overlay` + 읽기전용 배지.
- `tests/renderer/components.test.tsx` L296 `getByText('대화')`(탭 라벨) 등 Shell 단위 탭 의존분 — 탭 제거 반영(`.pane-tab` 0 단언으로 교체).

## 작업 단계 (TDD)
1. 단위 먼저: FileModal open(openedFile set→`.fv-overlay` 표시·헤더 path·최대화 토글 class·닫기→closeOpenedFile) · openedFile null→미렌더 · Shell에 pane-tab 부재(`.pane-tab` 0) · 파일 클릭→자동 탭전환 없음(탐색기·채팅 DOM 유지) · Esc→닫기(다른 모달 회귀 0).
2. resizableModal 훅 + FileModal + Shell 재구성 + store closeOpenedFile.
3. 기존 단위 테스트 회귀 수정(Shell 탭 의존분).

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck`(main+web) green.
- [ ] 단위: FileModal open(openedFile set→`.fv-overlay`)·close(closeOpenedFile)·Esc·미렌더(null). Shell `.pane-tab` **0개**(탭 제거). 파일 클릭→탐색기·채팅 DOM 유지(자동 탭전환 0).
- [ ] **창모드/최대화 측정자(클래스 토글)**: 기본=`.fv-overlay--windowed`(backdrop 비차단), `rz.toggleMaximize`→`.fv-overlay--full`(전체 덮기+스크림). 단위로 클래스 토글 단언(CSS 효과는 핸즈온 시각검증).
- [ ] **신뢰경계**: 모달=순수 renderer, 새 IPC 0, 기존 store 액션만. scope grep: window.api 신규 0. 인라인 색 0.
- [ ] `npm run test`(vitest) 회귀 0. `npm run lint` 0.
- [ ] **e2e 신모델 재작성 후 green**: 위 "qa 핸드오프" 6개 항목(★ 3개는 케이스 재작성) 반영 → `npm run test:e2e` green. "회귀 0"이 아니라 *명시된 케이스를 신모델로 재작성*이 측정자.

## 참조
원본 `FileModal.tsx` L1870~1964 · `resizableModal.tsx` 전체 · `styles.css` L1337~1349·1380~1386·1899~1924 · REPLICA_GAP F15.
