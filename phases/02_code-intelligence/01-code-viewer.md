# Phase 01: code-viewer (CodeMirror 6)

## 목표
파일을 클릭하면 **CodeMirror 6 읽기전용 뷰어**가 구문 하이라이팅 + 다크(Darcula풍) 테마로 내용을 보여준다. AgentCodeGUI 스택 일치.

## 담당 도메인 / 에이전트
shared-ipc(계약) + main-process(읽기 핸들러) + renderer(뷰어). 등급: 복잡~대규모 → coordinator 분해 가능.

## 의존 Phase
M1 전체.

## 위험 깃발
**trust-boundary** (fs 읽기 — untrusted 경로) → reviewer 무조건.

## 변경 대상
- `src/shared/ipc-contract.ts` — **단일 채널 `fs.read`**(텍스트+바이너리 통합. 별도 `fs.readBinary` 신설 금지 — 채널 단일화). preload 노출.
  - 요청: `{ path, root?, asBinary?: boolean }`(`root`=루트 식별자, Phase 03에서 레퍼런스 루트 대비). 
  - 응답: **discriminated union** — `{ kind:'text', content, language }` | `{ kind:'binary', dataUrl, mime }` | `{ kind:'too-large' }` | `{ kind:'binary-skipped' }` | `{ kind:'not-found' }`. (Phase 01은 text 분기 구현, binary 분기는 Phase 02. 계약은 여기서 1회 확정.)
- `src/main/fs/read.ts` (순수에 가깝게) + `src/main/ipc/index.ts` 핸들러 — `resolveSafe`(M1) 재사용한 경로 탈출 방어 + 크기/바이너리 가드.
- `src/renderer/src/components/CodeViewer.tsx` — CodeMirror 6 read-only. 확장자→언어 매핑, 다크 테마(HighlightStyle), 큰 파일 가드.
- `src/renderer/src/theme/` — Darcula풍 CodeMirror 테마(토큰은 UI_GUIDE 팔레트 연계).
- 레이아웃: 파일 클릭 → 코드 뷰어 표시(충분한 너비 — 중앙 영역 권장). diff와 전환 가능. 워커가 UI_GUIDE 준수해 배치 판단.
- 의존성 추가: `@codemirror/state @codemirror/view @codemirror/language @codemirror/commands @codemirror/search` + 언어 패키지(`@codemirror/lang-javascript` 등 MVP 범위) + (선택) `@codemirror/theme-one-dark` 또는 자체 테마.

## 작업 단계
1. shared: `fs.read` 계약 정의 + preload 노출(채널명 단일 공급원).
2. main: 핸들러 — resolveSafe로 경로 검증, 텍스트 읽기, 바이너리(널바이트)·대용량(예: >1MB) 가드 → 적절한 응답.
3. renderer: CodeViewer 컴포넌트(CodeMirror 6, `EditorState.readOnly`). 확장자→언어 확장. Darcula풍 다크 테마.
4. 탐색기 파일 클릭 → store에 선택 파일 + 내용 로드 → CodeViewer 렌더.
5. 안티슬롭 + 신뢰경계(renderer fs 직접 X, window.api만).

## 완료조건 (AC)
- [ ] `npm run typecheck` green · `npm run test` 전체 PASS · `npm run build` OK.
- [ ] `fs.read` 경로 탈출(`../`/심링크) 거부 테스트(M1 resolveSafe 재사용 검증).
- [ ] 바이너리/대용량 파일 가드 테스트.
- [ ] renderer Node/fs 직접 호출 0 · 채널명 하드코딩 0 · 인라인 색상 0 (grep).
- [ ] e2e: 파일 클릭 → CodeMirror 뷰어에 내용 + 하이라이팅 표시(`npm run test:e2e`).

## 참조
docs/ARCHITECTURE.md(신뢰경계·IPC) · docs/UI_GUIDE.md(팔레트) · CLAUDE.md(신뢰경계·IPC단일화) · M1 `src/main/fs/workspace.ts`(resolveSafe).
