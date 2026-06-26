---
owner: 영호
milestone: RF1
phase: 02
title: artifacts 옛 프로브 스크립트 정리
status: pending
grade: 단순
loop_track: auto-gate
estimated: 0.3h
domain: cross
summary: artifacts/*-probe.mjs 등 옛 개발 프로브 스크립트 물리 삭제 + artifacts 폴더 정책 정리
---

# Phase 02: artifacts 옛 프로브 스크립트 정리

> **상태**: pending
> **마일스톤**: RF1-cleanup (트랙 A · 위생)
> **등급**: 단순 (가역 · 추적 안 되는 잡파일 삭제)
> **담당**: 메인 직접

---

## 🎯 목표

`artifacts/`(이미 git-ignored)에 쌓인 옛 개발 프로브 스크립트(`context-probe.mjs`·`crons-probe.mjs`·`delete-probe.mjs`·`idle-probe.mjs` 등)를 물리 삭제하고, `artifacts/`의 용도(스크린샷 산출물 전용 — `docs/ARCHITECTURE.md`)를 명확히 한다.

---

## ⏪ 사전 조건

- [ ] 없음 (독립 Phase)

---

## 📝 작업 내용

- [ ] `artifacts/` 내용 전수 조사 — `*-probe.mjs` 외에 더 있는지 (screenshots/ 같은 정식 산출물은 보존)
- [ ] 각 프로브가 *일회성 디버그용*인지 확인 (어디서도 import/참조 안 됨 → grep)
- [ ] 옛 프로브 스크립트 삭제 (git 미추적이라 git 영향 0)
- [ ] `artifacts/`가 비면 `.gitkeep` 또는 README로 용도 명시 (e2e 스크린샷 출력 경로)

---

## ✅ 완료 조건

- [ ] `artifacts/`에 옛 프로브 스크립트 0개
- [ ] 삭제 대상이 코드 어디서도 참조 안 됨(grep 0건) 확인 후 삭제
- [ ] `npm run test` green (프로브 삭제가 테스트 무영향 확인)

---

## 📚 학습 포인트

- **일회성 디버그 산출물 위생** — 탐색용 스크립트는 작업 후 정리. 안 그러면 "이거 뭐였지?" 고고학 비용 누적.
- **삭제 전 참조 확인** — grep으로 "정말 안 쓰이나" 증명 후 삭제 (회귀 안전).

---

## ⚠️ 함정

- 정식 산출물(e2e 스크린샷 `visual-viewer`)을 프로브로 오인 삭제 — `docs/ARCHITECTURE.md` "스크린샷→artifacts/screenshots/" 확인.
- git-ignored라 안심하지 말 것 — 그래도 grep 참조 확인은 필수.

---

## 담당 SubAgent

> 메인 직접 (잡파일 삭제 — 단순)
