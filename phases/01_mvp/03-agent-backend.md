# Phase 03: agent-backend

## 목표
**얇은 `AgentBackend` 이음** + Claude Code 어댑터(실동작) + registry + Codex 어댑터(stub)가 구현되어, 엔진 출력이 공통 `AgentEvent`로 정규화된다.
> Track 1은 **Claude Code 전용** — 엔진은 하나뿐이다. 이음은 *내부 구조*(사용자 비노출, 복제 충실도 영향 X)로, Track 2에서 Codex를 끼우기 위한 대비. Codex 어댑터는 이번 Phase에선 **자리(stub)만**.

## 담당 도메인 / 에이전트
agent-backend. 등급: 복잡~대규모.

## 의존 Phase
02 (AgentEvent 타입).

## 위험 깃발
**backend-contract** → reviewer 무조건. (이벤트 모델 누수 시 전 소비자 영향)

## 변경 대상
- `src/main/agents/AgentBackend.ts` — 인터페이스(`id`/`isAvailable`/`version`/`start`→`AgentRun`)
- `src/main/agents/ClaudeCodeBackend.ts` — Agent SDK 우선, `claude -p` JSON 스트림 폴백
- `src/main/agents/CodexBackend.ts` — 인터페이스 구현 stub(`isAvailable()=false`, start→`error: not implemented`)
- `src/main/agents/registry.ts` — 탐지·선택·전환
- `tests/agents/claude-backend.golden.test.ts` — 캡처 샘플 → 기대 `AgentEvent[]`

## 작업 단계
1. **`claude-api` 스킬 참조** — SDK 시그니처·모델 ID 최신 확인(추측 금지). 최신 모델 ID는 CLAUDE.md.
2. `AgentBackend`/`AgentRun` 인터페이스를 ARCHITECTURE.md대로 구현. `AgentRun.events`는 `AsyncIterable<AgentEvent>`, `abort()` 보장.
3. ClaudeCodeBackend: 엔진 출력(SDK 이벤트 또는 `claude -p --output-format stream-json`) → `AgentEvent` 매핑. raw 누수 금지(필요 시 `raw` 패스스루 필드).
4. CodexBackend: stub만(M2에서 실동작).
5. registry: 설치 탐지 + `select(id)` + 기본 백엔드.
6. **골든 테스트 먼저(TDD)**: 고정 샘플 입력 → 기대 이벤트 배열.

## 완료조건 (AC)
- [ ] `npm run typecheck` green.
- [ ] 골든 테스트 PASS (엔진 출력 → AgentEvent 정규화 검증).
- [ ] `abort()` 호출 시 자식프로세스 정리(좀비 없음) — **결정론 테스트로 검증**(헤드리스 execute.py 경로에서도 검증 가능, '수동 확인' 폴백 금지).
- [ ] **CodexBackend는 stub만** — 실 spawn/네트워크 호출 0 (grep/검사). `isAvailable()=false`, start→`error: not implemented`. (Codex 실동작 = Track 2 / M6, 복제 *이후*)
- [ ] 호출부에 `if (engine === 'claude')` 식 분기 없음(registry만) — grep 확인.
- [ ] API 키가 코드·로그에 평문 없음.

## 참조
docs/ARCHITECTURE.md(어댑터 패턴) · ADR-003/004/008 · CLAUDE.md(엔진 추상화·키 CRITICAL) · `claude-api` 스킬.
