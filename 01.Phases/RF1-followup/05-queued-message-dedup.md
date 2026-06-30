---
owner: 영호
milestone: RF1-followup
phase: 05
title: QueuedMessage 타입 단일화 + perf/no-op 정리
status: pending
grade: 보통
loop_track: auto-gate
estimated: 1~2h
domain: renderer
summary: QueuedMessage 3중복 정의를 types.ts 단일화 + useCallback perf + no-op disable 제거 (타입/로직 — JSX 무변경이 정상, ui-visual 깃발 미발동)
---

# Phase 05: QueuedMessage 타입 단일화 + perf/no-op 정리

> **상태**: pending
> **마일스톤**: RF1-followup
> **등급**: 보통 (무깃발 — ui-visual은 JSX 손댈 때만 발동, 본 Phase는 타입/perf/no-op이라 미발동. JSX 변경 발생 시 (b) 육안 병행으로 격상)
> **담당**: renderer

---

## 🎯 목표

RF1 P14가 Composer를 분해했지만 잔여 3종이 남았다(work-pin 후속 P14):
1. `QueuedMessage` interface가 **3곳 중복 정의**(`Composer.tsx:42`, `SchedStrip.tsx:11`, `store/slices/types.ts:57`)
2. `useCallback` perf 최적화 누락
3. no-op `disable`(효과 없는 비활성화 처리) 잔존

타입을 단일 진실(`types.ts`)로 모으고 perf/no-op을 정리한다. 거동 불변.

---

## ⏪ 사전 조건

- [ ] Phase 01 완료 (drift 봉합)
- [x] 실측 (plan-auditor 정정 반영): 실제 **중복 정의는 컴포넌트측 2곳**(`Composer.tsx:42`·`SchedStrip.tsx:11`의 `export interface`). `store/slices/types.ts:57`이 SSOT. `composer.ts`·`selector.ts`는 *이미* `./types`에서 import(정상), `appStore.ts:55`는 re-export(3번째 참조 — 전수 점검 대상)
- [ ] **착수 전 3개 정의 본문 대조** — 필드 동일성 확인(다르면 통합 전 보고). `types.ts`를 단일 진실로 채택

---

## 📝 작업 내용

- [ ] `QueuedMessage` 3개 정의 본문 비교 — 동일하면 `store/slices/types.ts`를 단일 진실로 채택
- [ ] `Composer.tsx`·`SchedStrip.tsx`의 중복 `export interface QueuedMessage` 제거 → `types.ts`에서 `import type`
- [ ] 단, 기존 소비처가 `Composer`/`SchedStrip`에서 import하면 하위호환 re-export 고려(import churn 0)
- [ ] `useCallback` perf — 리렌더마다 재생성되는 핸들러를 메모이즈(의존성 배열 정확히)
- [ ] no-op `disable` 제거 — 효과 없는 비활성화 분기 식별 후 정리
- [ ] 관련 테스트 정합

---

## ✅ 완료 조건

- [ ] **타입 단일화**: `grep -rn "interface QueuedMessage" 02.Source` — 정의 **1곳**(types.ts), `appStore.ts:55` 포함 전 참조 정합
- [ ] **perf 측정**(plan-auditor #2): 대상 핸들러가 `react-hooks/exhaustive-deps` lint clean — `npm run lint` 경고 0 (useCallback 의존성 정확)
- [ ] **no-op 제거 측정**(plan-auditor #2): 제거한 no-op `disable` 분기 목록을 -없으면 보고-, 작업 후 해당 패턴 grep 0 확인
- [ ] `npm run typecheck` 0 errors
- [ ] `npm run test` green (시작값 대비 비감소 + 신규 fail 0)
- [ ] `npm run lint` 0 problems
- [ ] (JSX 시각 변경 발생 시에만) 영호 육안 확인 — 본 Phase 기대값은 시각 무변경

---

## 📚 학습 포인트

- **타입 SSOT** — 같은 `interface`가 3곳이면, 한 곳에 필드를 추가해도 나머지는 모른다. 타입 불일치 버그의 씨앗. store `types.ts`처럼 한 곳에 모은다.
- **useCallback의 의미** — 함수는 매 렌더마다 새 참조로 생성된다. 자식에 prop으로 넘기면 불필요 리렌더 유발. `useCallback`으로 참조를 안정화하되, 의존성 배열을 정확히(빠뜨리면 stale closure).
- **no-op 코드 냄새** — 효과 없는 분기는 "예전엔 의미 있었다"의 흔적. 제거가 가독성·성능 둘 다 이득.

---

## ⚠️ 함정

- **3개 정의가 미묘히 다를 수 있다** — 필드 추가/optional 차이. 통합 전 반드시 대조, 다르면 보고.
- **useCallback 의존성 배열** — 빠뜨리면 stale closure(옛 값 참조) 버그. ESLint `react-hooks/exhaustive-deps`로 검증.
- **ui-visual 경계** — JSX 레이아웃/스타일을 건드리면 육안 트랙. 본 Phase는 타입·perf·no-op 위주라 시각 변화는 없어야 정상(있으면 의도치 않은 회귀 신호).

---

## 담당 SubAgent

`renderer` (`02.Source/renderer/**` R/W)
