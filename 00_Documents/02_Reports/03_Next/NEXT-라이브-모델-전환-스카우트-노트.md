# NEXT 스카우트 노트 — REPL 지속세션 라이브 모델 전환

> 실측일: 2026-07-17
> 발견 계기: 영호 — "세션 대화 중간에 모델 변경이 안돼?"
> 성격: 차기 사이클 후보 (발견 즉시 처리 X — 박제 후 TG1 종결 우선)

## 결론

- 모델 선택은 **엔드투엔드 배선 완료** — 컴포저 피커 UI · store · JSON 영속 · IPC 계약 전부 `model` 필드 보유. **단발 경로(replMode OFF)에선 이미 전환 동작**.
- 막히는 건 기본값 REPL 지속세션(ADR-024):
  - 옵션이 세션 생성 시 1회 고정 — `claudeAgentRun.ts:1454` `_prepareQuery`
  - 후속 턴은 push(content 문자열)만 — `claudeAgentRun.ts:802`
  - 재사용 라우팅이 `req.model` 폐기 — `agent-runs.ts:212-223`
  - UI가 이 한계를 이미 고지 — `ComposerBar.tsx:97-98` "모델 변경은 새 대화부터"
- **SDK는 지원**:
  - `Query.setModel(model?)` — `sdk.d.ts:2270`, streaming input 전용 = 우리 held-open 세션이 바로 그 모드
  - `supportedModels()` — `sdk.d.ts:2350`, 표시명 · effort 지원 메타 포함
  - 별칭(`'opus'`) · 풀 ID 모두 수용. 전환 시 프롬프트 캐시 무효화(CLI `/model`과 동일).
- 원본 AgentCodeGUI는 query-per-message 단발이라 자연 동작(REPL 자체가 없음) → **Track 1 복제 누락 아님, Track 2 우리 확장**. 단 `setPermissionMode` 라이브 전환 선례가 우리 코드에 완비 — 정확히 미러하면 됨.

## 구현 좌표 (setPermissionMode 미러)

- **shared**: `SetModeRequest/Response`(`shared/ipc/agent.ts:236-244`) 미러 → `SetModelRequest/Response` + `agentSetModel` 채널 (additive — 깃발 shared-contract)
- **main 어댑터**: `claudeAgentRun.ts` `setPermissionMode`(`:692-709`) 미러 → `setModel(modelId)` — `_queryHandle.setModel`(별칭), `KNOWN_MODELS`(`run-args.ts:32`) allowlist 재사용, 비지속 no-op. `AgentBackend` 인터페이스 optional 추가
- **main 라우팅**: `agent-runs.ts` `setPermissionModeFn`(`:242`) 미러 → `setModelFn` + 재사용 경로(`:215-222`)에서 `pushFn` 직전 `existing.setModelFn?.(req.model)`. `handlers/agent.ts`에 `agentSetModel` 핸들러 + allowlist 정규화
- **renderer**: `composer.ts` `setSelectedModel`(`:150-151`)에 진행 중 지속세션이면 `agentSetModel` 호출 확장(`setPickerMode` 선례), `ComposerBar.tsx:97-98` 고지 문구 갱신
- **영속**: 추가 작업 0 (대화별 `model` 저장/복원 기존 동작)
- **주의**:
  - 캐시 무효화 비용 고지 여부(UX)
  - 멀티 패널(`PanelPicker.tsx:229-230`) 동일 확장
  - 등급 추정 **보통~복잡** (cross: shared+main+renderer → 분해 시 도메인별 Phase)

## 처리 방침 (영호 안내 2026-07-17)

발견 즉시 처리하지 않고 차기 사이클 입력으로 박제 — 이번 사이클 종결 = TG1 육안 22컷 + push · PR.
