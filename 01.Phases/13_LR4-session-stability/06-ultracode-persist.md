---
owner: 영호
milestone: LR4
phase: 06
title: Ultracode 토글 오복원 — 리마운트 유지
status: done
grade: 보통
risk: ui-visual
loop_track: human-visual
estimated: 1~3h
domain: renderer
summary: 컴포넌트 로컬 useState(스코프 과소)를 상위 리프팅/세션별 유지 — 화면 전환 왕복에 OFF 보존.
---

# Phase 06: Ultracode 토글 오복원 — 리마운트 유지

> **상태**: done
> **마일스톤**: LR4
> **등급**: 보통
> **담당**: renderer

---

## 🎯 목표

끈 Ultracode가 단일→멀티→단일 왕복에 유지되게 한다(현재는 언마운트로 소멸→ON 리셋).

---

## ⏪ 사전 조건

- [x] renderer 독립이나 **P05 뒤 순차** — P05·P06 둘 다 renderer(PanelView·Shell) 파일이 겹쳐 병렬 시 충돌 → P05 완료 후 착수.

---

## 📝 작업 내용

- [x] **(a) 스코프(세션별 vs 전역) 결정 — P06 착수 전 1회 확정·문서화** — P07 REPL 토글과 원칙 통일(P07 재작업 방지). 이 결정을 먼저 고정한 뒤 리프팅에 착수한다. → 세션별 확정(단일=conversationId·멀티=panelSessionKey, P07 원칙 통일, 2026-07-11).
- [x] **(b) 상태 리프팅** — orchestration 상태를 `Composer.tsx:135`/`PanelView.tsx:135` 로컬 useState에서 상위(Shell 수명 or store)로 리프팅.
- [x] **(c) 멀티 진입 보존** — 멀티 진입 언마운트(`Shell.tsx:350`)에도 OFF 보존.

---

## ✅ 완료 조건

- [x] 단일→멀티→단일 왕복 OFF 유지 테스트 PASS
- [x] `npm run typecheck` (main+renderer) 0 errors · `npm run test` green · `npm run lint` 0 problems
- [x] 육안(영호) 확인. (2026-07-12 이상 무)

---

## 📚 학습 포인트

- **상태 리프팅(lifting state up)** — 컴포넌트 로컬 useState는 언마운트 시 소멸한다. 리마운트를 넘어 유지해야 하는 상태는 상위 컴포넌트나 store로 끌어올려 스코프를 맞춘다.
- **스코프 과소/과대** — 상태의 생명주기가 UI 요구보다 짧으면(과소) 소멸 버그, 길면(과대) 누수 버그. 요구 스코프에 정확히 맞추는 것이 설계 포인트.

---

## ⚠️ 함정

- 세션별 vs 전역 스코프 결정(P07과 통일).
- human-visual — 영호 육안 확인 필요.

---

## 담당 SubAgent

renderer
