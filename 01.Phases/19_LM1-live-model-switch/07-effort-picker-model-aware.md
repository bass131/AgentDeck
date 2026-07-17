---
owner: 영호
milestone: LM1
phase: 07
title: effort 피커 모델 반응형 — 미지원 비활성·xhigh 클램프 표시·세션 고정 고지
status: done
grade: 보통
risk: ui-visual
loop_track: human-visual
estimated: 2~3h
domain: renderer
summary: LM1 확장(영호 편입 2026-07-17) — effort 피커가 선택 모델의 지원 표(shared/model-effort.ts, P06)를 반영. haiku 선택 시 비활성+안내(영호 확정 ② — 숨김 아님·레이아웃 불변), xhigh 미지원 모델은 xhigh 항목 제외 + 선택값 표시 클램프(저장값 원형 보존), effort 피커에 "새 대화(세션)부터 적용" 고지(라이브 API 부재 반영). 단일챗(ComposerBar)+멀티패널(PanelPicker) 2지점 전수. 파생 헬퍼 effortOptionsFor(modelId) 단일 출처. Picker에 optional disabled prop 최소 추가(안티슬롭). 육안=영호(버킷 b — 무인 commit X). 의존 P06(shared 표).
---

# Phase 07: effort 피커 모델 반응형 — 미지원 비활성·xhigh 클램프 표시·세션 고정 고지

> **상태**: done — 완료 2026-07-17: 게이트 green(신규 20/20·renderer 3185 회귀 0) · reviewer 통과(🔴 0·🟡 2 — 육안 확인 사항) — **육안(버킷 b) 영호 일괄 GO 2026-07-17**("순서대로 나머지 다 진행하자" — 개별 툴팁 검증 아님). 후속 관찰(LM1-DONE 이월): ① disabled 버튼 hover 툴팁 실효(Chromium에서 안 뜰 수 있음 — 실사용에서 안 뜨면 wrapper title 보강) ② P07 reviewer 🟡 effortNote dead value 정리(선택).
> **마일스톤**: LM1
> **등급**: 보통 (ui-visual)
> **loop_track**: human-visual — 기능은 자율 진행, haiku 비활성 표현·문구는 영호 육안(버킷 b · 무인 commit X)
> **담당**: renderer
> **plan-auditor 재검증 2026-07-17**: 🔴 1(P07 xhigh 공허 green) → 영호 확정 ③으로 해소, 🟡 3 반영 완료 — GO.

---

## 🧭 배경 (P06·P07 공통 컨텍스트)

LM1 P05 라이브 실측에서 **effort 잔존이 무해**함이 확인됐고, 영호 결정(2026-07-17): "haiku 라이브 제외" 대신 **effort GUI를 모델별 지원에 정합**시킨다(LM1 P06·P07 편입 — 별도 마일스톤 아님). 실측 근거:
- main의 `MODEL_EFFORT_SUPPORT`(`run-args.ts:54` — opus·fable·sonnet 전 단계 지원, **haiku 미지원**[키 생략], **xhigh 미지원 시 high 클램프**)는 완비돼 있음.
- 반면 renderer effort 피커(`ComposerBar.tsx:103-110`·`PanelPicker`)는 `EFFORTS` 6단계(`pickerOptions.ts:54-61`)를 **모델 무관 정적 표시** — "조용한 no-op의 순한 변종"(P13 교훈 동족).
- effort는 SDK 라이브 API 부재로 **세션 생성 시 1회 고정**(라이브 모델 전환과 달리 — P05 프로브 실측).

P06이 지원 표를 shared로 승격해 소비 토대를 만들었고, 본 P07은 그 표를 피커에 반영해 표시·전송을 모델 반응형으로 만든다.

---

## 📐 확정 결정 (영호 확정 2026-07-17)

- **① LM1 편입** — 별도 마일스톤을 열지 않고 LM1의 P06·P07로 편입한다(effort GUI 모델 정합).
- **② effort 미지원 모델(haiku) 선택 시 = 피커 비활성 + 안내** — **숨김이 아니다**(발견성·레이아웃 불변). 문구 최종안은 육안 버킷(b)에서 재확인.
- **xhigh 미지원 모델 = 항목 제외 + 표시 클램프** — xhigh 항목을 옵션에서 제외하되, 저장된 effort 값은 **덮어쓰지 않는다**(표시 계층에서만 클램프). 모델을 xhigh 지원 모델로 되돌리면 원래 effort가 복원돼야 한다.
- **effort는 세션 고정** — 라이브 API 부재 사실을 반영해 "새 대화(세션)부터 적용" 고지(모델·모드 피커의 체감 언어 관례 동형).
- **③ xhigh 처리 존치 + 합성 테스트(영호 확정 2026-07-17, plan-auditor 🔴 해소)** — 현행 표엔 `supports:true ∧ xhigh:false` 모델이 0개(실측: opus·fable·sonnet 전부 xhigh:true, haiku는 supports:false)라 실모델 테스트로는 xhigh 필터·클램프 경로가 발화하지 않는 '공허한 green'이 된다. 존치를 택하되, qa 테스트가 **합성 지원 레코드 `{supports:true, xhigh:false}`를 주입**해 경로를 강제 발화시켜 비공허 green을 보장한다. 미래에 xhigh 미지원 모델이 표에 추가돼도 UI 수정 0이 되는 선행 투자.

---

## ⏪ 사전 조건

- [ ] **P06(shared 모듈)** — `shared/model-effort.ts`의 `MODEL_EFFORT_SUPPORT`를 renderer가 import
- [x] **선례 청사진** — `ComposerBar.tsx:103-110`(effort 피커)·`PanelPicker`(패널 effort 피커) / `pickerOptions.ts:54-61`(`EFFORTS` 6단계) / `run-args.ts` `effortToOptions`(main 전송 시점 클램프 — 이중 안전의 신뢰 근거)
- [x] **실측(2026-07-17)** — Picker 컴포넌트에 `disabled` prop **현재 부재**(신규 추가 필요) / `minimal`은 앱 내부 id(SDK effort 아님 — `effortToOptions` special-case)라 제외 로직에서 오분류 주의

---

## 📝 작업 내용

- [ ] **(a) TDD RED 선행 (qa)** — `99.Others/tests/renderer/lm1-effort-picker-gating.test.ts` 작성(실패 먼저). ① haiku 선택 시 **disabled·안내** ② 지원 모델 선택 시 **활성** ③ xhigh 미지원 모델 → **xhigh 항목 제외 + 선택값 표시 클램프** ④ **저장값 원형 보존**(모델을 xhigh 지원 모델로 되돌리면 원래 effort 복원 — 표시 계층 클램프, 저장 덮어쓰기 금지) ⑤ **패널 미러**(PanelPicker 동형) ⑥ **문구 단정**(세션 고지 title/note) ⑦ **합성 레코드 비공허 green(영호 확정 ③)** — 합성 지원 레코드 `{supports:true, xhigh:false}` 모델 → xhigh 항목 제외 + 선택값이 xhigh면 표시 high 클램프 + 저장값 원형 보존(모델 되돌리면 xhigh 복원). 실모델 표엔 `supports:true ∧ xhigh:false`가 0개라 이 케이스로 xhigh 필터·클램프 경로를 강제 발화(공허 green 방지)
- [ ] **(b) 파생 헬퍼** — `effortOptionsFor(modelId)` 류(pickerOptions 또는 composer 셀렉터) **단일 출처**. 지원 표를 **인자로 받는 순수 함수로 설계**(기본 인자 = shared 표 — 합성 레코드 주입 가능하게, (a)⑦ 테스트가 이 파라미터로 `{supports:true,xhigh:false}`를 주입). shared 표를 소비해 모델별 유효 옵션·지원 여부를 계산
- [ ] **(c) Picker `disabled` prop — 2파일 전수** — `renderer/src/components/01_conversation/ComposerPicker.tsx:79`의 `Picker`(export)와 `renderer/src/components/00_shell/panel/PanelPicker.tsx:84`의 **로컬 `Picker`** 둘 다에 optional `disabled` prop 추가(둘 다 현재 부재 실측 — plan-auditor). **둘 다 추가하지 않으면 한 표면만 배선되는 "배지 3번째 지점 누락" 재발**. **안티슬롭 — 기존 Picker 스타일 관례 내에서 최소 추가**, 신규 컴포넌트 발명 금지
- [ ] **(d) 배선 2지점 + 고지** — `ComposerBar`·`PanelPicker` 배선(노출 지점 전수 원칙 — 배지 3번째 지점 누락 교훈) + title/note("새 대화(세션)부터 적용" 세션 고지)

---

## ✅ 완료 조건

- [ ] `npm run typecheck` (main+renderer) 0 errors
- [ ] `npm run test` green — 신규 게이팅 테스트 RED→GREEN + renderer 스위트 회귀 0
- [ ] `npm run lint` 0 problems
- [x] **육안 = 영호** (버킷 b — haiku 비활성 표현·문구, 기능은 자율 진행·무인 commit X) `(영호 일괄 GO 2026-07-17 — 툴팁 실효는 LM1-DONE 후속 관찰로 이월)`

---

## 📚 학습 포인트

- **파생 상태(derived state)** — 저장값을 파괴하지 않고 표시·전송 시점에 유효값을 계산하면 되돌림이 공짜다. 저장된 effort를 클램프값으로 덮어쓰면 모델을 되돌려도 원래 값이 사라진다 — "표시용 클램프"와 "저장값"을 분리하는 게 핵심.
- **disabled 컨트롤의 발견성 trade-off** — 숨기면 레이아웃이 흔들리고 "이 기능이 없나?" 오해를 부른다. 비활성+안내는 발견성을 지키되 왜 못 쓰는지 알려준다(영호 확정 ②의 근거).

---

## ⚠️ 함정

- **저장된 effort를 클램프값으로 덮어쓰지 말 것** — 모델을 xhigh 지원 모델로 되돌렸을 때 복원이 불가가 된다. main이 전송 시점에 이미 클램프하므로(`effortToOptions`), 표시 계층은 클램프만 하고 저장은 원형 보존한다(이중 안전).
- **`minimal`은 앱 내부 id(SDK effort 아님)** — `effortToOptions`의 special-case다. 제외 로직에서 SDK effort로 오분류하지 말 것.
- **게이트는 표시용 — 정합의 신뢰 근거는 main** — 피커 게이팅은 소음 절감·UX용이다(CORE-01 관례). renderer에서 걸렀다고 main 클램프를 신뢰 근거로 삼지 않는다.
- **노출 지점 전수** — 세션 고지·게이팅은 ComposerBar와 PanelPicker 둘 다에 동형으로 넣는다(배지 3번째 지점 누락 교훈). 한 곳만 바꾸면 다른 표면이 옛 정적 표시를 노출한다.
- **`disabled` prop은 Picker 2파일 전수** — `ComposerPicker.tsx:79`(export `Picker`)와 `PanelPicker.tsx:84`(로컬 `Picker`)는 **별개 정의**다(둘 다 disabled 부재 실측 — plan-auditor). 하나만 추가하면 그 표면만 배선되고 다른 표면은 여전히 비활성 불가 — "배지 3번째 지점 누락" 재발. 반드시 두 파일 모두 추가한다.

---

## 담당 SubAgent

> renderer (파생 헬퍼 + Picker disabled prop + ComposerBar·PanelPicker 배선·고지) · TDD RED는 qa · 육안 = 영호(버킷 b)
