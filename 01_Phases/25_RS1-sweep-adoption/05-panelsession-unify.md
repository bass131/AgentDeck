---
owner: 유영호
milestone: RS1
phase: 05
title: panelSession 평행 구현 통합 — performSend 공용 코어
status: done
grade: 복잡
loop_track: auto-gate
estimated: 2~4h
domain: cross
summary: panelSession의 로컬 경로와 매니저 경로에 평행 존재하는 performSend 구현(약 140줄 × 2)을 상태 접근 포트 주입 방식의 공용 코어로 통합. 로컬 모드 전용 코드는 thin wrapper화. 한쪽만 고쳐지는 발산 변경 구조 해소.
---

# Phase 05: panelSession 평행 구현 통합 — performSend 공용 코어

> **상태**: pending · **마일스톤**: RS1 · **등급**: 복잡(renderer+qa 협업) · **담당**: renderer + qa + reviewer

## 🎯 목표

메시지 전송 로직이 한 곳에만 존재하게 된다 — 지금은 거의 같은 구현이 두 벌 있어서 버그 수정이 한쪽에만 들어가는 사고(발산 변경, Divergent Change)가 구조적으로 예약돼 있다.

## ⏪ 사전 조건

- [ ] Phase 02 완료 (테스트 헬퍼 — 이관·검증에 사용)
- [ ] Phase 04 완료 (store 정리 — panelSession 주변이 먼저 정돈돼야 diff가 겹치지 않는다)

## 📝 작업 내용

- [ ] **performSend 공용 코어 추출** — `panelSession.ts:689-828`(로컬 경로)과 `:1185-1285`(매니저 경로)의 공통 골격을 하나의 함수로. 상태 읽기/쓰기는 `{ readState, dispatch }` **포트 주입**으로 받아 두 경로가 각자의 상태 소스를 꽂는다.
- [ ] 두 경로의 *실제 차이*는 옵션·포트로 흡수 — sessionKey 폴백 규칙 차이는 `opts`로, 상태 스냅샷 시점 차이(`:1181-1183`의 의도 주석 — 매니저 경로는 dispatch 직전에 다시 읽는다)는 `readState`가 호출 시점을 소유하는 것으로 자연 해소.
- [ ] **로컬 모드 처리** — `usePanelSession` 로컬 모드는 프로덕션 소비 0·테스트 9파일 소비가 실측됐다. 공용 코어 위의 thin wrapper로 남기거나, qa와 협업해 테스트를 매니저 경로로 이관 — **어느 쪽이 diff가 작은지 착수 시점에 실측으로 결정**하고 근거를 커밋 본문에 남긴다.

## ✅ 완료 조건

- [ ] `npm run typecheck`(node+web) 0 / `npm run test` 기준 비감소·신규 fail 0 / `npm run lint` 0
- [ ] **switch-continuity 계열 테스트 무수정 green** — 이 계열이 전송·전환 거동의 계약 핀이다. "무수정" 기준 = Phase 05 착수 시점 스냅샷(Phase 02의 셋업 이관이 이미 반영된 상태)
- [ ] 통합 후 performSend 골격 구현이 저장소에 정확히 1개 (grep 증적)
- [ ] reviewer 🔴 0

## 📚 학습 포인트

- **포트 주입(ports & adapters의 축소판)** — 로직은 하나로 두고 "상태를 어디서 읽고 어디에 쓰는가"만 인터페이스로 밀어내는 기법. C#으로 치면 전략(Strategy)을 생성자 주입하는 것과 같은 모양.
- **발산 변경(Divergent Change) 스멜** — 같은 개념의 코드가 두 벌이면 수정은 언젠가 한쪽에만 들어간다. 통합의 근거는 "줄 수 절약"이 아니라 이 사고 확률 제거다.

## ⚠️ 함정

- 두 경로의 차이를 "버그"로 단정하지 않는다 — `:1181-1183`처럼 주석으로 의도가 박힌 차이는 **보존 대상**이다. 차이를 없애는 게 아니라 차이를 *명시적 매개변수*로 승격하는 것.
- 테스트 이관을 택할 경우에도 검증 의미(단언)는 불변 — Phase 02와 같은 규율.
- renderer 시각(JSX 레이아웃)은 이 Phase 범위 밖.

## 담당 SubAgent

renderer (Worker, 코어 통합) + qa (테스트 이관 협업) + reviewer(조건부 충족 — 등급 복잡)
