---
owner: 영호
milestone: GAP1
phase: 02
title: toolKind MAP 확장 · TaskStop MUTATING 재분류 · 모델 대화별 영속
status: done
grade: 복잡 (보통 + backend-contract 깃발)
risk: backend-contract
loop_track: auto-gate
estimated: 2~5h
domain: cross
summary: GAP1 quick win 나머지 3건 — (1) toolKind MAP 확장으로 신형 SDK 도구 'other' 폴백 해소(T-09), (2) 태스크 종료 MUTATING 재분류 — TaskStop 정본화·KillShell/KillBash alias·BashOutput 오분류 정리(보안 부수결함), (3) 모델 선택 대화별 영속(I-03, chats/*.json optional 필드 + store-lift, persistent-run setModel 실측 반영). 영속 스키마는 optional 추가만.
---

# Phase 02: toolKind MAP · KillShell 교정 · 모델 영속

> **상태**: done (보안 재분류 b6635b4 · toolKind+모델 영속 — 게이트 green·reviewer PASS)
> **마일스톤**: GAP1
> **등급**: 복잡 (자동 상향: 보통 + backend-contract → reviewer 무조건·모델 상향)
> **담당**: cross (renderer + agent-backend) + reviewer

---

## 🎯 목표

신형 SDK 도구가 무명 카드로 떨어지는 드리프트를 닫고, 종료 도구가 mutating 게이트를 우회하던 보안 부수결함을 교정하며, 모델 선택이 대화 전환마다 초기화되는 마찰을 없앤다.

---

## ⏪ 사전 조건

- [ ] 선행 Phase 없음 (P01·P03과 병렬 착수 가능)
- [ ] 근거 = GAP1 감사 T-09 · quick win 4번(KillShell) · I-03
- [ ] mode가 이미 store-lift된 패턴 확인(model에 같은 패턴 적용) — `selector.ts:98` selectSelectedModel은 현재 게이지 분모 전용

---

## 📝 작업 내용

- [ ] **(a) toolKind MAP 확장 (T-09)** — KillShell/NotebookRead/TaskStop/TaskGet/TaskOutput/Monitor/EnterWorktree/ExitWorktree/ToolSearch가 현재 전부 'other' 폴백(`toolKind.ts:16-38`) → 각 도구 이름·아이콘·verb를 MAP에 추가
- [ ] **(b) 태스크 종료 MUTATING 재분류 (보안 부수결함)** — **실측**: permissionCoordinator READONLY_TOOLS에 TaskStop·TaskOutput 포함(자동 허용), MUTATING_TOOLS엔 stale KillBash + BashOutput. SDK 정본 태스크 종료 입력은 **TaskStop(sdk-tools.d.ts:628)**. 봉합 = **TaskStop을 mutating 정본으로 재분류**, KillShell/KillBash는 호환 alias, BashOutput(조회 도구)의 MUTATING 분류도 재검토(오분류 정리). **재분류 실패 테스트 선행(TDD)** · 보안 관련이라 reviewer 무조건
- [ ] **(c) 모델 대화별 영속 (I-03)** — 컴포저 모델 picker가 로컬 useState라 대화 전환·재진입마다 DEFAULT_MODEL='opus'로 초기화(`ComposerBar.tsx:87-94`; `Composer.tsx:127`) → chats/*.json 영속 스키마에 **하위호환 optional `model` 필드** 추가 + store-lift(mode와 같은 패턴). remount 시 저장된 모델 복원, picker에 되먹임. **실측 semantics**: persistent run 재사용 경로는 req.model 미적용(`agent-runs.ts:168`), SDK엔 `Query.setModel` 존재(sdk.d.ts:2264) → 완료 조건 = 둘 중 하나 — **(a) setModel 배선 + 재사용 세션 모델 변경 테스트**, 또는 **(b) '모델 변경은 새 세션부터 적용'을 UI와 완료 조건에 명시**
- [ ] **(d) TDD** — 각 항목 실패 테스트 선행: 신형 도구 kind 매핑 단정 · KillShell이 MUTATING으로 판정 · 대화 전환 후 모델 유지

---

## ✅ 완료 조건

- [ ] `npm run typecheck` (main+renderer) 0 errors
- [ ] `npm run test` Vitest 전체 green + TDD(실패 테스트 선행)
- [ ] `npm run lint` 0 problems
- [ ] 신형 도구 9종이 전용 kind로 매핑(단정) · TaskStop mutating 재분류 판정 + BashOutput 조회 분류 정리(단정) · 대화 전환 후 선택 모델 유지(단정)
- [ ] 모델 변경 적용 semantics 확정 — (a) setModel 배선 + 재사용 세션 모델 변경 테스트 **또는** (b) '새 세션부터 적용' UI 명시 중 하나 충족
- [ ] 영속 스키마 diff = optional 필드 추가만 (shape 변경·마이그레이션 diff 0)
- [ ] reviewer 통과 (backend-contract + 보안 부수효과 = 무조건 호출)

---

## 📚 학습 포인트

- **하위호환 스키마 진화** — 영속 데이터에 필드를 추가할 때 optional로 두면 기존 파일(필드 없는 것)을 읽어도 안 깨진다. shape를 바꾸는 마이그레이션과 달리 파괴적이지 않음.
- **stale 상수의 보안 함의** — 도구 이름이 SDK에서 바뀌었는데(KillBash→KillShell) 게이트 세트를 안 고치면, 새 이름이 조용히 게이트를 우회한다. 이름 매핑은 단순 라벨이 아니라 보안 판정의 키.

---

## ⚠️ 함정

- **영속 스키마 게이트** — optional 필드 추가만 허용. shape 변경(마이그레이션)이 필요해지면 **즉시 정지 + 영호 게이트**(work-judge 버킷 c = 비가역·JSON 영속 스키마 마이그레이션).
- **backend-contract 경로**(`02.Source/main/01_agents/**`·permissionCoordinator) — MUTATING 세트는 보안 관련이라 reviewer 무조건.
- toolKind MAP은 renderer, MUTATING·영속은 main — 도메인 교차. IPC 계약(공통 이벤트 타입) 변경이 필요해지면 P03 계약과 조율.

---

## 담당 SubAgent

coordinator 경유 — renderer Worker(toolKind MAP·모델 picker) + agent-backend Worker(MUTATING·영속 스키마) + reviewer 무조건(backend-contract·보안).
