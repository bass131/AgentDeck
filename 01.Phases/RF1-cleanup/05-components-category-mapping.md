---
owner: 영호
milestone: RF1
phase: 05
title: components 도메인 카테고리 매핑 설계
status: done
grade: 보통
loop_track: auto-gate
estimated: 1h
domain: renderer
summary: components/ 평면 나열을 도메인 카테고리(common·00_shell~07_notice)로 분류하는 매핑 테이블 설계 (코드 이동 X)
---

# Phase 05: components 도메인 카테고리 매핑 설계

> **상태**: ✅ done (2026-06-27 — 매핑 확정, 영호 06↔07 분할 GO)
> **마일스톤**: RF1-cleanup (트랙 B · 구조)
> **등급**: 보통 (설계 산출물 — 코드 미변경)
> **담당**: 메인 직접 (분류 설계 R 위주) → 영호 리뷰

---

## ✅ 결과 (2026-06-27) — 확정 매핑 (P06의 단일 진실원)

`components/` 47개 `.tsx`(+짝 `.css` 42개)를 **9개 그룹**으로 분류. 구분자=`_`·촘촘·논리/데이터흐름 순(ADR-027). 누락·중복 0 (47=3+7+9+5+5+1+6+4+7).

| 그룹 | 컴포넌트 (.tsx, 짝 .css 동반) |
|---|---|
| **`common/`** (도메인 무관 원자, 번호 없음) | `icons`(css無) · `Modal` · `FullscreenOverlay` |
| **`00_shell/`** (앱 프레임·레이아웃) | `MultiWorkspace` · `Sidebar` · `TitleBar` · `PaneSplitter` · `ResizeHandles` · `Profile` · `SettingsModal` |
| **`01_conversation/`** (대화 스트림) | `Conversation` · `Composer` · `MarkdownView` · `SmoothMarkdown`(css無) · `ScrollToBottomButton` · `ToolCallCard` · `ToolGroup` · `CmdResultCard` · `SelectionToolbar` |
| **`02_file/`** (파일 탐색·탭) | `FileExplorer` · `FileBadge` · `FileModal` · `FolderSwitchDialog`(css無) · `RecentFiles` |
| **`03_viewer/`** (코드/diff/이미지 뷰어) | `CodeViewer` · `DiffViewer` · `ImageViewer` · `ImagePreview` · `SelectionAskBar` |
| **`04_git/`** (git UI) | `GitModal` |
| **`05_agent/`** (에이전트 상태·멀티에이전트) | `AgentPanel` · `SubAgentModal`(css無) · `SubAgentInline` · `SubAgentFullscreen` · `OrchestrationCard` · `ProviderStatusPanel` |
| **`06_prompt/`** (에이전트→사용자 질문 모달) | `AskModal` · `PermissionModal` · `PromptModal` · `QuestionModal` |
| **`07_notice/`** (시스템→사용자 알림·게이트·루프) | `EngineGate` · `EngineUpdateNotice`(css無) · `AppUpdateGate` · `UpdateNotes` · `WhatsNew` · `LoopIndicator` · `LoopRunningIndicator` |

**애매한 컴포넌트 근거 메모**:
- `OrchestrationCard`·`SubAgentInline` → 05_agent (대화 인라인 렌더이나 본질=멀티에이전트).
- `ProviderStatusPanel` → 05_agent (SettingsModal 탭 안이나 데이터 도메인=에이전트 백엔드).
- `SelectionAskBar`(CodeViewer CM6 선택) → 03_viewer ↔ `SelectionToolbar`(채팅 선택) → 01_conversation.
- `FullscreenOverlay`·`Modal` → common (소비처가 특정 도메인이어도 범용 오버레이/크롬 프리미티브).
- 06↔07 분할: 영호 결정 — `prompt`(에이전트가 묻는 블로킹 모달) vs `notice`(시스템 알림/루프).

**css 無 5종**(이동 시 .tsx만): `icons` · `SmoothMarkdown` · `FolderSwitchDialog` · `SubAgentModal` · `EngineUpdateNotice`.

---

## 🎯 목표

`src/renderer/src/components/`의 평면 나열된 컴포넌트들을 **도메인 카테고리로 분류한 매핑 테이블**을 만든다. 이 Phase는 *설계만* — 실제 이동은 06. (먼저 합의된 매핑이 있어야 이동이 한 번에 깔끔하다.)

---

## ⏪ 사전 조건

- [ ] Phase 04 — ADR-027 확정 (번호접두 컨벤션 근거)

---

## 📝 작업 내용

- [ ] `components/` 전 파일 목록화 (.tsx + 짝 .css)
- [ ] 도메인 카테고리 초안으로 분류 (예시 — 실측으로 조정):
  - `00.shell/` — MultiWorkspace, FullscreenOverlay, Sidebar
  - `01.conversation/` — Conversation, Composer, CmdResultCard, MarkdownView
  - `02.file/` — FileExplorer, FileBadge, FileModal, FolderSwitchDialog
  - `03.viewer/` — CodeViewer, DiffViewer, ImageViewer, ImagePreview
  - `04.git/` — GitModal
  - `05.agent/` — AgentPanel, SubAgentModal
  - `06.feedback/` — LoopIndicator, LoopRunningIndicator, AskModal, EngineGate, AppUpdateGate
  - `common/` — icons (공유 원자, 번호 없이)
- [ ] 애매한 컴포넌트(2 카테고리 걸침)는 *주 사용처* 기준 배치 + 근거 메모
- [ ] 매핑 테이블을 `_milestone-plan.md` 또는 별도 매핑 노트로 박제

---

## ✅ 완료 조건

- [ ] 모든 components/*.tsx가 정확히 1 카테고리에 배정됨 (누락·중복 0)
- [ ] 각 카테고리 ≤ ~8개 (너무 크면 분할)
- [ ] 영호 매핑 리뷰 (육안 — 분류가 직관적인지)

---

## 📚 학습 포인트

- **응집도(cohesion)** — 같이 바뀌는 것끼리 모은다. "파일 알파벳 순"이 아니라 "도메인 순".
- **이동 전 설계** — 89개 컴포넌트 트리에서 즉흥 이동은 사고. 매핑 합의 → 일괄 이동이 churn 최소.

---

## ⚠️ 함정

- 너무 잘게 쪼갬 (카테고리 12개) → 폴더 탐색 피로. 6~8 카테고리가 적정.
- `common/`에 뭐든 던지기 → 의미 희석. 진짜 공유 원자만.

---

## 담당 SubAgent

> renderer (UI 도메인 지식 필요) 또는 메인 직접 (분류 설계는 R 위주)
