---
owner: 영호
milestone: LM1
phase: 06
title: MODEL_EFFORT_SUPPORT shared 승격 — 단일 정의 + 드리프트 테스트 잠금
status: done
grade: 복잡
risk: shared-contract·backend-contract
loop_track: auto-gate
estimated: 1~2h
domain: cross (shared-ipc + agent-backend 순차 2 Worker)
summary: LM1 확장(영호 편입 2026-07-17) — 모델별 effort 지원 표를 shared/model-effort.ts(신규, 도메인 상수 모듈·IPC 아님)로 승격해 main·renderer가 한 정의를 공유. run-args.ts는 shared에서 import + re-export(소비처 import 경로 불변·거동 불변). 키 집합 3자 동일(MODEL_EFFORT_SUPPORT keys ≡ KNOWN_MODELS ≡ MODEL_CONTEXT_WINDOW keys — 기존 주석 계약을 테스트로 승격)을 드리프트 테스트로 잠금. 순차 2 Worker(shared-ipc → agent-backend). reviewer 무조건(shared-contract). 의존 없음(즉시 착수). P07(피커 반응형)이 이 shared 표를 소비.
---

# Phase 06: MODEL_EFFORT_SUPPORT shared 승격 — 단일 정의 + 드리프트 테스트 잠금

> **상태**: done
> **마일스톤**: LM1
> **등급**: 복잡 (shared-ipc·agent-backend·qa 3개 도메인 R/W 경계 횡단 — Worker 1 계약 초과, 단 대규모 아님 · shared-contract → reviewer 무조건)
> **loop_track**: auto-gate — 상수 소유권 이동 리팩토링·기계 게이트로 판정(거동 불변, re-export로 소비처 무접촉)
> **담당**: cross — **coordinator 소유 순차 지휘** — qa(RED) → shared-ipc(`shared/model-effort.ts` 모듈 생성) → agent-backend(`run-args.ts` 표 재수입·re-export) → reviewer(깃발 무조건). coordinator→Worker 1단계만(Worker→Worker 직접 호출 금지, escalate).
> **plan-auditor 재검증 2026-07-17**: 🔴 1(P07 xhigh 공허 green) → 영호 확정 ③으로 해소, 🟡 3 반영 완료 — GO.
> **완료 2026-07-17**: 합본 게이트 green(typecheck 0·test 5305 pass/0 fail·lint 0) · reviewer 🟢(shared/backend-contract) — 커밋 마감.

---

## 🧭 배경 (P06·P07 공통 컨텍스트)

LM1 P05 라이브 실측에서 **effort 잔존이 무해**함이 확인됐고, 영호 결정(2026-07-17): "haiku 라이브 제외" 대신 **effort GUI를 모델별 지원에 정합**시킨다(LM1 P06 편입 — 별도 마일스톤 아님). 실측 근거:
- main의 `MODEL_EFFORT_SUPPORT`(`run-args.ts:54` — opus·fable·sonnet 전 단계 지원, **haiku 미지원**[키 생략], **xhigh 미지원 시 high 클램프**)는 완비돼 있음.
- 반면 renderer effort 피커(`ComposerBar.tsx:103-110`·`PanelPicker`)는 `EFFORTS` 6단계(`pickerOptions.ts:54-61`)를 **모델 무관 정적 표시** — "조용한 no-op의 순한 변종"(P13 교훈 동족).
- effort는 SDK 라이브 API 부재로 **세션 생성 시 1회 고정**(라이브 모델 전환과 달리 — P05 프로브 실측).

본 P06은 그 표를 shared로 승격해 renderer가 소비할 토대를 만들고(정의 이동·거동 불변), 실제 피커 반응형 표시는 P07이 얹는다.

---

## 📐 확정 결정 (영호 확정 2026-07-17)

- **① LM1 편입** — 별도 마일스톤을 열지 않고 LM1의 P06·P07로 편입한다(effort GUI 모델 정합).
- **② effort 미지원 모델(haiku) 선택 시 = 피커 비활성 + 안내** — 숨김이 아니다(발견성·레이아웃 불변). 문구 최종안은 육안 버킷에서 재확인. *(② 는 P07 표시 계층에서 소비 — 본 P06은 표만 공유 토대로 승격)*
- **표는 shared 도메인 상수 모듈** — `shared/model-effort.ts`는 IPC 채널이 아니라 순수 상수 모듈이다. `ipc-contract.ts` 등록 대상이 아니며 계약 버전 bump도 아니다.
- **거동 불변 리팩토링** — 정의만 옮기고 `run-args.ts`는 re-export한다. `effortToOptions`의 클램프·special-case 거동은 한 줄도 바뀌지 않는다.

---

## ⏪ 사전 조건

- [ ] 의존 없음 — **즉시 착수 가능**
- [x] **실측(2026-07-17)** — `run-args.ts:41-53`(권위 JSDoc + 주석 계약)·`:54`(`MODEL_EFFORT_SUPPORT` 정의) / `KNOWN_MODELS`·`MODEL_CONTEXT_WINDOW` 키 집합(주석 계약이 "3자 동일"을 서술만 하고 테스트로 잠기지 않은 상태) / `EFFORTS` 6단계(`pickerOptions.ts:54-61`)
- [ ] **소비처 grep 전수** — `MODEL_EFFORT_SUPPORT` 현 소비처를 전수 열거(re-export 누락 시 파손 방지)

---

## 📝 작업 내용

- [ ] **(a) TDD RED 선행 (qa)** — `99.Others/tests/shared/lm1-effort-support-contract.test.ts` 작성(실패 먼저). ① shared 모듈 export 형상 단정 ② **키 집합 3자 동일 단언**(`MODEL_EFFORT_SUPPORT` keys ≡ `KNOWN_MODELS` ≡ `MODEL_CONTEXT_WINDOW` keys — 기존 주석 계약의 테스트 승격) ③ `run-args`의 re-export가 **동일 참조**임을 단언(정의가 두 곳으로 갈라지지 않았음)
- [ ] **(b) shared 모듈 생성 (shared-ipc)** — `02.Source/shared/model-effort.ts` 신규 생성. 표 + 권위 JSDoc을 `run-args.ts:41-53` 주석 원형 유지로 이전. 키 타입은 `string`(`KNOWN_MODELS` 정합은 (a) 테스트가 잠금). **순수 상수만** — Node 전용 API 금지(main·renderer 양쪽 import 대상)
- [ ] **(c) agent-backend 배선** — `run-args.ts`에서 표 정의를 제거하고 shared에서 import + **re-export**(기존 소비처 import 경로 불변). `effortToOptions` 거동 한 줄도 불변
- [ ] **(d) 회귀 확인** — 기존 agents·shared 스위트 전수 green(정의 이동으로 인한 회귀 0)

---

## ✅ 완료 조건

- [ ] `npm run typecheck` (main+renderer) 0 errors
- [ ] `npm run test` green — 신규 계약 테스트 RED→GREEN + 기존 agents·shared 스위트 회귀 0
- [ ] `npm run lint` 0 problems
- [ ] renderer가 shared 표를 import할 수 있고, 키 집합 드리프트가 테스트로 잠김
- [ ] reviewer 통과 (shared-contract → 무조건)

---

## 📚 학습 포인트

- **상수의 "소유권 이동" 리팩토링** — re-export로 소비처를 안 건드리고 정의만 옮기는 기법(C#의 *type forwarding* 유사 — 어셈블리를 옮겨도 옛 이름으로 참조가 유지되는 것). 소비처는 옛 경로로 계속 import하지만 실제 정의는 새 위치에 산다.
- **주석 계약을 테스트로 승격** — "이 세 키 집합은 같아야 한다"가 주석으로만 있으면 드리프트가 조용히 통과한다. 테스트로 올리면 컴파일/CI에서 잡힌다(주석은 사람이 지켜야 하지만, 테스트는 기계가 지킨다).

---

## ⚠️ 함정

- **shared는 양쪽 import 대상 — Node 전용 API 금지** — `shared/model-effort.ts`는 main·renderer 둘 다에서 import되므로 `fs`·`process` 등 Node 전용 API를 쓰면 renderer 번들이 깨진다. 순수 상수만 둔다.
- **re-export 누락 = 기존 소비처 파손** — 정의를 옮기고 `run-args.ts`에서 re-export를 빠뜨리면 옛 import 경로가 죽는다. 반드시 `MODEL_EFFORT_SUPPORT` 소비처를 grep 전수한 뒤 re-export를 건다.
- **IPC 채널 아님 — ipc-contract 등록 불요** — 이 표는 도메인 상수 모듈이지 IPC 계약이 아니다. `ipc-contract.ts`에 등록하려 들면 오분류다(계약 버전 bump도 아님).
- **역의존 금지** — `shared/model-effort.ts`(프로덕션 모듈)는 `02.Source/main/**`에서 아무것도 import하지 않는다(어기면 renderer 번들에 main 코드 유입). KNOWN_MODELS와의 키 정합 검증은 *테스트 파일*(Node 실행, 번들 무관)에서만 main을 import해 단언한다 — `lm1-set-model-handler.test.ts:47` 확립 패턴.

---

## 담당 SubAgent

> cross — **coordinator 소유 순차 지휘**: qa(RED) → shared-ipc(`shared/model-effort.ts` 생성·표 승격) → agent-backend(`run-args.ts` import·re-export) → reviewer(무조건, shared-contract). 3개 도메인 R/W 경계 횡단(복잡 등급 근거) · coordinator→Worker 1단계만(Worker→Worker 직접 호출 금지, escalate).
