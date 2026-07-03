---
owner: 영호
milestone: UC1
phase: 07
title: 토글 단일 진실원 — 키워드 승격 폐지 + 기본 ON + OFF 유도 힌트 (ADR-032 v2)
status: pending
grade: 보통
risk: ui-visual
loop_track: human-visual
estimated: 1.5h
domain: renderer
summary: 전송 orchestration = 토글 상태 그대로(키워드 OR 제거), 토글 기본 ON, OFF+키워드 시 뮤트 하이라이트 + 명시적 사용 유도 힌트
---

# Phase 07: 토글 단일 진실원 — 키워드 승격 폐지 + 기본 ON + OFF 유도 힌트 (ADR-032 v2)

> **상태**: pending
> **마일스톤**: UC1-ultracode-redesign
> **등급**: 보통 (전송 경로 로직은 축소 — 힌트/뮤트가 ui-visual)
> **담당**: renderer
> **loop_track 근거**: human-visual — 로직·기계 게이트는 자율 진행, OFF 뮤트·힌트 미감은 P05와 묶어 영호 육안 1회(버킷 b, 무인 commit X).

---

## 🎯 목표

ADR-032 **개정 v2**가 renderer에 성립한다: 전송되는 `orchestration`이 **토글 상태 그대로**이고(보이는 것 = 전송되는 것), 토글 기본값이 ON이며, 토글 OFF 상태에서 키워드를 입력하면 승격 대신 **뮤트 하이라이트 + "UltraCode 꺼짐" 유도 힌트**가 보인다.

---

## ⏪ 사전 조건

- [ ] ADR-032 개정 v2 박제 (00.Documents/ADR.md)
- [ ] Phase 05 완료 (하이라이트 메커니즘 존재 — 뮤트 변형의 기반)

---

## 📝 작업 내용

- [ ] **키워드 OR 제거(승격 폐지)** — `Composer.tsx:147` `orchestration || detectOrchestrationKeyword(value)` → `orchestration` 단독. `PanelView.tsx:189-203` `turnOrchestration` 동일 제거. `detectOrchestrationKeyword`는 삭제하지 말 것(하이라이트·힌트가 사용).
- [ ] **토글 기본 ON** — `Composer.tsx:134`·`PanelView.tsx:132` `useState(false)` → `useState(true)` (컴포넌트 로컬 상태 — 영속 없음 확인됨, 마이그 불요).
- [ ] **OFF 유도 힌트(ui-visual)** — 토글 OFF + 키워드 감지 시: (a) 하이라이트를 그라데이션 대신 **뮤트 스타일**(예: `--text-4` 계열 — 새 색 발명 금지)로, (b) 컴포저 주변에 마이크로 힌트 1줄("UltraCode가 꺼져 있어요 — 토글을 켜면 오케스트레이션이 활성화됩니다" 취지, 기존 `.composer-disabled-hint` 관례 참고). ON일 땐 P05 그라데이션 그대로.
- [ ] **P04 키워드-OR 테스트 스펙 반전(의도 보존 치환, 케이스 삭제 금지)** — `composer.test.tsx` 키워드 트리거 케이스("토글 OFF + 키워드 → true 전송", L102-112) → "토글 OFF + 키워드 → **false** 전송(비승격)". `uc1-p04-keyword-trigger.test.ts`의 순수 함수 스펙은 불변(감지 규칙 자체는 유지). 기본 ON 단언 추가.
- [ ] **기본 OFF 전제 기존 테스트 명시 열거 정합(plan-auditor 🔴#2)** — 기본 ON flip이 즉시 깨뜨리는 2건, 초기상태만 v2 의미론으로 갱신(케이스 삭제 금지):
  - `composer.test.tsx:79-91` "ON 후 전송" — 기본 ON 전제로 재작성(클릭 1회 = OFF가 되므로 플로우 반전).
  - `composer.test.tsx:93-100` "OFF 상태 전송" — OFF-send 검증 전 토글을 명시적으로 OFF로 내린 뒤 단언.
- [ ] `ultracode-demo.e2e.ts` 지속 의미론 서술에 기본 ON 반영(라이브 실측은 P06).

## ✅ 완료 조건

- [ ] "OFF + 키워드 → orchestration=false 전송" 회귀 테스트 green (ADR-032 v2 ②' — 비승격 고정)
- [ ] 기본 ON 단언 green / 키워드 감지 순수 함수 테스트 불변 green
- [ ] `npm run typecheck` 0 / `npm run test` green / `npm run lint` 0
- [ ] reviewer CRITICAL 0
- [ ] **영호 육안 승인(버킷 b)** — ON 그라데이션 / OFF 뮤트+힌트, P05와 묶어 1회

## 📚 학습 포인트

- **보이는 것 = 전송되는 것** — UI 상태와 전송 값이 어긋나는 "숨은 승격"은 편의보다 혼란이 크다. 진실원을 하나로 줄이면 사용자 모델(mental model)이 단순해진다.
- **기본 ON + 사용 시점 게이트** — 기능을 기본 개방하되 실제 사용 순간에 perm-card로 확인받는 패턴: 발견 가능성(discoverability)과 안전을 동시에.

## ⚠️ 함정

- 키워드 감지 함수·하이라이트 메커니즘은 **삭제가 아니라 의미 재정의** — P05 산출물 위에 뮤트 변형만 얹는다.
- 힌트는 레이아웃 점프 없게(컴포저 높이 변동 최소화).
- P05가 아직 uncommitted — 같은 워킹 트리에 얹되 P05 파일 목록과 겹치는 편집은 신중히(P05+P07 묶음 육안 후 커밋 분리 판단은 메인 몫).

## 담당 SubAgent

renderer
