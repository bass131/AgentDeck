# CP1 P04 서브에이전트 영속 설계 노트 (요지 — 영호 GO 대기)

> **출처**: 전문은 Worker 보고 원문 — 메인 세션 트랜스크립트 2026-07-04.
> 본 파일은 P04 설계 Worker(shared-ipc)의 최종 보고를 Phase 폴더에 보존한 요지본이다.
> 상태: **영호 GO 대기(버킷 c — JSON 영속 스키마 사람 게이트)**.

---

## 대상 범위

- 단일챗 `ConversationRecord`만(옵션 B). 멀티패널 `PanelThreadSnapshot`은 후속 마일스톤 이관.

## 신규 스키마

- `ConversationRecord.subagents?: PersistedSubAgent[]` (additive).
- `PersistedSubAgent extends SubAgentInfo + afterMessageIndex: number` — 위치 앵커. `messages`와 분리된 사이드카(모델 컨텍스트 무개입 = ADR-024 정합).
- `SUBAGENT_PERSIST_LIMITS` — 30 서브에이전트 · transcript 100항목 · 4096자(기존 orchestration script cap 관례 재사용) · tools 200.

## 버전 전략

- 레코드 `version` 필드 신설 안 함 — graceful optional(`cwd?` · `sessionId?` 선례 4회 반복).

## 복원

- status 전면 done 동결(top-level + tools + transcript) — running 고착 방지, 원본 AgentCodeGUI 동일 철학.
- 복원 지점 2곳:
  - `slices/conversation.ts` `loadConversation`
  - `slices/sessions.ts` `selectConversation` 디스크 경로 — **후자가 S9b stale 실원인**, 이번 복원 로직 추가로 동반 봉합.
- bg 경로는 기존 스프레드로 이미 정상.

## P05 함정 3지점 (명시적 필드 추가 필요 — 누락 시 조용히 드롭)

1. `conversation.ts` 핸들러 필드 나열
2. `store.ts` `ChatFile` 리터럴
3. `toRecord()` 매핑

- 추가로 `sanitizeSubagents`(untrusted 검증 + 상한 절삭) 필요.

## 열린 질문 2

1. `SUBAGENT_PERSIST_LIMITS` 제안값(실사용 후 조정 전제).
2. transcript 1차 포함 vs 메타 먼저(스키마는 어느 쪽이든 재작업 0).
