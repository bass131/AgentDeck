# RS1 — 리팩토링 스윕 채택 (Refactor Sweep 1)

> **재료**: 2026-07-28 리팩토링 스윕 dry-run 보고서(`00_Documents/03_Reviews/Harness/2026-07-28-refactor-sweep.md`).
> 다섯 영역 진단에서 나온 발견 약 90건 중, 영호가 "대부분 채택"으로 판단한 것을 실행 가능한 Phase 7개로 분해했다.
> 진단은 스윕이 했고, **실행은 표준 Phase 루프(/work-run)** 로 한다 — 스윕 스킬의 자동 커밋 모드와는 별개 트랙이다. (분해 원본 = 7 Phase, 08은 영호 야간 추가 지시 2026-07-29로 +1 — 총 8개.)

## 목표

스윕이 찾은 부채 중 레버리지가 큰 것을 갚는다: 테스트 안전망 강화 → 공용 계약 정비 → renderer 상태 정리 → 어댑터 거대 클래스 분리 → 보안 심층방어 보강. 전 Phase의 공통 대원칙은 **거동 불변 + 공개 계약(시그니처·IPC·AgentEvent) 불변**이다 — 동작을 바꾸는 순간 리팩토링이 아니라 별건이다(유일한 예외 = Phase 07의 보안 보강 2건, 영호 GO 게이트).

## Phase 순서와 의존성

| # | Phase | 도메인 | 등급 | 게이트 |
|---|---|---|---|---|
| 01 | NUL 바이트 제거 + 테스트 수집 기준선 | qa | 단순 | auto |
| 02 | 테스트 셋업 헬퍼 3종 신설 + 대표 이관 | qa | 보통 | auto |
| 03 | shared 계약 정비 (agentEvents 분할·모델 어휘 타입 조임) | shared-ipc | 복잡 | auto |
| 04 | renderer store 정리 (죽은 이중 소스·산탄 수정 구조) | renderer | 복잡 | auto |
| 05 | panelSession 평행 구현 통합 | renderer+qa | 복잡 | auto |
| 06 | claudeAgentRun 거대 클래스 3단계 분리 | agent-backend | 대규모 | auto |
| 07 | main 심층방어 보강 2건 | main-process | 복잡 | **human-gate — GO 기부여(2026-07-28)** |
| 08 | 주석 다이어트 (자명·stale·리뷰어용 정리, 코드 diff 0) | cross | 보통 | auto |

- 의존: 01이 전 Phase 선행(기준선 fitness 위에서 작업) · 05는 02(헬퍼)·04(store 정리) 뒤 · 07은 아무 때나(GO 기부여 2026-07-28 — 야간 자율 런 포함 가능, loop-driver §3-1) · **08은 맨 마지막**(03~07 완료 후 — 영호 야간 추가 지시 2026-07-29).
- 병렬 가능(파일 무중복): 02 ↔ 03 · 06 ↔ 04·05. ⚠️ **02 ↔ 04는 동시 실행 금지** — 같은 renderer 테스트 파일(switch-continuity·bf3-p07 계열)을 02(셋업 이관)와 04(픽스처 수정)가 함께 만질 수 있다.
- 실행 브랜치: master pull 후 마일스톤 브랜치 1개(예: `refactor/rs1-sweep-adoption`) — 현 로컬(기머지 `chore/index-lm1-status-fix`)에서 실행하지 않는다. Phase별 atomic 커밋, push·PR·merge = 사람 게이트(CORE-06).
- ⚠️ **실행은 새 세션 권장** — Worker 모델 상향(sonnet→opus, 영호 2026-07-28 직접 편집)은 편집한 세션에서는 발효되지 않는다.

## 전 Phase 공통 완료 조건

- `npm run typecheck` node·web 양쪽 0 errors / `npm run test` **5,359 passed 비감소 + 신규 fail 0** / `npm run lint` 0 problems
- 테스트 **파일 수 402 비감소** (Phase 01이 이 축을 fitness 테스트로 박는다)
- 커밋은 항목별 atomic, 본문에 무엇/파일:줄/왜

## ⚠️ 전 Phase 계승 지뢰 (스윕 진단에서 확정 — Worker 브리프에 반드시 포함)

1. **모드 매핑 테이블 3종은 통합 금지** — `claudeAgentRun.ts:246`·`runArgs.ts:61`·`claudeStream.ts:302`는 겉이 비슷하지만 의미가 다르다(라이브 전환/세션 생성/역매핑). 합치면 거동 버그.
2. **엔진 고유 코드는 어댑터 밖 이동 금지**(ADR-003) — SDKUserMessage 형상·ORCHESTRATION_TOOLS·엔진 리터럴. `AgentBackend` 인터페이스 표면 불변.
3. **자동 수정 영구 금지 구역** — `02_Source/preload/**`·`02_Source/main/00_ipc/**`·canUseTool/권한 경로는 이 마일스톤에서도 손대지 않는다.

## 범위 밖 (의도적 제외 — 다음 회전 후보)

- **RS2 후보(코드)**: Conversation.tsx 훅 3종 추출·부품 분리 / claudeStream system 분기 디스패치화 / settings 3형제 공용화 / prefs↔profile 제네릭 저장소 / lsp manager·git.ts 분해 / 테스트 헬퍼 전량 이관 / 샘플 모듈에서 프로덕션 타입 분리
- **육안 트랙(📋)**: TurnAvatar 공유·TurnBlockList 통합·mcp 정렬 순서 — JSX/화면 확인 필요
- **결정 재론(ADR 트랙)**: writeFileAtomic 도입(헌법 박제 결정) / SDK 리터럴 중복 통합(ADR-003 재론)
- **별건(거동 수정)**: `03_lsp/manager.ts:80` 폴백 루프 잠재 버그 — 리팩토링이 아니라 버그 수정이므로 의도 확인 후 별건 처리
- **영호 몫**: ARCHITECTURE.md 지도 갱신 / mcp 주석↔코드 의도 확정 / 스윕 절차 v3.1 채택(유지보수 창 4건 — 하네스라 마일스톤 밖)
