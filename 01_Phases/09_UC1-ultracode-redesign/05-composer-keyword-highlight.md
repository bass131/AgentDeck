---
owner: 영호
milestone: UC1
phase: 05
title: 컴포저 키워드 하이라이트 — 보라 그라데이션 애니메이션 (미러 오버레이)
status: done
grade: 복잡
risk: ui-visual
loop_track: human-visual
estimated: 2.5h
domain: renderer
summary: 투명 textarea + 미러 오버레이로 "ultracode"/"/workflows"에 Claude Code CLI풍 보라 그라데이션 애니메이션 + UI.md 네온 예외 확장
---

# Phase 05: 컴포저 키워드 하이라이트 — 보라 그라데이션 애니메이션 (미러 오버레이)

> **상태**: pending
> **마일스톤**: UC1-ultracode-redesign
> **등급**: 복잡 (오버레이 동기화 난도 + ui-visual)
> **담당**: renderer
> **loop_track 근거**: human-visual — 코드·기계 게이트는 자율 진행, **미감·최종 커밋은 영호 육안 승인**(버킷 b, 무인 commit X).

---

## 🎯 목표

컴포저에서 "ultracode"(대소문자 무관)·"/workflows"를 입력하면 해당 글자에 **보라 그라데이션 애니메이션**(Claude Code CLI의 ultracode 키워드 렌더링과 같은 메커니즘)이 실시간 적용된다. P04의 감지 함수와 동일 규칙(단일 진실원)으로 하이라이트 위치를 계산한다.

---

## ⏪ 사전 조건

- [ ] Phase 04 완료 (감지 함수 존재 — 하이라이트와 트리거의 규칙 단일화)

---

## 📝 작업 내용

- [ ] **미러 오버레이 구조** — textarea는 부분 스타일 불가: 컴포저 textarea 뒤(또는 앞, pointer-events:none)에 같은 폰트·패딩·줄바꿈의 미러 div를 겹치고, 텍스트를 span 분해해 키워드 구간만 그라데이션 클래스 적용. textarea 텍스트는 키워드 구간만 투명 처리(또는 미러가 뒤에서 발광) — 구현 중 더 단순한 기법 발견 시 채택하되 스크롤·IME(한글 조합) 동기화가 판정 기준.
- [ ] **그라데이션 애니메이션** — CSS `background: linear-gradient(...보라 계열...)` + `background-clip: text` + keyframes로 흐르는 애니메이션. 색은 기존 UltraCode pill 보라 계열(`--orch-*` 또는 실측 HEX)에서 파생 — 새 팔레트 발명 금지.
- [ ] **UI.md 정합** — §1 팔레트(그라데이션 토큰)·§5 안티슬롭 네온 예외에 "컴포저 UltraCode 키워드 하이라이트" 확장 등재(ADR-032 waiver 근거 명기). ※ UI.md는 living doc — 메인 세션이 직접 갱신(영호 통제 인접).
- [ ] 단위 테스트: 키워드 구간 분해 함수(텍스트 → [일반|하이라이트] 세그먼트 배열) 경계 테스트.
- [ ] 성능: 입력마다 재계산 — 세그먼트 분해는 O(n) 정규식 1패스, 과도한 리렌더 없게(memo).

## ✅ 완료 조건

- [ ] 세그먼트 분해 단위 테스트 green / `npm run typecheck` 0 / `npm run test` green / `npm run lint` 0
- [ ] 스크롤·줄바꿈·한글 IME 조합 중 오버레이 어긋남 없음(수동 확인 항목 명시 보고)
- [ ] reviewer(ui-visual 깃발 무조건) CRITICAL 0
- [ ] **영호 육안 승인(버킷 b)** — 라이브 앱에서 하이라이트 확인 전 commit 금지

## 📚 학습 포인트

- **textarea 하이라이트의 표준 기법** — contentEditable 전환(복잡·IME 지뢰) 대신 미러 오버레이가 관용구인 이유: 입력 동작은 네이티브 그대로 두고 *표시만* 겹친다 — 관심사 분리.
- **명문화된 waiver** — 안티슬롭 "네온 금지"를 어기는 게 아니라, 예외를 ADR+UI.md에 등재해 "의도된 이탈"로 만든다(ADR-030 선례).

## ⚠️ 함정

- IME 조합 중(한글 입력 중간 상태) 미러와 textarea 텍스트가 순간 어긋날 수 있음 — compositionstart/end 처리 검토.
- 다크/라이트 듀얼 테마 모두에서 대비 확인(UI.md 듀얼 테마 원칙).
- 멀티 패널 컴포저에도 적용 여부 — 단일 컴포저 우선, 멀티는 동일 컴포넌트 공유면 자동 적용·아니면 보고 후 범위 확정.

## 담당 SubAgent

renderer
