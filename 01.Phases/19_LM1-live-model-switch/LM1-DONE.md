---
summary: REPL 지속세션 라이브 모델 전환(SDK Query.setModel — GAP1 P13 setPermissionMode 7단 체인 미러)을 7 Phase로 완주 + effort GUI 모델 정합(P06 shared 승격·P07 피커 반응형, 영호 편입 2026-07-17). 모델 vs 모드 비대칭(역통지 이벤트 부재)을 반영 정본 = 다음 assistant message.model·reject 조건부 롤백·재사용 경로 change-guard 안전망으로 봉합. P05 라이브 실측 = setModel 후 sonnet-5→haiku-4-5 전환 확인 + effort 잔존(opus xhigh→haiku) SDK 조용히 흡수(에러 0) — 이 실측이 P06·P07 확장의 근거. 최종 합본 게이트 typecheck 0·Vitest 5325 passed/0 failed·lint 0. TDD RED→GREEN 64케이스·reviewer 3회·plan-auditor 2회. 육안 = P04 모델 피커 영호 OK + P07 effort 피커 영호 일괄 GO(툴팁 실효는 후속 관찰 이월). 잔여 = 사람 게이트 2건(A트랙 하네스 push·PR·머지 먼저 → LM1 push·PR·머지).
phase: LM1-마일스톤-마감
work-id: lm1-live-model-switch
status: done
grade: 대규모
gate_version: 1
report_html: 00.Documents/reports/milestones/LM1-라이브모델전환-7페이즈-완주-보고서.html
owner: youngho
milestone: LM1
completed_at: 2026-07-17
---

# LM1 — 라이브 모델 전환 + effort GUI 정합 마일스톤 완료 박제

**기간**: 2026-07-17 · **브랜치**: `feature/lm1-live-model-switch` (하네스 커밋 `6ac509f` 위 분기 — A트랙 하네스 PR 먼저 머지) · **Phase**: 7개(P01~P07) 전부 done — P06·P07은 P05 라이브 실측 후 영호 편입(2026-07-17)

## TL;DR

REPL 지속세션에서 **세션을 재생성하지 않고 모델을 라이브로 전환**하는 코어 기능을 7 Phase로 닫았다. GAP1 P13이 세운 `setPermissionMode` 7단 체인(shared 계약 → 어댑터 → 핸들러 → 라우팅 → renderer 배선 → e2e → 라이브 프로브)을 **`Query.setModel`로 미러**한 것이 뼈대다. 초기 5 Phase(P01~P05, 라이브 전환 본체)를 마감한 뒤, **P05 라이브 실측에서 "effort 잔존이 무해"함이 확인**되자 영호가 "haiku 라이브 제외" 대신 **effort GUI를 모델별 지원에 정합**시키는 확장(P06 shared 승격 + P07 피커 반응형)을 같은 브랜치 후속 마디로 편입해(2026-07-17, GAP1 P16·TG1 P08 마감 후 편입 선례 동족) **7 Phase로 완주**했다. 핵심 난점은 **모델 vs 모드 비대칭** — 모드 전환과 달리 모델 전환은 SDK가 역통지 이벤트를 주지 않아, **반영 정본을 "다음 assistant `message.model`"로 잡고**(관측 정본) · reject 시 조건부 롤백 · 재사용 경로에 어댑터 change-guard 안전망을 두는 3중 설계로 봉합했다. 최종 합본 게이트 전건 green(typecheck 0 · Vitest **5325 passed / 0 failed** · lint 0), TDD RED→GREEN **총 64케이스**(P01~P05 44 + P07 20), reviewer 3회 · plan-auditor 2회. 육안은 P04(모델 피커) 영호 OK + P07(effort 피커) 영호 일괄 GO(2026-07-17 "순서대로 나머지 다 진행하자" — 툴팁 실효는 후속 관찰로 이월). 잔여는 사람 게이트 2건 — ① A트랙 하네스(`6ac509f`) push·PR·머지 먼저 → ② LM1 push·PR·머지(LM1이 하네스 커밋 위 분기라 순서 고정).

## 5단계 보고

- 🎯 **무엇을 만들었나** — **(1) 라이브 모델 전환**: REPL 지속세션이 살아있는 동안 사용자가 모델 피커로 다른 모델을 고르면, 세션을 죽였다 다시 만들지 않고 **SDK `Query.setModel`로 현 세션의 모델을 바꾼다**(GAP1 P13 `setPermissionMode` 7단 체인 미러 — shared 계약 `AGENT_SET_MODEL`+`SetModelRequest/Response` → 어댑터 `setModel`+change-guard → main 핸들러·라우팅·재사용 안전망 → renderer 모델 피커 라이브 배선 → e2e → 라이브 프로브). 피커에는 **"새 대화가 아니라 지금 세션부터 바뀐다"는 체감 언어 고지**를 붙였다. **(2) effort GUI 모델 정합(P06·P07 확장)**: 모델별 effort 지원 표(`MODEL_EFFORT_SUPPORT`)를 `shared/model-effort.ts`로 승격(P06)해 main·renderer가 한 정의를 공유하게 하고, effort 피커가 그 표를 반영(P07)하도록 만들었다 — haiku 선택 시 **비활성+안내**(숨김 아님·레이아웃 불변), xhigh 미지원 모델은 **xhigh 항목 제외 + 표시 클램프**(저장값 원형 보존), 그리고 **"새 대화(세션)부터 적용" 고지**(effort는 SDK 라이브 API 부재로 세션 생성 시 1회 고정). 단일챗(`ComposerBar`)·멀티패널(`PanelPicker`) 2지점 전수.
- 🤔 **왜 필요한가** — REPL 지속세션이 기본 활성(ADR-024)인 상태에서 모델을 바꾸려면 예전엔 세션을 재생성해야 했다 — 대화 맥락(REPL 상태)이 끊기는 마찰이다. 라이브 전환은 그 마찰을 없애 "대화 중 모델 갈아타기"를 손실 없이 성립시킨다. effort 정합은 결이 다른 문제였다: renderer effort 피커가 `EFFORTS` 6단계를 **모델 무관 정적으로 표시**해, 실제로는 haiku가 effort를 안 받고 일부 모델은 xhigh를 못 받는데도 GUI는 그걸 몰랐다("조용한 no-op의 순한 변종" — P13 교훈 동족). P05 라이브 실측이 이 잔존을 실제로 관측(무해하지만 표시가 부정직)하면서, 영호가 표시 계층을 모델 지원에 맞추기로 결정했다.
- 🛠️ **어떻게 만들었나** — 핵심 설계 3개. **① 반영 정본 = 다음 assistant `message.model`** (안 고른 대안: 모드 전환처럼 역통지 이벤트로 확인 → SDK가 모델 변경 역통지를 주지 않아 불가). 모델과 모드는 **비대칭**이다 — 모드는 setter 후 상태 이벤트가 오지만 모델은 오지 않는다. 그래서 "바뀌었다"의 관측 증거를 다음 assistant 메시지의 `message.model` 값으로 잡았다(P05 라이브 실측이 이 정본을 검증). **② reject 조건부 롤백 + 재사용 경로 change-guard 안전망** (영호 확정 ①): `setModel`이 거부되면 사용자 의도값을 되돌리되, model-fallback은 불가침(`_currentModel` = 사용자 의도값, SDK 폴백값으로 덮지 않음). 재사용되는 세션 경로가 있어(안전망 전제) 어댑터에 change-guard를 둬 의도치 않은 재적용을 막았다. **③ shared 상수 소유권 이동 + 키 드리프트 잠금** (P06): `MODEL_EFFORT_SUPPORT`를 `shared/model-effort.ts`로 옮기고 `run-args.ts`는 re-export(C#의 type forwarding 유사 — 소비처 import 경로 불변·거동 불변), 키 집합 3자 동일(`MODEL_EFFORT_SUPPORT` ≡ `KNOWN_MODELS` ≡ `MODEL_CONTEXT_WINDOW`)을 주석 계약에서 **테스트로 승격**해 드리프트를 기계가 잡게 했다. `shared/model-effort.ts`는 main을 아무것도 import하지 않는다(역의존 0 — 어기면 renderer 번들에 main 코드 유입). **④ 피커 고지 = 체감 언어** (영호 확정 ②): "라이브 전환됨"/"세션 고정" 같은 기술 언어 대신 사용자가 체감하는 "지금 세션부터"/"새 대화부터"로 적었다. **⑤ xhigh 존치 + 합성 테스트** (영호 확정 ③, plan-auditor 🔴 해소): 현행 표엔 `supports:true ∧ xhigh:false` 모델이 0개(opus·fable·sonnet 전부 xhigh:true, haiku는 supports:false)라 실모델 테스트로는 xhigh 필터·클램프 경로가 '공허한 green'이 된다 — qa가 **합성 지원 레코드 `{supports:true, xhigh:false}`를 주입**해 경로를 강제 발화시켜 비공허 green을 보장(미래에 xhigh 미지원 모델이 표에 추가돼도 UI 수정 0인 선행 투자).
- 🧪 **테스트 결과** — 최종 합본 게이트: `npm run typecheck` 0 errors(main+renderer) / `npm run test` **Vitest 5325 passed / 0 failed** / `npm run lint` 0 problems. TDD RED→GREEN **총 64케이스**(P01~P05 라이브 전환 본체 44 + P07 effort 피커 게이팅 20). reviewer 3회(P01·P02 계약 깃발 확인 / P06 🟢[shared·backend-contract] / P07 통과 — 🔴 0·🟡 2), plan-auditor 2회(시드 승인 + P06·P07 재검증 GO). **라이브 실측(P05)**: ⓐ `setModel` 후 다음 assistant `message.model`이 `claude-sonnet-5`→`claude-haiku-4-5-20251001`로 전환(반영 정본 검증) ⓑ effort 잔존(opus xhigh→haiku) SDK가 조용히 흡수, 에러 0 — 이 실측이 P06·P07 확장의 근거다.
- ➡️ **다음 스텝** — ① **A트랙 하네스 push·PR·머지 먼저**(`chore/harness-window-2026-07-17` 커밋 `6ac509f` — LM1이 이 커밋 위에 분기했으므로 순서 고정) → ② **LM1 push·PR·머지**(영호 게이트). ③ 머지 후 pin 박제. **후속 관찰(비차단) 3건**: (a) disabled 버튼 hover 툴팁 실효 — Chromium이 disabled 버튼에 툴팁을 안 띄울 수 있어, 실사용에서 안 뜨는 게 확인되면 wrapper `title` 보강 (b) P07 reviewer 🟡 — disabled 분기 `effortNote` dead value 정리(선택) (c) P06 reviewer 🟡 — run-args JSDoc 라인 참조 rot(cosmetic).

## Phase 결과 요약 (P01~P07)

| Phase | 제목 | 핵심 커밋 |
|---|---|---|
| — | 시드 — Phase 5본 + INDEX 화해 | `a01e758` |
| P01 | shared 계약(`AGENT_SET_MODEL`·`SetModelRequest/Response`) + preload | `111fc29` |
| P02 | 어댑터 `setModel`·change-guard·reject 조건부 롤백 | `abe85dd` |
| P03 | main 핸들러·라우팅·재사용 안전망 | `7d66610` |
| P04 | 모델 피커 라이브 배선 + 체감 언어 고지 | `a6ba525` (육안 영호 OK) |
| P05 | e2e·SDK 라이브 프로브 (반영 정본 실측) | `84aae1a` |
| P06 | `MODEL_EFFORT_SUPPORT` shared 승격·키 드리프트 잠금 | `f76c224` (reviewer 🟢) |
| P07 | effort 피커 모델 반응형 (비활성·클램프 표시·세션 고정 고지) | `986d277` (육안 영호 일괄 GO) |

## 리스크·보류 (정직 기록)

- **아키텍처 각주 — 모델 vs 모드 비대칭**: 모드 전환(setPermissionMode)은 setter 후 상태 이벤트로 반영을 확인할 수 있지만, 모델 전환은 SDK가 **역통지 이벤트를 주지 않는다**. 그래서 반영 정본 = 다음 assistant `message.model`(관측 정본) · reject 조건부 롤백 · 재사용 경로 change-guard 안전망으로 대체했다. `model-fallback 불가침`(`_currentModel` = 사용자 의도값, SDK 폴백값으로 덮지 않음)은 이 비대칭 하에서 사용자 의도를 지키는 핵심이다.
- **effort는 세션 고정 (SDK 라이브 API 부재)**: 라이브 모델 전환과 달리 effort는 세션 생성 시 1회 고정된다(P05 프로브 실측). 그래서 피커 고지가 "새 대화(세션)부터 적용" — 세션 고정 고지의 근거. P05가 관측한 "effort 잔존을 SDK가 조용히 흡수(에러 0)"가 이 사실의 실측 증거다.
- **shared/model-effort.ts 역의존 0 + 키 3자 드리프트 테스트**: 프로덕션 모듈은 `02.Source/main/**`에서 아무것도 import하지 않는다(어기면 renderer 번들에 main 코드 유입). KNOWN_MODELS 키 정합은 *테스트 파일*에서만 main을 import해 단언(번들 무관). 이 표는 IPC 채널이 아니라 **순수 도메인 상수 모듈**이라 계약 버전 bump가 아니다.
- **후속 관찰 3건(비차단)**: ① disabled 버튼 hover 툴팁 실효(Chromium이 disabled 버튼에 툴팁을 안 띄울 수 있음 — 실사용에서 안 뜨는 게 확인되면 wrapper `title` 보강) ② P07 reviewer 🟡: disabled 분기 `effortNote` dead value 정리(선택) ③ P06 reviewer 🟡: run-args JSDoc 라인 참조 rot(cosmetic).
- **잔여 사람 게이트 2건 (구현 완주와 별도)**: ① A트랙 하네스(`6ac509f`) push·PR·머지 먼저(LM1이 그 위 분기) ② LM1 push·PR·머지.

## AC 검증 결과

마일스톤 완료 조건을 실제로 실행한 명령과 결과(최종 합본 시점 실측):

```text
$ npm run typecheck
  0 errors (main+renderer)

$ npm run test        # Vitest — 최종 합본
  Tests  5325 passed | 0 failed

$ npm run lint
  0 problems

$ SDK 라이브 프로브 (P05 — Playwright _electron)
  setModel 후 다음 assistant message.model = claude-sonnet-5 → claude-haiku-4-5-20251001 (반영 정본 검증)
  effort 잔존(opus xhigh → haiku) SDK 조용히 흡수 · 에러 0
```

- [x] 7 Phase 전부 `status: done` — P01~P07 (각 Phase typecheck 0 · Vitest green · lint 0 + TDD RED 선행 64케이스)
- [x] 라이브 모델 전환 성립 — `Query.setModel` 7단 체인(GAP1 P13 setPermissionMode 미러) · 반영 정본 = 다음 assistant message.model(P05 라이브 실측 검증)
- [x] 모델 vs 모드 비대칭 봉합 — reject 조건부 롤백 · model-fallback 불가침 · 재사용 경로 change-guard 안전망
- [x] effort GUI 모델 정합(P06·P07 편입) — shared 승격(키 3자 드리프트 잠금) + 피커 반응형(haiku 비활성+안내·xhigh 항목 제외+표시 클램프·저장값 원형 보존·세션 고정 고지) 2지점 전수
- [x] xhigh 공허 green 방지 — 합성 지원 레코드 `{supports:true, xhigh:false}` 주입으로 필터·클램프 경로 강제 발화(plan-auditor 🔴 해소)
- [x] 육안 — P04 모델 피커 영호 OK(2026-07-17) · P07 effort 피커 영호 일괄 GO(2026-07-17, 툴팁 실효는 후속 관찰 이월)
- [ ] A트랙 하네스 push·PR·머지 (사람 게이트 — 영호 승인 대기, LM1 앞순위)
- [ ] LM1 push·PR·머지 (사람 게이트 — 영호 승인 대기)

## 학습 일지 후보 키워드

- 모델 vs 모드 비대칭 — setter 후 역통지 이벤트가 있는 것(모드)과 없는 것(모델)의 반영 정본 설계 차이(관측 정본 = 다음 assistant message.model)
- 반영 정본을 이벤트가 아니라 관측 값(message.model)으로 잡기 — 역통지가 없을 때의 "바뀌었다" 증거
- 표시용 클램프와 저장값 분리 = 되돌림이 공짜(파생 상태) — 저장값을 클램프값으로 덮으면 모델 되돌려도 복원 불가
- 상수 소유권 이동 리팩토링 — re-export(type forwarding 유사)로 소비처 무접촉·거동 불변, 주석 계약을 드리프트 테스트로 승격
- 공허한 green 방지 — 실모델 표에 경로를 발화시킬 데이터가 0개면 합성 레코드 주입(미래 데이터 추가 시 UI 수정 0인 선행 투자)
- 조용한 no-op의 순한 변종 — GUI가 백엔드 제약(effort 미지원·xhigh 클램프)을 모른 채 정적 표시하던 것을 표시 계층 정합으로 봉합(P13 교훈 동족)

사람 게이트: A트랙 하네스 push·PR·머지 → LM1 push·PR·머지(2026-07-17 대기) — merge는 별도 게이트.

<!-- 마지막 갱신: 2026-07-17 — report_html 완주 HTML 보고서 생성(5단계 라벨·선행 보고서 동형, phase-gate strict 충족). -->
