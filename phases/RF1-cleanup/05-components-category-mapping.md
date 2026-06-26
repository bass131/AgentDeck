---
owner: 영호
milestone: RF1
phase: 05
title: components 도메인 카테고리 매핑 설계
status: pending
grade: 보통
loop_track: auto-gate
estimated: 1h
domain: renderer
summary: components/ 평면 나열을 도메인 카테고리(00.shell~06.feedback)로 분류하는 매핑 테이블 설계 (코드 이동 X)
---

# Phase 05: components 도메인 카테고리 매핑 설계

> **상태**: pending
> **마일스톤**: RF1-cleanup (트랙 B · 구조)
> **등급**: 보통 (설계 산출물 — 코드 미변경)
> **담당**: renderer (또는 메인 직접 — 분류 설계)

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
