---
owner: 영호
milestone: UC1
phase: 04
title: renderer — 지속 토글(one-shot 폐기) + 키워드 트리거(OR 결합)
status: pending
grade: 보통
loop_track: auto-gate
estimated: 2h
domain: renderer
summary: Composer one-shot 리셋 제거 + "ultracode"/"/workflows" 키워드 턴 트리거 순수 함수 + 토글 OR 결합 (시각 변경 0 — 하이라이트는 P05)
---

# Phase 04: renderer — 지속 토글(one-shot 폐기) + 키워드 트리거(OR 결합)

> **상태**: pending
> **마일스톤**: UC1-ultracode-redesign
> **등급**: 보통
> **담당**: renderer

---

## 🎯 목표

UltraCode 토글이 사용자가 끌 때까지 유지되고(단발성 폐기), 메시지에 "ultracode"(대소문자 무관, 단어 경계) 또는 "/workflows"가 언급되면 토글이 꺼져 있어도 **그 턴의 `orchestration=true`로 전송**된다(토글 OR 키워드). 시각 변경 0 — 하이라이트는 P05.

---

## ⏪ 사전 조건

- [ ] Phase 03 완료 (백엔드가 턴별 플래그를 실제 반영 — renderer 변경의 실효 전제)

---

## 📝 작업 내용

- [ ] **TDD 선행**: `99.Others/tests/renderer/uc1-p04-keyword-trigger.test.ts` — 키워드 감지 순수 함수 스펙 먼저(RED). 경계: 대소문자("UltraCode"/"ULTRACODE"/"ultracode") / 단어 경계("ultracoded"·"multracode" 오탐 X) / "/workflows" 리터럴(문장 중간 공백 뒤 포함, "//workflows"·"a/workflows" 오탐 X) / 빈 문자열 / 코드블록 안 언급은 **감지함**(단순 규칙 — 과설계 금지). ※ renderer 테스트 작성은 qa 영역이나 순수 함수 스펙 주도라 본 Phase에서 renderer Worker가 테스트 포함 작성(TDD) — reviewer가 커버리지 점검.
- [ ] `02.Source/renderer/src/`에 키워드 감지 순수 함수 신설(예: `utils/orchestrationKeyword.ts` — `detectOrchestrationKeyword(text: string): boolean`).
- [ ] `Composer.tsx` — one-shot 리셋(`if (orchestration) setOrchestration(false)`) 제거 = 지속 토글. 전송 시 `orchestration: orchestration || detectOrchestrationKeyword(text)` OR 결합(멀티 패널 컴포저도 동일 경로인지 확인 — `PanelView`/`PanelPicker` 오케스트레이션 전달 경로 grep).
- [ ] **기존 one-shot 전제 테스트 명시 열거 정합(plan-auditor 🔴#1)** — 의도 보존 치환, 케이스 삭제 금지. 테스트 편집은 스펙 갱신 한정:
  - `99.Others/tests/renderer/composer.test.tsx` L78-100 "단발성" describe → 지속 의미론으로 치환
  - `99.Others/tests/renderer/multi-ultracode.test.tsx` L303-325 (K 케이스)
  - `99.Others/tests/e2e/ultracode-demo.e2e.ts` — **라이브 게이트라 npm run test가 못 잡는 파일**: L84-86 "전송 직후 자동 OFF" 단언·테스트 제목("단발성 자동 OFF")·스크린샷 파일명(`ultracode-3-sent-oneshot-off.png`)을 지속 의미론으로 치환(라이브 실행 검증은 P06 스윕에서).

## ✅ 완료 조건

- [ ] 키워드 함수 단위 테스트 green(경계 전부) / 기존 renderer 테스트 회귀 green
- [ ] `npm run typecheck` 0 / `npm run test` green / `npm run lint` 0
- [ ] UI 시각 변경 0 (CSS/JSX 레이아웃 불변 — 토글 pill 기존 모양 유지)
- [ ] reviewer(≥10줄+보통) CRITICAL 0

## 📚 학습 포인트

- **순수 함수로 정책 분리** — "어떤 텍스트가 트리거인가"를 UI에서 떼면 경계 테스트가 DOM 없이 돌고, 정책 변경(키워드 추가)이 국소화된다(RMW1 병합 함수 교훈의 재적용).
- **OR 결합의 의미론** — 지속 상태(토글)와 순간 신호(키워드)를 합칠 때 우선순위가 아니라 OR이면 "어느 쪽이든 켜면 켜짐" — 단순함이 곧 예측 가능성.

## ⚠️ 함정

- one-shot 제거는 **UX 의미 변경** — UltraCode 켜두고 잊으면 매 턴 Workflow 승인 카드가 뜰 수 있음. ADR-032 확정 사항이므로 진행하되, 눈에 띄는 부작용 발견 시 보고.
- 키워드 감지는 *표시 원문과 엔진 전달문 불변* — 플래그만 세움(메시지 가공 금지).

## 담당 SubAgent

renderer
