---
owner: 영호
milestone: CP1
phase: 03
title: 패널 cwd send·팔레트 배선
status: pending
grade: 보통
risk:
loop_track: human-visual
estimated: 1~3h
domain: renderer
summary: 패널 send가 panel.cwd를 workspaceRoot로 전달(전역 폴백) + 패널 팔레트 목록이 패널 root 기준 조회.
---

# Phase 03: 패널 cwd send·팔레트 배선

> **상태**: pending
> **마일스톤**: CP1
> **등급**: 보통
> **담당**: renderer

---

## 🎯 목표

패널 send 경로가 전역 workspaceRoot 대신 panel.cwd를 우선 전달하고(미설정 시 기존 전역 폴백), 패널의 슬래시/스킬 팔레트가 P01 파라미터로 패널 root 기준 목록을 조회한다. 라벨 표시와 실제 cwd가 일치한다.

---

## ⏪ 사전 조건

- [ ] **P02** — 핸들러 root 수용·재검증 + 전역 폴백 완료.

---

## 📝 작업 내용

- [ ] `PanelView.tsx:265-267` send 경로에서 panel.cwd 우선 전달 (미설정 시 기존 전역 — 거동 회귀 0).
- [ ] 패널 슬래시/스킬 팔레트가 P01 root 파라미터로 패널 root를 전달하여 목록 조회.
- [ ] 단일챗(비패널)은 전역 root 유지 — 변경 없음.
- [ ] 라벨 표시(panel.cwd)와 실제 send cwd 일치 확인.
- [ ] 테스트: 패널 cwd 유/무 × run·팔레트 조합.

---

## ✅ 완료 조건

- [ ] `npm run typecheck` (main+renderer) 0 errors
- [ ] `npm run test` green (패널 cwd 유/무 × run·팔레트 PASS)
- [ ] `npm run lint` 0 problems
- [ ] **영호 육안** — 패널별로 다른 프로젝트의 커맨드 목록이 표시됨(FB2 때 증상의 최종 봉합) 확인. loop_track: human-visual — 기능은 진행하고 육안 검토 병행(무인 commit X).

---

## 📚 학습 포인트

- **표시 vs 동작 정합** — 라벨(panel.cwd)이 표시만 하고 실제 동작은 전역을 쓰면 사용자 신뢰가 깨진다. UI가 약속한 것을 동작이 지켜야 한다.
- **폴백 우선순위** — `panel.cwd ?? 전역 root` 패턴으로 명시적 설정을 우선하되 미설정을 안전하게 처리.

---

## ⚠️ 함정

- `p15-panel-cwd` 기존 테스트와 정합 — 회귀시키지 말 것.
- 단일챗 경로에 패널 cwd 로직을 섞지 말 것(전역 유지).

---

## 담당 SubAgent

renderer
