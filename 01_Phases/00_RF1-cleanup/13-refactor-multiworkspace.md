---
owner: 영호
milestone: RF1
phase: 13
title: MultiWorkspace.tsx 분해
status: done
grade: 복잡
risk: ui-visual
loop_track: human-visual
estimated: 3h
domain: renderer
summary: 1582줄 MultiWorkspace를 하위 컴포넌트/훅으로 분해 (셸 레이아웃·시각 거동 불변, 육안 게이트)
---

# Phase 13: MultiWorkspace.tsx 분해

> **상태**: pending
> **마일스톤**: RF1-cleanup (트랙 C · 리팩토링)
> **등급**: 복잡 (1582줄이나 — 1 도메인(renderer)·격리된 단일파일·net 신규줄 적음(추출 위주) → 복잡 방어. ui-visual로 사람 트랙)
> **담당**: renderer — 사람 육안 게이트

---

## 🎯 목표

`02.Source/renderer/src/components/00_shell/MultiWorkspace.tsx`(1582줄)를 **하위 컴포넌트 + 커스텀 훅**으로 분해한다 (패널 관리·레이아웃·세션 라우팅 분리). 시각·동작 1픽셀 불변.

---

## ⏪ 사전 조건

- [ ] Phase 06 — components 이동 완료 (이동 후 분해 = import 1회 갱신)

---

## 📝 작업 내용

- [ ] 책임 식별: 패널 그리드 레이아웃 / 패널별 세션 상태 / 키보드·포커스 / 추가·제거 로직
- [ ] 로직은 커스텀 훅(`usePanelLayout`·`usePanelSessions` 등), 뷰는 하위 컴포넌트로 분리
- [ ] `MultiWorkspace.tsx`는 조립 셸로 슬림화
- [ ] 짝 CSS도 하위 컴포넌트로 분할 (해당 시)
- [ ] 6패널 독립 usePanelSession(runId 격리) 거동 보존

---

## ✅ 완료 조건

- [ ] `npm run typecheck` 0 errors · `npm run test` green · `npm run build` green
- [ ] **육안**: 2패널 동시 실행·패널 추가/제거·레이아웃 시각 불변 (`00.Documents/UI.md` 안티슬롭)
- [ ] 분해 후 최상위 파일 ≤ ~400줄
- [ ] 멀티세션 runId 라우팅 격리 거동 불변 (라이브 확인)

---

## 📚 학습 포인트

- **로직/뷰 분리** — 커스텀 훅으로 상태·부수효과를 빼면 컴포넌트는 렌더만. 테스트·재사용 쉬움.
- **거대 컴포넌트의 신호** — 1500줄 컴포넌트 = 책임 과다. 훅·하위 컴포넌트로 분산.

---

## ⚠️ 함정

- 훅 추출 중 의존성 배열·클로저 캡처 실수 → stale state·무한 리렌더. React 훅 규칙 주의.
- ui-visual = 무인 commit X. 멀티패널 동작은 e2e/육안으로만 검증 가능.

---

## 담당 SubAgent

> renderer (02.Source/renderer/** R/W) → 사람 육안 게이트.
