---
owner: 영호
milestone: RF1-followup
phase: 06
title: shared/ipc 배럴 검증 + ARCHITECTURE ipc 트리 문서 갱신
status: done
grade: 복잡
risk: shared-contract
loop_track: human-gate
estimated: 1~1.5h  # 작업량은 검증+문서지만 shared-contract 깃발로 복잡 상향(grade-and-risk §3 일관 — P02와 동일 처리)
domain: shared-ipc
summary: ipc 배럴 export* 정합 검증(확인) + ARCHITECTURE.md의 stale한 ipc/ 트리 문서 갱신(AI 초안→영호 확정)
---

# Phase 06: shared/ipc 배럴 검증 + ARCHITECTURE ipc 트리 문서 갱신

> **상태**: pending
> **마일스톤**: RF1-followup
> **등급**: 복잡 (보통 + shared-contract 자동 상향, grade-and-risk §3 일관 → reviewer 무조건 + -DONE.md/HTML / +docs → human-gate)
> **담당**: shared-ipc (코드 검증) + 메인(문서 초안, 영호 확정)

---

## 🎯 목표

RF1 P09가 `ipc-contract.ts`를 `shared/ipc/` 13개 도메인 파일로 분해했다(work-pin 후속 P09). 실측 결과 **배럴은 이미 깔끔**(`export *` 12도메인 + `IPC_CHANNELS` spread). 그러나 `ARCHITECTURE.md`는 여전히 옛 단일 `ipc-contract.ts` 구조로 기술돼 **stale**하다. 배럴을 *검증*(확인만)하고, ARCHITECTURE 문서를 실제 구조로 갱신한다.

---

## ⏪ 사전 조건

- [ ] Phase 01 완료 (drift 봉합)
- [ ] **Phase 04 완료 권장** (00_ipc 문서화 부분 한정) — plan-auditor #3: P06이 `main/00_ipc/` 트리를 문서화하는데 P04가 그 구조를 *변경*. P04 먼저 끝나야 00_ipc 문서가 stale 안 됨. `shared/ipc/` 13파일 문서화는 P04와 독립이라 병렬 OK.
- [x] 배럴 실측: `ipc-contract.ts`(88줄) = `export * from './ipc/*'` 12개 + `IPC_CHANNELS` 합성 → **추가 분해 불필요**
- [x] 문서 stale 실측: `ARCHITECTURE.md` 디렉토리 트리가 `ipc-contract.ts` 단일파일 + `ipc/` 핸들러 구조 미반영

---

## 📝 작업 내용

- [ ] **배럴 검증(코드, shared-ipc)** — `ipc-contract.ts`가 도메인을 누락 없이 re-export하는지 확인. **추가 분해/변경 없음 — 검증만**(over-engineering 경계)
- [ ] **ARCHITECTURE.md 초안(docs, 메인)** — 디렉토리 구조 섹션의 `shared/` 트리를 실제로 갱신:
  - `shared/ipc/` 13파일(common·workspace·agent·fs·conversation·reference·git·lsp·engine·settings·window·multi·personalization) 트리 반영
  - `ipc-contract.ts` = 배럴(re-export + IPC_CHANNELS 합성)로 설명 갱신
  - `main/00_ipc/` 핸들러 구조(handlers/ 하위 + index 등록)도 stale하면 함께 정합
  - `diff-types.ts` 등 누락 파일 반영
- [ ] **영호 확정 게이트** — 문서 변경은 AI가 초안 제시, 영호가 검토·확정

---

## ✅ 완료 조건

- [ ] 배럴 검증 보고 — `IPC_CHANNELS`가 **12 채널 도메인**(workspace·agent·fs·conversation·reference·git·lsp·engine·settings·window·multi·personalization) spread 확인. **`common.ts`는 채널 없는 상수/타입**(`BACKEND_LABELS`·`WORKSPACE_ROOT_ID`·`BackendId`)이라 `IPC_CHANNELS` 제외가 *정상* (plan-auditor #5 — common을 누락으로 오인해 `COMMON_CHANNELS` 추가 금지 = over-engineering 함정)
- [ ] `npm run typecheck` 0 errors (검증 — 코드 무변경 시 자동 통과)
- [ ] `ARCHITECTURE.md` 디렉토리 트리가 실제 `shared/ipc/`(13파일)·`00_ipc/` 구조 반영 (초안)
- [ ] **영호 GO** (human-gate — docs는 영호 단독 통제, AI는 초안만)

---

## 📚 학습 포인트

- **배럴(barrel) 패턴** — 여러 모듈을 한 `index`가 `export *`로 모아 재노출. 소비처는 한 경로에서 import → 내부를 쪼개도 import 경로 churn 0.
- **문서 드리프트** — 코드 구조가 바뀌면 ARCHITECTURE 같은 설계 문서가 현실과 어긋난다. 코드는 "진실", 문서는 "지도" — 지도가 stale하면 길을 잃는다.
- **왜 docs는 사람 게이트인가** — 설계 문서는 미래 합류자·본인의 판단 기준. AI가 멋대로 바꾸면 의도와 어긋날 수 있어 영호 확정이 필요하다.

---

## ⚠️ 함정

- **over-engineering 경계** — 배럴은 *이미 충분*. "더 잘 쪼갤 수 있다"는 유혹을 누르고 검증에 그친다. 코드 변경 충동 = 스코프 크리프.
- **docs 단독 통제 위반** — `ARCHITECTURE.md`(00.Documents)를 영호 확정 없이 commit 금지. 초안 제시 → GO 대기.
- **shared-contract 깃발** — 만약 배럴 검증 중 실제 누락을 발견해 코드를 손대면 양쪽 typecheck + reviewer 무조건. 단 본 Phase 기대값은 "검증만".

---

## 담당 SubAgent

`shared-ipc`(배럴 검증, R 위주) + 메인 직접(ARCHITECTURE 초안 — docs는 위임 X, 영호 확정)
