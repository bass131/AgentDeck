---
owner: 영호
milestone: RF1
phase: 14
title: Composer.tsx 분해
status: pending
grade: 복잡
risk: ui-visual
loop_track: human-visual
estimated: 3h
domain: renderer
summary: 1262줄 Composer를 입력·히스토리·이미지첨부·슬래시팔레트·큐 훅으로 분해 (입력 거동 불변)
---

# Phase 14: Composer.tsx 분해

> **상태**: pending
> **마일스톤**: RF1-cleanup (트랙 C · 리팩토링)
> **등급**: 복잡 (1262줄이나 — 1 도메인(renderer)·격리된 단일파일·net 신규줄 적음(훅 추출 위주) → 복잡 방어. ui-visual로 사람 트랙)
> **담당**: renderer — 사람 육안 게이트

---

## 🎯 목표

`02.Source/renderer/src/components/01_conversation/Composer.tsx`(1262줄)를 기능별 **커스텀 훅 + 하위 컴포넌트**로 분해한다 (입력 히스토리 ↑↓·이미지 첨부·슬래시/@mention 팔레트·메시지 큐). 입력 UX 거동 불변.

---

## ⏪ 사전 조건

- [ ] Phase 06 — components 이동 완료

---

## 📝 작업 내용

- [ ] 책임 식별: 텍스트 입력·draft / ↑↓ 히스토리(B9) / 이미지 첨부 drop·paste·picker(B7) / 슬래시·@mention 팔레트(B6) / 메시지 큐(B10)
- [ ] 각 관심사를 커스텀 훅으로 추출 (`useInputHistory`·`useImageAttach`·`useSlashPalette`·`useMessageQueue`)
- [ ] 팔레트·첨부 미리보기는 하위 컴포넌트로
- [ ] `Composer.tsx`는 조립 + 레이아웃으로 슬림화
- [ ] 원본 Chat.tsx Composer 1:1 거동 보존 (충실도 ADR-014)

---

## ✅ 완료 조건

- [ ] `npm run typecheck` 0 errors · `npm run test` green · `npm run build` green
- [ ] **육안·동작**: ↑↓ 히스토리·이미지 붙여넣기·슬래시 팔레트·실행중 큐 적재 전부 불변
- [ ] 분해 후 최상위 파일 ≤ ~350줄
- [ ] 각 훅 단위 테스트 가능 구조 (qa 후속 여지)

---

## 📚 학습 포인트

- **관심사 분리(SoC)** — 한 입력창이 5가지 일을 함 → 5개 훅으로. 각각 독립 테스트·이해.
- **제어 컴포넌트 + 훅** — 입력 상태를 훅이 소유, 뷰는 표현만. React 합성의 정석.

---

## ⚠️ 함정

- 큐·히스토리·draft가 같은 입력값을 공유 → 훅 분리 시 상태 출처 단일화 주의 (이중 소유 = 동기화 버그).
- 붙여넣기/드롭 이벤트 핸들러 이동 중 누락 → 이미지 첨부 무반응. 육안 필수.
- ui-visual = 무인 commit X.

---

## 담당 SubAgent

> renderer (02.Source/renderer/** R/W) → 사람 육안 게이트.
