---
owner: 영호
milestone: RF1
phase: 09
title: ipc-contract.ts 도메인별 분해
status: pending
grade: 대규모
risk: shared-contract
loop_track: auto-gate
estimated: 4h
domain: shared-ipc
summary: 2290줄 ipc-contract.ts를 도메인별 계약 모듈로 분해 (배럴 재export로 단일 import 표면 유지)
---

# Phase 09: ipc-contract.ts 도메인별 분해

> **상태**: pending
> **마일스톤**: RF1-cleanup (트랙 C · 리팩토링)
> **등급**: 대규모 (2290줄 · 양쪽 영향)
> **담당**: shared-ipc — **reviewer 무조건** (shared-contract 깃발)

---

## 🎯 목표

`src/shared/ipc-contract.ts`(2290줄)를 **도메인별 계약 파일**(workspace·agent·fs·git·lsp·conversation·reference·profile·ui …)로 분해하되, **단일 import 표면**(`@shared/ipc-contract`)을 배럴(barrel) 재export로 보존한다. 채널명/타입의 *단일정의* 원칙 불변.

---

## ⏪ 사전 조건

- [ ] 트랙 A 완료 권장 (깨끗한 트리)
- [ ] (독립) 트랙 B와 무관 — components 밖

---

## 📝 작업 내용 (TDD — 거동 불변이라 기존 타입 테스트가 안전망)

- [ ] 현 `ipc-contract.ts`의 채널·타입을 도메인으로 그룹핑 (이미 주석 구획 있는지 확인)
- [ ] `src/shared/ipc/` 하위로 도메인별 파일 분리 (`workspace.ts`·`agent.ts`·…)
- [ ] **배럴 파일명은 `ipc-contract.ts` 유지** (`ipc/index.ts`로 바꾸지 말 것 — 주의3): 소비처 import 무변경 + risk-detector의 `*src/shared/ipc-contract*` 패턴 생존
- [ ] **⚠️ hook 패턴 확장 (주의3 — 영호 확정)**: 도메인 파일이 `src/shared/ipc/*.ts`로 분리되면 배럴만 패턴에 걸리고 도메인 파일 편집은 shared-contract 깃발이 안 뜸. risk-detector 패턴을 `*src/shared/ipc*`로 확장(harness=영호 확정)
- [ ] `IPC_CHANNELS`·`IpcChannel` 타입 집계 유지 (단일 union 보존)
- [ ] 컨벤션 이탈 채널(`ref-1`·`ref-2`·`unsupported`·`compact`)은 *이번엔 그대로* (이름 변경 = 별 작업, 계약 분해만)

---

## ✅ 완료 조건

- [ ] `npm run typecheck` (main+renderer) 0 errors
- [ ] `npm run test` green
- [ ] 소비처(main·renderer) import 경로 변경 0 (배럴 `ipc-contract.ts` 유지 덕분)
- [ ] 단일 파일 ≤ ~400줄 (God 파일 해소)
- [ ] shared-contract 검출 생존 — `src/shared/ipc/` 도메인 파일 편집 시 깃발 발동 (패턴 확장 유효 확인)
- [ ] **reviewer GO** (shared-contract — 양쪽 영향 점검)

---

## 📚 학습 포인트

- **배럴 파일(barrel)** — 여러 모듈을 한 `index.ts`에서 재export → 내부는 쪼개고 외부 import 표면은 하나로. 분해의 단골 기법.
- **계약 단일정의** — 채널명/타입이 한 곳에서만 정의돼야 main·renderer drift 0 (헌법 CRITICAL).

---

## ⚠️ 함정

- 배럴 누락 → 소비처 import 전부 깨짐 (대량 churn). 배럴이 핵심.
- 타입 union(`IpcChannel`) 분산 → 일부 채널 타입 안전 상실. 집계 보존.
- 채널명 동시 변경 욕심 → 범위 폭발. 분해만, 이름 정리는 별도.

---

## 담당 SubAgent

> shared-ipc (src/shared/** R/W) → reviewer 무조건 (shared-contract).
