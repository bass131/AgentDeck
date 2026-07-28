---
owner: 유영호
milestone: RS1
phase: 06
title: claudeAgentRun 거대 클래스 3단계 분리
status: done
grade: 대규모
risk: backend-contract
loop_track: auto-gate
estimated: 4~6h (커밋 3+α로 분절)
domain: agent-backend
summary: 1,800줄대 claudeAgentRun에서 서로 다른 관심사 3개(백그라운드 태스크 관찰·토큰 장부·유휴 종료 거버너)를 어댑터 내부 모듈로 단계별 분리. 각 단계는 독립 커밋이며 기존 골든 테스트 무수정 green이 게이트. 펌프 루프 중복 추출 동반.
---

# Phase 06: claudeAgentRun 거대 클래스 3단계 분리

> **상태**: pending · **마일스톤**: RS1 · **등급**: 대규모(backend-contract 깃발) · **담당**: agent-backend + coordinator + reviewer 통합

## 🎯 목표

`claudeAgentRun.ts`가 "무엇이든 바뀌면 여기가 바뀌는" 거대 클래스에서 벗어나, 관심사 3개가 각자의 파일에서 독립적으로 읽히고 테스트된다. **분리는 전부 어댑터 *내부* 모듈로만** — `AgentBackend` 인터페이스 표면과 엔진 리터럴 위치는 불변(ADR-003).

## ⏪ 사전 조건

- [ ] Phase 01 완료 (기준선). Phase 04·05와 병렬 가능(renderer와 파일 무중복).

## 📝 작업 내용

각 단계 = 커밋 1개, 각 커밋마다 **기존 골든 테스트 무수정 green** 확인 후 다음 단계로.

- [ ] **① `bgTaskObserver.ts` 분리** — 백그라운드 태스크 관찰 관심사: `extractBgOutputPath`(:149-178)·`_bgTasks`(:541)·`_bgTaskGateOpen`(:1041)·`_observeBgTaskEvent`(:1057)·`_maybeStartBgTail`(:1096)·`_stopAllBgTails`(:1125).
- [ ] **② `sendTokenLedger.ts` 분리** — 전송 토큰 장부 관심사: (:484-492)·(:1142)·(:1166)·`isTurnAnchoringMessage`(:211-228). **gap1-p11 골든 테스트가 이 관심사의 계약 핀** — 무수정 green이 분리 정당성의 증거.
- [ ] **③ `idleCloseGovernor.ts` 분리** — 유휴 종료 거버너 관심사: `_scheduleIdleGrace`(:989)·`_cancelIdleGrace`(:1024)·`_sessionStateGateOpen`(:965).
- [ ] **부수(별도 커밋)**: `_runPersistentPump`(:1505-1849)에서 `_handleNormalizedEvent`(:1623-1696)·`_handleTurnBoundary`(:1697-1775) 메서드 추출 / 펌프 프롤로그 중복(:1269-1310 vs :1511-1557) → `_prepareQuery` 흡수 / 유휴 게이트 술어 4변형(:1005-1011·:1633-1641·:1667-1673·:1746-1751) → `_idleGateOpen()` 단일화. ⚠️ **:1667 변형은 sessionStateGate를 *의도적으로* 생략**한다 — 통합 시 이 생략을 명시 인자(예: `{ checkSessionState: false }`)로 승격, 조용히 뭉개지 않는다.

## ✅ 완료 조건

- [ ] 단계별 커밋 3+α, 각각 `npm run typecheck`(node+web) 0 / `npm run test` 비감소·신규 fail 0 / `npm run lint` 0
- [ ] **기존 골든 테스트(어댑터 이벤트 계약·gap1-p11 등) 전부 무수정 green**
- [ ] `AgentBackend` 인터페이스와 shared 타입 표면 diff 0
- [ ] coordinator 경계 정합 검증 통과 + reviewer 🔴 0

## 📚 학습 포인트

- **거대 클래스(Large Class) 해체의 정석** — 한 번에 갈아엎지 않고, 관심사 하나 = 커밋 하나 = 게이트 하나. 실패 시 되돌릴 단위가 작아진다.
- **골든 테스트 = 특성화 테스트(characterization test)** — "현재 거동이 곧 계약"을 기계로 박은 것. 리팩토링 중 유일하게 믿을 수 있는 안전망.

## ⚠️ 함정 — Worker 브리프에 반드시 포함할 지뢰

- **모드 매핑 테이블 3종 통합 금지** — `claudeAgentRun.ts:246`·`runArgs.ts:61`·`claudeStream.ts:302`는 겉이 비슷하지만 의미가 다르다(라이브 전환/세션 생성/역매핑). 합치면 거동 버그.
- **엔진 고유물의 어댑터 밖 유출 금지**(ADR-003) — `SDKUserMessage` 형상(:1461-1468)·`ORCHESTRATION_TOOLS`(`permissionCoordinator.ts:74`)·SDK 리터럴은 분리된 새 파일도 *어댑터 디렉토리 내부*여야 한다.
- 분리 중 private 상태(`_bgTasks` 등)의 소유권을 어디 둘지 애매하면 — 새 모듈이 상태를 소유하고 claudeAgentRun이 인스턴스를 든다(위임). 상태를 양쪽에 복제하는 순간 버그.
- 신규 모듈 파일 생성 시 tdd-guard가 "테스트 먼저"로 발화할 수 있다 — 브리프에 "기존 골든(특성화) 테스트 하의 거동 불변 리팩토링(신규 거동 없음)"임을 명시해 마찰을 예방한다.

## 담당 SubAgent

agent-backend (Worker, 대규모 — 모델 상향 발효 확인) + coordinator(경계 검증) + reviewer(무조건 — backend-contract·대규모 통합 리뷰)
