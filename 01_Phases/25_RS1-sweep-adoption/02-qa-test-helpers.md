---
owner: 유영호
milestone: RS1
phase: 02
title: 테스트 셋업 헬퍼 3종 신설 + 대표 이관
status: pending
grade: 보통
loop_track: auto-gate
estimated: 2~3h
domain: qa
summary: phase 단위 복사-변형으로 수십 파일에 복제된 테스트 셋업(SDK 메시지 팩토리·window.api 목업·스토어 리셋)을 공용 헬퍼 3종으로 추출하고, churn 상위 대표 파일군만 먼저 이관. 전량 이관은 후속 회전.
---

# Phase 02: 테스트 셋업 헬퍼 3종 신설 + 대표 이관

> **상태**: pending · **마일스톤**: RS1 · **등급**: 보통 · **담당**: qa

## 🎯 목표

새 테스트를 만들 때 이전 테스트의 셋업을 복사-변형하는 대신 공용 헬퍼를 import하게 된다. 이후 Phase 05가 이 헬퍼 위에서 테스트를 이관한다.

## ⏪ 사전 조건

- [ ] Phase 01 완료 (파일 수 기준선 fitness가 살아 있어야 이관 실수를 잡는다)

## 📝 작업 내용

- [ ] `99_Others/tests/agents/helpers/sdkFixtures.ts` 신설 — `mkInit(patch?)`·`mkResult(patch?)`·`mkAssistantText(text, patch?)`·`mkToolUse(id, name, input)`·`mkToolResult(id, content)` + `FIXTURE_MODEL_ID` 상수(현재 모델 ID 리터럴이 27개 파일에 산재).
- [ ] `99_Others/tests/agents/helpers/fakeQuery.ts` 신설 — `makeMockQueryFn(messages[])`·`makeCaptureQuery()`·`makeInterruptibleQueryFn({reject?})`.
- [ ] `99_Others/tests/renderer/helpers/windowApiMock.ts` 신설 — `installWindowApi(overrides?) → { api, emitAgentEvent(payload), uninstall }`. 전 preload 표면을 vi.fn 기본값으로 깔고 파일별 override만 받게.
- [ ] `99_Others/tests/renderer/helpers/storeReset.ts` 신설 — `resetAppStore(patch?)` (`makeInitialState()` 전개 + patch).
- [ ] **대표 이관(헬퍼당 3~5파일)**: agents 쪽 `persistent-pump`·`claude-backend-sdk` 계열 / renderer 쪽 churn 상위 `switch-continuity-seamless`·`switch-continuity-persistence`·`bf3-p07` 쌍 등. **전량 이관은 이 Phase 범위 밖**(후속 회전).
- [ ] 이관 전 복제본 간 드리프트 diff 정독 — 예: `mkInit`의 `apiKeySource`가 파일마다 `'user'` vs `'none'`으로 다름. **각 파일의 원래 의미를 보존**하는 쪽으로 patch 인자를 쓴다.

## ✅ 완료 조건

- [ ] `npm run typecheck`(node+web) 0 / `npm run test` 5,359+ passed·신규 fail 0 / `npm run lint` 0
- [ ] 테스트 파일 수 비감소 (Phase 01 fitness green)
- [ ] 이관된 파일들의 단언(assertion)이 한 글자도 안 바뀜 — 셋업만 교체

## 📚 학습 포인트

- **테스트 픽스처/팩토리 패턴** — 셋업 중복은 프로덕션 중복과 똑같이 드리프트한다(이번 실측: 복제본끼리 이미 형태가 어긋나기 시작).
- vitest `vi.mock`은 파일 최상단으로 호이스팅된다 — 헬퍼 경유 시 async factory로 우회해야 하는 제약.

## ⚠️ 함정

- **테스트의 거동 = 검증 의미**다. 셋업 통합 과정에서 단언이 달라지면 리팩토링이 아니다.
- 드리프트를 "통일"하고 싶어져도 참는다 — 파일별 차이가 의도일 수 있다(patch로 보존, 통일 여부는 별도 판단).
- ev-test 잔해 54개는 영호 몫의 별건(BZ 07-closeout 목록) — 건드리지 않는다.
- **Phase 04와 동시 실행 금지** — 이관 대상(switch-continuity·bf3-p07 계열)이 04의 픽스처 수정 대상과 겹칠 수 있다.

## 담당 SubAgent

qa
