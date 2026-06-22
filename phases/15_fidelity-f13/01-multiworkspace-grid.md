# Phase 01: multiworkspace-grid

## 목표
**MultiWorkspace 그리드**(헤더 count 탭 2~6 + 그리드 열 변동 + 패널 head/ctx/thread) + store mode 트리거 + Shell 통합.

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통~복잡.

## 의존 Phase
F12(완료).

## 위험 깃발
없음 (renderer. 새 IPC 0. window.api.multi 미사용. 동시 실행=M4).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/store/appStore.ts` — `workspaceMode:'single'|'multi'`(기본 single) + `setWorkspaceMode` + selectWorkspaceMode. renderer state만, 새 IPC 0.
- `src/renderer/src/lib/multiAgentSampleData.ts`(신규) — SAMPLE_PANELS 6{title,status:'idle'|'analyzing'|'working'|'done'|'error',cwd,ctxPct,sysPrompt?} + COLS{2:2,3:3,4:2,5:3,6:3} + COUNT_OPTIONS[2,3,4,5,6] + STATUS_META + DEFAULT_PICKER(opus/xhigh/bypass) + **SAMPLE_BATCH_TO(더미 대상 폴더 경로 — F13-02 일괄폴더 FolderSwitch from/to용)**. window.api 0.
- `src/renderer/src/components/MultiWorkspace.tsx`+CSS(신규) — `.multi` > ma-head(ma-head-ic IconGrid + ma-head-title + spacer + ma-batch 「일괄 폴더」[F13-02 트리거] + UsagePill 5시간/주간[정적 %] + ma-count tabs 2~6, count 로컬 state 기본 4) + ma-grid(gridTemplateColumns repeat(COLS[count]), 패널 count개). 
- `src/renderer/src/components/PanelView.tsx`+CSS(신규 또는 MultiWorkspace 내부) — ma-panel(data-slot) > ma-p-head(ma-p-row1: 슬롯번호 + 상태 dot[STATUS_META] + ma-p-title + spacer + busy spin/time; ma-p-row2: ma-p-folder cwd + 프롬프트 버튼[F13-02]) + ma-p-ctx(ma-ctx-ring conic `--p:ctxPct` + ma-ctx-label 컨텍스트 + ma-ctx-detail "N/M 토큰" + ma-ctx-pct) + ma-p-body(ma-p-zoom 「크게 보기」[F13-02] + ma-p-thread 빈 "메시지를 입력해 작업을 시작하세요"). footer(RunPickers/PanelComposer)는 F13-02.
- `src/renderer/src/layout/Shell.tsx` — selectWorkspaceMode 구독 → mode==='multi'면 메인 영역(탐색기|대화|에이전트 컬럼) 대신 `<MultiWorkspace>` 렌더(사이드바 유지). 기존 단일 레이아웃은 mode==='single' 분기.
- `src/renderer/src/components/Sidebar.tsx` — F8 mode 로컬 state → **store(workspaceMode) 구독+setWorkspaceMode**로 이전. **props 시그니처 무변경**. sb-mode 토글이 store 갱신.
- `src/renderer/src/components/icons.tsx` — 필요분.

## 작업 단계
1. store mode + 샘플 데이터.
2. MultiWorkspace(헤더 count 탭 + 그리드 cols) + PanelView(head/ctx/thread).
3. Shell 분기(multi→grid) + Sidebar mode→store.
4. CSS(ma-* — ctx-ring conic·grid·panel). 인라인 색 0(conic --p·grid cols 동적 인라인 허용).
5. 단위 테스트.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] 테스트: 사이드바 멀티 토글 → store workspaceMode='multi' · MultiWorkspace 렌더(ma-head·ma-count 5탭·ma-grid) · count 탭 클릭(2→6) → 패널 수/cols 변동 · PanelView(슬롯번호·상태 dot·ctx-ring·빈 thread) · 단일 토글 → 복귀. PASS.
- [ ] scope grep: MultiWorkspace/store mode window.api.multi 0(샘플/로컬).
- [ ] **Sidebar props 무변경** · 기존 sidebar-sessions/shell 회귀 0(mode store 이전 후 토글 aria-selected 보존).
- [ ] **store 누수 차단(필수)**: `sidebar-sessions.test.tsx`·`shell-chrome.test.tsx` `afterEach`에 `useAppStore.setState({ workspaceMode:'single' })` 추가(전역 store 케이스간 격리 — mode 로컬→store 이전이 깨는 격리 복원).
- [ ] **상태 보존**: single↔multi 왕복 후 기존 4컬럼·leftTab/centerTab·RecentFiles(F10) 상태 보존(Shell이 컬럼 교체만, state unmount 안 함) 단정.
- [ ] `npm run test`·`test:e2e` 회귀 0.

## 참조
원본 MultiAgent.tsx L1324~1360(MultiWorkspace)·L654~(PanelView)·L60~78(COLS/STATUS) · REPLICA_GAP F13.
